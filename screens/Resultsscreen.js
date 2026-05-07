// screens/ResultsScreen.js
// Shows resolved videos — what went viral, what flopped
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

function ResolvedCard({ video }) {
  const isViral = video.status === 'resolved_yes';
  const resolvedAgo = getTimeAgo(video.resolved_at ? new Date(video.resolved_at) : new Date());
  const views = video.current_views || 0;

  return (
    <View style={styles.card}>
      <View style={[styles.resultStrip, { backgroundColor: isViral ? COLORS.yes : COLORS.accent }]}>
        <Ionicons name={isViral ? 'trending-up' : 'trending-down'} size={14} color={COLORS.bg} />
        <Text style={styles.resultStripText}>{isViral ? 'WENT VIRAL' : 'FLOPPED'}</Text>
      </View>

      <View style={styles.cardInner}>
        {video.thumbnail_url
          ? <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} />
          : <View style={[styles.thumb, { backgroundColor: COLORS.surfaceHigh }]} />
        }
        <View style={styles.cardContent}>
          <Text style={styles.author}>@{video.author_handle || 'anonymous'}</Text>
          <Text style={styles.title} numberOfLines={2}>{video.title || 'TikTok Video'}</Text>

          {views > 0 && (
            <View style={styles.viewsRow}>
              <Ionicons name="eye-outline" size={12} color={isViral ? COLORS.yes : COLORS.muted} />
              <Text style={[styles.viewsText, { color: isViral ? COLORS.yes : COLORS.muted }]}>
                {views >= 1_000_000
                  ? `${(views / 1_000_000).toFixed(1)}M views`
                  : views >= 1_000
                  ? `${(views / 1_000).toFixed(0)}K views`
                  : `${views} views`}
              </Text>
            </View>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              <Ionicons name="people-outline" size={11} color={COLORS.muted} /> {video.total_bets || 0} bets
            </Text>
            <Text style={styles.meta}>{resolvedAgo}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ResultsScreen() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getApi('/results');
      setVideos(result.videos || []);
    } catch (err) {
      console.error('Results error:', err);
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
        <Text style={styles.loadingText}>Loading results...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>RESULTS</Text>
        <Text style={styles.headerSub}>resolved predictions</Text>
      </View>
      <FlatList
        data={videos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ResolvedCard video={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏁</Text>
            <Text style={styles.emptyTitle}>No results yet</Text>
            <Text style={styles.emptyText}>Check back after the first 7-day window closes</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function getTimeAgo(date) {
  const ms = Date.now() - date;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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
  resultStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  resultStripText: { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  cardInner: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  thumb: { width: 72, height: 96, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceHigh },
  cardContent: { flex: 1, gap: 4, justifyContent: 'center' },
  author: { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11 },
  title: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText: { fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  meta: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
});