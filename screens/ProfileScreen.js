// screens/ProfileScreen.js
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView, ScrollView, Modal, Pressable,
  RefreshControl, Image, Platform, StatusBar as RNStatusBar 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { getApi, callApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const BADGE_META = {
  early_bird: { icon: '🐦', label: 'Early Bird',   desc: 'Bet within 1hr of a video being added' },
  contrarian: { icon: '🎭', label: 'Contrarian',    desc: 'Won a NO bet' },
  streak_5:   { icon: '🔥', label: '5 Streak',      desc: '5 correct predictions in a row' },
  streak_10:  { icon: '💥', label: '10 Streak',     desc: '10 correct predictions in a row' },
  club_1000:  { icon: '⚡', label: '1K Spark Club', desc: 'Earned 1,000 total Sparks' },
  club_5000:  { icon: '💎', label: '5K Spark Club', desc: 'Earned 5,000 total Sparks' },
};

function ResultModal({ visible, type, title, message, onClose }) {
  const iconMap  = { success: '⚡', error: '❌', warning: '⚠️' };
  const colorMap = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark };
  const color    = colorMap[type] || COLORS.mutedHigh;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={[modalStyles.iconCircle, { backgroundColor: color + '22' }]}>
            <Text style={modalStyles.iconText}>{iconMap[type] || 'ℹ️'}</Text>
          </View>
          <Text style={[modalStyles.modalTitle, { color }]}>{title}</Text>
          <Text style={modalStyles.modalMessage}>{message}</Text>
          <Pressable style={[modalStyles.modalBtn, { backgroundColor: color }]} onPress={onClose}>
            <Text style={modalStyles.modalBtnLabel}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StatBox({ label, value, color }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BadgeItem({ badgeKey }) {
  const meta = BADGE_META[badgeKey] || { icon: '🏅', label: badgeKey, desc: '' };
  return (
    <View style={styles.badgeCard}>
      <Text style={styles.badgeIcon}>{meta.icon}</Text>
      <Text style={styles.badgeName}>{meta.label}</Text>
      <Text style={styles.badgeDesc}>{meta.desc}</Text>
    </View>
  );
}

function BetHistoryItem({ bet }) {
  const isWon     = bet.status === 'won';
  const isPending = bet.status === 'pending' || !bet.status;
  const isLost    = bet.status === 'lost';
  const placedAgo = bet.placed_at ? getTimeAgo(new Date(bet.placed_at)) : '—';

  const video = bet.videos;
  const videoTitle = video?.title || 'Unknown video';

  return (
    <View style={styles.betRow}>
      <View style={[styles.betSideBar, { backgroundColor: bet.side === 'yes' ? COLORS.yes : COLORS.accent }]} />
      <View style={{ flex: 1, paddingVertical: 10 }}>
        <Text style={styles.betSide}>
          {bet.side === 'yes' ? '🚀 VIRAL' : '📉 FLOP'} · {bet.sparks_wagered} Sparks
        </Text>
        <Text style={styles.betVideoTitle} numberOfLines={1}>{videoTitle}</Text>
        <Text style={styles.betTime}>{placedAgo}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', paddingRight: SPACING.sm }}>
        {isPending && (
          <View style={styles.pendingBadge}>
            <Text style={styles.betPending}>Pending</Text>
          </View>
        )}
        {isWon  && <Text style={styles.betWon}>+{bet.sparks_earned ?? bet.potential_payout} ⚡</Text>}
        {isLost && <Text style={styles.betLost}>−{bet.sparks_wagered} ⚡</Text>}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [userData, setUserData]       = useState(null);
  const [bets, setBets]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [modal, setModal] = useState({ visible: false, type: 'info', title: '', message: '' });

  const showModal = (opts) => setModal({ visible: true, ...opts });
  const closeModal = () => setModal(m => ({ ...m, visible: false }));

  useEffect(() => {
    registerForPushNotifications();
  }, []);

  const registerForPushNotifications = async () => {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData.data;
      await callApi('/registerPushToken', { token });
    } catch (err) {
      console.log('Push token error:', err);
    }
  };

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [profileResult, betsResult] = await Promise.all([
        getApi('/profile'),
        getApi('/myBets'),
      ]);
      setUserData(profileResult?.user || profileResult);
      setBets(betsResult?.bets || []);
    } catch (err) {
      console.error('Profile error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleClaimBonus = async () => {
    setClaimingBonus(true);
    try {
      const result = await callApi('/claimDailyBonus', {});
      showModal({
        type: 'success',
        title: 'Daily bonus claimed!',
        message: `+${result.awarded} Sparks added. You now have ${result.newBalance?.toLocaleString() ?? '—'} Sparks.`,
      });
      load();
    } catch (err) {
      showModal({ type: 'warning', title: 'Not yet!', message: err.message || 'Come back later.' });
    } finally {
      setClaimingBonus(false);
    }
  };

  if (loading || !userData) {
    return <View style={styles.loadingContainer}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  const correctPct = userData.total_bets > 0
    ? Math.round(((userData.correct_bets ?? 0) / userData.total_bets) * 100)
    : 0;

  const pendingBets  = bets.filter(b => b.status === 'pending' || !b.status);
  const resolvedBets = bets.filter(b => b.status === 'won' || b.status === 'lost');

  return (
    <SafeAreaView style={styles.container}>
      {/* 2. The Header is now outside, and the style handles the padding */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>@{userData.username || 'you'}</Text>
          {userData.flair ? <Text style={styles.flair}>{userData.flair}</Text> : null}
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.bg} />
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.accent} />}
      >
        {/* Sparks card */}
        <View style={styles.sparksCard}>
          <View>
            <Text style={styles.sparksLabel}>YOUR SPARKS</Text>
            <Text style={styles.sparksValue}>⚡ {(userData.sparks ?? 0).toLocaleString()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.bonusBtn, claimingBonus && { opacity: 0.5 }]}
            onPress={handleClaimBonus}
            disabled={claimingBonus}
          >
            {claimingBonus
              ? <ActivityIndicator color={COLORS.bg} size="small" />
              : <Text style={styles.bonusBtnLabel}>+100 Daily ⚡</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox label="Total Bets"  value={userData.total_bets ?? 0} />
          <StatBox label="Correct"     value={`${correctPct}%`}                color={COLORS.yes} />
          <StatBox label="Best Streak" value={userData.longest_streak ?? 0}    color={COLORS.spark} />
          <StatBox label="Current"     value={userData.current_streak ?? 0} />
        </View>

        {/* Badges */}
        {userData.badges?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BADGES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
              {userData.badges.map(b => <BadgeItem key={b} badgeKey={b} />)}
            </ScrollView>
          </View>
        )}

        {/* Active bets */}
        {pendingBets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACTIVE BETS ({pendingBets.length})</Text>
            {pendingBets.map(bet => <BetHistoryItem key={bet.id} bet={bet} />)}
          </View>
        )}

        {/* History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>BET HISTORY</Text>
            <Text style={styles.sectionCount}>{resolvedBets.length} resolved</Text>
          </View>
          {resolvedBets.length === 0
            ? (
              <View style={styles.emptyBets}>
                <Text style={styles.emptyBetsIcon}>🎯</Text>
                <Text style={styles.emptyText}>
                  {bets.length === 0
                    ? "No bets yet — go make some predictions!"
                    : "No resolved bets yet — check back when your predictions close"
                  }
                </Text>
              </View>
            )
            : resolvedBets.map(bet => <BetHistoryItem key={bet.id} bet={bet} />)
          }
        </View>
      </ScrollView>

      <ResultModal visible={modal.visible} type={modal.type} title={modal.title} message={modal.message} onClose={closeModal} />
    </SafeAreaView>
  );
}

function getTimeAgo(date) {
  const ms = Date.now() - date;
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: SPACING.md, paddingBottom: 120, gap: SPACING.md },
  
  // Header styles matching FeedScreen
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: SPACING.md, 
    // This adds extra space ONLY on Android to dodge the status bar icons
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight + 10 : 10, 
    paddingBottom: 15, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.border 
  },
  headerTitle: { 
    color: COLORS.text, 
    fontFamily: FONTS.display, 
    fontSize: 24, 
    letterSpacing: 1 
  },
  logoutBtn: { 
    backgroundColor: COLORS.accent, 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 7, 
    borderRadius: RADIUS.md, 
    gap: 4 
  },
  logoutBtnText: { 
    color: COLORS.bg, 
    fontWeight: '700', 
    fontSize: 13 
  },

  flair: { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },
  sparksCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sparksLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  sparksValue: { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 32, marginTop: 2 },
  bonusBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md },
  bonusBtnLabel: { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  statBox: { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  statValue: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22 },
  statLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, letterSpacing: 0.5, textAlign: 'center' },
  section: { gap: SPACING.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  sectionCount: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  badgeRow: { gap: SPACING.sm, paddingVertical: 4 },
  badgeCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border, width: 90 },
  badgeIcon: { fontSize: 28 },
  badgeName: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  badgeDesc: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, textAlign: 'center', lineHeight: 13 },
  emptyBets: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyBetsIcon: { fontSize: 32 },
  emptyText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  betRow: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  betSideBar: { width: 4 },
  betSide: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '600', paddingLeft: SPACING.sm },
  betVideoTitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, paddingLeft: SPACING.sm, marginTop: 2 },
  betTime: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, paddingLeft: SPACING.sm, marginTop: 2 },
  pendingBadge: { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 3 },
  betPending: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  betWon:  { color: COLORS.yes,    fontFamily: FONTS.display, fontSize: 15 },
  betLost: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 15 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  iconText: { fontSize: 30 },
  modalTitle: { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  modalMessage: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  modalBtn: { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  modalBtnLabel: { color: COLORS.bg, fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
});