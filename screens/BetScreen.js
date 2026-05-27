// screens/BetScreen.js
// KEY BUSINESS FEATURE: The "WHY" step collects the insight data we sell to brands.
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Animated, ActivityIndicator, SafeAreaView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getApi, callApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING, SHADOW } from '../theme';
import { useNavigation, useRoute } from '@react-navigation/native';

// ── WHY reasons — THIS IS THE DATA WE SELL ────────────────
// Each prediction comes with tagged reasons. Aggregated = market intelligence.
const WHY_OPTIONS = [
  { id: 'trending_sound',  emoji: '🎵', label: 'Trending Sound',      desc: 'Audio is viral or popular' },
  { id: 'strong_hook',     emoji: '⚡', label: 'Strong Hook',         desc: 'Grabs attention instantly' },
  { id: 'humor',           emoji: '😂', label: 'Funny/Comedy',        desc: 'High laugh factor' },
  { id: 'emotional',       emoji: '❤️', label: 'Emotional/Relatable', desc: 'People will share this' },
  { id: 'dance',           emoji: '💃', label: 'Dance/Challenge',      desc: 'Inspires participation' },
  { id: 'controversy',     emoji: '🌶️', label: 'Controversial',       desc: 'Will spark debate' },
  { id: 'news_trending',   emoji: '📰', label: 'Trending Topic',      desc: 'Tied to current events' },
  { id: 'creator_power',   emoji: '⭐', label: 'Strong Creator',      desc: 'Creator has influence' },
  { id: 'visual_quality',  emoji: '🎬', label: 'Great Visuals',       desc: 'High production quality' },
  { id: 'niche_community', emoji: '🎯', label: 'Niche Hit',           desc: 'Perfect for a community' },
  { id: 'early_trend',     emoji: '🚀', label: 'Early Trend',         desc: 'I spotted this first' },
  { id: 'already_moving',  emoji: '📈', label: 'Already Moving',      desc: 'Momentum is building' },
];

const BASE_WAGER_OPTIONS = [25, 50, 100, 200, 500];

function ResultModal({ visible, type, title, message, onClose, onAction, actionLabel }) {
  const icons  = { success: '⚡', error: '❌', warning: '⚠️', duplicate: '🎯' };
  const colors = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark, duplicate: COLORS.muted };
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

export default function BetScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { video, suggestedSide } = route.params;
  const { user }   = useAuth();

  // Step 1: pick side + wager  |  Step 2: pick WHY reasons  |  Step 3: confirm
  const [step,         setStep]         = useState(1);
  const [side,         setSide]         = useState(suggestedSide || 'yes');
  const [wager,        setWager]        = useState(100);
  const [whyReasons,   setWhyReasons]   = useState([]);
  const [userSparks,   setUserSparks]   = useState(null);
  const [submitting,   setSubmitting]   = useState(false);
  const [liveOdds,     setLiveOdds]     = useState(video.odds || { yes: 2.0, no: 2.0, yesProb: 50, noProb: 50 });
  const [modal,        setModal]        = useState({ visible: false });

  const slideAnim = useRef(new Animated.Value(60)).current;
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

  const canAfford = userSparks === null || wager <= userSparks;
  const oddsAtBet = side === 'yes' ? liveOdds.yes : liveOdds.no;
  const estPayout = Math.floor(wager * oddsAtBet);

  const toggleWhy = async (id) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWhyReasons(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const goToStep2 = async () => {
    if (!canAfford) {
      setModal({ visible: true, type: 'warning', title: 'Not enough Sparks', message: `You need ${wager} Sparks but have ${userSparks ?? 0}. Lower your wager.` });
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(2);
  };

  const handleSubmit = async () => {
    if (whyReasons.length === 0) {
      setModal({ visible: true, type: 'warning', title: 'Tell us why!', message: 'Pick at least one reason for your prediction. This helps make the platform smarter.' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await callApi('/placeBet', {
        videoId:      video.id,
        side,
        baseWager:    wager,
        multiplier:   1,
        whyReasons,   // ← the data we sell
        betType:      'binary',
      });

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (result.newOdds) setLiveOdds(result.newOdds);

      setModal({
        visible: true,
        type: 'success',
        title: 'Prediction locked! ⚡',
        message: `You bet ${wager} Sparks on ${side === 'yes' ? 'GOES VIRAL 🚀' : 'FLOPS 📉'}\n\nIf correct: +${result.potentialPayout} Sparks\nOdds: ${result.oddsAtBet?.toFixed(2)}× · Time bonus: ${result.timeBonus?.toFixed(2)}×`,
        onAction: () => { setModal({ visible: false }); navigation.goBack(); },
        actionLabel: 'Back to Feed',
      });
    } catch (err) {
      const msg = err.message || 'Something went wrong';
      if (msg.includes('already placed')) {
        setModal({ visible: true, type: 'duplicate', title: 'Already predicted!', message: "You've already made a prediction on this video." });
      } else if (msg.includes('Not enough')) {
        setModal({ visible: true, type: 'warning', title: 'Not enough Sparks', message: msg });
      } else {
        setModal({ visible: true, type: 'error', title: 'Something went wrong', message: msg });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isYes = side === 'yes';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Step indicator */}
      <View style={styles.stepRow}>
        <Pressable onPress={() => { if (step > 1) setStep(step - 1); else navigation.goBack(); }} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={COLORS.muted} />
        </Pressable>
        <View style={styles.stepDots}>
          {[1, 2].map(s => (
            <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
          ))}
        </View>
        <Text style={styles.stepLabel}>Step {step} of 2</Text>
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── STEP 1: Pick side + wager ── */}
          {step === 1 && (
            <>
              <Text style={styles.screenTitle}>Your Prediction</Text>
              <Text style={styles.videoAuthor}>@{video.author_handle || 'anonymous'}</Text>

              {/* Side selector */}
              <View style={styles.sectionLabel}><Text style={styles.sectionLabelText}>YOUR CALL</Text></View>
              <View style={styles.sideRow}>
                <Pressable style={[styles.sideBtn, isYes && styles.sideBtnViralActive]} onPress={() => setSide('yes')}>
                  {isYes ? (
                    <LinearGradient colors={['#00E87A', '#00A855']} style={styles.sideBtnGrad} start={[0,0]} end={[1,0]}>
                      <Ionicons name="trending-up" size={22} color="#000" />
                      <Text style={[styles.sideBtnLabel, { color: '#000' }]}>GOES VIRAL</Text>
                      <Text style={[styles.sideBtnOdds, { color: '#000' }]}>{liveOdds.yes?.toFixed(2)}×</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.sideBtnInner}>
                      <Ionicons name="trending-up" size={22} color={COLORS.muted} />
                      <Text style={[styles.sideBtnLabel, { color: COLORS.muted }]}>GOES VIRAL</Text>
                      <Text style={[styles.sideBtnOdds, { color: COLORS.muted }]}>{liveOdds.yes?.toFixed(2)}×</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable style={[styles.sideBtn, !isYes && styles.sideBtnFlopActive]} onPress={() => setSide('no')}>
                  <View style={styles.sideBtnInner}>
                    <Ionicons name="trending-down" size={22} color={!isYes ? COLORS.accent : COLORS.muted} />
                    <Text style={[styles.sideBtnLabel, { color: !isYes ? COLORS.accent : COLORS.muted }]}>FLOPS</Text>
                    <Text style={[styles.sideBtnOdds, { color: !isYes ? COLORS.accent : COLORS.muted }]}>{liveOdds.no?.toFixed(2)}×</Text>
                  </View>
                </Pressable>
              </View>

              {/* Market odds bar */}
              <View style={styles.oddsBar}>
                <View style={[styles.oddsYes, { flex: liveOdds.yesProb || 50 }]} />
                <View style={[styles.oddsNo,  { flex: liveOdds.noProb  || 50 }]} />
              </View>
              <View style={styles.oddsLabels}>
                <Text style={styles.oddsYesLabel}>🚀 {liveOdds.yesProb}% predict viral</Text>
                <Text style={styles.oddsNoLabel}>{liveOdds.noProb}% predict flop 📉</Text>
              </View>

              {/* Wager */}
              <View style={styles.sectionLabel}>
                <Text style={styles.sectionLabelText}>WAGER</Text>
                {userSparks !== null && (
                  <Text style={styles.balanceText}>⚡ {userSparks.toLocaleString()} available</Text>
                )}
              </View>
              <View style={styles.wagerRow}>
                {BASE_WAGER_OPTIONS.map(w => (
                  <Pressable
                    key={w}
                    style={[styles.wagerBtn, wager === w && styles.wagerBtnActive]}
                    onPress={() => { setWager(w); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Text style={[styles.wagerBtnLabel, wager === w && styles.wagerBtnLabelActive]}>{w}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Payout preview */}
              <View style={styles.payoutCard}>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutKey}>Wagering</Text>
                  <Text style={styles.payoutVal}>⚡ {wager}</Text>
                </View>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutKey}>Est. payout if correct</Text>
                  <Text style={[styles.payoutVal, { color: COLORS.yes }]}>+{estPayout} ⚡</Text>
                </View>
                <View style={styles.payoutRow}>
                  <Text style={styles.payoutKey}>If wrong</Text>
                  <Text style={[styles.payoutVal, { color: COLORS.accent }]}>−{wager} ⚡</Text>
                </View>
              </View>

              <Pressable
                style={[styles.nextBtn, !canAfford && styles.nextBtnDisabled]}
                onPress={goToStep2}
                disabled={!canAfford}
              >
                <LinearGradient
                  colors={canAfford ? ['#FF3B5C', '#CC1F3F'] : ['#333', '#222']}
                  style={styles.nextBtnGrad}
                  start={[0,0]} end={[1,0]}
                >
                  <Text style={styles.nextBtnLabel}>
                    {canAfford ? 'NEXT: Why do you think this? →' : 'Not enough Sparks'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </>
          )}

          {/* ── STEP 2: WHY ── */}
          {step === 2 && (
            <>
              <Text style={styles.screenTitle}>Why do you think this?</Text>
              <Text style={styles.whySub}>
                Pick all that apply — your insights power the platform's intelligence. {'\n'}
                <Text style={{ color: COLORS.accent }}>Required to submit.</Text>
              </Text>

              <View style={styles.whyGrid}>
                {WHY_OPTIONS.map(opt => {
                  const selected = whyReasons.includes(opt.id);
                  return (
                    <Pressable
                      key={opt.id}
                      style={[styles.whyCard, selected && styles.whyCardSelected]}
                      onPress={() => toggleWhy(opt.id)}
                    >
                      <Text style={styles.whyEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.whyLabel, selected && { color: COLORS.text }]}>{opt.label}</Text>
                      <Text style={styles.whyDesc}>{opt.desc}</Text>
                      {selected && (
                        <View style={styles.whyCheck}>
                          <Ionicons name="checkmark-circle" size={16} color={COLORS.yes} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              {/* Summary */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Prediction</Text>
                  <Text style={[styles.summaryVal, { color: isYes ? COLORS.yes : COLORS.accent }]}>
                    {isYes ? '🚀 GOES VIRAL' : '📉 FLOPS'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Wager</Text>
                  <Text style={styles.summaryVal}>⚡ {wager} Sparks</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Potential win</Text>
                  <Text style={[styles.summaryVal, { color: COLORS.yes }]}>+{estPayout} Sparks</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryKey}>Reasons tagged</Text>
                  <Text style={[styles.summaryVal, whyReasons.length === 0 && { color: COLORS.accent }]}>
                    {whyReasons.length === 0 ? 'None yet — required!' : `${whyReasons.length} selected`}
                  </Text>
                </View>
              </View>

              <Pressable
                style={[styles.nextBtn, (submitting || whyReasons.length === 0) && styles.nextBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting || whyReasons.length === 0}
              >
                <LinearGradient
                  colors={whyReasons.length > 0 ? ['#00E87A', '#00A855'] : ['#333', '#222']}
                  style={styles.nextBtnGrad}
                  start={[0,0]} end={[1,0]}
                >
                  {submitting
                    ? <ActivityIndicator color="#000" />
                    : <Text style={[styles.nextBtnLabel, whyReasons.length > 0 && { color: '#000' }]}>
                        {whyReasons.length === 0 ? 'Select at least one reason' : '⚡ LOCK IN PREDICTION'}
                      </Text>
                  }
                </LinearGradient>
              </Pressable>
            </>
          )}
        </ScrollView>
      </Animated.View>

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

  sectionLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabelText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  balanceText:  { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 11 },

  // Side selector
  sideRow:      { flexDirection: 'row', gap: SPACING.sm },
  sideBtn:      { flex: 1, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  sideBtnViralActive: { borderColor: COLORS.yes },
  sideBtnFlopActive:  { borderColor: COLORS.accent + '66' },
  sideBtnGrad:  { alignItems: 'center', paddingVertical: 18, gap: 4 },
  sideBtnInner: { alignItems: 'center', paddingVertical: 18, gap: 4 },
  sideBtnLabel: { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  sideBtnOdds:  { fontFamily: FONTS.display, fontSize: 20 },

  // Odds bar
  oddsBar:      { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  oddsYes:      { backgroundColor: COLORS.yes },
  oddsNo:       { backgroundColor: COLORS.accent },
  oddsLabels:   { flexDirection: 'row', justifyContent: 'space-between' },
  oddsYesLabel: { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 10 },
  oddsNoLabel:  { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 10 },

  // Wager
  wagerRow:     { flexDirection: 'row', gap: SPACING.sm },
  wagerBtn:     { flex: 1, paddingVertical: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  wagerBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  wagerBtnLabel: { color: COLORS.muted, fontFamily: FONTS.display, fontSize: 16 },
  wagerBtnLabelActive: { color: '#fff' },

  // Payout card
  payoutCard:   { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.md, gap: 8, borderWidth: 1, borderColor: COLORS.border },
  payoutRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoutKey:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  payoutVal:    { color: COLORS.text, fontFamily: FONTS.display, fontSize: 16 },

  // Next button
  nextBtn:      { borderRadius: RADIUS.md, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.5 },
  nextBtnGrad:  { paddingVertical: 16, alignItems: 'center' },
  nextBtnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },

  // WHY step
  whySub:       { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 13, lineHeight: 20 },
  whyGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  whyCard:      { width: '47%', backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, gap: 4, position: 'relative' },
  whyCardSelected: { borderColor: COLORS.yes, backgroundColor: COLORS.yesGlow },
  whyEmoji:     { fontSize: 22 },
  whyLabel:     { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },
  whyDesc:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, lineHeight: 14 },
  whyCheck:     { position: 'absolute', top: 6, right: 6 },

  // Summary
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
