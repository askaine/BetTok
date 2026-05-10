// screens/ResultsScreen.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, SafeAreaView, Image,
  TouchableOpacity, Modal, ScrollView, Linking, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

// ─────────────────────────────────────────
// Video Detail Modal
// ─────────────────────────────────────────
function VideoDetailModal({ video, myBet, visible, onClose }) {
  if (!video) return null;

  const isViral = video.status === 'resolved_yes';
  const views   = video.current_views || 0;
  const likes   = video.likes_at_ingestion || 0;
  const betWon  = myBet?.status === 'won';
  const betLost = myBet?.status === 'lost';

  const openTikTok = () => {
    if (video.tiktok_url) Linking.openURL(video.tiktok_url);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        {/* Header */}
        <View style={modal.header}>
          <Text style={modal.headerTitle}>VIDEO DETAILS</Text>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modal.scroll} showsVerticalScrollIndicator={false}>

          {/* Thumbnail + result */}
          <View style={modal.heroRow}>
            {video.thumbnail_url
              ? <Image source={{ uri: video.thumbnail_url }} style={modal.thumb} />
              : <View style={[modal.thumb, { backgroundColor: COLORS.surfaceHigh }]} />
            }
            <View style={modal.heroInfo}>
              <View style={[modal.resultBadge, { backgroundColor: isViral ? COLORS.yes + '22' : COLORS.accent + '22', borderColor: isViral ? COLORS.yes : COLORS.accent }]}>
                <Ionicons name={isViral ? 'trending-up' : 'trending-down'} size={13} color={isViral ? COLORS.yes : COLORS.accent} />
                <Text style={[modal.resultBadgeText, { color: isViral ? COLORS.yes : COLORS.accent }]}>
                  {isViral ? 'WENT VIRAL' : 'FLOPPED'}
                </Text>
              </View>
              <Text style={modal.authorText}>@{video.author_handle || 'unknown'}</Text>
              {video.title ? <Text style={modal.titleText} numberOfLines={3}>{video.title}</Text> : null}
            </View>
          </View>

          {/* Stats grid */}
          <Text style={modal.sectionLabel}>VIDEO STATS</Text>
          <View style={modal.statsGrid}>
            <View style={modal.statCell}>
              <Ionicons name="eye-outline" size={18} color={isViral ? COLORS.yes : COLORS.muted} />
              <Text style={[modal.statValue, { color: isViral ? COLORS.yes : COLORS.text }]}>
                {views >= 1_000_000
                  ? `${(views / 1_000_000).toFixed(2)}M`
                  : views >= 1_000
                  ? `${(views / 1_000).toFixed(1)}K`
                  : views}
              </Text>
              <Text style={modal.statLabel}>Final Views</Text>
            </View>

            <View style={modal.statCell}>
              <Ionicons name="heart-outline" size={18} color={COLORS.accent} />
              <Text style={modal.statValue}>
                {likes >= 1_000
                  ? `${(likes / 1_000).toFixed(1)}K`
                  : likes}
              </Text>
              <Text style={modal.statLabel}>Likes at Submit</Text>
            </View>

            <View style={modal.statCell}>
              <Ionicons name="people-outline" size={18} color={COLORS.spark} />
              <Text style={modal.statValue}>{video.total_bets || 0}</Text>
              <Text style={modal.statLabel}>Total Bets</Text>
            </View>

            <View style={modal.statCell}>
              <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.yes} />
              <Text style={modal.statValue}>{video.yes_bets || 0}</Text>
              <Text style={modal.statLabel}>Viral Bets</Text>
            </View>
          </View>

          {/* Timestamps */}
          <Text style={modal.sectionLabel}>TIMELINE</Text>
          <View style={modal.timelineCard}>
            {[
              { icon: 'cloud-upload-outline', label: 'Posted to TikTok', value: video.uploaded_at },
              { icon: 'add-circle-outline',   label: 'Added to BetTok',  value: video.added_at },
              { icon: 'flag-outline',          label: 'Resolved',         value: video.resolved_at },
            ].map(({ icon, label, value }) => (
              <View key={label} style={modal.timelineRow}>
                <Ionicons name={icon} size={15} color={COLORS.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={modal.timelineLabel}>{label}</Text>
                  <Text style={modal.timelineValue}>
                    {value ? new Date(value).toLocaleString() : '—'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* My bet result */}
          {myBet && (
            <>
              <Text style={modal.sectionLabel}>YOUR BET</Text>
              <View style={[modal.myBetCard, { borderColor: betWon ? COLORS.yes : COLORS.accent }]}>
                <View style={modal.myBetRow}>
                  <Text style={modal.myBetKey}>Prediction</Text>
                  <Text style={modal.myBetVal}>{myBet.side === 'yes' ? '🚀 VIRAL' : '📉 FLOP'}</Text>
                </View>
                <View style={modal.myBetRow}>
                  <Text style={modal.myBetKey}>Wagered</Text>
                  <Text style={modal.myBetVal}>{myBet.sparks_wagered} Sparks</Text>
                </View>
                <View style={modal.myBetRow}>
                  <Text style={modal.myBetKey}>Multiplier</Text>
                  <Text style={modal.myBetVal}>{myBet.multiplier}×</Text>
                </View>
                <View style={modal.myBetRow}>
                  <Text style={modal.myBetKey}>Result</Text>
                  <Text style={[modal.myBetVal, { color: betWon ? COLORS.yes : COLORS.accent, fontFamily: FONTS.display, fontSize: 18 }]}>
                    {betWon ? `+${myBet.sparks_earned} ⚡` : `-${myBet.sparks_wagered} ⚡`}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Open in TikTok */}
          <TouchableOpacity style={modal.tiktokBtn} onPress={openTikTok}>
            <Ionicons name="logo-tiktok" size={18} color={COLORS.bg} />
            <Text style={modal.tiktokBtnText}>Open in TikTok</Text>
            <Ionicons name="open-outline" size={15} color={COLORS.bg} />
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─────────────────────────────────────────
// Resolved card (tappable)
// ─────────────────────────────────────────
function ResolvedCard({ video, myBet, onPress }) {
  const isViral     = video.status === 'resolved_yes';
  const resolvedAgo = getTimeAgo(video.resolved_at ? new Date(video.resolved_at) : new Date());
  const views       = video.current_views || 0;
  const betWon      = myBet?.status === 'won';
  const betLost     = myBet?.status === 'lost';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.resultStrip, { backgroundColor: isViral ? COLORS.yes : COLORS.accent }]}>
        <Ionicons name={isViral ? 'trending-up' : 'trending-down'} size={14} color={COLORS.bg} />
        <Text style={styles.resultStripText}>{isViral ? 'WENT VIRAL' : 'FLOPPED'}</Text>
        {myBet && (
          <View style={[styles.betResult, { backgroundColor: betWon ? '#ffffff33' : '#00000033' }]}>
            <Text style={styles.betResultText}>
              {betWon ? `+${myBet.sparks_earned ?? myBet.potential_payout} ⚡` : `-${myBet.sparks_wagered} ⚡`}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={COLORS.bg + 'AA'} />
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

          {myBet && (
            <Text style={styles.myBetLabel}>
              Your bet: {myBet.side === 'yes' ? '🚀 VIRAL' : '📉 FLOP'} · {myBet.sparks_wagered} Sparks
            </Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              <Ionicons name="people-outline" size={11} color={COLORS.muted} /> {video.total_bets || 0} bets
            </Text>
            <Text style={styles.meta}>{resolvedAgo}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────
// Results screen
// ─────────────────────────────────────────
export default function ResultsScreen() {
  const { user } = useAuth();
  const [tab,          setTab]          = useState('all');
  const [allVideos,    setAllVideos]    = useState([]);
  const [myBets,       setMyBets]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [modalVisible,  setModalVisible]  = useState(false);

  const load = useCallback(async () => {
    try {
      const [resultsData, betsData] = await Promise.all([
        getApi('/results'),
        user ? getApi('/myBets') : Promise.resolve({ bets: [] }),
      ]);
      setAllVideos(resultsData.videos || []);
      setMyBets(betsData.bets || []);
    } catch (err) {
      console.error('Results error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, []);

  const resolvedBets    = myBets.filter(b => b.status === 'won' || b.status === 'lost');
  const myBetVideoIds   = new Set(resolvedBets.map(b => b.video_id));
  const myResultVideos  = allVideos.filter(v => myBetVideoIds.has(v.id));
  const getBetForVideo  = (videoId) => resolvedBets.find(b => b.video_id === videoId);
  const displayVideos   = tab === 'mine' ? myResultVideos : allVideos;

  const openDetail = (video) => {
    setSelectedVideo(video);
    setModalVisible(true);
  };

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

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'all' && styles.tabActive]} onPress={() => setTab('all')}>
          <Text style={[styles.tabLabel, tab === 'all' && styles.tabLabelActive]}>ALL RESULTS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'mine' && styles.tabActive]} onPress={() => setTab('mine')}>
          <Text style={[styles.tabLabel, tab === 'mine' && styles.tabLabelActive]}>
            MY BETS {resolvedBets.length > 0 ? `(${resolvedBets.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayVideos}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ResolvedCard
            video={item}
            myBet={tab === 'mine' ? getBetForVideo(item.id) : null}
            onPress={() => openDetail(item)}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{tab === 'mine' ? '🎯' : '🏁'}</Text>
            <Text style={styles.emptyTitle}>{tab === 'mine' ? 'No resolved bets yet' : 'No results yet'}</Text>
            <Text style={styles.emptyText}>
              {tab === 'mine'
                ? 'Your bets will appear here once the prediction windows close'
                : 'Check back after the first 7-day window closes'}
            </Text>
          </View>
        }
      />

      <VideoDetailModal
        video={selectedVideo}
        myBet={selectedVideo ? getBetForVideo(selectedVideo.id) : null}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
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
  container:        { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  header:           { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:      { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 4, lineHeight: 30 },
  headerSub:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  tabs:             { flexDirection: 'row', margin: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  tab:              { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive:        { backgroundColor: COLORS.accent },
  tabLabel:         { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, letterSpacing: 1 },
  tabLabelActive:   { color: COLORS.bg, fontWeight: '700' },
  list:             { paddingHorizontal: SPACING.md, paddingBottom: 80, gap: SPACING.sm },
  card:             { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  resultStrip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  resultStripText:  { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700', letterSpacing: 1, flex: 1 },
  betResult:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  betResultText:    { color: COLORS.bg, fontFamily: FONTS.display, fontSize: 13 },
  cardInner:        { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  thumb:            { width: 72, height: 96, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceHigh },
  cardContent:      { flex: 1, gap: 4, justifyContent: 'center' },
  author:           { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11 },
  title:            { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, lineHeight: 17 },
  viewsRow:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewsText:        { fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },
  myBetLabel:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  metaRow:          { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  meta:             { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  empty:            { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon:        { fontSize: 40 },
  emptyTitle:       { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  emptyText:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },
});

const modal = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.bg },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:      { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 18, letterSpacing: 3 },
  closeBtn:         { padding: 4 },
  scroll:           { padding: SPACING.md, gap: SPACING.md, paddingBottom: 40 },
  heroRow:          { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  thumb:            { width: 100, height: 133, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceHigh },
  heroInfo:         { flex: 1, gap: 8 },
  resultBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1, alignSelf: 'flex-start' },
  resultBadgeText:  { fontFamily: FONTS.body, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  authorText:       { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  titleText:        { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, lineHeight: 18 },
  sectionLabel:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2, marginTop: SPACING.sm },
  statsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  statCell:         { flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  statValue:        { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  statLabel:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, textAlign: 'center' },
  timelineCard:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, gap: 12, borderWidth: 1, borderColor: COLORS.border },
  timelineRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  timelineLabel:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  timelineValue:    { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 },
  myBetCard:        { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, gap: 10, borderWidth: 1 },
  myBetRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myBetKey:         { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  myBetVal:         { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  tiktokBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#000000', paddingVertical: 14, borderRadius: RADIUS.md, marginTop: SPACING.sm },
  tiktokBtnText:    { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', letterSpacing: 1, color: '#ffffff' },
});