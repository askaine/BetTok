// screens/ResultsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView,
  Image, TouchableOpacity, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../theme';

function ResolvedCard({ video, myBet }) {
  const isViral    = video.status === 'resolved_yes';
  const resolvedAgo = getTimeAgo(video.resolved_at ? new Date(video.resolved_at) : new Date());
  const views      = video.current_views || 0;

  const betWon  = myBet?.status === 'won';
  const betLost = myBet?.status === 'lost';

  return (
    <View style={[styles.card, myBet && (betWon ? styles.cardWon : styles.cardLost)]}>
      {/* Result header strip */}
      <LinearGradient
        colors={isViral ? ['#00E87A', '#00A855'] : ['#FF3B5C', '#CC1F3F']}
        style={styles.resultStrip}
        start={[0, 0]} end={[1, 0]}
      >
        <Ionicons name={isViral ? 'trending-up' : 'trending-down'} size={14} color="#fff" />
        <Text style={styles.resultStripText}>{isViral ? 'WENT VIRAL 🚀' : 'FLOPPED 📉'}</Text>

        {/* User's bet outcome */}
        {myBet && (
          <View style={[styles.betOutcomePill, { backgroundColor: 'rgba(0,0,0,0.25)' }]}>
            <Text style={styles.betOutcomeText}>
              {betWon ? `YOU WON +${myBet.sparks_earned ?? myBet.potential_payout} ⚡` : `YOU LOST −${myBet.sparks_wagered} ⚡`}
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={styles.cardBody}>
        {/* Thumbnail */}
        {video.thumbnail_url
          ? <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
          : <View style={[styles.thumb, styles.thumbPlaceholder]} />
        }

        {/* Info */}
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={2}>{video.title || 'TikTok Video'}</Text>

          {/* Final views */}
          {views > 0 && (
            <View style={styles.viewsRow}>
              <Ionicons name="eye-outline" size={12} color={isViral ? COLORS.yes : COLORS.muted} />
              <Text style={[styles.viewsText, { color: isViral ? COLORS.yes : COLORS.muted }]}>
                {views >= 1_000_000 ? `${(views / 1_000_000).toFixed(1)}M views`
                  : views >= 1_000  ? `${(views / 1_000).toFixed(0)}K views`
                  : `${views} views`}
              </Text>
            </View>
          )}

          {/* Your prediction */}
          {myBet && (
            <View style={styles.myPredRow}>
              <Text style={styles.myPredLabel}>Your call:</Text>
              <Text style={[styles.myPredValue, { color: myBet.side === 'yes' ? COLORS.yes : COLORS.accent }]}>
                {myBet.side === 'yes' ? '🚀 VIRAL' : '📉 FLOP'} · {myBet.sparks_wagered} ⚡
              </Text>
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              <Ionicons name="people-outline" size={10} color={COLORS.muted} /> {video.total_bets || 0} predictions
            </Text>
            <Text style={styles.metaText}>{resolvedAgo}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ResultsScreen() {
  const { user }   = useAuth();
  const [tab,      setTab]      = useState('all');
  const [all,      setAll]      = useState([]);
  const [myBets,   setMyBets]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rResult, bResult] = await Promise.all([
        getApi('/results'),
        user ? getApi('/myBets') : Promise.resolve({ bets: [] }),
      ]);
      setAll(rResult.videos || []);
      setMyBets((bResult.bets || []).filter(b => b.status === 'won' || b.status === 'lost'));
    } catch (err) {
      setError('Could not load results.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, []);

  const myBetMap = {};
  myBets.forEach(b => { myBetMap[b.video_id] = b; });

  const myResultVideos = all.filter(v => myBetMap[v.id]);
  const displayVideos  = tab === 'mine' ? myResultVideos : all;

  const wonCount  = myBets.filter(b => b.status === 'won').length;
  const lostCount = myBets.filter(b => b.status === 'lost').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={styles.loadingText}>Loading results…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>RESULTS</Text>
          <Text style={styles.headerSub}>resolved predictions</Text>
        </View>
      </View>

      {/* Stats bar — only when My Bets tab active */}
      {tab === 'mine' && myBets.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.statsItem}>
            <Text style={[styles.statsNum, { color: COLORS.yes }]}>{wonCount}</Text>
            <Text style={styles.statsLabel}>Won</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsItem}>
            <Text style={[styles.statsNum, { color: COLORS.accent }]}>{lostCount}</Text>
            <Text style={styles.statsLabel}>Lost</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsItem}>
            <Text style={[styles.statsNum, { color: COLORS.spark }]}>
              {myBets.length > 0 ? Math.round((wonCount / myBets.length) * 100) : 0}%
            </Text>
            <Text style={styles.statsLabel}>Accuracy</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'all' && styles.tabActive]} onPress={() => setTab('all')}>
          <Text style={[styles.tabLabel, tab === 'all' && styles.tabLabelActive]}>ALL RESULTS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'mine' && styles.tabActive]} onPress={() => setTab('mine')}>
          <Text style={[styles.tabLabel, tab === 'mine' && styles.tabLabelActive]}>
            MY BETS {myBets.length > 0 ? `(${myBets.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayVideos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ResolvedCard
            video={item}
            myBet={tab === 'mine' ? myBetMap[item.id] : null}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>{tab === 'mine' ? '🎯' : '🏁'}</Text>
            <Text style={styles.emptyTitle}>
              {error || (tab === 'mine' ? 'No resolved bets yet' : 'No results yet')}
            </Text>
            <Text style={styles.emptyText}>
              {tab === 'mine'
                ? 'Your bets appear here once their prediction windows close'
                : 'Results appear after the 7-day prediction windows close'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
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
  container:   { flex: 1, backgroundColor: COLORS.bg },
  center:      { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },

  header:     { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 32 },
  headerSub:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },

  statsBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', padding: SPACING.sm, backgroundColor: COLORS.surfaceHigh, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  statsItem:   { alignItems: 'center', gap: 2 },
  statsNum:    { fontFamily: FONTS.display, fontSize: 22 },
  statsLabel:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, letterSpacing: 1 },
  statsDivider: { width: 1, height: 32, backgroundColor: COLORS.border },

  tabs:         { flexDirection: 'row', marginHorizontal: SPACING.md, marginVertical: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  tab:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive:    { backgroundColor: COLORS.accent },
  tabLabel:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, letterSpacing: 1 },
  tabLabelActive: { color: '#fff', fontWeight: '700' },

  list: { paddingHorizontal: SPACING.md, paddingBottom: 100, gap: SPACING.sm },

  card:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden', ...SHADOW.card },
  cardWon:  { borderColor: COLORS.yes + '44' },
  cardLost: { borderColor: COLORS.accent + '33' },

  resultStrip:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 8 },
  resultStripText: { color: '#fff', fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', letterSpacing: 1, flex: 1 },
  betOutcomePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  betOutcomeText: { color: '#fff', fontFamily: FONTS.body, fontSize: 10, fontWeight: '700' },

  cardBody:    { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  thumb:       { width: 72, height: 96, borderRadius: RADIUS.sm },
  thumbPlaceholder: { backgroundColor: COLORS.surfaceHigh },
  cardContent: { flex: 1, gap: 5, justifyContent: 'center' },
  cardTitle:   { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },

  viewsRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText:  { fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },

  myPredRow:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  myPredLabel:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  myPredValue:  { fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },

  metaRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  empty:     { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
});
