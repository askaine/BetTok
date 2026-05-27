// supabase/functions/api/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESOLVE_SECRET       = Deno.env.get("RESOLVE_SECRET") || "change-me";

// ── Constants ─────────────────────────────────────────────
const VIRALITY_THRESHOLD     = 1_000_000;
const SUBMISSION_THRESHOLD   = 100_000;
const MIN_LIKES              = 500;
const MAX_LIKES              = 5_000;
const MAX_AGE_HOURS          = 168;
const DAILY_BONUS            = 100;
const RESOLUTION_DAYS        = 7;
const SEED_LIQUIDITY         = 300;
const MIN_ODDS               = 1.05;
const MAX_ODDS               = 15.0;
const MAX_SUBMISSIONS_PER_DAY = 3;
const CLEANUP_AFTER_DAYS     = 3;

const BRACKET_ODDS: Record<string, number> = {
  "<100k":     1.5,
  "100k-500k": 2.5,
  "500k-1m":   4.0,
  "1m-5m":     7.0,
  "5m+":       15.0,
};

const TIME_BONUS_TIERS = [
  { h: 1,        b: 1.5  },
  { h: 6,        b: 1.3  },
  { h: 24,       b: 1.15 },
  { h: 72,       b: 1.05 },
  { h: Infinity, b: 1.0  },
];

// ── Helpers ───────────────────────────────────────────────
function calculateOdds(yesPool: number, noPool: number, side: "yes" | "no"): number {
  const sy = (yesPool || 0) + SEED_LIQUIDITY;
  const sn = (noPool  || 0) + SEED_LIQUIDITY;
  const raw = (sy + sn) / (side === "yes" ? sy : sn);
  return +Math.min(MAX_ODDS, Math.max(MIN_ODDS, raw)).toFixed(3);
}

function oddsToProb(odds: number): number {
  return Math.round(Math.min(99, Math.max(1, (1 / odds) * 100)));
}

function getTimeBonus(addedAt: string, now: Date): number {
  const h = (now.getTime() - new Date(addedAt).getTime()) / 3_600_000;
  for (const t of TIME_BONUS_TIERS) { if (h <= t.h) return t.b; }
  return 1.0;
}

function noisyRange(n: number): string {
  if (n <= 10)   return "a few";
  if (n <= 50)   return "10–50";
  if (n <= 200)  return "50–200";
  if (n <= 500)  return "200–500";
  if (n <= 1000) return "500+";
  return "1000+";
}

function extractVideoId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchViews(tiktokUrl: string): Promise<number | null> {
  try {
    const r    = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`);
    const json = await r.json();
    return json?.data?.play_count ?? null;
  } catch { return null; }
}

async function sendPush(token: string, title: string, body: string) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, sound: "default", title, body }),
    });
  } catch {}
}

function checkBracketWin(bet: Record<string, unknown>, views: number, isViral: boolean): boolean {
  if (bet.bet_type === "binary") return bet.side === (isViral ? "yes" : "no");
  if (bet.bet_type === "bracket") {
    const b = bet.bracket as string;
    if (b === "<100k")     return views < 100_000;
    if (b === "100k-500k") return views >= 100_000 && views < 500_000;
    if (b === "500k-1m")   return views >= 500_000 && views < 1_000_000;
    if (b === "1m-5m")     return views >= 1_000_000 && views < 5_000_000;
    if (b === "5m+")       return views >= 5_000_000;
  }
  if (bet.bet_type === "parlay") {
    const legs = (bet.parlay_legs as { side: string }[]) || [];
    return legs[0]?.side === (isViral ? "yes" : "no");
  }
  return false;
}

async function runResolution(admin: ReturnType<typeof createClient>): Promise<number> {
  const now = new Date();
  let resolved = 0;

  // Find overdue or already-viral active videos
  const { data: candidates } = await admin
    .from("videos")
    .select("*")
    .eq("status", "active")
    .or(`resolution_deadline.lt.${now.toISOString()},current_views.gte.${VIRALITY_THRESHOLD}`);

  for (const video of (candidates || [])) {
    const freshViews   = await fetchViews(video.tiktok_url);
    const currentViews = freshViews ?? (video.current_views || 0);

    if (freshViews !== null) {
      await admin.from("videos").update({ current_views: freshViews }).eq("id", video.id);
    }

    const isViral      = currentViews >= VIRALITY_THRESHOLD;
    const isPastDeadline = new Date(video.resolution_deadline) <= now;
    if (!isViral && !isPastDeadline) continue;

    const resolution = isViral ? "resolved_yes" : "resolved_no";
    await admin.from("videos").update({ status: resolution, resolved_at: now.toISOString(), current_views: currentViews }).eq("id", video.id);

    // Settle bets
    const { data: bets } = await admin.from("bets").select("*").eq("video_id", video.id).eq("status", "pending");
    for (const bet of (bets || [])) {
      const won          = checkBracketWin(bet, currentViews, isViral);
      const sparksEarned = won ? (bet.potential_payout || 0) : 0;
      await admin.from("bets").update({ status: won ? "won" : "lost", settled_at: now.toISOString(), sparks_earned: sparksEarned }).eq("id", bet.id);

      const { data: u } = await admin.from("users").select("*").eq("id", bet.uid).single();
      if (!u) continue;
      const upd: Record<string, unknown> = {};

      if (won) {
        upd.sparks         = (u.sparks || 0) + sparksEarned;
        upd.correct_bets   = (u.correct_bets || 0) + 1;
        upd.current_streak = (u.current_streak || 0) + 1;
        upd.weekly_score   = (u.weekly_score  || 0) + sparksEarned;
        upd.all_time_score = (u.all_time_score || 0) + sparksEarned;
        const ns = (u.current_streak || 0) + 1;
        if (ns > (u.longest_streak || 0)) upd.longest_streak = ns;
        const badges = [...(u.badges || [])];
        if (!badges.includes("contrarian") && bet.side === "no") badges.push("contrarian");
        if (ns >= 5  && !badges.includes("streak_5"))  badges.push("streak_5");
        if (ns >= 10 && !badges.includes("streak_10")) badges.push("streak_10");
        const at = (u.all_time_score || 0) + sparksEarned;
        if (at >= 1000 && !badges.includes("club_1000")) badges.push("club_1000");
        if (at >= 5000 && !badges.includes("club_5000")) badges.push("club_5000");
        upd.badges = badges;
      } else {
        if ((u.current_streak || 0) > (u.longest_streak || 0)) upd.longest_streak = u.current_streak;
        upd.current_streak = 0;
      }
      await admin.from("users").update(upd).eq("id", bet.uid);

      if (u.push_token) {
        const title = video.title || "A video";
        won
          ? await sendPush(u.push_token, "⚡ Bet Won!", `+${sparksEarned} Sparks — ${title}`)
          : await sendPush(u.push_token, "📉 Bet Lost", `${isViral ? "Went viral" : "Flopped"} — ${title}`);
      }
    }
    resolved++;
  }

  // Cleanup old resolved videos
  const cutoff = new Date(now.getTime() - CLEANUP_AFTER_DAYS * 86_400_000).toISOString();
  await admin.from("videos").delete().neq("status", "active").lt("resolved_at", cutoff);

  return resolved;
}

async function updateLeaderboards(admin: ReturnType<typeof createClient>) {
  const now     = new Date();
  const weekKey = `${now.getFullYear()}-W${getISOWeek(now)}`;

  const toEntry = (u: Record<string, unknown>, scoreField: string) => ({
    uid: u.id, username: u.username, badge: u.flair || "",
    correct_pct:   (u.total_bets as number) > 0 ? Math.round(((u.correct_bets as number) / (u.total_bets as number)) * 100) / 100 : 0,
    sparks_earned: u[scoreField],
    streak:        u.longest_streak,
  });

  const { data: weekly } = await admin.from("users").select("id,username,flair,weekly_score,all_time_score,correct_bets,total_bets,longest_streak").order("weekly_score", { ascending: false }).limit(100);
  await admin.from("leaderboard_weekly").upsert({ week_key: weekKey, entries: (weekly || []).map(u => toEntry(u, "weekly_score")), updated_at: now.toISOString() }, { onConflict: "week_key" });

  const { data: allTime } = await admin.from("users").select("id,username,flair,all_time_score,correct_bets,total_bets,longest_streak").order("all_time_score", { ascending: false }).limit(100);
  await admin.from("leaderboard_alltime").upsert({ id: 1, entries: (allTime || []).map(u => toEntry(u, "all_time_score")), updated_at: now.toISOString() }, { onConflict: "id" });
}

function getISOWeek(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const y = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - y.getTime()) / 86_400_000 + 1) / 7);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Server ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url    = new URL(req.url);
  const path   = url.pathname.replace(/^\/functions\/v1\/api/, "").replace(/^\/api/, "") || "/";
  const auth   = req.headers.get("Authorization");
  const supa   = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { global: { headers: { Authorization: auth || "" } } });
  const admin  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user } } = await supa.auth.getUser();

  const ok  = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const err = (msg: string, status = 400) => new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const needAuth = () => !user ? err("Unauthenticated", 401) : null;

  try {
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // ── GET /checkUsername ────────────────────────────────
    if (path === "/checkUsername") {
      const u = url.searchParams.get("username")?.trim();
      if (!u) return err("username required");
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) return ok({ available: false, reason: "3–20 chars, letters/numbers/underscores only" });
      const { data: ex } = await admin.from("users").select("id").ilike("username", u).maybeSingle();
      return ok({ available: !ex });
    }

    // ── POST /ingestVideo ─────────────────────────────────
    if (path === "/ingestVideo" && req.method === "POST") {
      const e = needAuth(); if (e) return e;
      const { tiktokUrl } = body;
      const cleanUrl = tiktokUrl.split("?")[0];

      // Rate limit
      const dayStart = new Date(); dayStart.setHours(0,0,0,0);
      const { count } = await admin.from("videos").select("id", { count: "exact", head: true }).eq("added_by_uid", user!.id).gte("added_at", dayStart.toISOString());
      if ((count || 0) >= MAX_SUBMISSIONS_PER_DAY) return ok({ accepted: false, reason: `Max ${MAX_SUBMISSIONS_PER_DAY} submissions per day` });

      const videoId = extractVideoId(cleanUrl);
      if (videoId) {
        const { data: ex } = await admin.from("videos").select("id").eq("tiktok_video_id", videoId).maybeSingle();
        if (ex) return ok({ accepted: false, reason: "Already in the pool" });
      }

      const res  = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`);
      const json = await res.json();
      const v    = json.data;
      if (!v) return err("Could not fetch video data", 502);

      const uploadedAt = new Date(v.create_time * 1000);
      const ageH       = (Date.now() - uploadedAt.getTime()) / 3_600_000;
      if (v.digg_count  < MIN_LIKES)              return ok({ accepted: false, reason: `Needs at least ${MIN_LIKES} likes` });
      if (v.digg_count  > MAX_LIKES)              return ok({ accepted: false, reason: `Over ${MAX_LIKES.toLocaleString()} likes — too popular` });
      if (v.play_count >= SUBMISSION_THRESHOLD)   return ok({ accepted: false, reason: "Already too popular" });
      if (ageH          > MAX_AGE_HOURS)          return ok({ accepted: false, reason: "Video older than 7 days" });

      const now      = new Date();
      const deadline = new Date(now.getTime() + RESOLUTION_DAYS * 86_400_000);

      const { data: video, error: ve } = await admin.from("videos").insert({
        tiktok_url: cleanUrl, tiktok_video_id: videoId,
        direct_video_url: v.play, thumbnail_url: v.cover, title: v.title || "Untitled",
        author_handle: "anonymous", uploaded_at: uploadedAt.toISOString(),
        added_by_uid: user!.id, likes_at_ingestion: v.digg_count,
        views_at_ingestion: v.play_count, current_views: v.play_count,
        resolution_deadline: deadline.toISOString(), url_refreshed_at: now.toISOString(),
        status: "active", total_bets: 0, yes_bets: 0, no_bets: 0, yes_pool: 0, no_pool: 0,
        noisy_bet_range: "a few", random_seed: Math.random(),
      }).select().single();
      if (ve) return err(ve.message, 500);

      await admin.from("resolution_queue").insert({
        video_id: video.id,
        check_24h_at: new Date(now.getTime() + 86_400_000).toISOString(),
        check_48h_at: new Date(now.getTime() + 172_800_000).toISOString(),
        check_7d_at:  deadline.toISOString(),
        check_24h_done: false, check_48h_done: false, check_7d_done: false,
      });

      return ok({ accepted: true, videoId: video.id });
    }

    // ── POST /placeBet ────────────────────────────────────
    if (path === "/placeBet" && req.method === "POST") {
      const e = needAuth(); if (e) return e;
      const { betType = "binary", videoId, side, bracket, legs, multiplier = 1, baseWager = 100, whyReasons = [] } = body;
      const sparksWagered = Math.floor(baseWager * multiplier);

      const { data: u } = await admin.from("users").select("*").eq("id", user!.id).single();
      if (!u) return err("User not found", 404);
      if (u.sparks < sparksWagered) return err("Not enough Sparks");

      const now = new Date();

      if (betType === "binary") {
        if (!side) return err("side required for binary bets");
        const { data: vid } = await admin.from("videos").select("*").eq("id", videoId).single();
        if (!vid) return err("Video not found", 404);
        if (vid.status !== "active") return err("Video already resolved");

        const { data: ex } = await admin.from("bets").select("id").eq("uid", user!.id).eq("video_id", videoId).eq("bet_type", "binary").maybeSingle();
        if (ex) return err("Already placed a bet on this video");

        const oddsAtBet       = calculateOdds(vid.yes_pool || 0, vid.no_pool || 0, side);
        const addedAt         = vid.added_at || vid.created_at;
        const timeBonus       = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * oddsAtBet * timeBonus);

        const { error: be } = await admin.from("bets").insert({
          uid: user!.id, video_id: videoId, bet_type: "binary", side, multiplier,
          base_wager: baseWager, sparks_wagered: sparksWagered,
          odds_at_bet: oddsAtBet, time_bonus: timeBonus, potential_payout: potentialPayout,
          status: "pending", placed_at: now.toISOString(),
          why_reasons: whyReasons,  // ← DATA WE SELL
        });
        if (be) { if (be.code === "23505") return err("Already placed a bet on this video"); return err(be.message, 500); }

        await admin.from("users").update({ sparks: u.sparks - sparksWagered, total_bets: (u.total_bets || 0) + 1 }).eq("id", user!.id);

        const ny = side === "yes" ? (vid.yes_pool || 0) + sparksWagered : (vid.yes_pool || 0);
        const nn = side === "no"  ? (vid.no_pool  || 0) + sparksWagered : (vid.no_pool  || 0);
        const nt = (vid.total_bets || 0) + 1;
        await admin.from("videos").update({
          total_bets: nt, noisy_bet_range: noisyRange(nt), yes_pool: ny, no_pool: nn,
          yes_bets: side === "yes" ? (vid.yes_bets || 0) + 1 : vid.yes_bets,
          no_bets:  side === "no"  ? (vid.no_bets  || 0) + 1 : vid.no_bets,
        }).eq("id", videoId);

        // Store why_reasons in analytics table for data product
        if (whyReasons.length > 0) {
          await admin.from("prediction_insights").insert({
            video_id: videoId, uid: user!.id, side,
            why_reasons: whyReasons, wagered: sparksWagered,
            odds_at_bet: oddsAtBet, created_at: now.toISOString(),
          }).catch(() => {}); // non-blocking, table may not exist yet
        }

        const newYesOdds = calculateOdds(ny, nn, "yes");
        const newNoOdds  = calculateOdds(ny, nn, "no");
        return ok({ success: true, sparksWagered, oddsAtBet, timeBonus, potentialPayout,
          newOdds: { yes: newYesOdds, no: newNoOdds, yesProb: oddsToProb(newYesOdds), noProb: oddsToProb(newNoOdds) },
        });
      }

      if (betType === "bracket") {
        if (!bracket || !BRACKET_ODDS[bracket]) return err("Invalid bracket");
        const { data: vid } = await admin.from("videos").select("*").eq("id", videoId).single();
        if (!vid) return err("Video not found", 404);
        if (vid.status !== "active") return err("Video already resolved");
        const { data: ex } = await admin.from("bets").select("id").eq("uid", user!.id).eq("video_id", videoId).eq("bet_type", "bracket").maybeSingle();
        if (ex) return err("Already placed a bracket bet on this video");

        const bracketOdds     = BRACKET_ODDS[bracket];
        const timeBonus       = getTimeBonus(vid.added_at || vid.created_at, now);
        const potentialPayout = Math.floor(sparksWagered * bracketOdds * timeBonus);

        const { error: be } = await admin.from("bets").insert({
          uid: user!.id, video_id: videoId, bet_type: "bracket", side: "bracket", bracket, multiplier,
          base_wager: baseWager, sparks_wagered: sparksWagered,
          odds_at_bet: bracketOdds, time_bonus: timeBonus, potential_payout: potentialPayout,
          status: "pending", placed_at: now.toISOString(), why_reasons: whyReasons,
        });
        if (be) return err(be.message, 500);
        await admin.from("users").update({ sparks: u.sparks - sparksWagered, total_bets: (u.total_bets || 0) + 1 }).eq("id", user!.id);
        const nt = (vid.total_bets || 0) + 1;
        await admin.from("videos").update({ total_bets: nt, noisy_bet_range: noisyRange(nt) }).eq("id", videoId);
        return ok({ success: true, sparksWagered, bracketOdds, timeBonus, potentialPayout });
      }

      if (betType === "parlay") {
        if (!Array.isArray(legs) || legs.length < 2 || legs.length > 3) return err("Parlay: 2–3 legs required");
        const videoIds = legs.map((l: { videoId: string }) => l.videoId);
        const { data: vids } = await admin.from("videos").select("*").in("id", videoIds);
        if (!vids || vids.length !== videoIds.length) return err("One or more videos not found", 404);
        if (vids.find(v => v.status !== "active")) return err("One or more videos already resolved");
        const parlayOdds = legs.reduce((acc: number, leg: { videoId: string; side: string }) => {
          const v = vids.find(vd => vd.id === leg.videoId)!;
          return acc * calculateOdds(v.yes_pool || 0, v.no_pool || 0, leg.side as "yes" | "no");
        }, 1.0);
        const primary     = vids.find(v => v.id === legs[0].videoId)!;
        const timeBonus   = getTimeBonus(primary.added_at || primary.created_at, now);
        const potPayout   = Math.floor(sparksWagered * parlayOdds * timeBonus);
        const { error: be } = await admin.from("bets").insert({
          uid: user!.id, video_id: legs[0].videoId, bet_type: "parlay", side: "parlay",
          parlay_legs: legs, multiplier, base_wager: baseWager, sparks_wagered: sparksWagered,
          odds_at_bet: +parlayOdds.toFixed(3), time_bonus: timeBonus, potential_payout: potPayout,
          status: "pending", placed_at: now.toISOString(), why_reasons: whyReasons,
        });
        if (be) return err(be.message, 500);
        await admin.from("users").update({ sparks: u.sparks - sparksWagered, total_bets: (u.total_bets || 0) + 1 }).eq("id", user!.id);
        for (const leg of legs as { videoId: string }[]) {
          const v = vids.find(vd => vd.id === leg.videoId)!;
          const nt = (v.total_bets || 0) + 1;
          await admin.from("videos").update({ total_bets: nt, noisy_bet_range: noisyRange(nt) }).eq("id", leg.videoId);
        }
        return ok({ success: true, sparksWagered, parlayOdds: +parlayOdds.toFixed(3), timeBonus, potentialPayout: potPayout });
      }

      return err("Invalid betType");
    }

    // ── POST /claimDailyBonus ─────────────────────────────
    if (path === "/claimDailyBonus" && req.method === "POST") {
      const e = needAuth(); if (e) return e;
      const { data: u } = await admin.from("users").select("*").eq("id", user!.id).single();
      if (!u) return err("User not found", 404);
      const now  = new Date();
      const last = u.last_daily_bonus ? new Date(u.last_daily_bonus) : null;
      if (last) {
        const h = (now.getTime() - last.getTime()) / 3_600_000;
        if (h < 24) {
          const next = new Date(last.getTime() + 86_400_000);
          const m    = Math.ceil((next.getTime() - now.getTime()) / 60_000);
          const hh   = Math.floor(m / 60);
          return err(`Come back in ${hh >= 1 ? `${hh}h ${m % 60}m` : `${m}m`} for your next bonus`);
        }
      }
      const newBal = (u.sparks || 0) + DAILY_BONUS;

      // Update streak if they claimed within 48h of last claim
      let newStreak = 1;
      if (last) {
        const h = (now.getTime() - last.getTime()) / 3_600_000;
        newStreak = h <= 48 ? (u.current_streak || 0) + 1 : 1;
      }
      const longestStreak = Math.max(u.longest_streak || 0, newStreak);

      await admin.from("users").update({
        sparks: newBal, last_daily_bonus: now.toISOString(),
        current_streak: newStreak, longest_streak: longestStreak,
      }).eq("id", user!.id);

      return ok({ awarded: DAILY_BONUS, newBalance: newBal, newStreak });
    }

    // ── POST /registerPushToken ───────────────────────────
    if (path === "/registerPushToken" && req.method === "POST") {
      const e = needAuth(); if (e) return e;
      const { token } = body;
      if (!token) return err("token required");
      await admin.from("users").update({ push_token: token }).eq("id", user!.id);
      return ok({ ok: true });
    }

    // ── POST /flagVideo ───────────────────────────────────
    if (path === "/flagVideo" && req.method === "POST") {
      const e = needAuth(); if (e) return e;
      const { videoId, reason } = body;
      if (!videoId) return err("videoId required");
      const { data: ex } = await admin.from("video_flags").select("id").eq("video_id", videoId).eq("uid", user!.id).maybeSingle();
      if (ex) return ok({ ok: true, message: "Already flagged" });
      await admin.from("video_flags").insert({ video_id: videoId, uid: user!.id, reason: reason || "inappropriate", flagged_at: new Date().toISOString() });
      const { count } = await admin.from("video_flags").select("id", { count: "exact", head: true }).eq("video_id", videoId);
      if ((count || 0) >= 5) await admin.from("videos").update({ status: "flagged" }).eq("id", videoId);
      return ok({ ok: true });
    }

    // ── POST /manualResolve ───────────────────────────────
    if (path === "/manualResolve" && req.method === "POST") {
      const secret = req.headers.get("secret") || body.secret;
      if (!user && secret !== RESOLVE_SECRET) return err("Unauthorized", 401);
      const resolved = await runResolution(admin);
      await updateLeaderboards(admin);
      return ok({ ok: true, resolved });
    }

    // ── POST /awardAdSparks ───────────────────────────────
    // Called after user watches a rewarded ad (verified by client SDK)
    if (path === "/awardAdSparks" && req.method === "POST") {
      const e = needAuth(); if (e) return e;
      const { adToken } = body; // token from ad SDK proving ad was watched
      // In production: verify adToken with your ad provider's server-side API
      // For now we trust the client (add server-side verification when you have an ad provider)
      const AD_REWARD = 50;
      const { data: u } = await admin.from("users").select("sparks, last_ad_reward").eq("id", user!.id).single();
      if (!u) return err("User not found", 404);

      // Limit: one ad reward per hour
      const lastAd = u.last_ad_reward ? new Date(u.last_ad_reward) : null;
      if (lastAd && (Date.now() - lastAd.getTime()) < 3_600_000) {
        return err("You can watch another ad in " + Math.ceil((3_600_000 - (Date.now() - lastAd.getTime())) / 60_000) + " minutes");
      }

      await admin.from("users").update({ sparks: (u.sparks || 0) + AD_REWARD, last_ad_reward: new Date().toISOString() }).eq("id", user!.id);
      return ok({ awarded: AD_REWARD, newBalance: (u.sparks || 0) + AD_REWARD });
    }

    // ── GET /feed ─────────────────────────────────────────
    if (path === "/feed" && req.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "0");
      const { data: videos } = await admin.from("videos").select("*").eq("status", "active").order("added_at", { ascending: false }).range(page * 10, (page + 1) * 10 - 1);
      const enriched = (videos || []).map(v => ({
        ...v,
        odds: { yes: calculateOdds(v.yes_pool||0, v.no_pool||0, "yes"), no: calculateOdds(v.yes_pool||0, v.no_pool||0, "no"), yesProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "yes")), noProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "no")) },
      }));
      // Background resolution pass — fire and forget
      runResolution(admin).catch(console.error);
      return ok({ videos: enriched, hasMore: enriched.length === 10 });
    }

    // ── GET /trending ─────────────────────────────────────
    if (path === "/trending" && req.method === "GET") {
      const { data: videos } = await admin.from("videos").select("*").eq("status", "active").order("total_bets", { ascending: false }).limit(20);
      const enriched = (videos || []).map(v => ({
        ...v,
        odds: { yes: calculateOdds(v.yes_pool||0, v.no_pool||0, "yes"), no: calculateOdds(v.yes_pool||0, v.no_pool||0, "no"), yesProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "yes")), noProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "no")) },
      }));
      return ok({ videos: enriched });
    }

    // ── GET /results ──────────────────────────────────────
    if (path === "/results" && req.method === "GET") {
      const { data: videos } = await admin.from("videos").select("*").neq("status", "active").order("resolved_at", { ascending: false }).limit(30);
      return ok({ videos: videos || [] });
    }

    // ── GET /profile ──────────────────────────────────────
    if (path === "/profile") {
      const e = needAuth(); if (e) return e;
      const { data } = await admin.from("users").select("*").eq("id", user!.id).single();
      return ok({ user: data });
    }

    // ── GET /myBets ───────────────────────────────────────
    if (path === "/myBets") {
      const e = needAuth(); if (e) return e;
      const { data, error: be } = await admin.from("bets").select("*").eq("uid", user!.id).order("placed_at", { ascending: false }).limit(50);
      if (be) return err(be.message, 500);
      return ok({ bets: data || [] });
    }

    // ── GET /leaderboard ──────────────────────────────────
    if (path === "/leaderboard") {
      const type  = url.searchParams.get("type") || "weekly";
      const table = type === "weekly" ? "leaderboard_weekly" : "leaderboard_alltime";
      const { data } = await admin.from(table).select("entries").limit(1).maybeSingle();
      return ok({ entries: data?.entries || [] });
    }

    // ── GET /videoUrl ─────────────────────────────────────
    if (path === "/videoUrl" && req.method === "GET") {
      const videoId = url.searchParams.get("id");
      if (!videoId) return err("id required");
      const { data: video } = await admin.from("videos").select("tiktok_url, direct_video_url, url_refreshed_at").eq("id", videoId).single();
      if (!video) return err("Not found", 404);
      const refreshedAt = video.url_refreshed_at ? new Date(video.url_refreshed_at) : null;
      const ageH        = refreshedAt ? (Date.now() - refreshedAt.getTime()) / 3_600_000 : 999;
      if (ageH < 12 && video.direct_video_url) return ok({ url: video.direct_video_url });
      try {
        const r    = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(video.tiktok_url)}`);
        const json = await r.json();
        const freshUrl = json?.data?.play;
        if (freshUrl) {
          await admin.from("videos").update({ direct_video_url: freshUrl, url_refreshed_at: new Date().toISOString() }).eq("id", videoId);
          return ok({ url: freshUrl });
        }
      } catch {}
      return ok({ url: video.direct_video_url });
    }

    // ── GET /analytics/insights ───────────────────────────
    // Internal endpoint for data product — returns aggregated why_reasons per video
    if (path === "/analytics/insights" && req.method === "GET") {
      const secret = req.headers.get("secret");
      if (secret !== RESOLVE_SECRET) return err("Unauthorized", 401);
      const videoId = url.searchParams.get("video_id");
      const query   = admin.from("prediction_insights").select("video_id, side, why_reasons, wagered");
      if (videoId) query.eq("video_id", videoId);
      const { data } = await query.limit(1000);
      return ok({ insights: data || [] });
    }

    return err("Not found", 404);
  } catch (e) {
    console.error("API error:", e);
    return err((e as Error).message, 500);
  }
});
