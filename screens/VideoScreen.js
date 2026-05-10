// screens/VideoScreen.js
// Full-screen video modal — opened when tapping a card in Trending
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, SafeAreaView,
  ScrollView, ActivityIndicator, Image, Modal,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

// ── Reusable video player (same logic as FeedScreen) ──────
function VideoPlayer({ videoId, fallbackUrl, thumbnail }) {
  const videoRef  = useRef(null);
  const hasLoaded = useRef(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);

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
        console.error('VideoPlayer load error:', e);
        setFetchingUrl(false);
        return;
      }
      setFetchingUrl(false);
    }

    try {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    } catch (e) {
      console.error('VideoPlayer play error:', e);
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
      <Video
        ref={videoRef}
        style={[StyleSheet.absoluteFillObject, { opacity: isPlaying ? 1 : 0 }]}
        useNativeControls={false}
        resizeMode={ResizeMode.COVER}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        progressUpdateIntervalMillis={500}
        volume={1.0}
        isMuted={false}
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

// ── Odds bar ──────────────────────────────────────────────
function OddsBar({ video }) {
  const yesOdds  = video.odds?.yes     || 2.0;
  const noOdds   = video.odds?.no      || 2.0;
  const yesProb  = video.odds?.yesProb || 50;
  const noProb   = video.odds?.noProb  || 50;

  return (
    <View style={styles.oddsContainer}>
      <View style={styles.oddsLabelRow}>
        <Text style={[styles.oddsLabel, { color: COLORS.yes }]}>
          🚀 {yesProb}%  ·  {yesOdds.toFixed(2)}×
        </Text>
        <Text style={styles.oddsDivider}>market odds</Text>
        <Text style={[styles.oddsLabel, { color: COLORS.accent }]}>
          {noOdds.toFixed(2)}×  ·  {noProb}% 📉
        </Text>
      </View>
      <View style={styles.oddsBar}>
        <View style={[styles.oddsYesFill, { flex: yesProb }]} />
        <View style={[styles.oddsNoFill,  { flex: noProb  }]} />
      </View>
    </View>
  );
}

// ── VideoScreen ───────────────────────────────────────────
export default function VideoScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { video }  = route.params;

  const timeLeft    = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const uploadedAgo = video.uploaded_at ? getTimeAgo(new Date(video.uploaded_at)) : null;

  const handleBet = (side) => {
    navigation.navigate('Bet', { video, suggestedSide: side });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Close button */}
      <View style={styles.topBar}>
        <View style={styles.topBarMeta}>
          <View style={styles.authorDot} />
          <Text style={styles.authorHandle}>Anonymous Creator</Text>
          {uploadedAgo && <Text style={styles.uploadedAgo}>· {uploadedAgo}</Text>}
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={11} color={COLORS.accent} />
            <Text style={styles.timerText}>{timeLeft}</Text>
          </View>
          <Pressable
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={COLORS.muted} />
          </Pressable>
        </View>
      </View>

      {/* Likes at submission */}
      {video.likes_at_ingestion != null && (
        <View style={styles.likesBadge}>
          <Ionicons name="heart" size={11} color={COLORS.accent} />
          <Text style={styles.likesText}>
            {video.likes_at_ingestion.toLocaleString()} likes when submitted
          </Text>
        </View>
      )}

      {/* Video */}
      <VideoPlayer
        videoId={video.id}
        fallbackUrl={video.direct_video_url}
        thumbnail={video.thumbnail_url}
      />

      {/* Market odds */}
      <View style={styles.bottomSection}>
        <OddsBar video={video} />

        <View style={styles.noisyRow}>
          <Ionicons name="people-outline" size={12} color={COLORS.muted} />
          <Text style={styles.noisyText}>{video.noisy_bet_range} predictions placed</Text>
        </View>

        {/* Bet buttons */}
        <View style={styles.betRow}>
          <Pressable
            style={({ pressed }) => [styles.betBtn, styles.betBtnYes, pressed && { opacity: 0.8 }]}
            onPress={() => handleBet('yes')}
          >
            <Ionicons name="trending-up" size={16} color={COLORS.bg} />
            <Text style={styles.betBtnLabel}>GOES VIRAL</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.betBtn, styles.betBtnNo, pressed && { opacity: 0.8 }]}
            onPress={() => handleBet('no')}
          >
            <Ionicons name="trending-down" size={16} color={COLORS.text} />
            <Text style={[styles.betBtnLabel, { color: COLORS.text }]}>FLOPS</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function getTimeLeft(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) return 'Resolving...';
  const h = Math.floor(ms / 3_600_000);
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
  container:    { flex: 1, backgroundColor: COLORS.bg },
  topBar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 10 },
  topBarMeta:   { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  topBarRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.muted },
  authorHandle: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic' },
  uploadedAgo:  { color: COLORS.muted, fontSize: 11, opacity: 0.7 },
  timerBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accentGlow, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  timerText:    { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  closeBtn:     { padding: 4 },
  likesBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingBottom: 6 },
  likesText:    { color: COLORS.muted, fontSize: 11 },

  // Video
  videoContainer: { width: '100%', height: 420, backgroundColor: '#000' },
  video:          { width: '100%', height: '100%' },
  overlayCenter:  { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 8 },
  playCircle:     { width: 64, height: 64, borderRadius: 32, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center' },
  tapHint:        { color: '#ffffff99', fontSize: 12 },
  fetchingHint:   { color: '#ffffffcc', fontSize: 12 },
  audioIndicator: { position: 'absolute', top: 10, right: 10, backgroundColor: '#00000055', borderRadius: 12, padding: 4 },

  // Bottom
  bottomSection:  { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  oddsContainer:  { marginBottom: SPACING.sm },
  oddsLabelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  oddsLabel:      { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  oddsDivider:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1 },
  oddsBar:        { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  oddsYesFill:    { backgroundColor: COLORS.yes },
  oddsNoFill:     { backgroundColor: COLORS.accent },
  noisyRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: SPACING.sm },
  noisyText:      { color: COLORS.muted, fontSize: 11 },
  betRow:         { flexDirection: 'row', gap: SPACING.sm },
  betBtn:         { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: RADIUS.md, gap: 6 },
  betBtnYes:      { backgroundColor: COLORS.yes },
  betBtnNo:       { backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border },
  betBtnLabel:    { color: COLORS.bg, fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 },
});