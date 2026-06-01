// screens/VideoScreen.js
import React, { useRef, useState, useEffect } from 'react';
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
    }).catch(() => {});
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
        let uri = fallbackUrl;
        try {
          const r = await getApi('/videoUrl', { id: videoId });
          if (r?.url) uri = r.url;
        } catch (_) {}
        await videoRef.current.loadAsync({ uri }, {}, false);
        hasLoaded.current = true;
      } catch (e) {
        setFetchingUrl(false);
        return;
      }
      setFetchingUrl(false);
    }
    try {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    } catch (_) {}
  };

  const onStatus = (s) => {
    if (!s.isLoaded) return;
    setIsBuffering(s.isBuffering && !s.isPlaying);
    if (s.didJustFinish) {
      setIsPlaying(false);
      videoRef.current?.setPositionAsync(0);
    }
  };

  return (
    <Pressable style={styles.videoContainer} onPress={togglePlay}>
      {/* Thumbnail shown before play */}
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
        shouldPlay={false}
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

// ── Single video item (one "page" in the scroll) ──────────
function VideoItem({ video, navigation }) {
  const yesOdds  = video.odds?.yes     ?? 2.0;
  const noOdds   = video.odds?.no      ?? 2.0;
  const yesProb  = video.odds?.yesProb ?? 50;
  const noProb   = video.odds?.noProb  ?? 50;
  const timeLeft = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
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

      {/* Swipe hint — shown subtly on first item only */}
      <View style={styles.swipeHint} pointerEvents="none">
        <Ionicons name="chevron-up" size={14} color={COLORS.muted} style={{ opacity: 0.5 }} />
      </View>
    </View>
  );
}

// ── Screen: paging FlatList of VideoItems ─────────────────
export default function VideoScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { video, videos, initialIndex } = route.params;

  // Support both single-video (legacy) and multi-video navigation
  const videoList  = videos ?? [video];
  const startIndex = initialIndex ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <FlatList
        data={videoList}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <VideoItem video={item} navigation={navigation} />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={startIndex}
        // getItemLayout is required for initialScrollIndex to work correctly
        getItemLayout={(_, index) => ({
          length: SCREEN_H,
          offset: SCREEN_H * index,
          index,
        })}
        decelerationRate="fast"
        snapToAlignment="start"
      />
    </SafeAreaView>
  );
}

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

const styles = StyleSheet.create({
  // Outer FlatList wrapper
  container:    { flex: 1, backgroundColor: COLORS.bg },

  // Each full-screen page
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

  // Subtle "swipe up for next" affordance
  swipeHint:    { alignItems: 'center', paddingBottom: 6, paddingTop: 2 },
});