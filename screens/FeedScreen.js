// screens/FeedScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../theme';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

// ── Streak Banner ──────────────────────────────────────────
function StreakBanner({ streak, sparks, onDailyBonus }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (streak > 0) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])).start();
    }
  }, [streak]);

  return (
    <View style={styles.streakBanner}>
      <Animated.View style={[styles.streakPill, { transform: [{ scale: pulse }] }]}>
        <Text style={styles.streakFire}>🔥</Text>
        <Text style={styles.streakNum}>{streak}</Text>
        <Text style={styles.streakLabel}>day streak</Text>
      </Animated.View>
      <View style={styles.sparksPill}>
        <Text style={styles.sparksIcon}>⚡</Text>
        <Text style={styles.sparksNum}>{sparks?.toLocaleString() ?? '—'}</Text>
      </View>
      <Pressable style={styles.bonusBtn} onPress={onDailyBonus}>
        <Ionicons name="gift-outline" size={14} color={COLORS.spark} />
        <Text style={styles.bonusBtnLabel}>Daily</Text>
      </Pressable>
    </View>
  );
}

// ── Video Player ───────────────────────────────────────────
function VideoPlayer({ videoId, fallbackUrl, onExpand }) {
  const videoRef  = useRef(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [videoUri,    setVideoUri]    = useState(null);

  // Resolves the playback URL from the backend if not already cached
  const ensureUriLoaded = async () => {
    if (videoUri) return videoUri;
    setFetchingUrl(true);
    let uri = fallbackUrl;
    try {
      const r = await getApi('/videoUrl', { id: videoId });
      if (r?.url) uri = r.url;
    } catch (_) {}
    setVideoUri(uri);
    setFetchingUrl(false);
    return uri;
  };

  const togglePlay = async () => {
    if (isPlaying) { setIsPlaying(false); return; }
    await ensureUriLoaded();
    setIsPlaying(true);
  };

  const onStatus = (s) => {
    if (!s.isLoaded) return;
    setIsBuffering(s.isBuffering && !s.isPlaying);
    if (s.didJustFinish) {
      setIsPlaying(false);
      videoRef.current?.setPositionAsync(0);
    }
  };

  const handleExpand = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onExpand?.();
  };

  return (
    <View style={styles.videoWrapper}>
      <Pressable style={styles.videoContainer} onPress={togglePlay}>
        <Video
          ref={videoRef}
          style={styles.video}
          source={videoUri ? { uri: videoUri } : null}
          useNativeControls={false}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isPlaying}
          isMuted={false}
          volume={1.0}
          onPlaybackStatusUpdate={onStatus}
        />

        {(fetchingUrl || isBuffering) && (
          <View style={styles.videoOverlay} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
            {fetchingUrl && <Text style={styles.videoHint}>Loading…</Text>}
          </View>
        )}

        {!isPlaying && !fetchingUrl && !isBuffering && (
          <View style={styles.videoOverlay} pointerEvents="none">
            <View style={styles.playBtn}>
              <Ionicons name="play" size={30} color="#fff" />
            </View>
            <Text style={styles.videoHint}>Tap to play</Text>
          </View>
        )}

        {isPlaying && (
          <View style={styles.audioIndicator} pointerEvents="none">
            <Ionicons name="volume-high" size={13} color="#fff" />
          </View>
        )}

        {/* Expand button — navigates to full VideoScreen */}
        <View style={styles.videoControls}>
          <Pressable style={styles.videoControlBtn} onPress={handleExpand} hitSlop={8}>
            <Ionicons name="expand-outline" size={16} color="#fff" />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

// ── Video Card ─────────────────────────────────────────────
function VideoCard({ video, onBet, onExpand }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  const timeLeft    = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const uploadedAgo = video.uploaded_at ? getTimeAgo(new Date(video.uploaded_at)) : null;
  const yesOdds      = video.odds?.yes      ?? 2.0;
  const noOdds       = video.odds?.no       ?? 2.0;
  const yesProb      = video.odds?.yesProb ?? 50;
  const isHot        = (video.total_bets || 0) >= 10;

  const handleBet = async (side) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onBet(video, side);
  };

  return (
    <View style={styles.cardContainer} >
      <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
        {isHot && <View style={styles.hotBadge}><Text style={styles.hotBadgeText}>🔥 HOT</Text></View>}

        <View style={styles.cardHeader}>
          <View style={styles.metaLeft}>
            <View style={styles.anonDot} />
            <Text style={styles.anonLabel}>Anonymous</Text>
            {uploadedAgo && <Text style={styles.uploadedAgo}>· {uploadedAgo}</Text>}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.timerBadge}>
              <Ionicons name="time-outline" size={10} color={COLORS.accent} />
              <Text style={styles.timerText}>{timeLeft}</Text>
            </View>
          </View>
        </View>

        {video.likes_at_ingestion != null && (
          <View style={styles.likesRow}>
            <Ionicons name="heart" size={10} color={COLORS.accent} />
            <Text style={styles.likesText}>{video.likes_at_ingestion.toLocaleString()} likes at submission</Text>
          </View>
        )}

        <VideoPlayer
          videoId={video.id}
          fallbackUrl={video.direct_video_url}
          onExpand={() => onExpand?.(video)}
        />

        {/* Odds bar */}
        <View style={styles.oddsSection}>
          <View style={styles.oddsBar}>
            <View style={[styles.oddsYes, { flex: yesProb }]} />
            <View style={[styles.oddsNo,  { flex: 100 - yesProb }]} />
          </View>
          <View style={styles.oddsLabels}>
            <Text style={styles.oddsLabelYes}>🚀 {yesProb}% · {yesOdds.toFixed(2)}×</Text>
            <Text style={styles.oddsLabelNo}>{noOdds.toFixed(2)}× · {100 - yesProb}% 📉</Text>
          </View>
        </View>

        <View style={styles.crowdRow}>
          <Ionicons name="people-outline" size={11} color={COLORS.muted} />
          <Text style={styles.crowdText}>{video.noisy_bet_range} predictions placed</Text>
        </View>

        <View style={styles.betRow}>
          <Pressable
            style={({ pressed }) => [styles.betBtnViral, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
            onPress={() => handleBet('yes')}
          >
            <LinearGradient colors={['#00E87A','#00A855']} style={styles.betBtnGrad} start={[0,0]} end={[1,0]}>
              <Ionicons name="trending-up" size={16} color="#000" />
              <Text style={styles.betBtnViralLabel}>GOES VIRAL</Text>
              <Text style={styles.betBtnOdds}>{yesOdds.toFixed(2)}×</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.betBtnFlop, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
            onPress={() => handleBet('no')}
          >
            <View style={styles.betBtnFlopInner}>
              <Ionicons name="trending-down" size={16} color={COLORS.accent} />
              <Text style={styles.betBtnFlopLabel}>FLOPS</Text>
              <Text style={[styles.betBtnOdds, { color: COLORS.accent }]}>{noOdds.toFixed(2)}×</Text>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Feed Screen ────────────────────────────────────────────
export default function FeedScreen() {
  const navigation = useNavigation();
  const [videos,      setVideos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profile,    setProfile]    = useState(null);
  const [toastMsg,   setToastMsg]   = useState(null);

  const loadFeed = useCallback(async () => {
    setError(null);
    try {
      const r = await getApi('/feed');
      setVideos(r.videos || []);
    } catch (err) {
      setError('Could not load. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const r = await getApi('/profile');
      if (r?.user) setProfile(r.user);
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => { loadFeed(); loadProfile(); }, []));

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleDailyBonus = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const { callApi } = require('../Supabaseconfig');
      const r = await callApi('/claimDailyBonus', {});
      showToast(`+${r.awarded} Sparks! 🔥 ${r.newStreak}d streak`);
      loadProfile();
    } catch (err) {
      showToast(err.message || 'Come back tomorrow!');
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Finding fresh videos…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>📡</Text>
          <Text style={styles.errorTitle}>Connection problem</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); loadFeed(); }}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLogo}>BetTok</Text>
        <View style={styles.headerActions}>
          {profile?.is_admin && (
            <TouchableOpacity style={styles.adminBtn} onPress={() => navigation.navigate('Admin')}>
              <Text style={styles.adminBtnLabel}>👑</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submitBtn} onPress={() => navigation.navigate('Submit')}>
            <Ionicons name="add" size={16} color="#000" />
            <Text style={styles.submitBtnLabel}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Streak banner */}
      <StreakBanner
        streak={profile?.current_streak ?? 0}
        sparks={profile?.sparks}
        onDailyBonus={handleDailyBonus}
      />

      {/* Toast */}
      {toastMsg && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      )}

      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <VideoCard
            video={item}
            onBet={(v, s) => navigation.navigate('Bet', { video: v, suggestedSide: s })}
            onExpand={(v) => navigation.navigate('Video', { video: v, videos, initialIndex: index })}
          />
        )}
        contentContainerStyle={[styles.list, videos.length === 0 && { flexGrow: 1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadFeed(); loadProfile(); }}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 56 }}>🎬</Text>
            <Text style={styles.emptyTitle}>No videos yet</Text>
            <Text style={styles.emptyText}>Be the first to submit a TikTok to the prediction pool!</Text>
            <Pressable style={styles.emptyBtn} onPress={() => navigation.navigate('Submit')}>
              <LinearGradient colors={['#FF3B5C','#CC1F3F']} style={styles.emptyBtnGrad} start={[0,0]} end={[1,0]}>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={styles.emptyBtnLabel}>Submit a Video</Text>
              </LinearGradient>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function getTimeLeft(d) {
  const ms = d - Date.now();
  if (ms <= 0) return 'Resolving…';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const day = Math.floor(h / 24);
  if (day > 0) return `${day}d ${h % 24}h`;
  if (h > 0)   return `${h}h ${m}m`;
  return `${m}m left`;
}

function getTimeAgo(d) {
  const ms = Date.now() - d;
  const m  = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.bg },
  center:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg, gap: 12 },
  loadingText:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, marginTop: 8 },
  errorTitle:    { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  errorText:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
  retryBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: RADIUS.full },
  retryLabel:    { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 13 },

  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLogo:    { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 26, letterSpacing: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.accent + '44' },
  adminBtnLabel: { fontSize: 18 },
  submitBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  submitBtnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 13 },

  streakBanner:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 10, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  streakPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.purpleGlow, borderWidth: 1, borderColor: COLORS.purple + '44', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  streakFire:    { fontSize: 16 },
  streakNum:     { color: COLORS.purple, fontFamily: FONTS.display, fontSize: 18 },
  streakLabel:   { color: COLORS.purple, fontFamily: FONTS.body, fontSize: 10 },
  sparksPill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.sparkGlow, borderWidth: 1, borderColor: COLORS.spark + '44', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  sparksIcon:    { fontSize: 14 },
  sparksNum:     { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 16 },
  bonusBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.sparkGlow, borderWidth: 1, borderColor: COLORS.spark + '44', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full },
  bonusBtnLabel: { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },

  toast:         { position: 'absolute', top: 120, left: 20, right: 20, zIndex: 99, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.spark + '66' },
  toastText:     { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 15 },

  list:          { padding: SPACING.md, gap: SPACING.sm, paddingBottom: 100 },

  cardContainer: { width: '100%' },
  card:          { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, ...SHADOW.card },
  hotBadge:      { position: 'absolute', top: 0, left: 0, zIndex: 10, backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4, borderBottomRightRadius: RADIUS.md },
  hotBadgeText:  { color: '#fff', fontFamily: FONTS.body, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: 14, paddingBottom: 8 },
  metaLeft:      { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  anonDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.muted },
  anonLabel:     { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic' },
  uploadedAgo:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent + '44', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  timerText:     { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },
  likesRow:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingBottom: 8 },
  likesText:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  videoWrapper:    { position: 'relative', backgroundColor: '#000', width: '100%' },
  videoContainer:  { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000' },
  video:           { flex: 1 },
  videoOverlay:    { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.15)' },
  playBtn:         { width: 66, height: 66, borderRadius: 33, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingLeft: 3 },
  videoHint:       { color: 'rgba(255,255,255,0.75)', fontFamily: FONTS.body, fontSize: 12 },
  audioIndicator:  { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 6 },
  videoControls:   { position: 'absolute', top: 10, right: 10, zIndex: 20 },
  videoControlBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },

  oddsSection:  { paddingHorizontal: SPACING.md, paddingTop: 12, paddingBottom: 4, gap: 6 },
  oddsBar:      { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  oddsYes:      { backgroundColor: COLORS.yes },
  oddsNo:       { backgroundColor: COLORS.accent },
  oddsLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  oddsLabelYes: { color: COLORS.yes,    fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
  oddsLabelNo:  { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },

  crowdRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  crowdText:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  betRow:          { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md, paddingTop: 8 },
  betBtnViral:     { flex: 1, borderRadius: RADIUS.md, overflow: 'hidden' },
  betBtnGrad:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  betBtnViralLabel: { color: '#000', fontFamily: FONTS.body, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  betBtnOdds:      { color: '#000', fontFamily: FONTS.display, fontSize: 14 },
  betBtnFlop:      { flex: 1, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.accent + '66' },
  betBtnFlopInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  betBtnFlopLabel: { color: COLORS.accent, fontFamily: FONTS.body, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },

  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 80 },
  emptyTitle:    { color: COLORS.text, fontFamily: FONTS.display, fontSize: 24 },
  emptyText:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
  emptyBtn:      { borderRadius: RADIUS.full, overflow: 'hidden', marginTop: 8 },
  emptyBtnGrad:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14 },
  emptyBtnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14 },
});