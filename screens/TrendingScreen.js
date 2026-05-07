// screens/TrendingScreen.js
// Shows active videos sorted by most bets placed — "what's hot right now"
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView, Image, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation } from '@react-navigation/native';

function TrendingCard({ video, rank, onBet }) {
  const timeLeft = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const yesCount = video.yes_bets || 0;
  const noCount  = video.no_bets  || 0;
  const total    = yesCount + noCount;
  const yesPct   = total > 0 ? Math.round((yesCount / total) * 100) : 50;

  return (
    <View style={styles.card}>
      {/* Rank badge */}
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{rank}</Text>
      </View>

      <View style={styles.cardInner}>
        {video.thumbnail_url
          ? <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} />
          : <View style={[styles.thumb, { backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="play-circle-outline" size={28} color={COLORS.muted} />
            </View>
        }

        <View style={styles.cardContent}>
          <View style={styles.timerRow}>
            <Ionicons name="time-outline" size={11} color={COLORS.accent} />
            <Text style={styles.timerText}>{timeLeft}</Text>
          </View>

          <Text style={styles.betCount}>
            <Ionicons name="people-outline" size={12} color={COLORS.muted} /> {video.noisy_bet_range} predictions
          </Text>

          {/* Yes/No bar */}
          {total > 0 && (
            <View style={styles.barContainer}>
              <View style={[styles.barYes, { flex: yesPct }]} />
              <View style={[styles.barNo,  { flex: 100 - yesPct }]} />
            </View>
          )}
          {total > 0 && (
            <View style={styles.barLabels}>
              <Text style={styles.barLabelYes}>{yesPct}% VIRAL</Text>
              <Text style={styles.barLabelNo}>{100 - yesPct}% FLOP</Text>
            </View>
          )}

          <View style={styles.betBtns}>
            <Pressable
              style={({ pressed }) => [styles.betBtn, styles.betBtnYes, pressed && { opacity: 0.75 }]}
              onPress={() => onBet(video, 'yes')}
            >
              <Ionicons name="trending-up" size={13} color={COLORS.bg} />
              <Text style={styles.betBtnLabel}>VIRAL</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.betBtn, styles.betBtnNo, pressed && { opacity: 0.75 }]}
              onPress={() => onBet(video, 'no')}
            >
              <Ionicons name="trending-down" size={13} color={COLORS.text} />
              <Text style={[styles.betBtnLabel, { color: COLORS.text }]}>FLOP</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function TrendingScreen() {
  const navigation = useNavigation();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getApi('/trending');
      setVideos(result.videos || []);
    } catch (err) {
      console.error('Trending error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading trending...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TRENDING</Text>
        <Text style={styles.headerSub}>most active predictions</Text>
      </View>
      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <TrendingCard
            video={item}
            rank={index + 1}
            onBet={(v, s) => navigation.navigate('Bet', { video: v, suggestedSide: s })}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔥</Text>
            <Text style={styles.emptyTitle}>Nothing trending yet</Text>
            <Text style={styles.emptyText}>Submit videos and place bets to get things heating up</Text>
          </View>
        }
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  header: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 30 },
  headerSub: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  list: { padding: SPACING.md, paddingBottom: 80, gap: SPACING.sm },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  rankBadge: { backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  rankText: { color: COLORS.bg, fontFamily: FONTS.display, fontSize: 12, letterSpacing: 1 },
  cardInner: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  thumb: { width: 80, height: 110, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceHigh },
  cardContent: { flex: 1, gap: 6, justifyContent: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { color: COLORS.accent, fontSize: 11, fontWeight: '700' },
  betCount: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  barContainer: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  barYes: { backgroundColor: COLORS.yes },
  barNo: { backgroundColor: COLORS.accent },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabelYes: { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },
  barLabelNo: { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },
  betBtns: { flexDirection: 'row', gap: 6, marginTop: 2 },
  betBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: RADIUS.sm },
  betBtnYes: { backgroundColor: COLORS.yes },
  betBtnNo: { backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border },
  betBtnLabel: { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
});