// screens/FeedScreen.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated,
  Pressable,Image, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode, Audio } from 'expo-av'; // add Audio to the import
import { Ionicons } from '@expo/vector-icons';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation } from '@react-navigation/native';

function ResultModal({ visible, type = 'info', title, message, onClose }) {
  const iconMap  = { success: '⚡', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const colorMap = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark, info: COLORS.mutedHigh };
  const color = colorMap[type] || colorMap.info;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={[modalStyles.iconCircle, { backgroundColor: color + '22' }]}>
            <Text style={modalStyles.iconText}>{iconMap[type]}</Text>
          </View>
          <Text style={[modalStyles.modalTitle, { color }]}>{title}</Text>
          <Text style={modalStyles.modalMessage}>{message}</Text>
          <Pressable style={[modalStyles.modalBtn, { backgroundColor: color }]} onPress={onClose}>
            <Text style={modalStyles.modalBtnLabel}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VideoPlayer
//
// Why we use loadAsync instead of changing the source prop:
//
// Changing <Video source={...}> causes the component to reload internally.
// Calling playAsync() immediately after a source change silently fails because
// the new source hasn't finished loading yet. This was causing "second tap
// does nothing."
//
// Instead we leave the source prop absent and on first tap we:
//   1. Fetch a fresh URL from our edge function (12h server-side cache)
//   2. Call loadAsync() imperatively — loads without auto-playing
//   3. Call playAsync() once loaded
//
// On all subsequent taps: just play/pause, zero network calls, no re-renders.
// On video finish: seek back to 0 so replay works.
// ─────────────────────────────────────────────────────────────────────────────
function VideoPlayer({ videoId, fallbackUrl, thumbnail }) {
  const videoRef  = useRef(null);
  const hasLoaded = useRef(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);

  // Fix 1 — unlock audio on iOS (silent switch bypass + speaker routing)
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS:    true,
      staysActiveInBackground: false,
      shouldDuckAndroid:       true,
    });
  }, []);

  const togglePlay = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }

    if (!hasLoaded.current) {
      setFetchingUrl(true);
      try {
        let urlToLoad = fallbackUrl;
        try {
          const result = await getApi('/videoUrl', { id: videoId });
          if (result?.url) urlToLoad = result.url;
        } catch (_) {}
        await videoRef.current.loadAsync({ uri: urlToLoad }, {}, false);
        hasLoaded.current = true;
      } catch (e) {
        console.error('VideoPlayer loadAsync error:', e);
        setFetchingUrl(false);
        return;
      }
      setFetchingUrl(false);
    }

    try {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    } catch (e) {
      console.error('VideoPlayer playAsync error:', e);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (!status.isLoaded) return;
    setIsBuffering(status.isBuffering && !status.isPlaying);
    if (status.didJustFinish) {
      setIsPlaying(false);
      videoRef.current?.setPositionAsync(0);
    }
  };

  return (
    <Pressable style={styles.videoContainer} onPress={togglePlay}>
      {thumbnail && !isPlaying && !fetchingUrl && (
        <Image source={{ uri: thumbnail }} style={styles.video} resizeMode="cover" />
      )}

      {/* Fix 2 — use absoluteFillObject so the video actually has dimensions */}
      <Video
		  ref={videoRef}
		  style={[
			StyleSheet.absoluteFillObject,
			{ opacity: isPlaying ? 1 : 0 },
		  ]}
		  useNativeControls={false}
		  resizeMode={ResizeMode.COVER}
		  onPlaybackStatusUpdate={onPlaybackStatusUpdate}
		  progressUpdateIntervalMillis={500}
		  // 👇 ADD THESE THREE PROPS
		  volume={1.0}
		  isMuted={false}
		  ignoreSilentSwitchType="obey" // Change to "ignore" if you want to bypass the side switch
		/>

      {(fetchingUrl || isBuffering) && (
        <View style={styles.overlayCenter} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
          {fetchingUrl && <Text style={styles.fetchingHint}>Loading video…</Text>}
        </View>
      )}

      {!isPlaying && !fetchingUrl && !isBuffering && (
        <View style={styles.overlayCenter} pointerEvents="none">
          <View style={styles.playCircle}>
            <Ionicons name="play" size={32} color="#fff" />
          </View>
          <Text style={styles.tapHint}>Tap to play</Text>
        </View>
      )}

      {isPlaying && (
        <View style={styles.audioIndicator} pointerEvents="none">
          <Ionicons name="volume-high" size={14} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

function VideoCard({ video, onBet }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const timeLeft    = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const uploadedAgo = video.uploaded_at ? getTimeAgo(new Date(video.uploaded_at)) : null;

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
      <View style={styles.cardHeader}>
        <View style={styles.metaLeft}>
          <View style={styles.authorDot} />
          <Text style={styles.authorHandle}>Anonymous Creator</Text>
          {uploadedAgo && <Text style={styles.uploadedAgo}>· {uploadedAgo}</Text>}
        </View>
        <View style={styles.timerBadge}>
          <Ionicons name="time-outline" size={11} color={COLORS.accent} />
          <Text style={styles.timerText}>{timeLeft}</Text>
        </View>
      </View>

      {video.likes_at_ingestion != null && (
        <View style={styles.likesBadge}>
          <Ionicons name="heart" size={11} color={COLORS.accent} />
          <Text style={styles.likesText}>{video.likes_at_ingestion.toLocaleString()} likes when submitted</Text>
        </View>
      )}

      <VideoPlayer videoId={video.id} fallbackUrl={video.direct_video_url} thumbnail={video.thumbnail_url}/>

      <View style={styles.noisyRow}>
        <Ionicons name="people-outline" size={12} color={COLORS.muted} />
        <Text style={styles.noisyText}>{video.noisy_bet_range} predictions placed</Text>
      </View>

      <View style={styles.betRow}>
        <Pressable
          style={({ pressed }) => [styles.betBtn, styles.betBtnYes, pressed && styles.btnPressed]}
          onPress={() => onBet(video, 'yes')}
        >
          <Ionicons name="trending-up" size={16} color={COLORS.bg} />
          <Text style={styles.betBtnLabel}>GOES VIRAL</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.betBtn, styles.betBtnNo, pressed && styles.btnPressed]}
          onPress={() => onBet(video, 'no')}
        >
          <Ionicons name="trending-down" size={16} color={COLORS.text} />
          <Text style={[styles.betBtnLabel, { color: COLORS.text }]}>FLOPS</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function FeedScreen() {
  const navigation = useNavigation();
  const [videos,     setVideos]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sparks,     setSparks]     = useState(null);
  const [modal,      setModal]      = useState({ visible: false, type: 'info', title: '', message: '' });

  const loadVideos = useCallback(async () => {
    try {
      const result = await getApi('/feed');
      setVideos(result.videos || []);
    } catch (err) {
      console.error('Feed error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const result = await getApi('/profile');
      if (result?.user?.sparks != null) setSparks(result.user.sparks);
    } catch (_) {}
  }, []);

  useEffect(() => { loadVideos(); loadBalance(); }, []);

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BetTok</Text>
        <View style={styles.headerRight}>
          {sparks != null && (
			  <Pressable
				style={styles.balancePill}
				onPress={() => navigation.navigate('Shop')}
			  >
				<Ionicons name="flash" size={12} color={COLORS.spark} />
				<Text style={styles.balanceText}>{sparks.toLocaleString()}</Text>
				<Ionicons name="add" size={13} color={COLORS.spark} />
			  </Pressable>
			)}
          <TouchableOpacity style={styles.submitBtn} onPress={() => navigation.navigate('Submit')}>
            <Ionicons name="add" size={18} color={COLORS.bg} />
            <Text style={styles.submitBtnText}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <VideoCard
            video={item}
            onBet={(v, s) => navigation.navigate('Bet', { video: v, suggestedSide: s })}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadVideos(); loadBalance(); }}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No videos yet</Text>
            <Text style={styles.emptyText}>Be the first to submit a TikTok!</Text>
          </View>
        }
      />

      <ResultModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal(m => ({ ...m, visible: false }))}
      />
    </SafeAreaView>
  );
}

function getTimeLeft(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) return 'Resolving...';
  const h = Math.floor(ms / (1000 * 60 * 60));
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  return `${h}h left`;
}

function getTimeAgo(date) {
  const ms = Date.now() - date;
  const m  = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:      { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 24, letterSpacing: 1 },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  balancePill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.spark + '18', borderWidth: 1, borderColor: COLORS.spark + '44', paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.md },
  balanceText:      { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 14 },
  submitBtn:        { backgroundColor: COLORS.accent, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md, gap: 4 },
  submitBtnText:    { color: COLORS.bg, fontWeight: '700', fontSize: 13 },
  list:             { padding: SPACING.md, paddingBottom: 120 },
  card:             { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: SPACING.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 6 },
  metaLeft:         { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  authorDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.muted },
  authorHandle:     { color: COLORS.muted, fontSize: 12, fontStyle: 'italic' },
  uploadedAgo:      { color: COLORS.muted, fontSize: 11, opacity: 0.7 },
  timerBadge:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accentGlow, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  timerText:        { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  likesBadge:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingBottom: 8 },
  likesText:        { color: COLORS.muted, fontSize: 11 },
  videoContainer:   { width: '100%', height: 480, backgroundColor: '#000', position: 'relative' },
  video:            { flex: 1 },
  overlayCenter:    { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  playCircle:       { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', paddingLeft: 4 },
  tapHint:          { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 8 },
  fetchingHint:     { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 8 },
  audioIndicator:   { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 6 },
  noisyRow:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  noisyText:        { color: COLORS.muted, fontSize: 11 },
  betRow:           { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md },
  betBtn:           { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 13, borderRadius: RADIUS.md, gap: 6 },
  betBtnYes:        { backgroundColor: COLORS.yes },
  betBtnNo:         { backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border },
  betBtnLabel:      { color: COLORS.bg, fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
  btnPressed:       { opacity: 0.75 },
  empty:            { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon:        { fontSize: 40 },
  emptyTitle:       { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
});

const modalStyles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:         { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  iconCircle:    { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  iconText:      { fontSize: 30 },
  modalTitle:    { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  modalMessage:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  modalBtn:      { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  modalBtnLabel: { color: COLORS.bg, fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
});