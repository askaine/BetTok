import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Game constants ────────────────────────────────────────
const VIRALITY_THRESHOLD = 100_000;
const MIN_LIKES          = 500;
const MAX_LIKES          = 5_000;
const MAX_AGE_HOURS      = 168;
const DAILY_BONUS        = 100;
const RESOLUTION_DAYS    = 7;
const SEED_LIQUIDITY     = 300;
const MIN_ODDS           = 1.05;
const MAX_ODDS           = 15.0;

// Bracket view-range bands — must match BetScreen.js BRACKET_OPTIONS
const BRACKET_ODDS: Record<string, number> = {
  "<100k":    1.5,
  "100k-500k": 2.5,
  "500k-1m":  4.0,
  "1m-5m":    7.0,
  "5m+":      15.0,
};

const TIME_BONUS_TIERS = [
  { hoursAfterAdded: 1,        bonus: 1.5 },
  { hoursAfterAdded: 6,        bonus: 1.3 },
  { hoursAfterAdded: 24,       bonus: 1.15 },
  { hoursAfterAdded: 72,       bonus: 1.05 },
  { hoursAfterAdded: Infinity, bonus: 1.0 },
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Server ────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url        = new URL(req.url);
  const path       = url.pathname
    .replace(/^\/functions\/v1\/api/, "")
    .replace(/^\/api/, "") || "/";
  const authHeader = req.headers.get("Authorization");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: { headers: { Authorization: authHeader || "" } },
  });
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

      // Strip tracking params from URL
      const cleanUrl = tiktokUrl.split("?")[0];

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

      if (error) return respond({ error: error.message }, 500);

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

    // ── POST /placeBet ────────────────────────────────────
    if (path === "/placeBet" && req.method === "POST") {
      const authErr = requireAuth(); if (authErr) return authErr;

      const { betType = "binary", videoId, side, bracket, legs, multiplier, baseWager } = body;

      // Actual sparks at risk = base wager × multiplier
      const sparksWagered = Math.floor((baseWager || 100) * (multiplier || 1));

      const { data: userData } = await admin.from("users").select("*").eq("id", user!.id).single();
      if (!userData) return respond({ error: "Not found" }, 404);
      if (userData.sparks < sparksWagered) return respond({ error: "Not enough Sparks" }, 400);

      const now = new Date();

      // ─────────────────────────────────────────────────────
      // BINARY BET
      // ─────────────────────────────────────────────────────
      if (betType === "binary") {
        if (!side) return respond({ error: "side is required for binary bets" }, 400);

        const { data: videoData } = await admin.from("videos").select("*").eq("id", videoId).single();
        if (!videoData) return respond({ error: "Video not found" }, 404);
        if (videoData.status !== "active") return respond({ error: "This video has already been resolved" }, 400);

        const { data: existingBet } = await admin
          .from("bets").select("id").eq("uid", user!.id).eq("video_id", videoId).eq("bet_type", "binary").maybeSingle();
        if (existingBet) return respond({ error: "You've already placed a bet on this video!" }, 400);

        const oddsAtBet    = calculateOdds(videoData.yes_pool || 0, videoData.no_pool || 0, side);
        const addedAt      = videoData.added_at || videoData.created_at;
        const timeBonus    = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * oddsAtBet * timeBonus);

        const { error: betErr } = await admin.from("bets").insert({
          uid:              user!.id,
          video_id:         videoId,
          bet_type:         "binary",
          side,
          multiplier,
          base_wager:       baseWager,
          sparks_wagered:   sparksWagered,
          odds_at_bet:      oddsAtBet,
          time_bonus:       timeBonus,
          potential_payout: potentialPayout,
          status:           "pending",
          placed_at:        now.toISOString(),
        });

        if (betErr) {
          if (betErr.code === "23505") return respond({ error: "You've already placed a bet on this video!" }, 400);
          return respond({ error: betErr.message }, 500);
        }

        await admin.from("users").update({
          sparks:     userData.sparks - sparksWagered,
          total_bets: (userData.total_bets || 0) + 1,
        }).eq("id", user!.id);

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

        const { data: videoData } = await admin.from("videos").select("*").eq("id", videoId).single();
        if (!videoData) return respond({ error: "Video not found" }, 404);
        if (videoData.status !== "active") return respond({ error: "This video has already been resolved" }, 400);

        // One bracket bet per video per user
        const { data: existingBet } = await admin
          .from("bets").select("id").eq("uid", user!.id).eq("video_id", videoId).eq("bet_type", "bracket").maybeSingle();
        if (existingBet) return respond({ error: "You've already placed a bracket bet on this video!" }, 400);

        const bracketOdds  = BRACKET_ODDS[bracket];
        const addedAt      = videoData.added_at || videoData.created_at;
        const timeBonus    = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * bracketOdds * timeBonus);

        const { error: betErr } = await admin.from("bets").insert({
          uid:              user!.id,
          video_id:         videoId,
          bet_type:         "bracket",
          side:             "bracket",   // non-null placeholder
          bracket,
          multiplier,
          base_wager:       baseWager,
          sparks_wagered:   sparksWagered,
          odds_at_bet:      bracketOdds,
          time_bonus:       timeBonus,
          potential_payout: potentialPayout,
          status:           "pending",
          placed_at:        now.toISOString(),
        });

        if (betErr) {
          if (betErr.code === "23505") return respond({ error: "You've already placed a bracket bet on this video!" }, 400);
          return respond({ error: betErr.message }, 500);
        }

        await admin.from("users").update({
          sparks:     userData.sparks - sparksWagered,
          total_bets: (userData.total_bets || 0) + 1,
        }).eq("id", user!.id);

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

        // Validate all videos exist and are active
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

        // Calculate combined parlay odds
        const parlayOdds = legs.reduce((acc: number, leg: { videoId: string; side: string }) => {
          const v = videosData.find(vd => vd.id === leg.videoId)!;
          const legOdds = calculateOdds(v.yes_pool || 0, v.no_pool || 0, leg.side as "yes" | "no");
          return acc * legOdds;
        }, 1.0);

        const primaryVideoId = legs[0].videoId;
        const addedAt        = videosData.find(v => v.id === primaryVideoId)?.added_at || now.toISOString();
        const timeBonus      = getTimeBonus(addedAt, now);
        const potentialPayout = Math.floor(sparksWagered * parlayOdds * timeBonus);

        // Insert one bet row for the parlay (primary video as FK, legs stored as JSON)
        const { error: betErr } = await admin.from("bets").insert({
          uid:              user!.id,
          video_id:         primaryVideoId,
          bet_type:         "parlay",
          side:             "parlay",    // non-null placeholder
          parlay_legs:      legs,        // JSON array of { videoId, side }
          multiplier,
          base_wager:       baseWager,
          sparks_wagered:   sparksWagered,
          odds_at_bet:      +parlayOdds.toFixed(3),
          time_bonus:       timeBonus,
          potential_payout: potentialPayout,
          status:           "pending",
          placed_at:        now.toISOString(),
        });

        if (betErr) {
          return respond({ error: betErr.message }, 500);
        }

        await admin.from("users").update({
          sparks:     userData.sparks - sparksWagered,
          total_bets: (userData.total_bets || 0) + 1,
        }).eq("id", user!.id);

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

      const { data: userData } = await admin.from("users").select("*").eq("id", user!.id).single();
      if (!userData) return respond({ error: "User not found" }, 404);

      const now       = new Date();
      const lastClaim = userData.last_daily_bonus ? new Date(userData.last_daily_bonus) : null;

      if (lastClaim) {
        const hoursSince = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          const nextClaim    = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
          const minutesUntil = Math.ceil((nextClaim.getTime() - now.getTime()) / (1000 * 60));
          const hoursUntil   = Math.floor(minutesUntil / 60);
          const timeStr      = hoursUntil >= 1 ? `${hoursUntil}h ${minutesUntil % 60}m` : `${minutesUntil}m`;
          return respond({ error: `Come back in ${timeStr} for your next bonus` }, 400);
        }
      }

      const newBalance = (userData.sparks || 0) + DAILY_BONUS;
      await admin.from("users")
        .update({ sparks: newBalance, last_daily_bonus: now.toISOString() })
        .eq("id", user!.id);

      return respond({ awarded: DAILY_BONUS, newBalance });
    }

    // ── POST /registerPushToken ───────────────────────────
    if (path === "/registerPushToken" && req.method === "POST") {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { token } = body;
      if (!token) return respond({ error: "token required" }, 400);
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

    // ── GET /results ──────────────────────────────────────
    if (path === "/results" && req.method === "GET") {
      const { data: videos } = await admin
        .from("videos")
        .select("*")
        .neq("status", "active")
        .order("resolved_at", { ascending: false })
        .limit(30);
      return respond({ videos: videos || [] });
    }

    // ── GET /profile ──────────────────────────────────────
    if (path === "/profile") {
      const authErr = requireAuth(); if (authErr) return authErr;
      const { data } = await admin.from("users").select("*").eq("id", user!.id).single();
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
      if (error) return respond({ error: error.message }, 500);
      return respond({ bets: data || [] });
    }

    // ── GET /leaderboard ──────────────────────────────────
    if (path === "/leaderboard") {
      const type  = url.searchParams.get("type") || "weekly";
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
    console.error("API error:", err);
    return respond({ error: (err as Error).message }, 500);
  }
});