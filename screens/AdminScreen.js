// screens/AdminScreen.js
// Only accessible to yonazikri@gmail.com — checked server-side too
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, FlatList, TextInput, Alert,
  Modal, Share, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { getApi, callApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const TABS = ['Overview', 'Users', 'Videos', 'Bets', 'Insights', 'Export'];

// ── Stat Card ──────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <View style={[styles.statCard, { borderColor: (color || COLORS.accent) + '44' }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color: color || COLORS.text }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Section Header ─────────────────────────────────────────
function SectionHeader({ title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
    </View>
  );
}

// ── Overview Tab ───────────────────────────────────────────
function OverviewTab({ stats }) {
  if (!stats) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  const accuracy = stats.overallAccuracy || 0;
  const topTags  = stats.topTags || [];

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.tabContent}>
      <SectionHeader title="Platform Stats" subtitle="Live numbers" />

      <View style={styles.statsGrid}>
        <StatCard label="Total Users"   value={stats.totalUsers?.toLocaleString()   || '0'} icon="👥" color={COLORS.blue} />
        <StatCard label="Total Bets"    value={stats.totalBets?.toLocaleString()    || '0'} icon="⚡" color={COLORS.spark} />
        <StatCard label="Active Videos" value={stats.activeVideos?.toLocaleString() || '0'} icon="🎬" color={COLORS.yes} />
        <StatCard label="Resolved"      value={stats.resolvedVideos?.toLocaleString()|| '0'} icon="🏁" color={COLORS.purple} />
        <StatCard label="Sparks Bet"    value={(stats.totalSparksWagered || 0).toLocaleString()} icon="💫" color={COLORS.spark} />
        <StatCard label="Avg Accuracy"  value={`${accuracy}%`} icon="🎯" color={accuracy > 50 ? COLORS.yes : COLORS.accent} />
      </View>

      <SectionHeader title="Top Prediction Tags" subtitle="Most used why-reasons" />
      <View style={styles.tagCloud}>
        {topTags.slice(0, 20).map((tag, i) => (
          <View key={i} style={[styles.tagPill, { opacity: 1 - (i * 0.03) }]}>
            <Text style={styles.tagPillText}>{tag.name}</Text>
            <Text style={styles.tagPillCount}>{tag.use_count}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Users Tab ──────────────────────────────────────────────
function UsersTab() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(0);
  const [selected, setSelected] = useState(null);
  const [adjustAmt, setAdjustAmt] = useState('');
  const [adjustModal, setAdjustModal] = useState(false);

  const load = useCallback(async (p = 0, q = '') => {
    setLoading(true);
    try {
      const r = await getApi('/admin/users', { page: String(p), q });
      setUsers(p === 0 ? (r.users || []) : prev => [...prev, ...(r.users || [])]);
      setPage(p);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(0, ''); }, []));

  const handleSearch = (v) => {
    setSearch(v);
    load(0, v);
  };

  const handleAdjust = async () => {
    if (!selected || !adjustAmt) return;
    const amount = parseInt(adjustAmt);
    if (isNaN(amount)) { Alert.alert('Invalid amount'); return; }
    try {
      const r = await callApi('/admin/adjustSparks', { userId: selected.id, amount });
      Alert.alert('Done', `${selected.username} now has ${r.newBalance?.toLocaleString()} Sparks`);
      setAdjustModal(false);
      setAdjustAmt('');
      load(0, search);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const correctPct = (u) => u.total_bets > 0
    ? Math.round(((u.correct_bets || 0) / u.total_bets) * 100) : 0;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.searchBox}
        placeholder="Search username…"
        placeholderTextColor={COLORS.muted}
        value={search}
        onChangeText={handleSearch}
      />
      {loading && page === 0
        ? <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={users}
            keyExtractor={u => u.id}
            contentContainerStyle={{ padding: SPACING.sm, gap: 6, paddingBottom: 100 }}
            renderItem={({ item: u }) => (
              <Pressable
                style={styles.userRow}
                onPress={() => { setSelected(u); setAdjustModal(true); }}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>{(u.username || 'U')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{u.username} {u.is_admin ? '👑' : ''}</Text>
                  <Text style={styles.userMeta}>
                    {u.total_bets} bets · {correctPct(u)}% accurate · 🔥{u.current_streak}d
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.userSparks}>⚡ {(u.sparks || 0).toLocaleString()}</Text>
                  <Text style={styles.userScore}>#{(u.all_time_score || 0).toLocaleString()} pts</Text>
                </View>
              </Pressable>
            )}
            onEndReached={() => load(page + 1, search)}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loading ? <ActivityIndicator color={COLORS.accent} style={{ margin: 16 }} /> : null}
          />
        )
      }

      {/* Adjust Sparks Modal */}
      <Modal visible={adjustModal} transparent animationType="slide" onRequestClose={() => setAdjustModal(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Adjust Sparks</Text>
            <Text style={modalStyles.sub}>User: @{selected?.username}</Text>
            <Text style={modalStyles.sub}>Current: ⚡ {(selected?.sparks || 0).toLocaleString()}</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="+500 or -100"
              placeholderTextColor={COLORS.muted}
              value={adjustAmt}
              onChangeText={setAdjustAmt}
              keyboardType="numeric"
            />
            <View style={modalStyles.btnRow}>
              <Pressable style={[modalStyles.btn, { backgroundColor: COLORS.surfaceHigh }]} onPress={() => setAdjustModal(false)}>
                <Text style={[modalStyles.btnLabel, { color: COLORS.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[modalStyles.btn, { backgroundColor: COLORS.accent }]} onPress={handleAdjust}>
                <Text style={modalStyles.btnLabel}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Videos Tab ─────────────────────────────────────────────
function VideosTab() {
  const [videos,  setVideos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('active');

  const load = useCallback(async (s = 'active') => {
    setLoading(true);
    try {
      const r = await getApi('/admin/videos', { status: s });
      setVideos(r.videos || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(status); }, [status]));

  const handleRemove = async (videoId) => {
    Alert.alert('Remove Video', 'Mark this video as flagged and hide it?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await callApi('/admin/removeVideo', { videoId });
          load(status);
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const fmtViews = (n) => {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, padding: SPACING.sm }}>
        {['active', 'resolved_yes', 'resolved_no', 'flagged'].map(s => (
          <Pressable key={s} style={[styles.filterChip, status === s && styles.filterChipActive]} onPress={() => { setStatus(s); load(s); }}>
            <Text style={[styles.filterChipLabel, status === s && { color: '#fff' }]}>
              {s === 'active' ? '🟢 Active' : s === 'resolved_yes' ? '🚀 Viral' : s === 'resolved_no' ? '📉 Flopped' : '🚫 Flagged'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading
        ? <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={videos}
            keyExtractor={v => v.id}
            contentContainerStyle={{ padding: SPACING.sm, gap: 6, paddingBottom: 100 }}
            renderItem={({ item: v }) => (
              <View style={styles.videoRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.videoTitle} numberOfLines={1}>{v.title || 'Untitled'}</Text>
                  <Text style={styles.videoMeta}>
                    ❤️ {(v.likes_at_ingestion || 0).toLocaleString()} · 👁 {fmtViews(v.current_views)} · 🎯 {v.total_bets} bets
                  </Text>
                  <Text style={styles.videoMeta}>
                    Yes: {v.yes_bets || 0} · No: {v.no_bets || 0} · {v.categories?.join(', ') || 'no tags'}
                  </Text>
                </View>
                {status === 'active' && (
                  <Pressable onPress={() => handleRemove(v.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.accent} />
                  </Pressable>
                )}
              </View>
            )}
          />
        )
      }
    </View>
  );
}

// ── Bets Tab ───────────────────────────────────────────────
function BetsTab() {
  const [bets,    setBets]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState('');

  const load = useCallback(async (s = '') => {
    setLoading(true);
    try {
      const r = await getApi('/admin/bets', { status: s });
      setBets(r.bets || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(''); }, []));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, padding: SPACING.sm }}>
        {[['', 'All'], ['pending', '🟡 Pending'], ['won', '✅ Won'], ['lost', '❌ Lost']].map(([s, label]) => (
          <Pressable key={s} style={[styles.filterChip, status === s && styles.filterChipActive]} onPress={() => { setStatus(s); load(s); }}>
            <Text style={[styles.filterChipLabel, status === s && { color: '#fff' }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading
        ? <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        : (
          <FlatList
            data={bets}
            keyExtractor={b => b.id}
            contentContainerStyle={{ padding: SPACING.sm, gap: 4, paddingBottom: 100 }}
            renderItem={({ item: b }) => (
              <View style={styles.betRow}>
                <View style={[styles.betSide, { backgroundColor: b.side === 'yes' ? COLORS.yes : COLORS.accent }]} />
                <View style={{ flex: 1, padding: SPACING.sm }}>
                  <Text style={styles.betSideLabel}>{b.side === 'yes' ? '🚀 VIRAL' : '📉 FLOP'} · {b.sparks_wagered} ⚡</Text>
                  <Text style={styles.betMeta}>
                    Odds: {b.odds_at_bet?.toFixed(2)}× · Payout: {b.potential_payout} · Status: {b.status}
                  </Text>
                  {b.why_reasons?.length > 0 && (
                    <Text style={styles.betTags}>Tags: {b.why_reasons.join(', ')}</Text>
                  )}
                </View>
                <View style={{ padding: SPACING.sm, alignItems: 'flex-end' }}>
                  {b.status === 'won'  && <Text style={{ color: COLORS.yes,    fontFamily: FONTS.display, fontSize: 14 }}>+{b.sparks_earned} ⚡</Text>}
                  {b.status === 'lost' && <Text style={{ color: COLORS.accent, fontFamily: FONTS.display, fontSize: 14 }}>−{b.sparks_wagered} ⚡</Text>}
                </View>
              </View>
            )}
          />
        )
      }
    </View>
  );
}

// ── Insights Tab ───────────────────────────────────────────
function InsightsTab() {
  const [insights,  setInsights]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');

  // Aggregate why_reasons into counts
  const aggregated = React.useMemo(() => {
    const counts: Record<string, { total: number; yes: number; no: number; sparks: number }> = {};
    for (const row of insights) {
      for (const reason of (row.why_reasons || [])) {
        if (!counts[reason]) counts[reason] = { total: 0, yes: 0, no: 0, sparks: 0 };
        counts[reason].total++;
        counts[reason][row.side === 'yes' ? 'yes' : 'no']++;
        counts[reason].sparks += row.wagered || 0;
      }
    }
    return Object.entries(counts)
      .map(([reason, data]) => ({ reason, ...data, viralPct: Math.round((data.yes / data.total) * 100) }))
      .sort((a, b) => b.total - a.total);
  }, [insights]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from = fromDate;
      if (toDate)   params.to   = toDate;
      const r = await getApi('/admin/insights', params);
      setInsights(r.insights || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, [fromDate, toDate]);

  useFocusEffect(useCallback(() => { load(); }, []));

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.sm, gap: SPACING.sm, paddingBottom: 100 }}>
      <Text style={styles.insightTotal}>
        {insights.length} total predictions · {aggregated.length} unique tags
      </Text>

      <SectionHeader title="Tag Intelligence" subtitle="What users think makes videos go viral" />

      {loading
        ? <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
        : aggregated.map((item, i) => (
          <View key={item.reason} style={styles.insightRow}>
            <View style={styles.insightLeft}>
              <Text style={styles.insightRank}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightReason}>{item.reason.replace(/_/g, ' ')}</Text>
                <Text style={styles.insightMeta}>{item.total} predictions · ⚡{item.sparks?.toLocaleString()} wagered</Text>
              </View>
            </View>
            <View style={styles.insightRight}>
              <Text style={[styles.insightViralPct, { color: item.viralPct > 50 ? COLORS.yes : COLORS.accent }]}>
                {item.viralPct}% viral
              </Text>
              <Text style={styles.insightSplit}>{item.yes}Y / {item.no}N</Text>
            </View>
          </View>
        ))
      }
    </ScrollView>
  );
}

// ── Export Tab ─────────────────────────────────────────────
function ExportTab() {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);

  const handleExport = async (type) => {
    setLoading(true);
    setResult(null);
    try {
      const r = await getApi('/admin/export', { type });
      setResult({ type, count: r.count, rows: r.rows });
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  };

  const handleShare = async () => {
    if (!result) return;
    // Convert rows to CSV
    const rows = result.rows || [];
    if (rows.length === 0) { Alert.alert('No data to export'); return; }
    const headers = Object.keys(rows[0]).join(',');
    const csv = [headers, ...rows.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    try {
      await Share.share({ message: csv, title: `BetTok ${result.type} export` });
    } catch (e) { Alert.alert('Share failed', e.message); }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md, paddingBottom: 100 }}>
      <SectionHeader title="Data Export" subtitle="Download platform data as CSV" />

      {[
        { type: 'insights', label: '🧠 Prediction Insights', desc: 'All why-reason tags, wagered amounts, sides — the core data product' },
        { type: 'users',    label: '👥 User Data',           desc: 'Usernames, scores, bet counts, streaks — anonymized stats' },
        { type: 'videos',   label: '🎬 Video Data',          desc: 'All videos with bet counts, categories, resolution outcomes' },
      ].map(({ type, label, desc }) => (
        <View key={type} style={styles.exportCard}>
          <Text style={styles.exportLabel}>{label}</Text>
          <Text style={styles.exportDesc}>{desc}</Text>
          <Pressable style={styles.exportBtn} onPress={() => handleExport(type)} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#000" size="small" />
              : (
                <LinearGradient colors={['#FF3B5C', '#CC1F3F']} style={styles.exportBtnGrad} start={[0,0]} end={[1,0]}>
                  <Ionicons name="download-outline" size={14} color="#fff" />
                  <Text style={styles.exportBtnLabel}>Load Data</Text>
                </LinearGradient>
              )
            }
          </Pressable>
          {result?.type === type && (
            <View style={styles.exportResult}>
              <Text style={styles.exportResultText}>✅ {result.count} rows loaded</Text>
              <Pressable style={styles.shareBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={14} color={COLORS.accent} />
                <Text style={styles.shareBtnLabel}>Share as CSV</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ── Main AdminScreen ───────────────────────────────────────
export default function AdminScreen() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const r = await getApi('/admin/stats');
      setStats(r);
    } catch (e) { Alert.alert('Admin Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, []));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient colors={['#1A0010', '#080810']} style={styles.header} start={[0,0]} end={[1,1]}>
        <View>
          <Text style={styles.headerTitle}>👑 ADMIN PANEL</Text>
          <Text style={styles.headerSub}>yonazikri@gmail.com</Text>
        </View>
        <Pressable onPress={loadStats} hitSlop={12}>
          <Ionicons name="refresh-outline" size={20} color={COLORS.muted} />
        </Pressable>
      </LinearGradient>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ gap: 4, padding: 8 }}>
        {TABS.map(tab => (
          <Pressable key={tab} style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabBtnLabel, activeTab === tab && styles.tabBtnLabelActive]}>{tab}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'Overview' && <OverviewTab stats={stats} />}
        {activeTab === 'Users'    && <UsersTab />}
        {activeTab === 'Videos'   && <VideosTab />}
        {activeTab === 'Bets'     && <BetsTab />}
        {activeTab === 'Insights' && <InsightsTab />}
        {activeTab === 'Export'   && <ExportTab />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.accent + '33' },
  headerTitle:  { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 20, letterSpacing: 2 },
  headerSub:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },

  tabBar:       { borderBottomWidth: 1, borderBottomColor: COLORS.border, maxHeight: 52 },
  tabBtn:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceHigh },
  tabBtnActive: { backgroundColor: COLORS.accent },
  tabBtnLabel:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, fontWeight: '600' },
  tabBtnLabelActive: { color: '#fff' },

  tabContent:   { padding: SPACING.md, paddingBottom: 100, gap: SPACING.md },

  sectionHeader: { gap: 2, marginTop: 4 },
  sectionTitle:  { color: COLORS.text, fontFamily: FONTS.display, fontSize: 18, letterSpacing: 1 },
  sectionSub:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  statsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  statCard:     { width: '31%', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', gap: 4, borderWidth: 1 },
  statIcon:     { fontSize: 22 },
  statValue:    { fontFamily: FONTS.display, fontSize: 20 },
  statLabel:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, letterSpacing: 0.5, textAlign: 'center' },

  tagCloud:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagPill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border },
  tagPillText:  { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 11 },
  tagPillCount: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 12 },

  searchBox:    { margin: SPACING.sm, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 12, color: COLORS.text, fontFamily: FONTS.body, fontSize: 13 },

  filterRow:    { maxHeight: 52 },
  filterChip:   { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterChipLabel:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },

  userRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  userAvatar:   { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  userAvatarText: { color: '#fff', fontFamily: FONTS.display, fontSize: 18 },
  userName:     { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  userMeta:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  userSparks:   { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 14 },
  userScore:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  videoRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  videoTitle:   { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '600' },
  videoMeta:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  betRow:       { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  betSide:      { width: 4 },
  betSideLabel: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, fontWeight: '600' },
  betMeta:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  betTags:      { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 10, fontStyle: 'italic' },

  insightTotal: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  insightRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  insightLeft:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  insightRank:  { color: COLORS.muted, fontFamily: FONTS.display, fontSize: 14, width: 28 },
  insightReason:{ color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  insightMeta:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  insightRight: { alignItems: 'flex-end', gap: 2 },
  insightViralPct: { fontFamily: FONTS.display, fontSize: 16 },
  insightSplit: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  exportCard:   { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  exportLabel:  { color: COLORS.text, fontFamily: FONTS.body, fontSize: 14, fontWeight: '700' },
  exportDesc:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, lineHeight: 18 },
  exportBtn:    { borderRadius: RADIUS.md, overflow: 'hidden' },
  exportBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  exportBtnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 13 },
  exportResult: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.yesGlow, borderRadius: RADIUS.sm, padding: SPACING.sm },
  exportResultText: { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 12 },
  shareBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  shareBtnLabel: { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  title:    { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22, letterSpacing: 1 },
  sub:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  input:    { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, paddingVertical: 14, color: COLORS.text, fontFamily: FONTS.body, fontSize: 16 },
  btnRow:   { flexDirection: 'row', gap: SPACING.sm },
  btn:      { flex: 1, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  btnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14 },
});
