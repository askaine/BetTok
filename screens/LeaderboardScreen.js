// screens/LeaderboardScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView,
  TouchableOpacity, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { getApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../theme';

const RANK_EMOJI  = ['🥇', '🥈', '🥉'];
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function PodiumCard({ entry, rank }) {
  const color = RANK_COLORS[rank - 1] || COLORS.muted;
  return (
    <View style={[styles.podiumCard, { borderColor: color + '44' }]}>
      <Text style={styles.podiumEmoji}>{RANK_EMOJI[rank - 1]}</Text>
      <View style={[styles.podiumAvatar, { backgroundColor: color + '33', borderColor: color + '66' }]}>
        <Text style={[styles.podiumAvatarText, { color }]}>
          {(entry.username || 'U')[0].toUpperCase()}
        </Text>
      </View>
      <Text style={[styles.podiumUsername, { color }]} numberOfLines={1}>
        {entry.username}
      </Text>
      <Text style={styles.podiumSparks}>
        ⚡ {(entry.sparks_earned || 0).toLocaleString()}
      </Text>
      <Text style={styles.podiumPct}>{Math.round((entry.correct_pct || 0) * 100)}% accurate</Text>
    </View>
  );
}

function LeaderRow({ entry, rank, isMe, index }) {
  const anim = new Animated.Value(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 40,
      useNativeDriver: true,
    }).start();
  }, []);

  const isTop3 = rank <= 3;
  const rankColor = RANK_COLORS[rank - 1] || (rank <= 10 ? COLORS.accent : COLORS.muted);

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <View style={[styles.row, isMe && styles.rowMe, isTop3 && { borderColor: RANK_COLORS[rank - 1] + '44' }]}>
        {/* Rank */}
        <View style={styles.rankCell}>
          {isTop3
            ? <Text style={styles.rankEmoji}>{RANK_EMOJI[rank - 1]}</Text>
            : <Text style={[styles.rankNum, { color: rankColor }]}>#{rank}</Text>
          }
        </View>

        {/* Avatar */}
        <View style={[styles.avatar, isMe && { backgroundColor: COLORS.accent }]}>
          <Text style={styles.avatarText}>{(entry.username || 'U')[0].toUpperCase()}</Text>
        </View>

        {/* Name + badge */}
        <View style={styles.userCell}>
          <Text style={[styles.username, isMe && { color: COLORS.accent }]} numberOfLines={1}>
            {entry.username}{isMe ? ' (you)' : ''}
          </Text>
          {entry.streak > 0 && (
            <Text style={styles.streakBadge}>🔥 {entry.streak}d streak</Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsCell}>
          <Text style={styles.sparksText}>
            ⚡ {(entry.sparks_earned || 0).toLocaleString()}
          </Text>
          <Text style={styles.pctText}>
            {Math.round((entry.correct_pct || 0) * 100)}% accurate
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const [tab,     setTab]     = useState('weekly');
  const [weekly,  setWeekly]  = useState([]);
  const [allTime, setAllTime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [wResult, aResult] = await Promise.all([
        getApi('/leaderboard', { type: 'weekly' }),
        getApi('/leaderboard', { type: 'alltime' }),
      ]);
      setWeekly(wResult.entries  || []);
      setAllTime(aResult.entries || []);
    } catch (err) {
      console.error('Leaderboard error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const entries = tab === 'weekly' ? weekly : allTime;
  const top3    = entries.slice(0, 3);
  const rest    = entries.slice(3);

  // Find current user's rank
  const myRank  = entries.findIndex(e => e.uid === user?.id) + 1;
  const myEntry = entries.find(e => e.uid === user?.id);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading rankings…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>RANKINGS</Text>
          <Text style={styles.headerSub}>top predictors</Text>
        </View>
        {myRank > 0 && myEntry && (
          <View style={styles.myRankPill}>
            <Text style={styles.myRankText}>You: #{myRank}</Text>
          </View>
        )}
      </View>

      {/* Tab toggle */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'weekly' && styles.tabActive]} onPress={() => setTab('weekly')}>
          <Text style={[styles.tabLabel, tab === 'weekly' && styles.tabLabelActive]}>THIS WEEK</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'alltime' && styles.tabActive]} onPress={() => setTab('alltime')}>
          <Text style={[styles.tabLabel, tab === 'alltime' && styles.tabLabelActive]}>ALL TIME</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={rest}
        keyExtractor={(item, i) => item.uid || String(i)}
        ListHeaderComponent={
          entries.length > 0 ? (
            <>
              {/* Podium for top 3 */}
              {top3.length >= 3 && (
                <View style={styles.podiumRow}>
                  <PodiumCard entry={top3[1]} rank={2} />
                  <PodiumCard entry={top3[0]} rank={1} />
                  <PodiumCard entry={top3[2]} rank={3} />
                </View>
              )}
              {top3.length < 3 && top3.map((e, i) => (
                <LeaderRow key={e.uid || i} entry={e} rank={i + 1} isMe={e.uid === user?.id} index={i} />
              ))}
            </>
          ) : null
        }
        renderItem={({ item, index }) => (
          <LeaderRow
            entry={item}
            rank={index + 4}
            isMe={item.uid === user?.id}
            index={index}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🏆</Text>
            <Text style={styles.emptyTitle}>No rankings yet</Text>
            <Text style={styles.emptyText}>Start predicting to appear on the leaderboard</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bg },
  center:      { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },

  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 32 },
  headerSub:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  myRankPill:  { backgroundColor: COLORS.accentGlow, borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.accent + '44' },
  myRankText:  { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 14 },

  tabs:          { flexDirection: 'row', marginHorizontal: SPACING.md, marginTop: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  tab:           { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive:     { backgroundColor: COLORS.accent },
  tabLabel:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, letterSpacing: 1 },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  list: { padding: SPACING.md, paddingBottom: 100, gap: 6 },

  // Podium
  podiumRow:       { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, alignItems: 'flex-end' },
  podiumCard:      { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.sm, alignItems: 'center', gap: 4, borderWidth: 1, ...SHADOW.card },
  podiumEmoji:     { fontSize: 24 },
  podiumAvatar:    { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  podiumAvatarText: { fontFamily: FONTS.display, fontSize: 20 },
  podiumUsername:  { fontFamily: FONTS.body, fontSize: 11, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  podiumSparks:    { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 14 },
  podiumPct:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9 },

  // Rows
  row:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  rowMe:     { borderColor: COLORS.accent + '66', backgroundColor: COLORS.accentGlow },
  rankCell:  { width: 32, alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankNum:   { fontFamily: FONTS.display, fontSize: 16 },
  avatar:    { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 16 },
  userCell:  { flex: 1, gap: 2 },
  username:  { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  streakBadge: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  statsCell: { alignItems: 'flex-end', gap: 2 },
  sparksText: { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 14 },
  pctText:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
});
