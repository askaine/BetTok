// screens/BetScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Animated, ActivityIndicator, SafeAreaView, Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getApi, callApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation, useRoute } from '@react-navigation/native';

// Import the shared modular TagSearch component
import TagSearch from '../components/TagSearch';

const { width: W } = Dimensions.get('window');
const BASE_WAGER_OPTIONS = [25, 50, 100, 200, 500];

// ── Result Modal ───────────────────────────────────────────
function ResultModal({ visible, type, title, message, onClose, onAction, actionLabel }) {
  const colors = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark, duplicate: COLORS.muted };
  const icons  = { success: '⚡', error: '❌', warning: '⚠️', duplicate: '🎯' };
  const color  = colors[type] || COLORS.accent;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={[modalStyles.iconCircle, { backgroundColor: color + '22' }]}>
            <Text style={modalStyles.iconText}>{icons[type] || '📋'}</Text>
          </View>
          <Text style={[modalStyles.title, { color }]}>{title}</Text>
          <Text style={modalStyles.message}>{message}</Text>
          {onAction && (
            <Pressable style={[modalStyles.btn, { backgroundColor: color }]} onPress={onAction}>
              <Text style={modalStyles.btnLabel}>{actionLabel}</Text>
            </Pressable>
          )}
          <Pressable style={modalStyles.secondaryBtn} onPress={onClose}>
            <Text style={modalStyles.secondaryLabel}>{onAction ? 'Stay here' : 'Got it'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Main BetScreen ─────────────────────────────────────────
export default function BetScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { video, suggestedSide } = route.params;
  const { user }   = useAuth();

  const [step,       setStep]       = useState(1);
  const [side,       setSide]       = useState(suggestedSide || 'yes');
  const [wager,      setWager]      = useState(100);
  const [whyTags,    setWhyTags]    = useState([]);
  const [userSparks, setUserSparks] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveOdds,   setLiveOdds]   = useState(video.odds || { yes: 2.0, no: 2.0, yesProb: 50, noProb: 50 });
  const [modal,      setModal]      = useState({ visible: false });

  const slideAnim = useRef(new Animated.Value(40)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    loadSparks();
  }, []);

  const loadSparks = async () => {
    try {
      const r = await getApi('/profile');
      if (r?.user?.sparks != null) setUserSparks(r.user.sparks);
    } catch (_) {}
  };

  const canAfford  = userSparks === null || wager <= userSparks;
  const oddsAtBet  = side === 'yes' ? (liveOdds.yes || 2.0) : (liveOdds.no || 2.0);
  const estPayout  = Math.floor(wager * oddsAtBet);
  const isYes      = side === 'yes';

  const goToStep2 = async () => {
    if (!canAfford) {
      setModal({ visible: true, type: 'warning', title: 'Not enough Sparks', message: `You need ${wager} Sparks but have ${userSparks ?? 0}.` });
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (whyTags.length === 0) {
      setModal({ visible: true, type: 'warning', title: 'Add at least one tag', message: 'Tell us why you think this! Search or create a tag.' });
      return;
    }

    setSubmitting(true);
    let result = null;
    let betError = null;

    try {
      result = await callApi('/placeBet', {
        videoId:    video.id,
        side,
        baseWager:  wager,
        multiplier: 1,
        whyReasons: whyTags,
      });
    } catch (e) {
      betError = e;
    } finally {
      setSubmitting(false);
    }

    // Handle error
    if (betError || !result?.success) {
      const msg = betError?.message || result?.error || 'Something went wrong';
      if (msg.includes('already placed')) {
        setModal({ visible: true, type: 'duplicate', title: 'Already predicted!', message: "You've already made a prediction on this video." });
      } else if (msg.includes('Not enough')) {
        setModal({ visible: true, type: 'warning', title: 'Not enough Sparks', message: msg });
      } else if (msg.includes('already been resolved') || msg.includes('already resolved')) {
        setModal({ visible: true, type: 'warning', title: 'Too late!', message: 'This video has already been resolved.' });
      } else {
        setModal({ visible: true, type: 'error', title: 'Something went wrong', message: msg });
      }
      return;
    }

    // Success
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (result.newOdds) setLiveOdds(result.newOdds);

    setModal({
      visible: true,
      type: 'success',
      title: 'Prediction locked! ⚡',
      message: `${side === 'yes' ? '🚀 VIRAL' : '📉 FLOP'} · ${wager} Sparks wagered\n\nIf correct: +${result.potentialPayout} Sparks\nOdds: ${result.oddsAtBet?.toFixed(2)}× · Time bonus: ${result.timeBonus?.toFixed(2)}×`,
      onAction: () => { setModal({ visible: false }); navigation.goBack(); },
      actionLabel: 'Back to Feed',
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Step header */}
      <View style={styles.stepRow}>
        <Pressable onPress={() => step > 1 ? setStep(1) : navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={COLORS.muted} />
        </Pressable>
        <View style={styles.stepDots}>
          {[1, 2].map(s => <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />)}
        </View>
        <Text style={styles.stepLabel}>Step {step} of 2</Text>
      </View>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <>
            <Text style={styles.screenTitle}>Your Prediction</Text>
            <Text style={styles.videoAuthor}>@{video.author_handle || 'anonymous'}</Text>

            {/* Side selector */}
            <Text style={styles.sectionLabel}>YOUR CALL</Text>
            <View style={styles.sideRow}>
              <Pressable style={[styles.sideBtn, isYes && styles.sideBtnViralActive]} onPress={() => setSide('yes')}>
                {isYes ? (
                  <LinearGradient colors={['#00E87A','#00A855']} style={styles.sideBtnGrad} start={[0,0]} end={[1,0]}>
                    <Ionicons name="trending-up" size={22} color="#000" />
                    <Text style={[styles.sideBtnLabel, { color: '#000' }]}>GOES VIRAL</Text>
                    <Text style={[styles.sideBtnOdds, { color: '#000' }]}>{(liveOdds.yes || 2).toFixed(2)}×</Text>
                  </LinearGradient>
                ) : (
                  <View style={styles.sideBtnInner}>
                    <Ionicons name="trending-up" size={22} color={COLORS.muted} />
                    <Text style={[styles.sideBtnLabel, { color: COLORS.muted }]}>GOES VIRAL</Text>
                    <Text style={[styles.sideBtnOdds, { color: COLORS.muted }]}>{(liveOdds.yes || 2).toFixed(2)}×</Text>
                  </View>
                )}
              </Pressable>
              <Pressable style={[styles.sideBtn, !isYes && styles.sideBtnFlopActive]} onPress={() => setSide('no')}>
                <View style={styles.sideBtnInner}>
                  <Ionicons name="trending-down" size={22} color={!isYes ? COLORS.accent : COLORS.muted} />
                  <Text style={[styles.sideBtnLabel, { color: !isYes ? COLORS.accent : COLORS.muted }]}>FLOPS</Text>
                  <Text style={[styles.sideBtnOdds, { color: !isYes ? COLORS.accent : COLORS.muted }]}>{(liveOdds.no || 2).toFixed(2)}×</Text>
                </View>
              </Pressable>
            </View>

            {/* Odds bar */}
            <View style={styles.oddsBar}>
              <View style={[styles.oddsYes, { flex: liveOdds.yesProb || 50 }]} />
              <View style={[styles.oddsNo,  { flex: liveOdds.noProb  || 50 }]} />
            </View>
            <View style={styles.oddsLabels}>
              <Text style={styles.oddsYesLabel}>🚀 {liveOdds.yesProb || 50}% predict viral</Text>
              <Text style={styles.oddsNoLabel}>{liveOdds.noProb || 50}% predict flop 📉</Text>
            </View>

            {/* Wager */}
            <View style={styles.wagerHeader}>
              <Text style={styles.sectionLabel}>WAGER</Text>
              {userSparks !== null && <Text style={styles.balanceText}>⚡ {userSparks.toLocaleString()} available</Text>}
            </View>
            <View style={styles.wagerRow}>
              {BASE_WAGER_OPTIONS.map(w => (
                <Pressable key={w} style={[styles.wagerBtn, wager === w && styles.wagerBtnActive]}
                  onPress={() => { setWager(w); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                  <Text style={[styles.wagerBtnLabel, wager === w && styles.wagerBtnLabelActive]}>{w}</Text>
                </Pressable>
              ))}
            </View>

            {/* Payout preview */}
            <View style={styles.payoutCard}>
              <View style={styles.payoutRow}><Text style={styles.payoutKey}>Wagering</Text><Text style={styles.payoutVal}>⚡ {wager}</Text></View>
              <View style={styles.payoutRow}><Text style={styles.payoutKey}>If correct (est.)</Text><Text style={[styles.payoutVal, { color: COLORS.yes }]}>+{estPayout} ⚡</Text></View>
              <View style={styles.payoutRow}><Text style={styles.payoutKey}>If wrong</Text><Text style={[styles.payoutVal, { color: COLORS.accent }]}>−{wager} ⚡</Text></View>
            </View>

            <Pressable style={[styles.nextBtn, !canAfford && { opacity: 0.5 }]} onPress={goToStep2} disabled={!canAfford}>
              <LinearGradient colors={canAfford ? ['#FF3B5C','#CC1F3F'] : ['#333','#222']} style={styles.nextBtnGrad} start={[0,0]} end={[1,0]}>
                <Text style={styles.nextBtnLabel}>
                  {canAfford ? 'NEXT: Why do you think this? →' : 'Not enough Sparks'}
                </Text>
              </LinearGradient>
            </Pressable>
          </>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <>
            <Text style={styles.screenTitle}>Why do you think this?</Text>
            <Text style={styles.whySub}>
              Search for tags or create your own. Your insight powers the platform.{' '}
              <Text style={{ color: COLORS.accent }}>At least 1 required.</Text>
            </Text>

            {/* Now flawlessly invoking the imported shared TagSearch module */}
            <TagSearch selectedTags={whyTags} onChange={setWhyTags} />

            {/* Bet summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}><Text style={styles.summaryKey}>Prediction</Text><Text style={[styles.summaryVal, { color: isYes ? COLORS.yes : COLORS.accent }]}>{isYes ? '🚀 GOES VIRAL' : '📉 FLOPS'}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryKey}>Wager</Text><Text style={styles.summaryVal}>⚡ {wager} Sparks</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryKey}>If correct</Text><Text style={[styles.summaryVal, { color: COLORS.yes }]}>+{estPayout} Sparks</Text></View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Tags</Text>
                <Text style={[styles.summaryVal, whyTags.length === 0 && { color: COLORS.accent }]}>
                  {whyTags.length === 0 ? 'None yet' : `${whyTags.length} tagged`}
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.nextBtn, (submitting || whyTags.length === 0) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={submitting || whyTags.length === 0}
            >
              <LinearGradient
                colors={whyTags.length > 0 ? ['#00E87A','#00A855'] : ['#333','#222']}
                style={styles.nextBtnGrad} start={[0,0]} end={[1,0]}
              >
                {submitting
                  ? <ActivityIndicator color="#000" />
                  : <Text style={[styles.nextBtnLabel, whyTags.length > 0 && { color: '#000' }]}>
                      {whyTags.length === 0 ? 'Add at least one tag' : '⚡ LOCK IN PREDICTION'}
                    </Text>
                }
              </LinearGradient>
            </Pressable>
          </>
        )}
      </Animated.ScrollView>

      <ResultModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal({ visible: false })}
        onAction={modal.onAction}
        actionLabel={modal.actionLabel}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  stepRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepDots:     { flexDirection: 'row', gap: 6 },
  stepDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border },
  stepDotActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  stepLabel:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  content:      { padding: SPACING.md, paddingBottom: 60, gap: SPACING.md },
  screenTitle:  { color: COLORS.text, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 1 },
  videoAuthor:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, marginTop: -8 },
  sectionLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  wagerHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceText:  { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 11 },
  sideRow:      { flexDirection: 'row', gap: SPACING.sm },
  sideBtn:      { flex: 1, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  sideBtnViralActive: { borderColor: COLORS.yes },
  sideBtnFlopActive:  { borderColor: COLORS.accent + '66' },
  sideBtnGrad:  { alignItems: 'center', paddingVertical: 18, gap: 4 },
  sideBtnInner: { alignItems: 'center', paddingVertical: 18, gap: 4 },
  sideBtnLabel: { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  sideBtnOdds:  { fontFamily: FONTS.display, fontSize: 20 },
  oddsBar:      { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  oddsYes:      { backgroundColor: COLORS.yes },
  oddsNo:       { backgroundColor: COLORS.accent },
  oddsLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  oddsYesLabel: { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 10 },
  oddsNoLabel:  { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10 },
  wagerRow:     { flexDirection: 'row', gap: SPACING.sm },
  wagerBtn:     { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  wagerBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  wagerBtnLabel:  { color: COLORS.muted, fontFamily: FONTS.display, fontSize: 16 },
  wagerBtnLabelActive: { color: '#fff' },
  payoutCard:   { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.md, gap: 8, borderWidth: 1, borderColor: COLORS.border },
  payoutRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoutKey:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  payoutVal:    { color: COLORS.text, fontFamily: FONTS.display, fontSize: 16 },
  nextBtn:      { borderRadius: RADIUS.md, overflow: 'hidden' },
  nextBtnGrad:  { paddingVertical: 16, alignItems: 'center' },
  nextBtnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  whySub:       { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 13, lineHeight: 20 },
  summaryCard:  { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.md, gap: 8, borderWidth: 1, borderColor: COLORS.borderHigh },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  summaryVal:   { color: COLORS.text, fontFamily: FONTS.display, fontSize: 15 },
});

const modalStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: '#000000BB', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:        { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  iconCircle:   { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  iconText:     { fontSize: 30 },
  title:        { fontFamily: FONTS.display, fontSize: 22, letterSpacing: 1, textAlign: 'center' },
  message:      { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn:          { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  btnLabel:     { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  secondaryBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  secondaryLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
});