// screens/TrendingScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView,
  Image, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../theme';

function TrendingCard({ video, rank, onBet, onWatch }) {
  const timeLeft = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const yesOdds  = video.odds?.yes     ?? 2.0;
  const noOdds   = video.odds?.no      ?? 2.0;
  const yesProb  = video.odds?.yesProb ?? 50;
  const noProb   = video.odds?.noProb  ?? 50;
  const isHot    = (video.total_bets || 0) >= 15;

  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const rankColor  = rankColors[rank - 1] || COLORS.muted;

  return (
    <View style={styles.card}>
      {/* Rank strip */}
      <View style={[styles.rankStrip, { backgroundColor: rank <= 3 ? rankColor + '22' : COLORS.surfaceHigh }]}>
        <Text style={[styles.rankText, { color: rank <= 3 ? rankColor : COLORS.muted }]}>
          {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
        </Text>
        {isHot && (
          <View style={styles.hotPill}>
            <Text style={styles.hotPillText}>🔥 HOT</Text>
          </View>
        )}
        <View style={styles.timerBadge}>
          <Ionicons name="time-outline" size={10} color={COLORS.accent} />
          <Text style={styles.timerText}>{timeLeft}</Text>
        </View>
      </View>

      <Pressable style={styles.cardBody} onPress={() => onWatch(video)}>
        {/* Thumbnail */}
        <View style={styles.thumbWrapper}>
          {video.thumbnail_url
            ? <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
            : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="play-circle-outline" size={32} color={COLORS.muted} />
              </View>
            )
          }
          <View style={styles.playOverlay}>
            <Ionicons name="play-circle" size={24} color="rgba(255,255,255,0.85)" />
          </View>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Odds pills */}
          <View style={styles.oddsPills}>
            <View style={[styles.oddsPill, { backgroundColor: COLORS.yesGlow, borderColor: COLORS.yes + '44' }]}>
              <Text style={[styles.oddsPillText, { color: COLORS.yes }]}>🚀 {yesOdds.toFixed(2)}×</Text>
            </View>
            <View style={[styles.oddsPill, { backgroundColor: COLORS.accentGlow, borderColor: COLORS.accent + '44' }]}>
              <Text style={[styles.oddsPillText, { color: COLORS.accent }]}>📉 {noOdds.toFixed(2)}×</Text>
            </View>
          </View>

          {/* Probability bar */}
          <View style={styles.probBar}>
            <View style={[styles.probYes, { flex: yesProb }]} />
            <View style={[styles.probNo,  { flex: noProb  }]} />
          </View>
          <View style={styles.probLabels}>
            <Text style={styles.probLabelYes}>{yesProb}% VIRAL</Text>
            <Text style={styles.probLabelNo}>{noProb}% FLOP</Text>
          </View>

          {/* Crowd */}
          <View style={styles.crowdRow}>
            <Ionicons name="people-outline" size={11} color={COLORS.muted} />
            <Text style={styles.crowdText}>{video.noisy_bet_range} predictions</Text>
          </View>

          {/* Bet buttons */}
          <View style={styles.betBtns}>
            <Pressable
              style={styles.betBtnViral}
              onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onBet(video, 'yes'); }}
            >
              <LinearGradient colors={['#00E87A', '#00A855']} style={styles.betBtnGrad} start={[0,0]} end={[1,0]}>
                <Ionicons name="trending-up" size={13} color="#000" />
                <Text style={styles.betBtnViralLabel}>VIRAL</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={styles.betBtnFlop}
              onPress={async () => { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onBet(video, 'no'); }}
            >
              <Ionicons name="trending-down" size={13} color={COLORS.accent} />
              <Text style={styles.betBtnFlopLabel}>FLOP</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

export default function TrendingScreen() {
  const navigation = useNavigation();
  const [videos,    setVideos]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const result = await getApi('/trending');
      setVideos(result.videos || []);
    } catch (err) {
      setError('Could not load trending. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading trending…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>TRENDING</Text>
          <Text style={styles.headerSub}>most active predictions right now</Text>
        </View>
      </View>

      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <TrendingCard
            video={item}
            rank={index + 1}
            onBet={(v, s) => navigation.navigate('Bet', { video: v, suggestedSide: s })}
            onWatch={v  => navigation.navigate('Video', { video: v })}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔥</Text>
            <Text style={styles.emptyTitle}>{error || 'Nothing trending yet'}</Text>
            <Text style={styles.emptyText}>Submit videos and place bets to heat things up</Text>
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
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)   return `${h}h ${m}m`;
  return `${m}m left`;
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bg },
  center:      { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },

  header:      { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 32 },
  headerSub:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },

  list: { padding: SPACING.md, paddingBottom: 100, gap: SPACING.sm },

  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOW.card },

  rankStrip:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  rankText:   { fontFamily: FONTS.display, fontSize: 18, minWidth: 32 },
  hotPill:    { backgroundColor: COLORS.accent + '22', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  hotPillText: { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', backgroundColor: COLORS.accentGlow, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  timerText:  { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },

  cardBody:       { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  thumbWrapper:   { position: 'relative', width: 88, height: 120, borderRadius: RADIUS.md, overflow: 'hidden' },
  thumb:          { width: '100%', height: '100%' },
  thumbPlaceholder: { width: '100%', height: '100%', backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
  playOverlay:    { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 2 },

  cardContent:  { flex: 1, gap: 6, justifyContent: 'center' },
  oddsPills:    { flexDirection: 'row', gap: 6 },
  oddsPill:     { paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1 },
  oddsPillText: { fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },

  probBar:       { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  probYes:       { backgroundColor: COLORS.yes },
  probNo:        { backgroundColor: COLORS.accent },
  probLabels:    { flexDirection: 'row', justifyContent: 'space-between' },
  probLabelYes:  { color: COLORS.yes,    fontFamily: FONTS.body, fontSize: 9, fontWeight: '700' },
  probLabelNo:   { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 9, fontWeight: '700' },

  crowdRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crowdText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  betBtns:         { flexDirection: 'row', gap: 6 },
  betBtnViral:     { flex: 1, borderRadius: RADIUS.sm, overflow: 'hidden' },
  betBtnGrad:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9 },
  betBtnViralLabel: { color: '#000', fontFamily: FONTS.body, fontWeight: '700', fontSize: 11 },
  betBtnFlop:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.accent + '66' },
  betBtnFlopLabel: { color: COLORS.accent, fontFamily: FONTS.body, fontWeight: '700', fontSize: 11 },

  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 20 },
  emptyText:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});
