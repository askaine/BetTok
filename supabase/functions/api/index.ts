import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESOLVE_SECRET    = Deno.env.get("RESOLVE_SECRET") || "change-me";
const ADMIN_EMAIL       = "yonazikri@gmail.com";

// ── Constants ─────────────────────────────────────────────
const VIRALITY_THRESHOLD   = 1_000_000;
const SUBMISSION_THRESHOLD = 50_000;
const MIN_LIKES            = 500;
const MAX_LIKES            = 5_000;
const MAX_AGE_HOURS        = 168;
const DAILY_BONUS          = 100;
const RESOLUTION_DAYS      = 7;
const SEED_LIQUIDITY       = 300;
const MIN_ODDS             = 1.05;
const MAX_ODDS             = 15.0;
const MAX_SUBMISSIONS_PER_DAY = 3;
const CLEANUP_AFTER_DAYS   = 3;

const TIME_BONUS_TIERS = [
  { h: 1,        b: 1.5  },
  { h: 6,        b: 1.3  },
  { h: 24,       b: 1.15 },
  { h: 72,       b: 1.05 },
  { h: Infinity, b: 1.0  },
];

// ── Helpers ───────────────────────────────────────────────
function calculateOdds(yesPool: number, noPool: number, side: "yes" | "no"): number {
  const sy  = (yesPool || 0) + SEED_LIQUIDITY;
  const sn  = (noPool  || 0) + SEED_LIQUIDITY;
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

// Increment tag use count, create if new
async function upsertTags(admin: ReturnType<typeof createClient>, tags: string[]) {
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, "_");
    if (!clean) continue;
    await admin.from("tags").upsert(
      { name: clean, use_count: 1 },
      { onConflict: "name", ignoreDuplicates: false }
    ).then(() =>
      admin.rpc("increment_tag_count", { tag_name: clean }).catch(() => {})
    );
  }
}

async function runResolution(admin: ReturnType<typeof createClient>): Promise<number> {
  const now = new Date();
  let resolved = 0;

  const { data: candidates } = await admin
    .from("videos").select("*").eq("status", "active")
    .or(`resolution_deadline.lt.${now.toISOString()},current_views.gte.${VIRALITY_THRESHOLD}`);

  for (const video of (candidates || [])) {
    const freshViews   = await fetchViews(video.tiktok_url);
    const currentViews = freshViews ?? (video.current_views || 0);
    if (freshViews !== null) {
      await admin.from("videos").update({ current_views: freshViews }).eq("id", video.id);
    }

    const isViral      = currentViews >= VIRALITY_THRESHOLD;
    const isPastDead   = new Date(video.resolution_deadline) <= now;
    if (!isViral && !isPastDead) continue;

    const resolution = isViral ? "resolved_yes" : "resolved_no";
    await admin.from("videos").update({
      status: resolution,
      resolved_at: now.toISOString(),
      current_views: currentViews,
    }).eq("id", video.id);

    const { data: bets } = await admin
      .from("bets").select("*").eq("video_id", video.id).eq("status", "pending");

    for (const bet of (bets || [])) {
      const won          = bet.side === (isViral ? "yes" : "no");
      const sparksEarned = won ? (bet.potential_payout || 0) : 0;

      await admin.from("bets").update({
        status: won ? "won" : "lost",
        settled_at: now.toISOString(),
        sparks_earned: sparksEarned,
      }).eq("id", bet.id);

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
        const t = video.title || "A video";
        won
          ? await sendPush(u.push_token, "⚡ Bet Won!", `+${sparksEarned} Sparks — ${t}`)
          : await sendPush(u.push_token, "📉 Bet Lost", `${isViral ? "Went viral" : "Flopped"} — ${t}`);
      }
    }
    resolved++;
  }

  // Cleanup old resolved videos
  const cutoff = new Date(now.getTime() - CLEANUP_AFTER_DAYS * 86_400_000).toISOString();
  await admin.from("videos").delete().neq("status", "active").lt("resolved_at", cutoff);

  return resolved;
}

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Server ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url    = new URL(req.url);
  const path   = url.pathname
    .replace(/^\/functions\/v1\/api/, "")
    .replace(/^\/api/, "") || "/";
  const auth   = req.headers.get("Authorization");

  const supa  = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { global: { headers: { Authorization: auth || "" } } });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: { user } } = await supa.auth.getUser();

  const ok  = (data: unknown, s = 200) =>
    new Response(JSON.stringify(data), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const err = (msg: string,   s = 400) =>
    new Response(JSON.stringify({ error: msg }), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const requireAuth = () => (!user ? err("Unauthenticated", 401) : null);

  const requireAdmin = async () => {
    if (!user) return err("Unauthenticated", 401);
    const { data } = await admin.from("users").select("is_admin").eq("id", user.id).single();
    if (!data?.is_admin) return err("Forbidden", 403);
    return null;
  };

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

    // ── GET /tags/search ──────────────────────────────────
    // Returns popular tags matching the query for autocomplete
    if (path === "/tags/search" && req.method === "GET") {
      const q     = url.searchParams.get("q")?.trim() || "";
      const limit = parseInt(url.searchParams.get("limit") || "10");

      let query = admin.from("tags").select("name, use_count").order("use_count", { ascending: false }).limit(limit);
      if (q) query = query.ilike("name", `%${q}%`);

      const { data } = await query;
      return ok({ tags: (data || []).map(t => t.name) });
    }

    // ── POST /previewVideo ────────────────────────────────
    if (path === "/previewVideo" && req.method === "POST") {
      const e = requireAuth(); if (e) return e;
      const { tiktokUrl } = body;
      const cleanUrl = tiktokUrl.split("?")[0];

      const res  = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`);
      const json = await res.json();
      const v    = json.data;
      if (!v) return err("Could not fetch video data", 502);

      const uploadedAt = new Date(v.create_time * 1000);
      const ageHours   = (Date.now() - uploadedAt.getTime()) / 3_600_000;

      let followers = 0;
      if (v.author?.unique_id) {
        try {
          const ur   = await fetch(`https://www.tikwm.com/api/user/info?unique_id=${v.author.unique_id}`);
          const uj   = await ur.json();
          if (uj.data?.stats) followers = uj.data.stats.followerCount || 0;
        } catch {}
      }

      const videoId = extractVideoId(cleanUrl);
      let notDupe   = true;
      if (videoId) {
        const { data: ex } = await admin.from("videos").select("id").eq("tiktok_video_id", videoId).maybeSingle();
        if (ex) notDupe = false;
      }

      return ok({
        video: { thumbnail: v.cover, likes: v.digg_count, views: v.play_count, uploadedAt: uploadedAt.toISOString(), duration: v.duration },
        creator: { followers },
        eligibility: {
          likes:     v.digg_count >= MIN_LIKES && v.digg_count <= MAX_LIKES,
          views:     v.play_count < SUBMISSION_THRESHOLD,
          age:       ageHours <= MAX_AGE_HOURS,
          followers: followers < 100_000,
          notDupe,
        },
      });
    }

    // ── POST /ingestVideo ─────────────────────────────────
	if (path === "/ingestVideo" && req.method === "POST") {
	  const e = requireAuth(); if (e) return e;
	  const { tiktokUrl, categories = [], whyReasons = [] } = body;
	  const cleanUrl = tiktokUrl.split("?")[0];

	  // Rate limit
	  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
	  const { count } = await admin.from("videos").select("id", { count: "exact", head: true })
		.eq("added_by_uid", user!.id).gte("added_at", dayStart.toISOString());
	  if ((count || 0) >= MAX_SUBMISSIONS_PER_DAY)
		return ok({ accepted: false, reason: `Max ${MAX_SUBMISSIONS_PER_DAY} submissions per day` });

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

	  if (v.digg_count  < MIN_LIKES)            return ok({ accepted: false, reason: `Needs at least ${MIN_LIKES} likes` });
	  if (v.digg_count  > MAX_LIKES)            return ok({ accepted: false, reason: `Over ${MAX_LIKES.toLocaleString()} likes — too popular` });
	  if (v.play_count >= SUBMISSION_THRESHOLD) return ok({ accepted: false, reason: "Already too popular" });
	  if (ageH        > MAX_AGE_HOURS)        return ok({ accepted: false, reason: "Video older than 7 days" });

	  const now      = new Date();
	  const deadline = new Date(now.getTime() + RESOLUTION_DAYS * 86_400_000);

	  const { data: video, error: ve } = await admin.from("videos").insert({
		tiktok_url: cleanUrl, tiktok_video_id: videoId,
		direct_video_url: v.play, 
		
		// 🔥 FIXED: Pull the native vertical layout frame instead of the padded layout frame
		thumbnail_url: v.origin_cover || v.cover, 
		
		title: v.title || "Untitled", author_handle: "anonymous",
		uploaded_at: uploadedAt.toISOString(), added_by_uid: user!.id,
		likes_at_ingestion: v.digg_count, views_at_ingestion: v.play_count,
		current_views: v.play_count, resolution_deadline: deadline.toISOString(),
		url_refreshed_at: now.toISOString(), status: "active",
		total_bets: 0, yes_bets: 0, no_bets: 0, yes_pool: 0, no_pool: 0,
		noisy_bet_range: "a few", random_seed: Math.random(),
		categories,
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
    // FIX: removed the .catch() that was causing phantom errors
    if (path === "/placeBet" && req.method === "POST") {
      const e = requireAuth(); if (e) return e;
      const { videoId, side, multiplier = 1, baseWager = 100, whyReasons = [] } = body;

      const sparksWagered = Math.floor(baseWager * multiplier);

      const [{ data: userData, error: ue }, { data: videoData, error: ve2 }] = await Promise.all([
        admin.from("users").select("*").eq("id", user!.id).single(),
        admin.from("videos").select("*").eq("id", videoId).single(),
      ]);

      if (ue || !userData) return err("User not found", 404);
      if (ve2 || !videoData) return err("Video not found", 404);
      if (videoData.status !== "active") return err("This video has already been resolved");
      if (userData.sparks < sparksWagered) return err("Not enough Sparks");

      const { data: existingBet } = await admin
        .from("bets").select("id").eq("uid", user!.id).eq("video_id", videoId).maybeSingle();
      if (existingBet) return err("You've already placed a bet on this video!");

      const oddsAtBet    = calculateOdds(videoData.yes_pool || 0, videoData.no_pool || 0, side);
      const now          = new Date();
      const addedAt      = videoData.added_at || videoData.created_at;
      const timeBonus    = getTimeBonus(addedAt, now);
      const potentialPayout = Math.floor(sparksWagered * oddsAtBet * timeBonus);

      // Build bet object — only include why_reasons if column exists
      const betRow: Record<string, unknown> = {
        uid: user!.id, video_id: videoId, side, multiplier,
        base_wager: baseWager, sparks_wagered: sparksWagered,
        odds_at_bet: oddsAtBet, time_bonus: timeBonus,
        potential_payout: potentialPayout,
        status: "pending", placed_at: now.toISOString(),
      };

      // Safely add why_reasons — won't break if column missing
      if (Array.isArray(whyReasons) && whyReasons.length > 0) {
        betRow.why_reasons = whyReasons;
      }

      const { error: betErr } = await admin.from("bets").insert(betRow);

      if (betErr) {
        if (betErr.code === "23505") return err("You've already placed a bet on this video!");
        // If why_reasons column doesn't exist yet, retry without it
        if (betErr.message?.includes("why_reasons")) {
          delete betRow.why_reasons;
          const { error: retryErr } = await admin.from("bets").insert(betRow);
          if (retryErr) return err(retryErr.message, 500);
        } else {
          return err(betErr.message, 500);
        }
      }

      // Update user
      await admin.from("users").update({
        sparks:     userData.sparks - sparksWagered,
        total_bets: (userData.total_bets || 0) + 1,
      }).eq("id", user!.id);

      // Update video pools
      const newYesPool = side === "yes" ? (videoData.yes_pool || 0) + sparksWagered : (videoData.yes_pool || 0);
      const newNoPool  = side === "no"  ? (videoData.no_pool  || 0) + sparksWagered : (videoData.no_pool  || 0);
      const newTotal   = (videoData.total_bets || 0) + 1;

      await admin.from("videos").update({
        total_bets: newTotal, noisy_bet_range: noisyRange(newTotal),
        yes_bets: side === "yes" ? (videoData.yes_bets || 0) + 1 : videoData.yes_bets,
        no_bets:  side === "no"  ? (videoData.no_bets  || 0) + 1 : videoData.no_bets,
        yes_pool: newYesPool, no_pool: newNoPool,
      }).eq("id", videoId);

      // Store insights (fire and forget — never blocks bet success)
      if (whyReasons.length > 0) {
        admin.from("prediction_insights").insert({
          video_id: videoId, uid: user!.id, side,
          why_reasons: whyReasons, wagered: sparksWagered,
          odds_at_bet: oddsAtBet, created_at: now.toISOString(),
        }).then(() => {}).catch(() => {});
      }

      // Update tags use counts (fire and forget)
      if (whyReasons.length > 0) {
        Promise.all(whyReasons.map((tag: string) =>
          admin.from("tags")
            .upsert({ name: tag.trim().toLowerCase(), use_count: 1 }, { onConflict: "name" })
        )).catch(() => {});
      }

      const newYesOdds = calculateOdds(newYesPool, newNoPool, "yes");
      const newNoOdds  = calculateOdds(newYesPool, newNoPool, "no");

      return ok({
        success: true, sparksWagered, oddsAtBet, timeBonus, potentialPayout,
        newOdds: { yes: newYesOdds, no: newNoOdds, yesProb: oddsToProb(newYesOdds), noProb: oddsToProb(newNoOdds) },
      });
    }

    // ── POST /claimDailyBonus ─────────────────────────────
    if (path === "/claimDailyBonus" && req.method === "POST") {
      const e = requireAuth(); if (e) return e;
      const { data: u } = await admin.from("users").select("*").eq("id", user!.id).single();
      if (!u) return err("User not found", 404);
      const now  = new Date();
      const last = u.last_daily_bonus ? new Date(u.last_daily_bonus) : null;
      if (last) {
        const h = (now.getTime() - last.getTime()) / 3_600_000;
        if (h < 24) {
          const m  = Math.ceil((last.getTime() + 86_400_000 - now.getTime()) / 60_000);
          const hh = Math.floor(m / 60);
          return err(`Come back in ${hh >= 1 ? `${hh}h ${m % 60}m` : `${m}m`} for your next bonus`);
        }
      }
      // Update streak
      let newStreak = 1;
      if (last) {
        const h = (now.getTime() - last.getTime()) / 3_600_000;
        newStreak = h <= 48 ? (u.current_streak || 0) + 1 : 1;
      }
      const newBal = (u.sparks || 0) + DAILY_BONUS;
      await admin.from("users").update({
        sparks: newBal, last_daily_bonus: now.toISOString(),
        current_streak: newStreak,
        longest_streak: Math.max(u.longest_streak || 0, newStreak),
      }).eq("id", user!.id);
      return ok({ awarded: DAILY_BONUS, newBalance: newBal, newStreak });
    }

    // ── POST /registerPushToken ───────────────────────────
    if (path === "/registerPushToken" && req.method === "POST") {
      const e = requireAuth(); if (e) return e;
      const { token } = body;
      if (!token) return err("token required");
      await admin.from("users").update({ push_token: token }).eq("id", user!.id);
      return ok({ ok: true });
    }

    // ── POST /flagVideo ───────────────────────────────────
    if (path === "/flagVideo" && req.method === "POST") {
      const e = requireAuth(); if (e) return e;
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
      return ok({ ok: true, resolved });
    }

    // ── GET /feed ─────────────────────────────────────────
    if (path === "/feed" && req.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "0");
      const { data: videos } = await admin.from("videos").select("*").eq("status", "active")
        .order("added_at", { ascending: false }).range(page * 10, (page + 1) * 10 - 1);
      const enriched = (videos || []).map(v => ({
        ...v,
        odds: { yes: calculateOdds(v.yes_pool||0, v.no_pool||0, "yes"), no: calculateOdds(v.yes_pool||0, v.no_pool||0, "no"), yesProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "yes")), noProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "no")) },
      }));
      // Background resolution — never blocks feed
      runResolution(admin).catch(() => {});
      return ok({ videos: enriched, hasMore: enriched.length === 10 });
    }

    // ── GET /trending ─────────────────────────────────────
    if (path === "/trending" && req.method === "GET") {
      const { data: videos } = await admin.from("videos").select("*").eq("status", "active")
        .order("total_bets", { ascending: false }).limit(20);
      const enriched = (videos || []).map(v => ({
        ...v,
        odds: { yes: calculateOdds(v.yes_pool||0, v.no_pool||0, "yes"), no: calculateOdds(v.yes_pool||0, v.no_pool||0, "no"), yesProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "yes")), noProb: oddsToProb(calculateOdds(v.yes_pool||0, v.no_pool||0, "no")) },
      }));
      return ok({ videos: enriched });
    }

    // ── GET /results ──────────────────────────────────────
    if (path === "/results" && req.method === "GET") {
      const { data: videos } = await admin.from("videos").select("*").neq("status", "active")
        .order("resolved_at", { ascending: false }).limit(30);
      return ok({ videos: videos || [] });
    }

    // ── GET /profile ──────────────────────────────────────
    if (path === "/profile") {
      const e = requireAuth(); if (e) return e;
      const { data } = await admin.from("users").select("*").eq("id", user!.id).single();
      return ok({ user: data });
    }

    // ── GET /myBets ───────────────────────────────────────
    if (path === "/myBets") {
      const e = requireAuth(); if (e) return e;
      const { data, error: be } = await admin.from("bets").select("*").eq("uid", user!.id)
        .order("placed_at", { ascending: false }).limit(50);
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
      const { data: video } = await admin.from("videos")
        .select("tiktok_url, direct_video_url, url_refreshed_at").eq("id", videoId).single();
      if (!video) return err("Not found", 404);
      const refreshedAt = video.url_refreshed_at ? new Date(video.url_refreshed_at) : null;
      const ageH        = refreshedAt ? (Date.now() - refreshedAt.getTime()) / 3_600_000 : 999;
      if (ageH < 12 && video.direct_video_url) return ok({ url: video.direct_video_url });
      try {
        const r   = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(video.tiktok_url)}`);
        const j   = await r.json();
        const url2 = j?.data?.play;
        if (url2) {
          await admin.from("videos").update({ direct_video_url: url2, url_refreshed_at: new Date().toISOString() }).eq("id", videoId);
          return ok({ url: url2 });
        }
      } catch {}
      return ok({ url: video.direct_video_url });
    }

    // ══════════════════════════════════════════════════════
    // ADMIN ENDPOINTS — yonazikri@gmail.com only
    // ══════════════════════════════════════════════════════

    // ── GET /admin/stats ──────────────────────────────────
    if (path === "/admin/stats" && req.method === "GET") {
      const ae = await requireAdmin(); if (ae) return ae;

      const [
        { count: totalUsers },
        { count: totalBets },
        { count: totalVideos },
        { count: activeVideos },
        { count: resolvedVideos },
        { data: topTags },
        { data: recentBets },
      ] = await Promise.all([
        admin.from("users").select("id", { count: "exact", head: true }),
        admin.from("bets").select("id", { count: "exact", head: true }),
        admin.from("videos").select("id", { count: "exact", head: true }),
        admin.from("videos").select("id", { count: "exact", head: true }).eq("status", "active"),
        admin.from("videos").select("id", { count: "exact", head: true }).neq("status", "active"),
        admin.from("tags").select("name, use_count").order("use_count", { ascending: false }).limit(20),
        admin.from("bets").select("sparks_wagered, status").limit(1000),
      ]);

      const totalSparksWagered = (recentBets || []).reduce((s, b) => s + (b.sparks_wagered || 0), 0);
      const wonBets            = (recentBets || []).filter(b => b.status === "won").length;
      const accuracy           = recentBets?.length ? Math.round((wonBets / recentBets.length) * 100) : 0;

      return ok({
        totalUsers, totalBets, totalVideos, activeVideos, resolvedVideos,
        totalSparksWagered, overallAccuracy: accuracy,
        topTags: topTags || [],
      });
    }

    // ── GET /admin/users ──────────────────────────────────
    if (path === "/admin/users" && req.method === "GET") {
      const ae = await requireAdmin(); if (ae) return ae;
      const page  = parseInt(url.searchParams.get("page") || "0");
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const q     = url.searchParams.get("q") || "";

      let query = admin.from("users").select("id, username, sparks, total_bets, correct_bets, current_streak, longest_streak, all_time_score, badges, created_at, is_admin");
      if (q) query = query.ilike("username", `%${q}%`);
      query = query.order("all_time_score", { ascending: false }).range(page * limit, (page + 1) * limit - 1);

      const { data, error: ue } = await query;
      if (ue) return err(ue.message, 500);
      return ok({ users: data || [] });
    }

    // ── GET /admin/videos ─────────────────────────────────
    if (path === "/admin/videos" && req.method === "GET") {
      const ae = await requireAdmin(); if (ae) return ae;
      const status = url.searchParams.get("status") || "active";
      const page   = parseInt(url.searchParams.get("page") || "0");

      const { data, error: ve } = await admin.from("videos").select("*")
        .eq("status", status).order("added_at", { ascending: false })
        .range(page * 20, (page + 1) * 20 - 1);
      if (ve) return err(ve.message, 500);
      return ok({ videos: data || [] });
    }

    // ── GET /admin/bets ───────────────────────────────────
    if (path === "/admin/bets" && req.method === "GET") {
      const ae = await requireAdmin(); if (ae) return ae;
      const page     = parseInt(url.searchParams.get("page") || "0");
      const videoId  = url.searchParams.get("video_id") || "";
      const status   = url.searchParams.get("status") || "";

      let query = admin.from("bets").select("*");
      if (videoId) query = query.eq("video_id", videoId);
      if (status)  query = query.eq("status", status);
      query = query.order("placed_at", { ascending: false }).range(page * 50, (page + 1) * 50 - 1);

      const { data, error: be } = await query;
      if (be) return err(be.message, 500);
      return ok({ bets: data || [] });
    }

    // ── GET /admin/insights ───────────────────────────────
    // The data product — aggregated why_reasons
    if (path === "/admin/insights" && req.method === "GET") {
      const ae = await requireAdmin(); if (ae) return ae;
      const videoId  = url.searchParams.get("video_id") || "";
      const fromDate = url.searchParams.get("from") || "";
      const toDate   = url.searchParams.get("to") || "";

      let query = admin.from("prediction_insights").select("video_id, side, why_reasons, wagered, odds_at_bet, created_at");
      if (videoId)  query = query.eq("video_id", videoId);
      if (fromDate) query = query.gte("created_at", fromDate);
      if (toDate)   query = query.lte("created_at", toDate);
      query = query.order("created_at", { ascending: false }).limit(2000);

      const { data, error: ie } = await query;
      if (ie) return err(ie.message, 500);
      return ok({ insights: data || [], count: data?.length || 0 });
    }

    // ── GET /admin/export ─────────────────────────────────
    // Returns CSV-ready aggregated insight data
    if (path === "/admin/export" && req.method === "GET") {
      const ae = await requireAdmin(); if (ae) return ae;
      const type = url.searchParams.get("type") || "insights";

      if (type === "insights") {
        const { data } = await admin.from("prediction_insights")
          .select("video_id, side, why_reasons, wagered, created_at").limit(5000);

        // Flatten why_reasons array into rows
        const rows: Record<string, unknown>[] = [];
        for (const row of (data || [])) {
          for (const reason of (row.why_reasons || [])) {
            rows.push({ video_id: row.video_id, side: row.side, reason, wagered: row.wagered, created_at: row.created_at });
          }
        }
        return ok({ rows, count: rows.length });
      }

      if (type === "users") {
        const { data } = await admin.from("users")
          .select("username, sparks, total_bets, correct_bets, current_streak, longest_streak, all_time_score, created_at")
          .order("all_time_score", { ascending: false }).limit(1000);
        return ok({ rows: data || [], count: data?.length || 0 });
      }

      if (type === "videos") {
        const { data } = await admin.from("videos")
          .select("id, title, status, total_bets, yes_bets, no_bets, likes_at_ingestion, current_views, categories, added_at, resolved_at")
          .order("added_at", { ascending: false }).limit(1000);
        return ok({ rows: data || [], count: data?.length || 0 });
      }

      return err("Unknown export type");
    }

    // ── POST /admin/removeVideo ───────────────────────────
    if (path === "/admin/removeVideo" && req.method === "POST") {
      const ae = await requireAdmin(); if (ae) return ae;
      const { videoId, reason } = body;
      if (!videoId) return err("videoId required");
      await admin.from("videos").update({ status: "flagged" }).eq("id", videoId);
      return ok({ ok: true });
    }

    // ── POST /admin/adjustSparks ──────────────────────────
    if (path === "/admin/adjustSparks" && req.method === "POST") {
      const ae = await requireAdmin(); if (ae) return ae;
      const { userId, amount, reason } = body;
      if (!userId || !amount) return err("userId and amount required");
      const { data: u } = await admin.from("users").select("sparks, username").eq("id", userId).single();
      if (!u) return err("User not found", 404);
      const newBal = Math.max(0, (u.sparks || 0) + amount);
      await admin.from("users").update({ sparks: newBal }).eq("id", userId);
      return ok({ ok: true, username: u.username, oldBalance: u.sparks, newBalance: newBal });
    }

    return err("Not found", 404);
  } catch (e) {
    console.error("API error:", e);
    return err((e as Error).message, 500);
  }
});
