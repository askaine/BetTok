// screens/LeaderboardScreen.js
import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const RANK_ICONS = ['🥇', '🥈', '🥉'];

function LeaderRow({ entry, rank, isMe }) {
  return (
    <View style={[styles.row, isMe && styles.rowMe]}>
      <View style={styles.rankCell}>
        {rank <= 3
          ? <Text style={styles.rankEmoji}>{RANK_ICONS[rank - 1]}</Text>
          : <Text style={[styles.rankNum, rank <= 10 && { color: COLORS.accent }]}>#{rank}</Text>
        }
      </View>
      <View style={styles.userCell}>
        <Text style={[styles.username, isMe && { color: COLORS.accent }]}>
          {entry.username} {isMe ? '(you)' : ''}
        </Text>
        {entry.badge ? <Text style={styles.badge}>{entry.badge}</Text> : null}
      </View>
      <View style={styles.statsCell}>
        <Text style={styles.sparks}>
          <Ionicons name="flash" size={11} color={COLORS.spark} /> {entry.sparks_earned?.toLocaleString()}
        </Text>
        <Text style={styles.pct}>{Math.round((entry.correct_pct || 0) * 100)}% correct</Text>
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState('weekly');
  const [weeklyEntries, setWeeklyEntries] = useState([]);
  const [allTimeEntries, setAllTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [weekResult, allResult] = await Promise.all([
          getApi('/leaderboard', { type: 'weekly' }),
          getApi('/leaderboard', { type: 'alltime' }),
        ]);
        setWeeklyEntries(weekResult.entries || []);
        setAllTimeEntries(allResult.entries || []);
      } catch (err) {
        console.error('Leaderboard error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const entries = tab === 'weekly' ? weeklyEntries : allTimeEntries;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading rankings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>RANKINGS</Text>
        <Text style={styles.headerSub}>top predictors</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'weekly' && styles.tabActive]} onPress={() => setTab('weekly')}>
          <Text style={[styles.tabLabel, tab === 'weekly' && styles.tabLabelActive]}>THIS WEEK</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'alltime' && styles.tabActive]} onPress={() => setTab('alltime')}>
          <Text style={[styles.tabLabel, tab === 'alltime' && styles.tabLabelActive]}>ALL TIME</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(item, i) => item.uid || String(i)}
        renderItem={({ item, index }) => (
          <LeaderRow entry={item} rank={index + 1} isMe={item.uid === user?.id} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏆</Text>
            <Text style={styles.emptyTitle}>No rankings yet</Text>
            <Text style={styles.emptyText}>Start predicting to appear on the leaderboard</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  header: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 30 },
  headerSub: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  tabs: {
    flexDirection: 'row', margin: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: 4, borderWidth: 1, borderColor: COLORS.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: COLORS.accent },
  tabLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, letterSpacing: 1 },
  tabLabelActive: { color: COLORS.bg, fontWeight: '700' },
  list: { paddingHorizontal: SPACING.md, paddingBottom: 80, gap: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  rowMe: { borderColor: COLORS.accent, backgroundColor: COLORS.accentGlow },
  rankCell: { width: 36, alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankNum: { color: COLORS.muted, fontFamily: FONTS.display, fontSize: 16 },
  userCell: { flex: 1, gap: 2 },
  username: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  badge: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  statsCell: { alignItems: 'flex-end', gap: 2 },
  sparks: { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 15 },
  pct: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
});