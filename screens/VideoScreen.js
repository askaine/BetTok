// screens/VideoScreen.js
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, Dimensions,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const { height: SCREEN_H } = Dimensions.get('window');

// ── Global URI cache so URLs are only fetched once across renders ──
const uriCache = {};

async function resolveUri(videoId, fallbackUrl) {
  if (uriCache[videoId]) return uriCache[videoId];
  let uri = fallbackUrl;
  try {
    const r = await getApi('/videoUrl', { id: videoId });
    if (r?.url) uri = r.url;
  } catch (_) {}
  uriCache[videoId] = uri;
  return uri;
}

// ── VideoPlayer ───────────────────────────────────────────────────
//
//  Props:
//    isActive   – true when this item is the visible page
//    shouldLoad – true when within preload window (±2 of active)
//
function VideoPlayer({ videoId, fallbackUrl, thumbnail, isActive, shouldLoad }) {
  const videoRef      = useRef(null);
  const loadedRef     = useRef(false);   // has loadAsync been called?
  const [uri,         setUri]         = useState(uriCache[videoId] ?? null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);

  // ── Set audio mode once ──────────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS:    true,
      staysActiveInBackground: false,
      shouldDuckAndroid:       true,
    }).catch(() => {});
  }, []);

  // ── Preload: resolve URI and loadAsync when within window ────
  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;

    const load = async () => {
      const resolved = await resolveUri(videoId, fallbackUrl);
      if (cancelled) return;
      setUri(resolved);

      // Load into the video component so it's buffered and ready
      if (!loadedRef.current && videoRef.current) {
        try {
          setFetchingUrl(true);
          await videoRef.current.loadAsync({ uri: resolved }, {}, false);
          loadedRef.current = true;
        } catch (_) {}
        if (!cancelled) setFetchingUrl(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [shouldLoad, videoId, fallbackUrl]);

  // ── Active page: auto-play; inactive page: pause + rewind ───
  useEffect(() => {
    if (!videoRef.current) return;

    if (isActive) {
      // If not loaded yet, wait — the preload effect above will trigger
      // a re-render once loadedRef becomes true; we'll catch it then.
      if (loadedRef.current) {
        videoRef.current.playAsync().catch(() => {});
        setIsPlaying(true);
      }
    } else {
      // Pause and seek to start so it's fresh if the user scrolls back
      videoRef.current.pauseAsync().catch(() => {});
      videoRef.current.setPositionAsync(0).catch(() => {});
      setIsPlaying(false);
    }
  }, [isActive]);

  // When preload finishes while this item is already the active one,
  // start playback (covers the case where the user lands on this item
  // before the load completes).
  useEffect(() => {
    if (isActive && loadedRef.current && !isPlaying) {
      videoRef.current?.playAsync().catch(() => {});
      setIsPlaying(true);
    }
    // We intentionally only react to uri changes here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // ── Manual tap: toggle play/pause ───────────────────────────
  const togglePlay = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync().catch(() => {});
      setIsPlaying(false);
      return;
    }

    if (!loadedRef.current) {
      setFetchingUrl(true);
      try {
        const resolved = await resolveUri(videoId, fallbackUrl);
        setUri(resolved);
        await videoRef.current.loadAsync({ uri: resolved }, {}, false);
        loadedRef.current = true;
      } catch (_) {
        setFetchingUrl(false);
        return;
      }
      setFetchingUrl(false);
    }

    await videoRef.current.playAsync().catch(() => {});
    setIsPlaying(true);
  };

  const onStatus = (s) => {
    if (!s.isLoaded) return;
    setIsBuffering(s.isBuffering && !s.isPlaying);
    if (s.didJustFinish) {
      setIsPlaying(false);
      videoRef.current?.setPositionAsync(0).catch(() => {});
    }
  };

  return (
    <Pressable style={styles.videoContainer} onPress={togglePlay}>
      {/* Thumbnail shown before first play */}
      {!isPlaying && thumbnail && (
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      )}

      <Video
        ref={videoRef}
        style={[StyleSheet.absoluteFillObject, { opacity: isPlaying ? 1 : 0 }]}
        useNativeControls={false}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}   // we control playback manually
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
            <Ionicons name="play" size={32} color="#fff" />
          </View>
          <Text style={styles.videoHint}>Tap to play</Text>
        </View>
      )}

      {isPlaying && (
        <View style={styles.audioIndicator} pointerEvents="none">
          <Ionicons name="volume-high" size={13} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

// ── Single full-screen page ───────────────────────────────────────
function VideoItem({ video, navigation, isActive, shouldLoad }) {
  const yesOdds  = video.odds?.yes     ?? 2.0;
  const noOdds   = video.odds?.no      ?? 2.0;
  const yesProb  = video.odds?.yesProb ?? 50;
  const noProb   = video.odds?.noProb  ?? 50;
  const timeLeft    = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const uploadedAgo = video.uploaded_at ? getTimeAgo(new Date(video.uploaded_at)) : null;

  const handleBet = async (side) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Bet', { video, suggestedSide: side });
  };

  return (
    <View style={styles.itemContainer}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.anonDot} />
          <Text style={styles.anonLabel}>Anonymous</Text>
          {uploadedAgo && <Text style={styles.uploadedAgo}>· {uploadedAgo}</Text>}
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={10} color={COLORS.accent} />
            <Text style={styles.timerText}>{timeLeft}</Text>
          </View>
          <Pressable onPress={() => navigation.goBack()} hitSlop={14} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.muted} />
          </Pressable>
        </View>
      </View>

      {/* Likes badge */}
      {video.likes_at_ingestion != null && (
        <View style={styles.likesBadge}>
          <Ionicons name="heart" size={10} color={COLORS.accent} />
          <Text style={styles.likesText}>{video.likes_at_ingestion.toLocaleString()} likes when submitted</Text>
        </View>
      )}

      {/* Video player */}
      <VideoPlayer
        videoId={video.id}
        fallbackUrl={video.direct_video_url}
        thumbnail={video.thumbnail_url}
        isActive={isActive}
        shouldLoad={shouldLoad}
      />

      {/* Bottom section */}
      <View style={styles.bottom}>
        {/* Live odds */}
        <View style={styles.oddsContainer}>
          <View style={styles.oddsLabelRow}>
            <Text style={[styles.oddsLabel, { color: COLORS.yes }]}>
              🚀 {yesProb}% · {yesOdds.toFixed(2)}×
            </Text>
            <Text style={styles.oddsCenter}>market odds</Text>
            <Text style={[styles.oddsLabel, { color: COLORS.accent }]}>
              {noOdds.toFixed(2)}× · {noProb}% 📉
            </Text>
          </View>
          <View style={styles.oddsBar}>
            <View style={[styles.oddsYes, { flex: yesProb }]} />
            <View style={[styles.oddsNo,  { flex: noProb  }]} />
          </View>
        </View>

        {/* Crowd */}
        <View style={styles.crowdRow}>
          <Ionicons name="people-outline" size={12} color={COLORS.muted} />
          <Text style={styles.crowdText}>{video.noisy_bet_range} predictions placed</Text>
        </View>

        {/* Bet buttons */}
        <View style={styles.betRow}>
          <Pressable style={styles.betViral} onPress={() => handleBet('yes')}>
            <LinearGradient colors={['#00E87A', '#00A855']} style={styles.betGrad} start={[0,0]} end={[1,0]}>
              <Ionicons name="trending-up" size={18} color="#000" />
              <Text style={styles.betViralLabel}>GOES VIRAL</Text>
              <Text style={styles.betOdds}>{yesOdds.toFixed(2)}×</Text>
            </LinearGradient>
          </Pressable>

          <Pressable style={styles.betFlop} onPress={() => handleBet('no')}>
            <View style={styles.betFlopInner}>
              <Ionicons name="trending-down" size={18} color={COLORS.accent} />
              <Text style={styles.betFlopLabel}>FLOPS</Text>
              <Text style={[styles.betOdds, { color: COLORS.accent }]}>{noOdds.toFixed(2)}×</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.swipeHint} pointerEvents="none">
        <Ionicons name="chevron-up" size={14} color={COLORS.muted} style={{ opacity: 0.5 }} />
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────
const PRELOAD_WINDOW = 2;   // preload this many items ahead & behind

const viewabilityConfig = {
  itemVisiblePercentThreshold: 60,  // item must be 60% visible to be "active"
};

export default function VideoScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { video, videos, initialIndex } = route.params;

  const videoList  = videos ?? [video];
  const startIndex = initialIndex ?? 0;

  const [activeIndex, setActiveIndex] = useState(startIndex);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
    }
  }, []);

  // Stable ref required by FlatList
  const viewabilityConfigCallbackPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged },
  ]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <FlatList
        data={videoList}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <VideoItem
            video={item}
            navigation={navigation}
            isActive={index === activeIndex}
            shouldLoad={Math.abs(index - activeIndex) <= PRELOAD_WINDOW}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, index) => ({
          length: SCREEN_H,
          offset: SCREEN_H * index,
          index,
        })}
        decelerationRate="fast"
        snapToAlignment="start"
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
        // Keep ±3 items rendered so preloaded players stay mounted
        windowSize={7}
        maxToRenderPerBatch={3}
        initialNumToRender={3}
      />
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────
function getTimeLeft(d) {
  const ms = d - Date.now();
  if (ms <= 0) return 'Resolving…';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m left`;
}

function getTimeAgo(d) {
  const ms = Date.now() - d;
  const m  = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  itemContainer: { height: SCREEN_H, backgroundColor: COLORS.bg },

  topBar:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 10 },
  topBarLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  anonDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.muted },
  anonLabel:    { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12, fontStyle: 'italic' },
  uploadedAgo:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  topBarRight:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerBadge:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.accentGlow, borderWidth: 1, borderColor: COLORS.accent + '44', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  timerText:    { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },
  closeBtn:     { padding: 4 },

  likesBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingBottom: 6 },
  likesText:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  videoContainer: { width: '100%', aspectRatio: 9 / 14, backgroundColor: '#000', position: 'relative' },
  videoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.1)' },
  playBtn:      { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingLeft: 4 },
  videoHint:    { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.body, fontSize: 12 },
  audioIndicator: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 6 },

  bottom:       { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: SPACING.sm, justifyContent: 'center' },

  oddsContainer: { gap: 6 },
  oddsLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  oddsLabel:    { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  oddsCenter:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1 },
  oddsBar:      { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  oddsYes:      { backgroundColor: COLORS.yes },
  oddsNo:       { backgroundColor: COLORS.accent },

  crowdRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  crowdText:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  betRow:       { flexDirection: 'row', gap: SPACING.sm },
  betViral:     { flex: 1, borderRadius: RADIUS.md, overflow: 'hidden' },
  betGrad:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  betViralLabel: { color: '#000', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  betOdds:      { color: '#000', fontFamily: FONTS.display, fontSize: 16 },
  betFlop:      { flex: 1, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.accent + '66' },
  betFlopInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  betFlopLabel: { color: COLORS.accent, fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },

  swipeHint:    { alignItems: 'center', paddingBottom: 6, paddingTop: 2 },
});