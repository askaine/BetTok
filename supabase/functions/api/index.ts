import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Game constants ────────────────────────────────────────
const VIRALITY_THRESHOLD  = 50_000;
const MIN_LIKES           = 500;
const MAX_LIKES           = 5_000;
const MAX_AGE_HOURS       = 168;
const DAILY_BONUS         = 100;
const RESOLUTION_DAYS     = 7;
const SEED_LIQUIDITY      = 300;
const MIN_ODDS            = 1.05;
const MAX_ODDS            = 15.0;
const MAX_BASE_WAGER      = 10_000;  // hard cap per bet
const MAX_MULTIPLIER      = 10;      // hard cap on multiplier
const MAX_VIDEOS_PER_DAY  = 5;       // ingestVideo rate limit per user

// Allowed TikTok hostnames for SSRF protection
const TIKTOK_HOSTNAMES = new Set([
  "www.tiktok.com",
  "tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
]);

// Bracket view-range bands — must match BetScreen.js BRACKET_OPTIONS
const BRACKET_ODDS: Record<string, number> = {
  "<100k":     1.5,
  "100k-500k": 2.5,
  "500k-1m":   4.0,
  "1m-5m":     7.0,
  "5m+":       15.0,
};

const TIME_BONUS_TIERS = [
  { hoursAfterAdded: 1,        bonus: 1.5  },
  { hoursAfterAdded: 6,        bonus: 1.3  },
  { hoursAfterAdded: 24,       bonus: 1.15 },
  { hoursAfterAdded: 72,       bonus: 1.05 },
  { hoursAfterAdded: Infinity, bonus: 1.0  },
];

// ── Helpers ───────────────────────────────────────────────

function calculateOdds(yesPool: number, noPool: number, side: "yes" | "no"): number {
  const seededYes   = (yesPool  || 0) + SEED_LIQUIDITY;
  const seededNo    = (noPool   || 0) + SEED_LIQUIDITY;
  const totalSeeded = seededYes + seededNo;
  const sidePool    = side === "yes" ? seededYes : seededNo;
  const rawOdds     = totalSeeded / sidePool;
  return +Math.min(MAX_ODDS, Math.max(MIN_ODDS, rawOdds)).toFixed(3);
}

function oddsToProb(odds: number): number {
  return Math.round(Math.min(99, Math.max(1, (1 / odds) * 100)));
}

function getTimeBonus(videoAddedAt: string, betPlacedAt: Date): number {
  const hoursElapsed =
    (betPlacedAt.getTime() - new Date(videoAddedAt).getTime()) / (1000 * 60 * 60);
  for (const tier of TIME_BONUS_TIERS) {
    if (hoursElapsed <= tier.hoursAfterAdded) return tier.bonus;
  }
  return 1.0;
}

function generateNoisyRange(realCount: number): string {
  if (realCount <= 10)   return "a few";
  if (realCount <= 50)   return "10–50";
  if (realCount <= 200)  return "50–200";
  if (realCount <= 500)  return "200–500";
  if (realCount <= 1000) return "500+";
  return "1000+";
}

function extractTikTokVideoId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Validate that a URL is a legitimate TikTok URL.
 * Returns the cleaned URL string, or null if invalid.
 */
function validateTikTokUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    // Only allow https
    if (parsed.protocol !== "https:") return null;
    // Only allow known TikTok hostnames
    if (!TIKTOK_HOSTNAMES.has(parsed.hostname)) return null;
    // Strip tracking query params — return clean URL
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESOLVE_SECRET = Deno.env.get("RESOLVE_SECRET") || "change-this-secret";
 
async function fetchCurrentViews(tiktokUrl: string): Promise<number | null> {
  try {
    const res  = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`);
    const json = await res.json();
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
 
function checkBracketWin(bet: Record<string, unknown>, currentViews: number, isViral: boolean): boolean {
  if (bet.bet_type === "binary") return bet.side === (isViral ? "yes" : "no");
  if (bet.bet_type === "bracket") {
    const b = bet.bracket as string;
    if (b === "<100k")     return currentViews < 100_000;
    if (b === "100k-500k") return currentViews >= 100_000 && currentViews < 500_000;
    if (b === "500k-1m")   return currentViews >= 500_000 && currentViews < 1_000_000;
    if (b === "1m-5m")     return currentViews >= 1_000_000 && currentViews < 5_000_000;
    if (b === "5m+")       return currentViews >= 5_000_000;
  }
  if (bet.bet_type === "parlay") {
    const legs = (bet.parlay_legs as { side: string }[]) || [];
    return legs[0]?.side === (isViral ? "yes" : "no");
  }
  return false;
}
 
async function runResolutionPass(adminClient: ReturnType<typeof createClient>): Promise<number> {
  const now = new Date();
  let resolved = 0;
 
  // Find all active videos past their deadline OR already viral
  const { data: candidates } = await adminClient
    .from("videos")
    .select("*")
    .eq("status", "active")
    .or(`resolution_deadline.lt.${now.toISOString()},current_views.gte.50000`);
 
  for (const video of (candidates || [])) {
    const freshViews   = await fetchCurrentViews(video.tiktok_url);
    const currentViews = freshViews ?? (video.current_views || 0);
 
    if (freshViews !== null) {
      await adminClient.from("videos").update({ current_views: freshViews }).eq("id", video.id);
    }
 
    const isViral = currentViews >= 50_000;
    const isPastDeadline = new Date(video.resolution_deadline) <= now;
 
    // Only resolve if deadline passed OR already viral
    if (!isViral && !isPastDeadline) continue;
 
    const resolution = isViral ? "resolved_yes" : "resolved_no";
 
    await adminClient.from("videos").update({
      status:       resolution,
      resolved_at:  now.toISOString(),
      current_views: currentViews,
    }).eq("id", video.id);
 
    // Settle all pending bets
    const { data: bets } = await adminClient
      .from("bets").select("*").eq("video_id", video.id).eq("status", "pending");
 
    for (const bet of (bets || [])) {
      const won          = checkBracketWin(bet, currentViews, isViral);
      const sparksEarned = won ? (bet.potential_payout || 0) : 0;
 
      await adminClient.from("bets").update({
        status:        won ? "won" : "lost",
        settled_at:    now.toISOString(),
        sparks_earned: sparksEarned,
      }).eq("id", bet.id);
 
      const { data: userData } = await adminClient.from("users").select("*").eq("id", bet.uid).single();
      if (!userData) continue;
 
      const updates: Record<string, unknown> = {};
      if (won) {
        updates.sparks         = (userData.sparks || 0) + sparksEarned;
        updates.correct_bets   = (userData.correct_bets || 0) + 1;
        updates.current_streak = (userData.current_streak || 0) + 1;
        updates.weekly_score   = (userData.weekly_score || 0) + sparksEarned;
        updates.all_time_score = (userData.all_time_score || 0) + sparksEarned;
        const newStreak = (userData.current_streak || 0) + 1;
        if (newStreak > (userData.longest_streak || 0)) updates.longest_streak = newStreak;
        const badges = [...(userData.badges || [])];
        if (!badges.includes("contrarian") && bet.side === "no") badges.push("contrarian");
        if (newStreak >= 5  && !badges.includes("streak_5"))  badges.push("streak_5");
        if (newStreak >= 10 && !badges.includes("streak_10")) badges.push("streak_10");
        const allTime = (userData.all_time_score || 0) + sparksEarned;
        if (allTime >= 1000 && !badges.includes("club_1000")) badges.push("club_1000");
        if (allTime >= 5000 && !badges.includes("club_5000")) badges.push("club_5000");
        updates.badges = badges;
      } else {
        if ((userData.current_streak || 0) > (userData.longest_streak || 0)) {
          updates.longest_streak = userData.current_streak;
        }
        updates.current_streak = 0;
      }
      await adminClient.from("users").update(updates).eq("id", bet.uid);
 
      if (userData.push_token) {
        const title = video.title || "A video";
        if (won) {
          await sendPush(userData.push_token, "⚡ Bet Won!", `+${sparksEarned} Sparks — ${title}`);
        } else {
          await sendPush(userData.push_token, "📉 Bet Lost", `${isViral ? "Went viral" : "Flopped"} — ${title}`);
        }
      }
    }
    resolved++;
  }
 
  // Cleanup: delete resolved videos older than 3 days
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  await adminClient.from("videos").delete()
    .neq("status", "active")
    .lt("resolved_at", threeDaysAgo);
 
  return resolved;
}




// ── Server ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url        = new URL(req.url);
  const path       = url.pathname
    .replace(/^\/functions\/v1\/api/, "")
    .replace(/^\/api/, "") || "/";
  const authHeader = req.headers.get("Authorization");

  // supabase: verifies the caller's JWT and resolves req user
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: { headers: { Authorization: authHeader || "" } },
  });
  // admin: service-role client for DB writes — always bypasses RLS intentionally
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user } } = await supabase.auth.getUser();

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const requireAuth = () => {
    if (!user) return respond({ error: "Unauthenticated" }, 401);
    return null;
  };

  try {
    const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};

    // ── POST /ingestVideo ─────────────────────────────────
    if (path === "/ingestVideo" && req.method === "POST") {
      const authErr = requireAuth(); if (authErr) return authErr;

      const { tiktokUrl } = body;
      if (!tiktokUrl || typeof tiktokUrl !== "string") {
        return respond({ error: "tiktokUrl is required" }, 400);
      }

      // SSRF protection: validate the URL is actually a TikTok URL
      const cleanUrl = validateTikTokUrl(tiktokUrl);
      if (!cleanUrl) {
        return respond({ error: "Invalid TikTok URL" }, 400);
      }

      // Rate limit: max MAX_VIDEOS_PER_DAY submissions per user per 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: submissionCount } = await admin
        .from("videos")
        .select("id", { count: "exact", head: true })
        .eq("added_by_uid", user!.id)
        .gte("created_at", oneDayAgo);

      if ((submissionCount ?? 0) >= MAX_VIDEOS_PER_DAY) {
        return respond({
          accepted: false,
          reason: `Daily submission limit reached (${MAX_VIDEOS_PER_DAY} videos per day)`,
        });
      }

      const videoId = extractTikTokVideoId(cleanUrl);
      if (videoId) {
        const { data: existing } = await admin
          .from("videos").select("id").eq("tiktok_video_id", videoId).maybeSingle();
        if (existing) return respond({ accepted: false, reason: "Already in the pool" });
      }

      const scraperRes  = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(cleanUrl)}`);
      const scraperJson = await scraperRes.json();
      const v           = scraperJson.data;
      if (!v) return respond({ error: "Could not fetch video data" }, 502);

      const uploadedAt = new Date(v.create_time * 1000);
      const ageHours   = (Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60);

      if (v.digg_count  < MIN_LIKES)          return respond({ accepted: false, reason: `Needs at least ${MIN_LIKES} likes` });
      if (v.digg_count  > MAX_LIKES)          return respond({ accepted: false, reason: `Over ${MAX_LIKES.toLocaleString()} likes — too popular already` });
      if (v.play_count >= VIRALITY_THRESHOLD) return respond({ accepted: false, reason: "Already passed the viral threshold" });
      if (ageHours      > MAX_AGE_HOURS)      return respond({ accepted: false, reason: "Video is older than 7 days" });

      const now      = new Date();
      const deadline = new Date(now.getTime() + RESOLUTION_DAYS * 24 * 60 * 60 * 1000);

      const { data: video, error } = await admin.from("videos").insert({
        tiktok_url:          cleanUrl,
        tiktok_video_id:     videoId,
        direct_video_url:    v.play,
        author_handle:       "anonymous",
        thumbnail_url:       v.cover,
        title:               v.title || "Untitled",
        uploaded_at:         uploadedAt.toISOString(),
        added_by_uid:        user!.id,
        likes_at_ingestion:  v.digg_count,
        views_at_ingestion:  v.play_count,
        current_views:       v.play_count,
        resolution_deadline: deadline.toISOString(),
        url_refreshed_at:    now.toISOString(),
        random_seed:         Math.random(),
        noisy_bet_range:     "a few",
        status:              "active",
        total_bets:          0,
        yes_bets:            0,
        no_bets:             0,
        yes_pool:            0,
        no_pool:             0,
      }).select().single();

      if (error) return respond({ error: "Failed to save video" }, 500);

      await admin.from("resolution_queue").insert({
        video_id:       video.id,
        check_24h_at:   new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        check_48h_at:   new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        check_7d_at:    deadline.toISOString(),
        check_24h_done: false,
        check_48h_done: false,
        check_7d_done:  false,
      });

      return respond({ accepted: true, videoId: video.id });
    }
	
	
	
	// ── POST /manualResolve ───────────────────────────────
    if (path === "/manualResolve" && req.method === "POST") {
      const secret = req.headers.get("secret") || body.secret;
      // Allow logged-in users OR a secret key (for cron jobs)
      if (!user && secret !== RESOLVE_SECRET) {
        return respond({ error: "Unauthorized" }, 401);
      }
      const resolved = await runResolutionPass(admin);
      return respond({ ok: true, resolved, message: `Resolved ${resolved} video(s)` });
    }

    // ── POST /placeBet ────────────────────────────────────
    if (path === "/placeBet" && req.method === "POST") {
      const authErr = requireAuth(); if (authErr) return authErr;

      const { betType = "binary", videoId, side, bracket, legs, multiplier, baseWager } = body;

      // ── Input validation ──────────────────────────────
      const parsedBaseWager  = Number(baseWager);
      const parsedMultiplier = Number(multiplier ?? 1);

      if (
        !Number.isInteger(parsedBaseWager) ||
        parsedBaseWager < 1 ||
        parsedBaseWager > MAX_BASE_WAGER
      ) {
        return respond({ error: `baseWager must be a whole number between 1 and ${MAX_BASE_WAGER}` }, 400);
      }
      if (
        !Number.isFinite(parsedMultiplier) ||
        parsedMultiplier < 1 ||
        parsedMultiplier > MAX_MULTIPLIER
      ) {
        return respond({ error: `multiplier must be between 1 and ${MAX_MULTIPLIER}` }, 400);
      }

      // Actual sparks at risk = base wager × multiplier
      const sparksWagered = Math.floor(parsedBaseWager * parsedMultiplier);
      const now = new Date();

      // ─────────────────────────────────────────────────────
      // BINARY BET
      // ─────────────────────────────────────────────────────
      if (betType === "binary") {
        if (!side || !["yes", "no"].includes(side)) {
          return respond({ error: "side must be 'yes' or 'no' for binary bets" }, 400);
        }
        if (!videoId) return respond({ error: "videoId is required" }, 400);

        const { data: videoData } = await admin.from("videos").select("*").eq("id", videoId).single();
        if (!videoData) return respond({ error: "Video not found" }, 404);
        if (videoData.status !== "active") return respond({ error: "This video has already been resolved" }, 400);

        const { data: existingBet } = await admin
          .from("bets").select("id")
          .eq("uid", user!.id).eq("video_id", videoId).eq("bet_type", "binary")
          .maybeSingle();
        if (existingBet) return respond({ error: "You've already placed a bet on this video!" }, 400);

        const oddsAtBet       = calculateOdds(videoData.yes_pool || 0, videoData.no_pool || 0, side);
        const addedAt         = videoData.added_at || videoData.created_at;
        const timeBonus       = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * oddsAtBet * timeBonus);

        // ── Atomic sparks deduction via RPC ──────────────
        // The deduct_sparks() function checks balance and deducts in a single
        // statement, preventing race conditions and negative balances.
        const { error: deductErr } = await admin.rpc("deduct_sparks", {
          p_user_id: user!.id,
          p_amount:  sparksWagered,
        });
        if (deductErr) {
          if (deductErr.message.includes("INSUFFICIENT_SPARKS")) {
            return respond({ error: "Not enough Sparks" }, 400);
          }
          return respond({ error: "Failed to place bet" }, 500);
        }

        // Insert bet record; if this fails, refund the sparks
        const { error: betErr } = await admin.from("bets").insert({
          uid:              user!.id,
          video_id:         videoId,
          bet_type:         "binary",
          side,
          multiplier:       parsedMultiplier,
          base_wager:       parsedBaseWager,
          sparks_wagered:   sparksWagered,
          odds_at_bet:      oddsAtBet,
          time_bonus:       timeBonus,
          potential_payout: potentialPayout,
          status:           "pending",
          placed_at:        now.toISOString(),
        });

        if (betErr) {
          await admin.rpc("refund_sparks", { p_user_id: user!.id, p_amount: sparksWagered });
          if (betErr.code === "23505") return respond({ error: "You've already placed a bet on this video!" }, 400);
          return respond({ error: "Failed to save bet" }, 500);
        }

        const newYesPool = side === "yes" ? (videoData.yes_pool || 0) + sparksWagered : (videoData.yes_pool || 0);
        const newNoPool  = side === "no"  ? (videoData.no_pool  || 0) + sparksWagered : (videoData.no_pool  || 0);
        const newTotal   = (videoData.total_bets || 0) + 1;

        await admin.from("videos").update({
          total_bets:      newTotal,
          yes_bets:        side === "yes" ? (videoData.yes_bets || 0) + 1 : videoData.yes_bets,
          no_bets:         side === "no"  ? (videoData.no_bets  || 0) + 1 : videoData.no_bets,
          yes_pool:        newYesPool,
          no_pool:         newNoPool,
          noisy_bet_range: generateNoisyRange(newTotal),
        }).eq("id", videoId);

        const newYesOdds = calculateOdds(newYesPool, newNoPool, "yes");
        const newNoOdds  = calculateOdds(newYesPool, newNoPool, "no");

        return respond({
          success: true, sparksWagered, oddsAtBet, timeBonus, potentialPayout,
          newOdds: { yes: newYesOdds, no: newNoOdds, yesProb: oddsToProb(newYesOdds), noProb: oddsToProb(newNoOdds) },
        });
      }

      // ─────────────────────────────────────────────────────
      // BRACKET BET
      // ─────────────────────────────────────────────────────
      if (betType === "bracket") {
        if (!bracket || !BRACKET_ODDS[bracket]) {
          return respond({ error: "Invalid bracket selection" }, 400);
        }
        if (!videoId) return respond({ error: "videoId is required" }, 400);

        const { data: videoData } = await admin.from("videos").select("*").eq("id", videoId).single();
        if (!videoData) return respond({ error: "Video not found" }, 404);
        if (videoData.status !== "active") return respond({ error: "This video has already been resolved" }, 400);

        const { data: existingBet } = await admin
          .from("bets").select("id")
          .eq("uid", user!.id).eq("video_id", videoId).eq("bet_type", "bracket")
          .maybeSingle();
        if (existingBet) return respond({ error: "You've already placed a bracket bet on this video!" }, 400);

        const bracketOdds    = BRACKET_ODDS[bracket];
        const addedAt        = videoData.added_at || videoData.created_at;
        const timeBonus      = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * bracketOdds * timeBonus);

        // Atomic deduction
        const { error: deductErr } = await admin.rpc("deduct_sparks", {
          p_user_id: user!.id,
          p_amount:  sparksWagered,
        });
        if (deductErr) {
          if (deductErr.message.includes("INSUFFICIENT_SPARKS")) {
            return respond({ error: "Not enough Sparks" }, 400);
          }
          return respond({ error: "Failed to place bet" }, 500);
        }

        const { error: betErr } = await admin.from("bets").insert({
          uid:              user!.id,
          video_id:         videoId,
          bet_type:         "bracket",
          side:             "bracket",
          bracket,
          multiplier:       parsedMultiplier,
          base_wager:       parsedBaseWager,
          sparks_wagered:   sparksWagered,
          odds_at_bet:      bracketOdds,
          time_bonus:       timeBonus,
          potential_payout: potentialPayout,
          status:           "pending",
          placed_at:        now.toISOString(),
        });

        if (betErr) {
          await admin.rpc("refund_sparks", { p_user_id: user!.id, p_amount: sparksWagered });
          if (betErr.code === "23505") return respond({ error: "You've already placed a bracket bet on this video!" }, 400);
          return respond({ error: "Failed to save bet" }, 500);
        }

        const newTotal = (videoData.total_bets || 0) + 1;
        await admin.from("videos").update({
          total_bets:      newTotal,
          noisy_bet_range: generateNoisyRange(newTotal),
        }).eq("id", videoId);

        return respond({ success: true, sparksWagered, bracketOdds, timeBonus, potentialPayout });
      }

      // ─────────────────────────────────────────────────────
      // PARLAY BET
      // legs: [{ videoId, side }] — minimum 2, maximum 3
      // ─────────────────────────────────────────────────────
      if (betType === "parlay") {
        if (!Array.isArray(legs) || legs.length < 2) {
          return respond({ error: "Parlay requires at least 2 legs" }, 400);
        }
        if (legs.length > 3) {
          return respond({ error: "Maximum 3 legs per parlay" }, 400);
        }

        const videoIds = legs.map((l: { videoId: string }) => l.videoId);
        const { data: videosData } = await admin
          .from("videos").select("*").in("id", videoIds);

        if (!videosData || videosData.length !== videoIds.length) {
          return respond({ error: "One or more videos not found" }, 404);
        }

        const inactiveVideo = videosData.find(v => v.status !== "active");
        if (inactiveVideo) {
          return respond({ error: "One or more videos have already been resolved" }, 400);
        }

        const parlayOdds = legs.reduce((acc: number, leg: { videoId: string; side: string }) => {
          const v = videosData.find(vd => vd.id === leg.videoId)!;
          const legOdds = calculateOdds(v.yes_pool || 0, v.no_pool || 0, leg.side as "yes" | "no");
          return acc * legOdds;
        }, 1.0);

        const primaryVideoId  = legs[0].videoId;
        const addedAt         = videosData.find(v => v.id === primaryVideoId)?.added_at || now.toISOString();
        const timeBonus       = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * parlayOdds * timeBonus);

        // Atomic deduction
        const { error: deductErr } = await admin.rpc("deduct_sparks", {
          p_user_id: user!.id,
          p_amount:  sparksWagered,
        });
        if (deductErr) {
          if (deductErr.message.includes("INSUFFICIENT_SPARKS")) {
            return respond({ error: "Not enough Sparks" }, 400);
          }
          return respond({ error: "Failed to place bet" }, 500);
        }

        const { error: betErr } = await admin.from("bets").insert({
          uid:              user!.id,
          video_id:         primaryVideoId,
          bet_type:         "parlay",
          side:             "parlay",
          parlay_legs:      legs,
          multiplier:       parsedMultiplier,
          base_wager:       parsedBaseWager,
          sparks_wagered:   sparksWagered,
          odds_at_bet:      +parlayOdds.toFixed(3),
          time_bonus:       timeBonus,
          potential_payout: potentialPayout,
          status:           "pending",
          placed_at:        now.toISOString(),
        });

        if (betErr) {
          await admin.rpc("refund_sparks", { p_user_id: user!.id, p_amount: sparksWagered });
          return respond({ error: "Failed to save bet" }, 500);
        }

        // Update total_bets count on each leg's video
        for (const leg of legs as { videoId: string; side: string }[]) {
          const v = videosData.find(vd => vd.id === leg.videoId)!;
          const newTotal = (v.total_bets || 0) + 1;
          await admin.from("videos").update({
            total_bets:      newTotal,
            noisy_bet_range: generateNoisyRange(newTotal),
          }).eq("id", leg.videoId);
        }

        return respond({ success: true, sparksWagered, parlayOdds: +parlayOdds.toFixed(3), timeBonus, potentialPayout });
      }

      return respond({ error: "Invalid betType" }, 400);
    }

    // ── POST /claimDailyBonus ─────────────────────────────
    if (path === "/claimDailyBonus" && req.method === "POST") {
      const authErr = requireAuth(); if (authErr) return authErr;

      // The try_claim_daily_bonus() RPC does the 24-hour check and the
      // balance increment atomically, preventing double-claim race conditions.
      const { data: rpcResult, error: rpcErr } = await admin.rpc("try_claim_daily_bonus", {
        p_user_id:    user!.id,
        p_bonus:      DAILY_BONUS,
      });

      if (rpcErr) {
        if (rpcErr.message.includes("COOLDOWN:")) {
          // Parse remaining seconds from the error message
          const secondsStr = rpcErr.message.split("COOLDOWN:")[1]?.trim();
          const seconds    = parseInt(secondsStr || "0", 10);
          const hours      = Math.floor(seconds / 3600);
          const minutes    = Math.ceil((seconds % 3600) / 60);
          const timeStr    = hours >= 1 ? `${hours}h ${minutes}m` : `${minutes}m`;
          return respond({ error: `Come back in ${timeStr} for your next bonus` }, 400);
        }
        if (rpcErr.message.includes("USER_NOT_FOUND")) {
          return respond({ error: "User not found" }, 404);
        }
        return respond({ error: "Failed to claim bonus" }, 500);
      }

      return respond({ awarded: DAILY_BONUS, newBalance: rpcResult.new_balance });
    }

    // ── POST /registerPushToken ───────────────────────────
    if (path === "/registerPushToken" && req.method === "POST") {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { token } = body;
      if (!token || typeof token !== "string") return respond({ error: "token required" }, 400);
      await admin.from("users").update({ push_token: token }).eq("id", user!.id);
      return respond({ ok: true });
    }

    // ── GET /feed ─────────────────────────────────────────
    if (path === "/feed" && req.method === "GET") {
      const page = parseInt(url.searchParams.get("page") || "0");
      const { data: videos } = await admin
        .from("videos")
        .select("*")
        .eq("status", "active")
        .order("added_at", { ascending: false })
        .range(page * 10, (page + 1) * 10 - 1);

      const enriched = (videos || []).map(v => ({
        ...v,
        odds: {
          yes:     calculateOdds(v.yes_pool || 0, v.no_pool || 0, "yes"),
          no:      calculateOdds(v.yes_pool || 0, v.no_pool || 0, "no"),
          yesProb: oddsToProb(calculateOdds(v.yes_pool || 0, v.no_pool || 0, "yes")),
          noProb:  oddsToProb(calculateOdds(v.yes_pool || 0, v.no_pool || 0, "no")),
        },
      }));

      return respond({ videos: enriched, hasMore: enriched.length === 10 });
    }

    // ── GET /trending ─────────────────────────────────────
    if (path === "/trending" && req.method === "GET") {
      const { data: videos } = await admin
        .from("videos")
        .select("*")
        .eq("status", "active")
        .order("total_bets", { ascending: false })
        .limit(20);

      const enriched = (videos || []).map(v => ({
        ...v,
        odds: {
          yes:     calculateOdds(v.yes_pool || 0, v.no_pool || 0, "yes"),
          no:      calculateOdds(v.yes_pool || 0, v.no_pool || 0, "no"),
          yesProb: oddsToProb(calculateOdds(v.yes_pool || 0, v.no_pool || 0, "yes")),
          noProb:  oddsToProb(calculateOdds(v.yes_pool || 0, v.no_pool || 0, "no")),
        },
      }));

      return respond({ videos: enriched });
    }

    // ── GET /results ───────────────────────────────────────
	if (path === "/results" && req.method === "GET") {
	  const authErr = requireAuth(); if (authErr) return authErr;

	  const { data: videos, error } = await admin
		.from("videos")
		.select("id, tiktok_url, author_handle, thumbnail_url, title, status, resolved_at, total_bets, yes_bets, current_views, likes_at_ingestion, uploaded_at, added_at")
		.in("status", ["resolved_yes", "resolved_no"])
		.order("resolved_at", { ascending: false })
		.limit(50);

	  if (error) return respond({ error: error.message }, 500);
	  const sorted = (videos || []).sort((a, b) => b.total_bets - a.total_bets);
	  return respond({ videos: sorted });
	}

    // ── GET /profile ──────────────────────────────────────
    if (path === "/profile") {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { data } = await admin.from("users").select("*").eq("id", user!.id).single();
      if (!data) return respond({ error: "Profile not found" }, 404);
      return respond({ user: data });
    }

    // ── GET /myBets ───────────────────────────────────────
    if (path === "/myBets") {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { data, error } = await admin
        .from("bets")
        .select("*")
        .eq("uid", user!.id)
        .order("placed_at", { ascending: false })
        .limit(50);
      if (error) return respond({ error: "Failed to fetch bets" }, 500);
      return respond({ bets: data || [] });
    }

    // ── GET /leaderboard ──────────────────────────────────
    if (path === "/leaderboard") {
      const type  = url.searchParams.get("type") || "weekly";
      // Whitelist the table name to prevent injection
      const table = type === "weekly" ? "leaderboard_weekly" : "leaderboard_alltime";
      const { data } = await admin.from(table).select("entries").limit(1).maybeSingle();
      return respond({ entries: data?.entries || [] });
    }

    // ── GET /videoUrl ─────────────────────────────────────
    if (path === "/videoUrl" && req.method === "GET") {
      const videoId = url.searchParams.get("id");
      if (!videoId) return respond({ error: "id required" }, 400);

      const { data: video } = await admin
        .from("videos")
        .select("tiktok_url, direct_video_url, url_refreshed_at")
        .eq("id", videoId)
        .single();

      if (!video) return respond({ error: "Not found" }, 404);

      const refreshedAt = video.url_refreshed_at ? new Date(video.url_refreshed_at) : null;
      const ageHours    = refreshedAt
        ? (Date.now() - refreshedAt.getTime()) / (1000 * 60 * 60)
        : 999;

      if (ageHours < 12 && video.direct_video_url) {
        return respond({ url: video.direct_video_url });
      }

      try {
        const scraperRes  = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(video.tiktok_url)}`);
        const scraperJson = await scraperRes.json();
        const freshUrl    = scraperJson?.data?.play;

        if (freshUrl) {
          await admin.from("videos").update({
            direct_video_url: freshUrl,
            url_refreshed_at: new Date().toISOString(),
          }).eq("id", videoId);

          return respond({ url: freshUrl });
        }
      } catch (_) {}

      return respond({ url: video.direct_video_url });
    }

    return respond({ error: "Not found" }, 404);

  } catch (err) {
    // Log the real error server-side but NEVER expose raw internal details to the client
    console.error("Unhandled API error:", err);
    return respond({ error: "An internal error occurred" }, 500);
  }
});