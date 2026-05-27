// screens/ProfileScreen.js
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, Pressable,
  RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { getApi, callApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../theme';

const { width: W } = Dimensions.get('window');

const BADGE_META = {
  early_bird:  { icon: '🐦', label: 'Early Bird',    desc: 'Bet within 1hr of submission' },
  contrarian:  { icon: '🎭', label: 'Contrarian',     desc: 'Won a FLOP bet' },
  streak_5:    { icon: '🔥', label: '5-Day Streak',   desc: '5 correct predictions in a row' },
  streak_10:   { icon: '💥', label: '10-Day Streak',  desc: '10 correct in a row' },
  club_1000:   { icon: '⚡', label: '1K Club',        desc: 'Earned 1,000 total Sparks' },
  club_5000:   { icon: '💎', label: '5K Club',        desc: 'Earned 5,000 total Sparks' },
  trend_spotter: { icon: '🚀', label: 'Trend Spotter', desc: 'Predicted 5 viral videos' },
};

function ResultModal({ visible, type, title, message, onClose }) {
  const colors = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark };
  const icons  = { success: '⚡', error: '❌', warning: '⚠️' };
  const color  = colors[type] || COLORS.textSub;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={[modalStyles.iconCircle, { backgroundColor: color + '22' }]}>
            <Text style={modalStyles.iconText}>{icons[type] || 'ℹ️'}</Text>
          </View>
          <Text style={[modalStyles.title, { color }]}>{title}</Text>
          <Text style={modalStyles.message}>{message}</Text>
          <Pressable style={[modalStyles.btn, { backgroundColor: color }]} onPress={onClose}>
            <Text style={modalStyles.btnLabel}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StatCard({ label, value, color, icon }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StreakCalendar({ streak }) {
  // Show last 7 days — filled if streak covers them
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <View style={styles.calendarRow}>
      {days.map((d, i) => {
        const active = i < Math.min(streak, 7);
        return (
          <View key={i} style={[styles.calendarDay, active && styles.calendarDayActive]}>
            <Text style={[styles.calendarDayLabel, active && { color: COLORS.purple }]}>{d}</Text>
            {active && <Text style={styles.calendarFire}>🔥</Text>}
          </View>
        );
      })}
    </View>
  );
}

function BetHistoryItem({ bet }) {
  const isWon     = bet.status === 'won';
  const isPending = bet.status === 'pending' || !bet.status;
  const isLost    = bet.status === 'lost';
  const ago       = bet.placed_at ? getTimeAgo(new Date(bet.placed_at)) : '—';

  // Show why reasons if available
  const reasons = bet.why_reasons || [];

  return (
    <View style={styles.betItem}>
      <View style={[styles.betSidebar, { backgroundColor: isYesBet(bet) ? COLORS.yes : COLORS.accent }]} />
      <View style={styles.betContent}>
        <View style={styles.betTopRow}>
          <Text style={styles.betSideText}>
            {isYesBet(bet) ? '🚀 VIRAL' : '📉 FLOP'} · {bet.sparks_wagered} ⚡
          </Text>
          {isPending && <View style={styles.pendingPill}><Text style={styles.pendingText}>LIVE</Text></View>}
          {isWon  && <Text style={styles.wonText}>+{bet.sparks_earned ?? bet.potential_payout} ⚡</Text>}
          {isLost && <Text style={styles.lostText}>−{bet.sparks_wagered} ⚡</Text>}
        </View>
        {reasons.length > 0 && (
          <Text style={styles.betReasons}>Tagged: {reasons.slice(0, 3).join(', ')}</Text>
        )}
        <Text style={styles.betTime}>{ago}</Text>
      </View>
    </View>
  );
}

function isYesBet(bet) {
  return bet.side === 'yes';
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [userData,      setUserData]      = useState(null);
  const [bets,          setBets]          = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [modal,         setModal]         = useState({ visible: false });

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    try {
      const [pResult, bResult] = await Promise.all([
        getApi('/profile'),
        getApi('/myBets'),
      ]);
      setUserData(pResult?.user || pResult);
      setBets(bResult?.bets || []);
    } catch (err) {
      console.error('Profile load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleClaimBonus = async () => {
    setClaimingBonus(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const r = await callApi('/claimDailyBonus', {});
      setModal({ visible: true, type: 'success', title: '⚡ Daily bonus!', message: `+${r.awarded} Sparks added. New balance: ${r.newBalance?.toLocaleString()} Sparks.` });
      load();
    } catch (err) {
      setModal({ visible: true, type: 'warning', title: 'Not yet!', message: err.message || 'Come back in 24 hours.' });
    } finally {
      setClaimingBonus(false);
    }
  };

  const handleLogout = () => {
    setModal({
      visible: true, type: 'warning',
      title: 'Log out?',
      message: 'You will need to log back in.',
    });
  };

  if (loading || !userData) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} size="large" /></View>;
  }

  const correctPct  = userData.total_bets > 0 ? Math.round(((userData.correct_bets ?? 0) / userData.total_bets) * 100) : 0;
  const pendingBets = bets.filter(b => !b.status || b.status === 'pending');
  const doneBets    = bets.filter(b => b.status === 'won' || b.status === 'lost');
  const wonBets     = doneBets.filter(b => b.status === 'won').length;
  const totalDone   = doneBets.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{(userData.username || 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.username}>@{userData.username || 'you'}</Text>
            {userData.flair ? <Text style={styles.flair}>{userData.flair}</Text> : null}
          </View>
          <TouchableOpacity onPress={logout} hitSlop={10}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        {/* Sparks card */}
        <LinearGradient colors={['#1A1A0A', '#0F0F00']} style={styles.sparksCard} start={[0,0]} end={[1,1]}>
          <View style={styles.sparksLeft}>
            <Text style={styles.sparksLabel}>YOUR SPARKS</Text>
            <Text style={styles.sparksValue}>⚡ {(userData.sparks ?? 0).toLocaleString()}</Text>
          </View>
          <Pressable
            style={[styles.bonusBtn, claimingBonus && { opacity: 0.5 }]}
            onPress={handleClaimBonus}
            disabled={claimingBonus}
          >
            {claimingBonus
              ? <ActivityIndicator color="#000" size="small" />
              : (
                <>
                  <Ionicons name="gift-outline" size={14} color="#000" />
                  <Text style={styles.bonusBtnLabel}>+100 Daily</Text>
                </>
              )
            }
          </Pressable>
        </LinearGradient>

        {/* Streak visualization */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>STREAK</Text>
            <Text style={styles.streakNum}>🔥 {userData.current_streak ?? 0} days</Text>
          </View>
          <StreakCalendar streak={userData.current_streak ?? 0} />
          {(userData.longest_streak ?? 0) > 0 && (
            <Text style={styles.streakBest}>Best: {userData.longest_streak} days</Text>
          )}
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard icon="🎯" label="Total Bets"  value={userData.total_bets ?? 0} />
          <StatCard icon="✅" label="Accuracy"    value={`${correctPct}%`}                   color={COLORS.yes} />
          <StatCard icon="🏆" label="Best Streak" value={userData.longest_streak ?? 0}        color={COLORS.purple} />
          <StatCard icon="📈" label="Wins"        value={`${wonBets}/${totalDone}`}            color={COLORS.spark} />
        </View>

        {/* Badges */}
        {userData.badges?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BADGES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
              {userData.badges.map(b => {
                const meta = BADGE_META[b] || { icon: '🏅', label: b, desc: '' };
                return (
                  <View key={b} style={styles.badgeCard}>
                    <Text style={styles.badgeEmoji}>{meta.icon}</Text>
                    <Text style={styles.badgeName}>{meta.label}</Text>
                    <Text style={styles.badgeDesc}>{meta.desc}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Active bets */}
        {pendingBets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ACTIVE PREDICTIONS ({pendingBets.length})</Text>
            {pendingBets.map(b => <BetHistoryItem key={b.id} bet={b} />)}
          </View>
        )}

        {/* Bet history */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>BET HISTORY</Text>
            <Text style={styles.sectionCount}>{doneBets.length} resolved</Text>
          </View>
          {doneBets.length === 0 ? (
            <View style={styles.emptyBets}>
              <Text style={{ fontSize: 32 }}>🎯</Text>
              <Text style={styles.emptyBetsText}>
                {bets.length === 0 ? 'No bets yet — start predicting!' : 'No resolved bets yet'}
              </Text>
            </View>
          ) : (
            doneBets.map(b => <BetHistoryItem key={b.id} bet={b} />)
          )}
        </View>

        {/* Legal links */}
        <View style={styles.legalRow}>
          <Text style={styles.legalLink}>Privacy Policy</Text>
          <Text style={styles.legalDot}>·</Text>
          <Text style={styles.legalLink}>Terms of Service</Text>
        </View>
      </ScrollView>

      <ResultModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal({ visible: false })}
      />
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
  container:    { flex: 1, backgroundColor: COLORS.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  scroll:       { padding: SPACING.md, paddingBottom: 100, gap: SPACING.md },

  header:       { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  avatarText:   { color: '#fff', fontFamily: FONTS.display, fontSize: 22 },
  headerInfo:   { flex: 1 },
  username:     { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22, letterSpacing: 1 },
  flair:        { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11, marginTop: 2 },

  sparksCard:   { borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: COLORS.spark + '33' },
  sparksLeft:   { gap: 4 },
  sparksLabel:  { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  sparksValue:  { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 34 },
  bonusBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.spark, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full },
  bonusBtnLabel: { color: '#000', fontFamily: FONTS.body, fontWeight: '700', fontSize: 13 },

  section:       { gap: SPACING.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  sectionCount:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  streakNum:    { color: COLORS.purple, fontFamily: FONTS.display, fontSize: 16 },
  calendarRow:  { flexDirection: 'row', gap: 6 },
  calendarDay:  { flex: 1, alignItems: 'center', gap: 4, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.sm, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  calendarDayActive: { backgroundColor: COLORS.purpleGlow, borderColor: COLORS.purple + '44' },
  calendarDayLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  calendarFire: { fontSize: 12 },
  streakBest:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, textAlign: 'center' },

  statsGrid:    { flexDirection: 'row', gap: SPACING.sm },
  statCard:     { flex: 1, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  statIcon:     { fontSize: 20 },
  statValue:    { color: COLORS.text, fontFamily: FONTS.display, fontSize: 20 },
  statLabel:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, letterSpacing: 0.5, textAlign: 'center' },

  badgeRow:     { gap: SPACING.sm, paddingVertical: 4 },
  badgeCard:    { width: 88, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.sm, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  badgeEmoji:   { fontSize: 26 },
  badgeName:    { color: COLORS.text, fontFamily: FONTS.body, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  badgeDesc:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9, textAlign: 'center', lineHeight: 13 },

  betItem:      { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, marginBottom: 6 },
  betSidebar:   { width: 4 },
  betContent:   { flex: 1, padding: SPACING.sm, gap: 3 },
  betTopRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  betSideText:  { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '600' },
  pendingPill:  { backgroundColor: COLORS.blue + '22', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  pendingText:  { color: COLORS.blue, fontFamily: FONTS.body, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  wonText:      { color: COLORS.yes, fontFamily: FONTS.display, fontSize: 15 },
  lostText:     { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 15 },
  betReasons:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  betTime:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },

  emptyBets:    { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyBetsText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },

  legalRow:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: SPACING.md },
  legalLink:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
  legalDot:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },
});

const modalStyles = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: '#000000BB', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:      { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  iconText:   { fontSize: 30 },
  title:      { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  message:    { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn:        { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  btnLabel:   { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14 },
});
