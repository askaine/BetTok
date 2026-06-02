// supabase/functions/resolve/index.ts
// Runs on schedule via pg_cron — deploy: supabase functions deploy resolve
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VIRALITY_THRESHOLD   = 50_000;
const MIN_BETS_THRESHOLD   = 10; // Change this to adjust minimum bets required

// Fixed odds for bracket bets — must match constants in BetScreen.js
const BRACKET_ODDS: Record<string, number> = {
  "<100k":     1.5,
  "100k-500k": 2.5,
  "500k-1m":   4.0,
  "1m-5m":     7.0,
  "5m+":       15.0,
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getViewBracket(views: number): string {
  if (views < 100_000)   return "<100k";
  if (views < 500_000)   return "100k-500k";
  if (views < 1_000_000) return "500k-1m";
  if (views < 5_000_000) return "1m-5m";
  return "5m+";
}

async function fetchCurrentViews(tiktokUrl: string): Promise<number | null> {
  try {
    const res  = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(tiktokUrl)}`);
    const json = await res.json();
    if (json?.data?.play_count != null) return json.data.play_count;
    return null;
  } catch {
    return null;
  }
}

async function sendPushNotification(pushToken: string, title: string, body: string) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: pushToken, sound: "default", title, body, data: {} }),
    });
  } catch (err) {
    console.error("Push notification failed:", err);
  }
}

// ── User stat update helper ─────────────────────────────────────────────────

async function applyWinToUser(
  userData: Record<string, unknown>,
  sparksEarned: number,
  betSide: string | null,
) {
  const updates: Record<string, unknown> = {};

  updates.sparks        = (userData.sparks        as number || 0) + sparksEarned;
  updates.correct_bets  = (userData.correct_bets  as number || 0) + 1;
  updates.current_streak= (userData.current_streak as number || 0) + 1;
  updates.weekly_score  = (userData.weekly_score   as number || 0) + sparksEarned;
  updates.all_time_score= (userData.all_time_score as number || 0) + sparksEarned;

  const newStreak = (userData.current_streak as number || 0) + 1;
  if (newStreak > (userData.longest_streak as number || 0)) {
    updates.longest_streak = newStreak;
  }

  updates.streak_multiplier = Math.min(2.0, 1.0 + Math.floor(newStreak / 5) * 0.1);

  const badges  = [...((userData.badges as string[]) || [])];
  const allTime = (userData.all_time_score as number || 0) + sparksEarned;

  if (betSide === "no"  && !badges.includes("contrarian")) badges.push("contrarian");
  if (newStreak >= 5    && !badges.includes("streak_5"))   badges.push("streak_5");
  if (newStreak >= 10   && !badges.includes("streak_10"))  badges.push("streak_10");
  if (allTime  >= 1000  && !badges.includes("club_1000"))  badges.push("club_1000");
  if (allTime  >= 5000  && !badges.includes("club_5000"))  badges.push("club_5000");
  updates.badges = badges;

  await admin.from("users").update(updates).eq("id", userData.id);
  return updates;
}

async function applyLossToUser(userData: Record<string, unknown>) {
  const streak = userData.current_streak as number || 0;
  const updates: Record<string, unknown> = {
    current_streak:    0,
    streak_multiplier: 1.0,
  };
  if (streak > (userData.longest_streak as number || 0)) {
    updates.longest_streak = streak;
  }
  await admin.from("users").update(updates).eq("id", userData.id);
}

// ── Voiding Logic ───────────────────────────────────────────────────────────

async function voidVideoAndRefund(videoId: string) {
  // 1. Refund Binary & Bracket bets
  const { data: standardBets } = await admin
    .from("bets")
    .select("*")
    .eq("video_id", videoId)
    .eq("status", "pending")
    .in("bet_type", ["binary", "bracket"]);

  for (const bet of standardBets || []) {
    const { data: user } = await admin.from("users").select("id, sparks, push_token").eq("id", bet.uid).single();
    if (user) {
      await admin.from("users").update({ sparks: (user.sparks || 0) + (bet.sparks_wagered as number) }).eq("id", user.id);
      if (user.push_token) {
        await sendPushNotification(user.push_token as string, "🚫 Bet Voided", "Not enough users bet on this video. Your sparks were refunded!");
      }
    }
  }

  // 2. Refund Parlays that include this video
  const { data: parlayBets } = await admin
    .from("bets")
    .select("*")
    .eq("bet_type", "parlay")
    .eq("status", "pending");

  for (const bet of parlayBets || []) {
    const legs = bet.parlay_legs as Array<{ videoId: string }>;
    if (legs.some(l => l.videoId === videoId)) {
      const { data: user } = await admin.from("users").select("id, sparks, push_token").eq("id", bet.uid).single();
      if (user) {
        await admin.from("users").update({ sparks: (user.sparks || 0) + (bet.sparks_wagered as number) }).eq("id", user.id);
        if (user.push_token) {
          await sendPushNotification(user.push_token as string, "🚫 Parlay Voided", "A video in your parlay didn't reach the bet threshold. Your wager was refunded!");
        }
      }
      await admin.from("bets").update({ status: "voided" }).eq("id", bet.id);
    }
  }

  // 3. Delete the video and its data entirely
  await admin.from("resolution_queue").delete().eq("video_id", videoId);
  await admin.from("bets").delete().eq("video_id", videoId);
  await admin.from("videos").delete().eq("id", videoId);
}

// ── Cleanup Logic ───────────────────────────────────────────────────────────

async function cleanupOldVideos() {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  
  const { data: oldVideos } = await admin
    .from("videos")
    .select("id")
    .in("status", ["resolved_yes", "resolved_no"])
    .lt("resolved_at", twoDaysAgo);

  for (const v of oldVideos || []) {
    // Delete queue and bets to prevent orphaned data, then delete video
    await admin.from("resolution_queue").delete().eq("video_id", v.id);
    await admin.from("bets").delete().eq("video_id", v.id);
    await admin.from("videos").delete().eq("id", v.id);
  }
}

// ── Settle binary + bracket bets ────────────────────────────────────────────

async function settleBinaryAndBracketBets(
  videoId: string,
  resolution: string,
  resolvedAt: Date,
  videoTitle: string,
  finalViews: number,
) {
  const winningSide    = resolution === "resolved_yes" ? "yes" : "no";
  const isViral        = resolution === "resolved_yes";
  const winningBracket = getViewBracket(finalViews);

  const { data: bets } = await admin
    .from("bets")
    .select("*")
    .eq("video_id", videoId)
    .eq("status", "pending")
    .in("bet_type", ["binary", "bracket"]);

  for (const bet of bets || []) {
    const won: boolean =
      bet.bet_type === "bracket"
        ? bet.bracket === winningBracket
        : bet.side === winningSide;

    const sparksEarned = won ? (bet.potential_payout as number) : 0;

    await admin.from("bets").update({
      status:      won ? "won" : "lost",
      settled_at:  resolvedAt.toISOString(),
      sparks_earned: sparksEarned,
    }).eq("id", bet.id);

    const { data: userData } = await admin
      .from("users").select("*").eq("id", bet.uid).single();
    if (!userData) continue;

    if (won) {
      await applyWinToUser(userData, sparksEarned, bet.side ?? null);
    } else {
      await applyLossToUser(userData);
    }

    if (userData.push_token) {
      if (won) {
        const betLabel =
          bet.bet_type === "bracket"
            ? `BRACKET (${bet.bracket})`
            : bet.side === "yes" ? "VIRAL" : "FLOP";
        await sendPushNotification(
          userData.push_token as string,
          "⚡ Bet Won!",
          `Your ${betLabel} call was right! +${sparksEarned} Sparks`,
        );
      } else {
        await sendPushNotification(
          userData.push_token as string,
          "📉 Bet Lost",
          `The video ${isViral ? "went viral" : "flopped"} — you lost ${bet.sparks_wagered} Sparks`,
        );
      }
    }
  }
}

// ── Settle parlay legs ──────────────────────────────────────────────────────

async function settleParlayLegs(videoId: string, resolution: string, resolvedAt: Date) {
  const winningSide = resolution === "resolved_yes" ? "yes" : "no";

  const { data: parlayBets } = await admin
    .from("bets")
    .select("*")
    .eq("bet_type", "parlay")
    .eq("status", "pending");

  for (const bet of parlayBets || []) {
    const legs = bet.parlay_legs as Array<{
      videoId: string;
      side: string;
      odds: number;
      outcome: string | null;
    }>;

    if (!Array.isArray(legs)) continue;

    const legIdx = legs.findIndex(l => l.videoId === videoId);
    if (legIdx === -1) continue;

    const updatedLegs = legs.map((l, i) =>
      i === legIdx
        ? { ...l, outcome: l.side === winningSide ? "won" : "lost" }
        : l,
    );

    const allSettled  = updatedLegs.every(l => l.outcome !== null && l.outcome !== undefined);
    const anyLost     = updatedLegs.some(l => l.outcome === "lost");

    if (!allSettled) {
      await admin.from("bets").update({ parlay_legs: updatedLegs }).eq("id", bet.id);
      continue;
    }

    const allWon       = !anyLost;
    const sparksEarned = allWon ? (bet.potential_payout as number) : 0;

    await admin.from("bets").update({
      parlay_legs:   updatedLegs,
      status:        allWon ? "won" : "lost",
      settled_at:    resolvedAt.toISOString(),
      sparks_earned: sparksEarned,
    }).eq("id", bet.id);

    const { data: userData } = await admin
      .from("users").select("*").eq("id", bet.uid).single();
    if (!userData) continue;

    if (allWon) {
      await applyWinToUser(userData, sparksEarned, null);

      if (userData.push_token) {
        await sendPushNotification(
          userData.push_token as string,
          "⚡ Parlay Won!",
          `All ${updatedLegs.length} legs hit! +${sparksEarned} Sparks 🎉`,
        );
      }
    } else {
      const { data: freshUser } = await admin
        .from("users").select("current_streak, longest_streak").eq("id", bet.uid).single();
      if (freshUser && (freshUser.current_streak as number) > 0) {
        await applyLossToUser({ ...userData, ...freshUser });
      }

      if (userData.push_token) {
        const failedLegs = updatedLegs.filter(l => l.outcome === "lost").length;
        await sendPushNotification(
          userData.push_token as string,
          "📉 Parlay Lost",
          `${failedLegs} of ${updatedLegs.length} legs failed — you lost ${bet.sparks_wagered} Sparks`,
        );
      }
    }
  }
}

// ── Leaderboard snapshot ────────────────────────────────────────────────────

async function updateLeaderboards() {
  const now     = new Date();
  const weekKey = `${now.getFullYear()}-W${getISOWeek(now)}`;

  const toEntry = (u: Record<string, unknown>, scoreField: string) => ({
    uid:          u.id,
    username:     u.username,
    badge:        u.flair || "",
    correct_pct:  (u.total_bets as number) > 0
      ? Math.round(((u.correct_bets as number) / (u.total_bets as number)) * 100) / 100
      : 0,
    sparks_earned: u[scoreField],
    streak:        u.longest_streak,
  });

  const { data: weeklyUsers } = await admin
    .from("users")
    .select("id, username, flair, weekly_score, all_time_score, correct_bets, total_bets, longest_streak")
    .order("weekly_score", { ascending: false })
    .limit(100);

  await admin.from("leaderboard_weekly").upsert({
    week_key:   weekKey,
    entries:    (weeklyUsers || []).map(u => toEntry(u, "weekly_score")),
    updated_at: now.toISOString(),
  }, { onConflict: "week_key" });

  const { data: allTimeUsers } = await admin
    .from("users")
    .select("id, username, flair, all_time_score, correct_bets, total_bets, longest_streak")
    .order("all_time_score", { ascending: false })
    .limit(100);

  await admin.from("leaderboard_alltime").upsert({
    id:         1,
    entries:    (allTimeUsers || []).map(u => toEntry(u, "all_time_score")),
    updated_at: now.toISOString(),
  }, { onConflict: "id" });
}

// ── Main resolve handler ────────────────────────────────────────────────────

serve(async (req) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  try {
    const now = new Date();

    // Support on-demand single-video resolution (called from admin panel)
    let forcedVideoId: string | null = null;
    try {
      const body = await req.json();
      forcedVideoId = body?.videoId ?? null;
    } catch { /* scheduled call — no body */ }

    const queueQuery = admin
      .from("resolution_queue")
      .select("*")
      .eq("check_7d_done", false);

    if (forcedVideoId) {
      queueQuery.eq("video_id", forcedVideoId);
    }

    const { data: queue } = await queueQuery;

    let processed = 0;

    for (const item of queue || []) {
      let checkType: string | null = null;
      if (!item.check_24h_done && new Date(item.check_24h_at) <= now) checkType = "24h";
      else if (!item.check_48h_done && new Date(item.check_48h_at) <= now) checkType = "48h";
      else if (!item.check_7d_done  && new Date(item.check_7d_at)  <= now) checkType = "7d";

      if (!checkType) continue;

      const { data: video } = await admin
        .from("videos").select("*").eq("id", item.video_id).single();

      if (!video || video.status !== "active") {
        await admin.from("resolution_queue").update({
          check_24h_done: true, check_48h_done: true, check_7d_done: true,
        }).eq("video_id", item.video_id);
        continue;
      }

      let currentViews = video.current_views || 0;
      const freshViews = await fetchCurrentViews(video.tiktok_url);
      if (freshViews !== null) {
        currentViews = freshViews;
        await admin.from("videos").update({ current_views: freshViews }).eq("id", video.id);
      }

      const isViral      = currentViews >= VIRALITY_THRESHOLD;
      const isFinalCheck = checkType === "7d";

      const checkUpdate: Record<string, unknown> = {};
      checkUpdate[`check_${checkType}_done`] = true;
      await admin.from("resolution_queue").update(checkUpdate).eq("video_id", item.video_id);
      await admin.from("videos").update({
        last_checked_at: now.toISOString(),
        check_count: (video.check_count || 0) + 1,
      }).eq("id", item.video_id);

      if (isViral || isFinalCheck) {
        
        // --- THRESHOLD CHECK ---
        const { count: totalBets } = await admin
          .from("bets")
          .select("*", { count: "exact", head: true })
          .eq("video_id", item.video_id);

        if ((totalBets || 0) < MIN_BETS_THRESHOLD) {
          await voidVideoAndRefund(item.video_id);
          processed++;
          continue; // Skip the standard win/loss settlement
        }
        // -----------------------

        const resolution = isViral ? "resolved_yes" : "resolved_no";

        await admin.from("videos").update({
          status:      resolution,
          resolved_at: now.toISOString(),
        }).eq("id", item.video_id);

        await admin.from("resolution_queue").update({
          check_24h_done: true, check_48h_done: true, check_7d_done: true,
        }).eq("video_id", item.video_id);

        await settleBinaryAndBracketBets(
          item.video_id, resolution, now, video.title || "A video", currentViews,
        );
        await settleParlayLegs(item.video_id, resolution, now);

        processed++;
      }
    }

    if (processed > 0) await updateLeaderboards();

    // --- 2-DAY CLEANUP ---
    await cleanupOldVideos();
    // ---------------------

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Admin on-demand handler (POST { videoId }) ──────────────────────────────
// Register this in your admin Edge Function router as POST /admin/resolveVideoAuto
// It forces a single video through the auto-resolve pipeline immediately.
export async function resolveVideoAuto(videoId: string): Promise<{ ok: boolean; resolution: string | null }> {
  const now = new Date();

  const { data: video } = await admin
    .from("videos").select("*").eq("id", videoId).single();

  if (!video || video.status !== "active") {
    throw new Error(`Video ${videoId} not found or already resolved.`);
  }

  // Fetch live views
  let currentViews = video.current_views || 0;
  const freshViews = await fetchCurrentViews(video.tiktok_url);
  if (freshViews !== null) {
    currentViews = freshViews;
    await admin.from("videos").update({ current_views: freshViews }).eq("id", video.id);
  }

  // Check bet threshold
  const { count: totalBets } = await admin
    .from("bets")
    .select("*", { count: "exact", head: true })
    .eq("video_id", videoId);

  if ((totalBets || 0) < MIN_BETS_THRESHOLD) {
    await voidVideoAndRefund(videoId);
    return { ok: true, resolution: "voided" };
  }

  const isViral    = currentViews >= VIRALITY_THRESHOLD;
  const resolution = isViral ? "resolved_yes" : "resolved_no";

  await admin.from("videos").update({
    status:      resolution,
    resolved_at: now.toISOString(),
    last_checked_at: now.toISOString(),
  }).eq("id", videoId);

  await admin.from("resolution_queue").update({
    check_24h_done: true, check_48h_done: true, check_7d_done: true,
  }).eq("video_id", videoId);

  await settleBinaryAndBracketBets(videoId, resolution, now, video.title || "A video", currentViews);
  await settleParlayLegs(videoId, resolution, now);
  await updateLeaderboards();

  return { ok: true, resolution };
}