// screens/TrendingScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView, Image, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation } from '@react-navigation/native';

function TrendingCard({ video, rank, onBet, onWatch }) {
  const timeLeft = getTimeLeft(video.resolution_deadline ? new Date(video.resolution_deadline) : new Date());
  const yesOdds  = video.odds?.yes     || 2.0;
  const noOdds   = video.odds?.no      || 2.0;
  const yesProb  = video.odds?.yesProb || 50;

  return (
    // Entire card is tappable → opens full video view
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      onPress={() => onWatch(video)}
    >
      {/* Rank badge */}
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{rank}</Text>
      </View>

      <View style={styles.cardInner}>
        {/* Thumbnail — also tappable, shows "Watch" hint */}
        <Pressable style={styles.thumbWrapper} onPress={() => onWatch(video)}>
          {video.thumbnail_url
            ? <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} />
            : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="play-circle-outline" size={28} color={COLORS.muted} />
              </View>
            )
          }
          <View style={styles.watchOverlay}>
            <Ionicons name="play-circle" size={22} color="#ffffffcc" />
          </View>
        </Pressable>

        <View style={styles.cardContent}>
          {/* Timer */}
          <View style={styles.timerRow}>
            <Ionicons name="time-outline" size={11} color={COLORS.accent} />
            <Text style={styles.timerText}>{timeLeft}</Text>
          </View>

          {/* Prediction count */}
          <Text style={styles.betCount}>
            <Ionicons name="people-outline" size={12} color={COLORS.muted} /> {video.noisy_bet_range} predictions
          </Text>

          {/* Odds display */}
          <View style={styles.oddsRow}>
            <View style={[styles.oddsPill, { backgroundColor: COLORS.yes + '22' }]}>
              <Text style={[styles.oddsPillText, { color: COLORS.yes }]}>
                🚀 {yesOdds.toFixed(2)}×
              </Text>
            </View>
            <View style={[styles.oddsPill, { backgroundColor: COLORS.accent + '22' }]}>
              <Text style={[styles.oddsPillText, { color: COLORS.accent }]}>
                📉 {noOdds.toFixed(2)}×
              </Text>
            </View>
          </View>

          {/* Probability bar */}
          <View style={styles.barContainer}>
            <View style={[styles.barYes, { flex: yesProb }]} />
            <View style={[styles.barNo,  { flex: 100 - yesProb }]} />
          </View>
          <View style={styles.barLabels}>
            <Text style={styles.barLabelYes}>{yesProb}% VIRAL</Text>
            <Text style={styles.barLabelNo}>{100 - yesProb}% FLOP</Text>
          </View>

          {/* Bet buttons — stop propagation so card tap doesn't fire too */}
          <View style={styles.betBtns}>
            <Pressable
              style={({ pressed }) => [styles.betBtn, styles.betBtnYes, pressed && { opacity: 0.75 }]}
              onPress={(e) => { e.stopPropagation?.(); onBet(video, 'yes'); }}
            >
              <Ionicons name="trending-up" size={13} color={COLORS.bg} />
              <Text style={styles.betBtnLabel}>VIRAL</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.betBtn, styles.betBtnNo, pressed && { opacity: 0.75 }]}
              onPress={(e) => { e.stopPropagation?.(); onBet(video, 'no'); }}
            >
              <Ionicons name="trending-down" size={13} color={COLORS.text} />
              <Text style={[styles.betBtnLabel, { color: COLORS.text }]}>FLOP</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function TrendingScreen() {
  const navigation = useNavigation();
  const [videos, setVideos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
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

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
            onBet={(v, s) => navigation.navigate('Bet',   { video: v, suggestedSide: s })}
            onWatch={(v)  => navigation.navigate('Video', { video: v })}
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
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h left`;
  return `${h}h left`;
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  header:          { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:     { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 30 },
  headerSub:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  list:            { padding: SPACING.md, paddingBottom: 80, gap: SPACING.sm },

  card:            { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  rankBadge:       { backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  rankText:        { color: COLORS.bg, fontFamily: FONTS.display, fontSize: 12, letterSpacing: 1 },
  cardInner:       { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },

  thumbWrapper:    { position: 'relative' },
  thumb:           { width: 80, height: 120, borderRadius: RADIUS.sm },
  thumbPlaceholder: { backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
  watchOverlay:    { position: 'absolute', bottom: 4, right: 4, backgroundColor: '#00000055', borderRadius: 12, padding: 2 },

  cardContent:     { flex: 1, gap: 6, justifyContent: 'center' },
  timerRow:        { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText:       { color: COLORS.accent, fontSize: 11, fontWeight: '700' },
  betCount:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  oddsRow:         { flexDirection: 'row', gap: 6 },
  oddsPill:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm },
  oddsPillText:    { fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },

  barContainer:    { flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  barYes:          { backgroundColor: COLORS.yes },
  barNo:           { backgroundColor: COLORS.accent },
  barLabels:       { flexDirection: 'row', justifyContent: 'space-between' },
  barLabelYes:     { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },
  barLabelNo:      { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },

  betBtns:         { flexDirection: 'row', gap: 6, marginTop: 2 },
  betBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: RADIUS.sm },
  betBtnYes:       { backgroundColor: COLORS.yes },
  betBtnNo:        { backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border },
  betBtnLabel:     { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },

  empty:           { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon:       { fontSize: 40 },
  emptyTitle:      { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
});