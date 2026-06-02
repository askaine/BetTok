// screens/AdminScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, FlatList, TextInput, Alert,
  Modal, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { getApi, callApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const TABS = ['Overview', 'Users', 'Videos', 'Bets', 'Insights', 'Export'];

function StatCard({ label, value, icon, color }) {
  return (
    <View style={[styles.statCard, { borderColor: (color || COLORS.accent) + '44' }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color: color || COLORS.text }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

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
        <StatCard label="Total Users"   value={stats.totalUsers?.toLocaleString()    || '0'} icon="👥" color={COLORS.blue} />
        <StatCard label="Total Bets"    value={stats.totalBets?.toLocaleString()     || '0'} icon="⚡" color={COLORS.spark} />
        <StatCard label="Active Videos" value={stats.activeVideos?.toLocaleString()  || '0'} icon="🎬" color={COLORS.yes} />
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
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(0);
  const [selected,    setSelected]    = useState(null);
  const [adjustAmt,   setAdjustAmt]   = useState('');
  const [actionModal, setActionModal] = useState(false);

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

  const handleSearch = (v) => { setSearch(v); load(0, v); };

  const handleBan = async () => {
    if (!selected) return;
    Alert.alert(
      selected.is_banned ? `Unban @${selected.username}?` : `Ban @${selected.username}?`,
      selected.is_banned ? 'This will restore their full system access.' : 'This will completely disable their account and hide submissions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: selected.is_banned ? 'Confirm Unban' : 'Confirm Ban', style: 'destructive', onPress: async () => {
            try {
              await callApi('/admin/banUser', { userId: selected.id });
              Alert.alert('Success', `@${selected.username} account status has been toggled.`);
              setActionModal(false);
              load(0, search);
            } catch (e) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
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
                style={[styles.userRow, u.is_banned && { opacity: 0.5, borderColor: COLORS.accent + '44' }]}
                onPress={() => { setSelected(u); setActionModal(true); }}
              >
                <View style={[styles.userAvatar, u.is_banned && { backgroundColor: COLORS.muted }]}>
                  <Text style={styles.userAvatarText}>{(u.username || 'U')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>
                    {u.username} {u.is_admin ? '👑' : ''}{u.is_banned ? ' 🚫' : ''}
                  </Text>
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

      {/* User Action Modal */}
      <Modal visible={actionModal} transparent animationType="slide" onRequestClose={() => setActionModal(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>@{selected?.username}</Text>
            <Text style={modalStyles.sub}>⚡ {(selected?.sparks || 0).toLocaleString()} Sparks · {selected?.total_bets || 0} bets</Text>

            <View style={{ width: '100%', gap: 8 }}>
              <Text style={[modalStyles.sub, { marginTop: 8 }]}>Adjust Sparks</Text>
              <TextInput
                style={modalStyles.input}
                placeholder="+500 or -100"
                placeholderTextColor={COLORS.muted}
                value={adjustAmt}
                onChangeText={setAdjustAmt}
                keyboardType="numeric"
              />
              <View style={modalStyles.btnRow}>
                <Pressable style={[modalStyles.btn, { backgroundColor: COLORS.surfaceHigh }]} onPress={() => { setActionModal(false); setAdjustAmt(''); }}>
                  <Text style={[modalStyles.btnLabel, { color: COLORS.muted }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[modalStyles.btn, { backgroundColor: COLORS.accent }]} onPress={async () => {
                  if (!adjustAmt) return;
                  const amount = parseInt(adjustAmt);
                  if (isNaN(amount)) { Alert.alert('Invalid amount'); return; }
                  try {
                    const r = await callApi('/admin/adjustSparks', { userId: selected.id, amount });
                    Alert.alert('Done', `${selected.username} now has ${r.newBalance?.toLocaleString()} Sparks`);
                    setActionModal(false);
                    setAdjustAmt('');
                    load(0, search);
                  } catch (e) { Alert.alert('Error', e.message); }
                }}>
                  <Text style={modalStyles.btnLabel}>Apply</Text>
                </Pressable>
              </View>

              {/* Explicitly Labeled Ban/Unban Operations */}
              {!selected?.is_admin && (
                <Pressable
                  style={[
                    modalStyles.btn, 
                    { 
                      flex: 0,
                      alignSelf: 'stretch',
                      backgroundColor: selected?.is_banned ? COLORS.yes + '15' : '#3A0010', 
                      borderWidth: 1, 
                      borderColor: selected?.is_banned ? COLORS.yes + '66' : COLORS.accent + '66',
                      marginTop: 12,
                      paddingVertical: 16
                    }
                  ]}
                  onPress={handleBan}
                >
                  <Text style={[modalStyles.btnLabel, { color: selected?.is_banned ? COLORS.yes : COLORS.accent, fontWeight: '700', fontSize: 12 }]}>
                    {selected?.is_banned 
                      ? '🔓 UNBAN USER: RESTORE POOL ACCESS & SHOW SUBMISSIONS' 
                      : '🚫 BAN USER: TERMINATE SYSTEM ACCESS & HIDE SUBMISSIONS'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Videos Tab ─────────────────────────────────────────────
function VideosTab() {
  const [videos,        setVideos]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [status,        setStatus]        = useState('active');
  const [resolveModal,  setResolveModal]  = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

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
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try { await callApi('/admin/removeVideo', { videoId }); load(status); }
          catch (e) { Alert.alert('Error', e.message); }
        },
      },
    ]);
  };

  const handleResolve = async (resolution) => {
    if (!selectedVideo) return;
    try {
      if (resolution === 'auto') {
        // Invoke the resolve pipeline for this specific video via dedicated admin route
        await callApi('/admin/resolveVideoAuto', { videoId: selectedVideo.id });
        Alert.alert('Auto-Resolved', 'Video processed through automated index check successfully.');
      } else {
        await callApi('/admin/resolveVideo', { videoId: selectedVideo.id, resolution });
        Alert.alert('Manually Resolved', `Video marked as ${resolution === 'yes' ? '🚀 Viral' : '📉 Flopped'}`);
      }
      setResolveModal(false);
      setSelectedVideo(null);
      load(status);
    } catch (e) { Alert.alert('Error', e.message); }
  };

  const fmtViews = (n) => {
    if (!n) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  return (
    <View style={{ flex: 1 }}>
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
                    Yes: {v.yes_bets || 0} · No: {v.no_bets || 0} · {v.why_reasons?.join(', ') || 'no tags'}
                  </Text>
                </View>
                {status === 'active' && (
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <Pressable
                      onPress={() => { setSelectedVideo(v); setResolveModal(true); }}
                      hitSlop={8}
                    >
                      <Ionicons name="checkmark-done-outline" size={20} color={COLORS.yes} />
                    </Pressable>
                    <Pressable onPress={() => handleRemove(v.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={COLORS.accent} />
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          />
        )
      }

      {/* Choice Between Manual or Automated Resolution */}
      <Modal visible={resolveModal} transparent animationType="slide" onRequestClose={() => setResolveModal(false)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>Resolve Video</Text>
            <Text style={modalStyles.sub} numberOfLines={1}>{selectedVideo?.title || 'Untitled'}</Text>
            <Text style={[modalStyles.sub, { textAlign: 'center', lineHeight: 18, marginBottom: 8 }]}>
              Trigger the core automated calculation routine via API index or explicitly override metrics manually below.
            </Text>

            {/* Strategy 1: Auto Resolution Choice */}
            <Pressable
              onPress={() => handleResolve('auto')}
              style={{
                width: '100%',
                paddingVertical: 18,
                paddingHorizontal: 16,
                borderRadius: RADIUS.md,
                backgroundColor: '#1a0a2e',
                borderWidth: 1.5,
                borderColor: '#8b5cf6',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#c4b5fd', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                🤖 Run Auto-Resolution Engine (Live Views)
              </Text>
            </Pressable>
            <View style={{ height: 1, backgroundColor: COLORS.border, width: '100%', marginVertical: 8 }} />

            {/* Strategy 2: Manual Overrides Choice */}
            <Text style={[modalStyles.sub, { fontSize: 10, letterSpacing: 1, fontWeight: '700', alignSelf: 'flex-start' }]}>MANUAL OVERRIDE OPTIONS</Text>
            <View style={[modalStyles.btnRow, { width: '100%' }]}>
              <Pressable
                style={[modalStyles.btn, { backgroundColor: COLORS.yes + '22', borderWidth: 1, borderColor: COLORS.yes + '66' }]}
                onPress={() => handleResolve('yes')}
              >
                <Text style={[modalStyles.btnLabel, { color: COLORS.yes }]}>🚀 Went Viral</Text>
              </Pressable>
              <Pressable
                style={[modalStyles.btn, { backgroundColor: COLORS.accent + '22', borderWidth: 1, borderColor: COLORS.accent + '66' }]}
                onPress={() => handleResolve('no')}
              >
                <Text style={[modalStyles.btnLabel, { color: COLORS.accent }]}>📉 Flopped</Text>
              </Pressable>
            </View>

            <Pressable style={{ paddingVertical: 10 }} onPress={() => setResolveModal(false)}>
              <Text style={{ color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
                  <Text style={styles.betMeta}>Odds: {b.odds_at_bet?.toFixed(2)}× · Payout: {b.potential_payout} · Status: {b.status}</Text>
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
  const [view,      setView]      = useState('tags');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getApi('/admin/insights', {});
      setInsights(r.insights || []);
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  const tagStats = React.useMemo(() => {
    const m = {};
    for (const row of insights) {
      for (const reason of (row.why_reasons || [])) {
        if (!m[reason]) m[reason] = { total: 0, yes: 0, no: 0, sparks: 0, won: 0 };
        m[reason].total++;
        m[reason][row.side === 'yes' ? 'yes' : 'no']++;
        m[reason].sparks += row.wagered || 0;
        if (row.outcome === 'won') m[reason].won++;
      }
    }
    return Object.entries(m)
      .map(([tag, d]) => ({
        tag,
        total: d.total,
        viralBias: Math.round((d.yes / d.total) * 100),
        accuracy: d.total > 0 ? Math.round((d.won / d.total) * 100) : null,
        sparks: d.sparks,
        yesCount: d.yes,
        noCount: d.no,
      }))
      .filter(t => t.total >= 3)
      .sort((a, b) => b.total - a.total);
  }, [insights]);

  const categoryStats = React.useMemo(() => {
    const m = {};
    for (const row of insights) {
      for (const cat of (row.categories || [])) {
        if (!m[cat]) m[cat] = { total: 0, viralBets: 0, flopBets: 0, totalSparks: 0, highConviction: 0 };
        m[cat].total++;
        if (row.side === 'yes') m[cat].viralBets++;
        else m[cat].flopBets++;
        m[cat].totalSparks += row.wagered || 0;
        if ((row.wagered || 0) >= 200) m[cat].highConviction++;
      }
    }
    return Object.entries(m)
      .map(([cat, d]) => ({
        cat,
        total: d.total,
        viralBias: Math.round((d.viralBets / d.total) * 100),
        avgWager: d.total > 0 ? Math.round(d.totalSparks / d.total) : 0,
        highConvictionPct: d.total > 0 ? Math.round((d.highConviction / d.total) * 100) : 0,
      }))
      .filter(c => c.total >= 5)
      .sort((a, b) => b.total - a.total);
  }, [insights]);

  const convictionStats = React.useMemo(() => {
    const buckets = [
      { label: 'Small (≤50)',   min: 0,   max: 50  },
      { label: 'Mid (51–150)',  min: 51,  max: 150 },
      { label: 'Large (151–)',  min: 151, max: Infinity },
    ];
    return buckets.map(b => {
      const rows = insights.filter(r => {
        const w = r.wagered || 0;
        return w > b.min && w <= b.max;
      });
      const viralBets = rows.filter(r => r.side === 'yes').length;
      const won = rows.filter(r => r.outcome === 'won').length;
      return {
        label: b.label,
        count: rows.length,
        viralBias: rows.length > 0 ? Math.round((viralBets / rows.length) * 100) : 0,
        accuracy: rows.length > 0 ? Math.round((won / rows.length) * 100) : null,
        totalSparks: rows.reduce((s, r) => s + (r.wagered || 0), 0),
      };
    });
  }, [insights]);

  if (loading) return <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, padding: SPACING.sm }}>
        {[['tags', '🏷 Tag Intelligence'], ['categories', '🎬 Category Virality'], ['conviction', '💰 Conviction Signal']].map(([id, label]) => (
          <Pressable key={id} style={[styles.filterChip, view === id && styles.filterChipActive]} onPress={() => setView(id)}>
            <Text style={[styles.filterChipLabel, view === id && { color: '#fff' }]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: SPACING.sm, gap: 8, paddingBottom: 100 }}>
        <Text style={styles.insightTotal}>{insights.length} total predictions</Text>

        {view === 'tags' && (
          <>
            <SectionHeader title="Tag Intelligence" subtitle="Which tags predict virality? High viral-bias + high usage = reliable signal" />
            {tagStats.map((item, i) => (
              <View key={item.tag} style={styles.insightRow}>
                <View style={styles.insightLeft}>
                  <Text style={styles.insightRank}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insightReason}>{item.tag.replace(/_/g, ' ')}</Text>
                    <Text style={styles.insightMeta}>
                      {item.total} uses · ⚡{item.sparks?.toLocaleString()} wagered · {item.yesCount}Y / {item.noCount}N
                    </Text>
                  </View>
                </View>
                <View style={styles.insightRight}>
                  <Text style={[styles.insightViralPct, { color: item.viralBias > 60 ? COLORS.yes : item.viralBias < 40 ? COLORS.accent : COLORS.muted }]}>
                    {item.viralBias}% viral
                  </Text>
                  {item.accuracy !== null && (
                    <Text style={[styles.insightSplit, { color: item.accuracy > 55 ? COLORS.yes : COLORS.muted }]}>
                      {item.accuracy}% correct
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {view === 'categories' && (
          <>
            <SectionHeader title="Category Virality" subtitle="Which content categories do users believe in most?" />
            {categoryStats.map((item, i) => (
              <View key={item.cat} style={styles.insightRow}>
                <View style={styles.insightLeft}>
                  <Text style={styles.insightRank}>#{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.insightReason}>{item.cat}</Text>
                    <Text style={styles.insightMeta}>
                      {item.total} bets · avg ⚡{item.avgWager} · {item.highConvictionPct}% high-conviction
                    </Text>
                  </View>
                </View>
                <View style={styles.insightRight}>
                  <Text style={[styles.insightViralPct, { color: item.viralBias > 60 ? COLORS.yes : item.viralBias < 40 ? COLORS.accent : COLORS.muted }]}>
                    {item.viralBias}% viral bias
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {view === 'conviction' && (
          <>
            <SectionHeader title="Conviction Signal" subtitle="Do users who bet more know more?" />
            {convictionStats.map((item) => (
              <View key={item.label} style={[styles.insightRow, { flexDirection: 'column', gap: 8 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.insightReason}>{item.label}</Text>
                  <Text style={[styles.insightViralPct, { color: COLORS.spark }]}>{item.count} bets</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                  <View style={styles.convictionStat}>
                    <Text style={styles.convictionVal}>{item.viralBias}%</Text>
                    <Text style={styles.convictionLabel}>picked viral</Text>
                  </View>
                  <View style={styles.convictionStat}>
                    <Text style={[styles.convictionVal, { color: item.accuracy > 55 ? COLORS.yes : COLORS.accent }]}>
                      {item.accuracy !== null ? `${item.accuracy}%` : '—'}
                    </Text>
                    <Text style={styles.convictionLabel}>accurate</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
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
    const rows = result.rows || [];
    if (rows.length === 0) { Alert.alert('No data'); return; }
    const headers = Object.keys(rows[0]).join(',');
    const csv = [headers, ...rows.map(r => Object.values(r).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    try {
      await Share.share({ message: csv, title: `BetTok ${result.type} export` });
    } catch (e) { Alert.alert('Failed', e.message); }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: SPACING.md, gap: SPACING.md, paddingBottom: 100 }}>
      <SectionHeader title="Data Export" subtitle="Download platform data as CSV" />
      {[
        { type: 'insights',   label: '🧠 Prediction Insights',  desc: 'All why-reason tags, wagered amounts, and outcomes.' },
        { type: 'users',      label: '👥 User Data',             desc: 'Usernames, scores, bet counts, streaks.' },
        { type: 'videos',     label: '🎬 Video Data',             desc: 'All videos with bet counts and resolutions.' },
      ].map(({ type, label, desc }) => (
        <View key={type} style={styles.exportCard}>
          <Text style={styles.exportLabel}>{label}</Text>
          <Text style={styles.exportDesc}>{desc}</Text>
          <Pressable style={styles.exportBtn} onPress={() => handleExport(type)} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" size="small" /> : (
              <LinearGradient colors={['#FF3B5C', '#CC1F3F']} style={styles.exportBtnGrad} start={[0, 0]} end={[1, 0]}>
                <Ionicons name="download-outline" size={14} color="#fff" />
                <Text style={styles.exportBtnLabel}>Load Data</Text>
              </LinearGradient>
            )}
          </Pressable>
          {result?.type === type && (
            <View style={styles.exportResult}>
              <Text style={styles.exportResultText}>✅ {result.count} rows loaded</Text>
              <Pressable style={styles.shareBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={14} color={COLORS.accent} />
                <Text style={styles.shareBtnLabel}>Share CSV</Text>
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
      <LinearGradient colors={['#1A0010', '#080810']} style={styles.header} start={[0, 0]} end={[1, 1]}>
        <View>
          <Text style={styles.headerTitle}>👑 ADMIN PANEL</Text>
          <Text style={styles.headerSub}>yonazikri@gmail.com</Text>
        </View>
        <Pressable onPress={loadStats} hitSlop={12}>
          <Ionicons name="refresh-outline" size={20} color={COLORS.muted} />
        </Pressable>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ gap: 4, padding: 8 }}>
        {TABS.map(tab => (
          <Pressable key={tab} style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabBtnLabel, activeTab === tab && styles.tabBtnLabelActive]}>{tab}</Text>
          </Pressable>
        ))}
      </ScrollView>

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

  convictionStat:  { flex: 1, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.sm, padding: 10, alignItems: 'center', gap: 2 },
  convictionVal:   { color: COLORS.text, fontFamily: FONTS.display, fontSize: 18 },
  convictionLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, textAlign: 'center' },

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
  btn:      { flex: 1, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, textAlign: 'center' },
});