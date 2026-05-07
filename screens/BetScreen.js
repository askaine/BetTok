// screens/BetScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, FlatList,
  Animated, ActivityIndicator, SafeAreaView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApi, callApi } from '../Supabaseconfig';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation, useRoute } from '@react-navigation/native';

// ── Constants ──────────────────────────────────────────────────────────────

const BASE_WAGER_OPTIONS = [25, 50, 100, 200, 500];

const MULTIPLIER_OPTIONS = [
  { value: 1, label: '1×', tag: 'Safe' },
  { value: 2, label: '2×', tag: 'Bold' },
  { value: 3, label: '3×', tag: 'Max' },
];

// Must match BRACKET_ODDS in the resolve edge function (index.ts)
const BRACKET_OPTIONS = [
  { id: '<100k',     label: 'Under 100K',  sublabel: '< 100K views',    odds: 1.5,  color: COLORS.muted,     icon: 'remove-circle-outline' },
  { id: '100k-500k', label: '100K – 500K', sublabel: '100K–500K views', odds: 2.5,  color: COLORS.mutedHigh, icon: 'trending-up-outline' },
  { id: '500k-1m',   label: '500K – 1M',   sublabel: '500K–1M views',   odds: 4.0,  color: COLORS.spark,     icon: 'flame-outline' },
  { id: '1m-5m',     label: '1M – 5M',     sublabel: '1M–5M views',     odds: 7.0,  color: COLORS.yes,       icon: 'rocket-outline' },
  { id: '5m+',       label: 'MEGA VIRAL',  sublabel: '5M+ views',       odds: 15.0, color: COLORS.accent,    icon: 'star-outline' },
];

const BET_TYPES = [
  { id: 'binary',  label: 'BINARY',  desc: 'Viral or Flop' },
  { id: 'bracket', label: 'BRACKET', desc: 'Pick view range' },
  { id: 'parlay',  label: 'PARLAY',  desc: 'Chain bets' },
];

// ── Result Modal ───────────────────────────────────────────────────────────

function ResultModal({ visible, type, title, message, onClose, onAction, actionLabel }) {
  const iconMap  = { success: '⚡', error: '❌', warning: '⚠️', duplicate: '🎯' };
  const colorMap = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark, duplicate: COLORS.mutedHigh };
  const color    = colorMap[type] || COLORS.accent;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <View style={[modalStyles.iconCircle, { backgroundColor: color + '22' }]}>
            <Text style={modalStyles.iconText}>{iconMap[type] || '📋'}</Text>
          </View>
          <Text style={[modalStyles.modalTitle, { color }]}>{title}</Text>
          <Text style={modalStyles.modalMessage}>{message}</Text>
          {onAction && (
            <Pressable style={[modalStyles.modalBtn, { backgroundColor: color }]} onPress={onAction}>
              <Text style={modalStyles.modalBtnLabel}>{actionLabel || 'OK'}</Text>
            </Pressable>
          )}
          <Pressable style={modalStyles.modalSecondaryBtn} onPress={onClose}>
            <Text style={modalStyles.modalSecondaryLabel}>{onAction ? 'Stay here' : 'Got it'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Odds bar (binary only) ─────────────────────────────────────────────────

function OddsBar({ yesProb, noProb }) {
  return (
    <View style={oddsStyles.container}>
      <View style={oddsStyles.labels}>
        <Text style={[oddsStyles.label, { color: COLORS.yes }]}>🚀 {yesProb}%</Text>
        <Text style={oddsStyles.center}>market odds</Text>
        <Text style={[oddsStyles.label, { color: COLORS.accent }]}>{noProb}% 📉</Text>
      </View>
      <View style={oddsStyles.bar}>
        <View style={[oddsStyles.yesFill, { flex: yesProb }]} />
        <View style={[oddsStyles.noFill,  { flex: noProb  }]} />
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function BetScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const { video, suggestedSide } = route.params;
  const { user } = useAuth();

  // Shared state
  const [betType,    setBetType]    = useState('binary');
  const [baseWager,  setBaseWager]  = useState(100);
  const [multiplier, setMultiplier] = useState(1);
  const [userSparks, setUserSparks] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({
    visible: false, type: 'info', title: '', message: '', onAction: null, actionLabel: '',
  });

  // Binary state
  const [side, setSide] = useState(suggestedSide || 'yes');
  const [odds, setOdds] = useState(video.odds || { yes: 2.0, no: 2.0, yesProb: 50, noProb: 50 });

  // Bracket state
  const [selectedBracket, setSelectedBracket] = useState(null);

  // Parlay state
  const [parlayLegs,      setParlayLegs]      = useState([{ video, side: suggestedSide || 'yes' }]);
  const [availableVideos, setAvailableVideos]  = useState([]);
  const [showPicker,      setShowPicker]       = useState(false);
  const [loadingVideos,   setLoadingVideos]    = useState(false);

  const slideAnim = useRef(new Animated.Value(50)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
    if (user) {
      getApi('/profile')
        .then(d => { if (d?.user?.sparks != null) setUserSparks(d.user.sparks); })
        .catch(() => {});
    }
  }, []);

  // Load feed videos for parlay picker when user switches to parlay mode
  useEffect(() => {
    if (betType !== 'parlay' || availableVideos.length > 0) return;
    setLoadingVideos(true);
    getApi('/feed')
      .then(result => {
        const alreadyAdded = new Set(parlayLegs.map(l => l.video.id));
        setAvailableVideos((result.videos || []).filter(v => !alreadyAdded.has(v.id)));
      })
      .catch(() => {})
      .finally(() => setLoadingVideos(false));
  }, [betType]);

  const showModal = (opts) => setModal({ visible: true, ...opts });
  const closeModal = () => setModal(m => ({ ...m, visible: false }));

  // ── Derived values ────────────────────────────────────────────

  const actualWager = baseWager * multiplier;
  const canAfford   = userSparks === null || actualWager <= userSparks;

  const getParlayOdds = () =>
    parlayLegs.reduce((acc, leg) => acc * ((leg.video.odds?.[leg.side]) || 2.0), 1.0);

  const getEstimatedPayout = () => {
    const timeBonus = 1.3; // displayed estimate; backend calculates exact
    if (betType === 'binary') {
      return Math.floor(actualWager * (odds[side] || 2.0) * timeBonus);
    }
    if (betType === 'bracket') {
      if (!selectedBracket) return 0;
      const bracketOdds = BRACKET_OPTIONS.find(b => b.id === selectedBracket)?.odds || 1.0;
      return Math.floor(actualWager * bracketOdds * timeBonus);
    }
    if (betType === 'parlay') {
      if (parlayLegs.length < 2) return 0;
      return Math.floor(actualWager * getParlayOdds() * timeBonus);
    }
    return 0;
  };

  const estimatedPayout = getEstimatedPayout();

  // ── Parlay helpers ────────────────────────────────────────────

  const addParlayLeg = (videoToAdd) => {
    setAvailableVideos(prev => prev.filter(v => v.id !== videoToAdd.id));
    setParlayLegs(prev => [...prev, { video: videoToAdd, side: 'yes' }]);
    setShowPicker(false);
  };

  const removeParlayLeg = (idx) => {
    if (idx === 0) return; // first leg is locked (entry point)
    setAvailableVideos(prev => [...prev, parlayLegs[idx].video]);
    setParlayLegs(prev => prev.filter((_, i) => i !== idx));
  };

  const setParlayLegSide = (idx, newSide) => {
    setParlayLegs(prev => prev.map((l, i) => i === idx ? { ...l, side: newSide } : l));
  };

  // ── Submit ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canAfford) {
	  showModal({
		type: 'warning',
		title: 'Not enough Sparks',
		message: `You need ${actualWager.toLocaleString()} Sparks but only have ${userSparks?.toLocaleString()}. Lower your wager or multiplier.`,
	  });
	  return;
	}
    if (betType === 'bracket' && !selectedBracket) {
      showModal({ type: 'warning', title: 'Pick a bracket', message: 'Select which view range you think this video will reach in 7 days.' });
      return;
    }
    if (betType === 'parlay' && parlayLegs.length < 2) {
      showModal({ type: 'warning', title: 'Add more legs', message: 'A parlay needs at least 2 predictions. Tap "Add Leg" to chain another video.' });
      return;
    }

    setSubmitting(true);
    try {
      let payload;
      if (betType === 'binary') {
        payload = { videoId: video.id, side, multiplier, baseWager, betType: 'binary' };
      } else if (betType === 'bracket') {
        payload = { videoId: video.id, bracket: selectedBracket, multiplier, baseWager, betType: 'bracket' };
      } else {
        payload = {
          betType: 'parlay',
          videoId: parlayLegs[0].video.id,   // primary video FK
          legs:    parlayLegs.map(l => ({ videoId: l.video.id, side: l.side })),
          multiplier,
          baseWager,
        };
      }

      const result = await callApi('/placeBet', payload);
      if (result.newOdds) setOdds(result.newOdds);

      const betLabel =
        betType === 'binary'  ? (side === 'yes' ? 'GOES VIRAL 🚀' : 'FLOPS 📉')
        : betType === 'bracket' ? `BRACKET: ${BRACKET_OPTIONS.find(b => b.id === selectedBracket)?.label || selectedBracket}`
        : `PARLAY (${parlayLegs.length} legs)`;

      showModal({
        type:        'success',
        title:       'Bet locked in!',
        message:     `Wagered ${result.sparksWagered ?? actualWager} Sparks on ${betLabel}\n\nIf correct: +${result.potentialPayout ?? estimatedPayout} Sparks`,
        actionLabel: 'Back to Feed',
        onAction:    () => { closeModal(); setTimeout(() => navigation.goBack(), 150); },
      });
    } catch (err) {
      const message = err.message || 'Something went wrong';
      if (message.toLowerCase().includes('already placed')) {
        showModal({
          type:        'duplicate',
          title:       'Already predicted!',
          message:     "You've already placed a bet on this video.",
          actionLabel: 'Back to Feed',
          onAction:    () => { closeModal(); setTimeout(() => navigation.goBack(), 150); },
        });
      } else {
        showModal({ type: 'error', title: 'Something went wrong', message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Display helpers ───────────────────────────────────────────

  const isYes = side === 'yes';

  const getOddsDisplay = () => {
    if (betType === 'binary')  return `${(odds[side] || 2).toFixed(2)}×`;
    if (betType === 'bracket') return selectedBracket
      ? `${BRACKET_OPTIONS.find(b => b.id === selectedBracket)?.odds?.toFixed(1)}×`
      : '—';
    return parlayLegs.length >= 2 ? `${getParlayOdds().toFixed(2)}×` : '—';
  };

  const getOddsLabel = () => {
    if (betType === 'binary')  return `Market odds (${side === 'yes' ? 'VIRAL' : 'FLOP'})`;
    if (betType === 'bracket') return `Bracket odds${selectedBracket ? ` (${selectedBracket})` : ''}`;
    return 'Combined parlay odds';
  };

  const submitColor = betType === 'binary' && !isYes ? COLORS.accent : COLORS.yes;
  const submitLabel =
    betType === 'binary'  ? `LOCK IN ${actualWager} ⚡ — ${side === 'yes' ? 'VIRAL' : 'FLOP'}`
    : betType === 'bracket' ? `LOCK IN ${actualWager} ⚡ — BRACKET`
    : `LOCK IN ${actualWager} ⚡ — PARLAY ×${parlayLegs.length}`;

  // ── Render ────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.handle} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>PLACE PREDICTION</Text>
        <Text style={styles.videoAuthor}>@{video.author_handle || 'creator'}</Text>

        {/* ── Bet type selector ── */}
        <View style={styles.betTypeTabs}>
          {BET_TYPES.map(type => (
            <Pressable
              key={type.id}
              style={[styles.betTypeTab, betType === type.id && styles.betTypeTabActive]}
              onPress={() => setBetType(type.id)}
            >
              <Text style={[styles.betTypeLabel, betType === type.id && styles.betTypeLabelActive]}>
                {type.label}
              </Text>
              <Text style={[styles.betTypeDesc, betType === type.id && { color: COLORS.bg + 'BB' }]}>
                {type.desc}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ════════════════════════════════════════
            BINARY MODE
            ════════════════════════════════════════ */}
        {betType === 'binary' && (
          <>
            <OddsBar yesProb={odds.yesProb || 50} noProb={odds.noProb || 50} />
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>YOUR CALL</Text>
              <View style={styles.sideRow}>
                <Pressable
                  style={[styles.sideBtn, isYes && styles.sideBtnYesActive]}
                  onPress={() => setSide('yes')}
                >
                  <Ionicons name="trending-up" size={22} color={isYes ? COLORS.bg : COLORS.muted} />
                  <Text style={[styles.sideBtnLabel, isYes && { color: COLORS.bg }]}>GOES VIRAL</Text>
                  <Text style={[styles.sideBtnOdds, isYes && { color: COLORS.bg + 'CC' }]}>
                    {odds.yes?.toFixed(2)}× · {odds.yesProb}%
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sideBtn, !isYes && styles.sideBtnNoActive]}
                  onPress={() => setSide('no')}
                >
                  <Ionicons name="trending-down" size={22} color={!isYes ? COLORS.text : COLORS.muted} />
                  <Text style={[styles.sideBtnLabel, !isYes && { color: COLORS.text }]}>FLOPS</Text>
                  <Text style={[styles.sideBtnOdds, !isYes && { color: COLORS.mutedHigh }]}>
                    {odds.no?.toFixed(2)}× · {odds.noProb}%
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}

        {/* ════════════════════════════════════════
            BRACKET MODE
            ════════════════════════════════════════ */}
        {betType === 'bracket' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PICK THE VIEW RANGE IN 7 DAYS</Text>
            <Text style={styles.sectionHint}>
              Guess exactly where the final view count lands. Higher brackets = harder call, bigger payout.
            </Text>
            <View style={styles.bracketList}>
              {BRACKET_OPTIONS.map(opt => {
                const isSelected = selectedBracket === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.bracketOption,
                      isSelected && { borderColor: opt.color, backgroundColor: opt.color + '15' },
                    ]}
                    onPress={() => setSelectedBracket(opt.id)}
                  >
                    <View style={styles.bracketLeft}>
                      <Ionicons
                        name={opt.icon}
                        size={18}
                        color={isSelected ? opt.color : COLORS.muted}
                      />
                      <View style={{ gap: 1 }}>
                        <Text style={[styles.bracketLabel, isSelected && { color: opt.color }]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.bracketSublabel}>{opt.sublabel}</Text>
                      </View>
                    </View>
                    <View style={[styles.bracketOddsChip, isSelected && { backgroundColor: opt.color }]}>
                      <Text style={[styles.bracketOddsText, isSelected && { color: COLORS.bg }]}>
                        {opt.odds}×
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════
            PARLAY MODE
            ════════════════════════════════════════ */}
        {betType === 'parlay' && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>YOUR PARLAY LEGS ({parlayLegs.length}/3)</Text>
            <Text style={styles.sectionHint}>
              Every leg must win. Odds multiply — more legs = bigger potential payout.
            </Text>

            {parlayLegs.map((leg, idx) => {
              const legOdds = leg.video.odds?.[leg.side] || 2.0;
              return (
                <View key={leg.video.id} style={styles.parlayLegCard}>
                  <View style={styles.parlayLegHeader}>
                    <View style={styles.parlayLegNumPill}>
                      <Text style={styles.parlayLegNumText}>LEG {idx + 1}</Text>
                    </View>
                    {idx > 0 && (
                      <Pressable onPress={() => removeParlayLeg(idx)} hitSlop={12}>
                        <Ionicons name="close-circle-outline" size={18} color={COLORS.muted} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={styles.parlayVideoHandle}>@{leg.video.author_handle || 'creator'}</Text>
                  <Text style={styles.parlayVideoTitle} numberOfLines={1}>
                    {leg.video.title || leg.video.noisy_bet_range || 'Video'}
                  </Text>
                  <View style={styles.parlayLegRow}>
                    <Pressable
                      style={[styles.parlayLegBtn, leg.side === 'yes' && styles.parlayLegBtnYes]}
                      onPress={() => setParlayLegSide(idx, 'yes')}
                    >
                      <Ionicons
                        name="trending-up"
                        size={12}
                        color={leg.side === 'yes' ? COLORS.bg : COLORS.muted}
                      />
                      <Text style={[styles.parlayLegBtnLabel, leg.side === 'yes' && { color: COLORS.bg }]}>
                        VIRAL
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.parlayLegBtn, leg.side === 'no' && styles.parlayLegBtnNo]}
                      onPress={() => setParlayLegSide(idx, 'no')}
                    >
                      <Ionicons
                        name="trending-down"
                        size={12}
                        color={leg.side === 'no' ? COLORS.text : COLORS.muted}
                      />
                      <Text style={[styles.parlayLegBtnLabel, leg.side === 'no' && { color: COLORS.text }]}>
                        FLOP
                      </Text>
                    </Pressable>
                    <View style={styles.parlayLegOdds}>
                      <Text style={styles.parlayLegOddsText}>{legOdds.toFixed(2)}×</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            {parlayLegs.length < 3 && (
              <Pressable style={styles.addLegBtn} onPress={() => setShowPicker(true)}>
                <Ionicons name="add-circle-outline" size={18} color={COLORS.accent} />
                <Text style={styles.addLegLabel}>ADD LEG {parlayLegs.length + 1}</Text>
              </Pressable>
            )}

            {parlayLegs.length >= 2 && (
              <View style={styles.parlayOddsRow}>
                <Text style={styles.parlayOddsLabel}>COMBINED ODDS</Text>
                <Text style={styles.parlayOddsValue}>{getParlayOdds().toFixed(2)}×</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Wager ── */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>BASE WAGER</Text>
            {userSparks !== null && (
              <Text style={styles.sparkBalance}>
                <Ionicons name="flash" size={11} color={COLORS.spark} /> {userSparks.toLocaleString()} available
              </Text>
            )}
          </View>
          <View style={styles.optionRow}>
            {BASE_WAGER_OPTIONS.map(w => (
              <Pressable
                key={w}
                style={[
                  styles.optionBtn,
                  baseWager === w && styles.optionBtnActive,
                  userSparks !== null && w * multiplier > userSparks && styles.optionBtnDisabled,
                ]}
                onPress={() => setBaseWager(w)}
              >
                <Text style={[styles.optionLabel, baseWager === w && styles.optionLabelActive]}>{w}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Multiplier ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MULTIPLIER</Text>
          <Text style={styles.sectionHint}>Scales both your risk AND your reward equally</Text>
          <View style={styles.optionRow}>
            {MULTIPLIER_OPTIONS.map(({ value, label, tag }) => {
              const total      = baseWager * value;
              const tooExp     = userSparks !== null && total > userSparks;
              return (
                <Pressable
                  key={value}
                  style={[
                    styles.multiplierBtn,
                    multiplier === value && styles.multiplierBtnActive,
                    tooExp && styles.optionBtnDisabled,
                  ]}
                  onPress={() => setMultiplier(value)}
                >
                  <Text style={[styles.multiplierLabel, multiplier === value && styles.multiplierLabelActive]}>
                    {label}
                  </Text>
                  <Text style={[styles.multiplierTag, multiplier === value && { color: COLORS.spark }]}>
                    {tag}
                  </Text>
                  <Text style={[styles.multiplierRisk, tooExp && { color: COLORS.accent }]}>
                    risk {total} ⚡
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* ── Early bet bonus (binary only) ── */}
        {betType === 'binary' && (
          <View style={styles.timeBonusCard}>
            <Ionicons name="flash" size={14} color={COLORS.spark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.timeBonusTitle}>Early Bet Bonus Active</Text>
              <Text style={styles.timeBonusText}>
                Betting early adds up to 1.5× on top of market odds.
              </Text>
            </View>
          </View>
        )}

        {/* ── Payout summary ── */}
        <View style={styles.payoutCard}>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>{getOddsLabel()}</Text>
            <Text style={styles.payoutOdds}>{getOddsDisplay()}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>At risk</Text>
            <Text style={[styles.payoutValue, { color: COLORS.accent }]}>
              −{actualWager.toLocaleString()} ⚡
            </Text>
          </View>
          <View style={styles.payoutRow}>
            <Text style={styles.payoutLabel}>If correct (est.)</Text>
            <Text style={[styles.payoutValue, { color: COLORS.yes }]}>
              +{estimatedPayout > 0 ? estimatedPayout.toLocaleString() : '—'} ⚡
            </Text>
          </View>
          {estimatedPayout > actualWager && (
            <View style={[styles.netRow, { backgroundColor: COLORS.yes + '11' }]}>
              <Text style={styles.netLabel}>Net profit if correct</Text>
              <Text style={[styles.netValue, { color: COLORS.yes }]}>
                +{(estimatedPayout - actualWager).toLocaleString()} ⚡
              </Text>
            </View>
          )}
        </View>

        {/* ── Submit ── */}
        <Pressable
          style={[
            styles.submitBtn,
            { backgroundColor: submitColor },
            (submitting || !canAfford) && { opacity: 0.55 },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={COLORS.bg} />
            : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.bg} />
                <Text style={styles.submitLabel}>{submitLabel}</Text>
              </>
            )
          }
        </Pressable>

        {!canAfford && (
          <Text style={styles.cantAffordText}>
            You need {actualWager} Sparks but have {userSparks?.toLocaleString() ?? '—'}
          </Text>
        )}

        <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </ScrollView>

      {/* ── Parlay video picker modal ── */}
      <Modal
        transparent
        animationType="slide"
        visible={showPicker}
        onRequestClose={() => setShowPicker(false)}
      >
        <View style={pickerStyles.overlay}>
          <View style={pickerStyles.sheet}>
            <View style={pickerStyles.handle} />
            <View style={pickerStyles.header}>
              <Text style={pickerStyles.title}>ADD LEG {parlayLegs.length + 1}</Text>
              <Pressable onPress={() => setShowPicker(false)} hitSlop={12}>
                <Ionicons name="close" size={20} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={pickerStyles.subtitle}>
              Pick a video to chain into your parlay
            </Text>
            {loadingVideos ? (
              <ActivityIndicator color={COLORS.accent} style={{ padding: 40 }} />
            ) : availableVideos.length === 0 ? (
              <View style={pickerStyles.empty}>
                <Text style={pickerStyles.emptyIcon}>📭</Text>
                <Text style={pickerStyles.emptyText}>No other active videos available</Text>
              </View>
            ) : (
              <FlatList
                data={availableVideos}
                keyExtractor={item => item.id}
                style={{ maxHeight: 380 }}
                contentContainerStyle={{ gap: 6, paddingBottom: 20 }}
                renderItem={({ item }) => {
                  const yesOdds = item.odds?.yes || 2.0;
                  const noOdds  = item.odds?.no  || 2.0;
                  return (
                    <Pressable style={pickerStyles.videoRow} onPress={() => addParlayLeg(item)}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={pickerStyles.videoHandle}>
                          @{item.author_handle || 'creator'}
                        </Text>
                        <Text style={pickerStyles.videoBets}>
                          {item.noisy_bet_range || '—'} predictions
                        </Text>
                      </View>
                      <View style={pickerStyles.videoOddsCol}>
                        <Text style={pickerStyles.videoOddsYes}>🚀 {yesOdds.toFixed(1)}×</Text>
                        <Text style={pickerStyles.videoOddsNo}>📉 {noOdds.toFixed(1)}×</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={COLORS.accent} />
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <ResultModal
        visible={modal.visible}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={closeModal}
        onAction={modal.onAction}
        actionLabel={modal.actionLabel}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.surface },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  content:     { padding: SPACING.md, paddingBottom: 40 },
  title:       { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 22, letterSpacing: 3, marginBottom: 2 },
  videoAuthor: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginBottom: SPACING.md },

  // Bet type tabs
  betTypeTabs:       { flexDirection: 'row', gap: 6, marginBottom: SPACING.lg },
  betTypeTab:        { flex: 1, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, gap: 2 },
  betTypeTabActive:  { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  betTypeLabel:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  betTypeLabelActive:{ color: COLORS.bg },
  betTypeDesc:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 9 },

  // Sections
  section:          { marginBottom: SPACING.lg },
  sectionLabelRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionLabel:     { color: COLORS.mutedHigh, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2, marginBottom: SPACING.sm },
  sectionHint:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginBottom: SPACING.sm, marginTop: -6, lineHeight: 16 },
  sparkBalance:     { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 11 },

  // Binary side buttons
  sideRow:         { flexDirection: 'row', gap: SPACING.sm },
  sideBtn:         { flex: 1, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 4 },
  sideBtnYesActive:{ backgroundColor: COLORS.yes, borderColor: COLORS.yes },
  sideBtnNoActive: { backgroundColor: COLORS.accent + '22', borderColor: COLORS.accent },
  sideBtnLabel:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  sideBtnOdds:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11 },

  // Bracket
  bracketList:       { gap: 8 },
  bracketOption:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md, paddingVertical: 12 },
  bracketLeft:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bracketLabel:      { color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  bracketSublabel:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  bracketOddsChip:   { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  bracketOddsText:   { color: COLORS.mutedHigh, fontFamily: FONTS.display, fontSize: 15 },

  // Parlay legs
  parlayLegCard:       { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.sm, marginBottom: 8 },
  parlayLegHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  parlayLegNumPill:    { backgroundColor: COLORS.accent + '22', borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 2 },
  parlayLegNumText:    { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  parlayVideoHandle:   { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11, marginBottom: 2 },
  parlayVideoTitle:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, marginBottom: 8 },
  parlayLegRow:        { flexDirection: 'row', gap: 6, alignItems: 'center' },
  parlayLegBtn:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  parlayLegBtnYes:     { backgroundColor: COLORS.yes, borderColor: COLORS.yes },
  parlayLegBtnNo:      { backgroundColor: COLORS.accent + '22', borderColor: COLORS.accent },
  parlayLegBtnLabel:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
  parlayLegOdds:       { paddingHorizontal: 10, paddingVertical: 8, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  parlayLegOddsText:   { color: COLORS.mutedHigh, fontFamily: FONTS.display, fontSize: 13 },
  addLegBtn:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.accent + '55', borderStyle: 'dashed' },
  addLegLabel:         { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  parlayOddsRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingHorizontal: SPACING.sm },
  parlayOddsLabel:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  parlayOddsValue:     { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 22 },

  // Wager / multiplier
  optionRow:           { flexDirection: 'row', gap: SPACING.sm },
  optionBtn:           { flex: 1, paddingVertical: 10, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  optionBtnActive:     { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  optionBtnDisabled:   { opacity: 0.35 },
  optionLabel:         { color: COLORS.muted, fontFamily: FONTS.display, fontSize: 16 },
  optionLabelActive:   { color: COLORS.bg },
  multiplierBtn:       { flex: 1, paddingVertical: 12, borderRadius: RADIUS.sm, backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 3 },
  multiplierBtnActive: { borderColor: COLORS.spark, backgroundColor: COLORS.spark + '18' },
  multiplierLabel:     { color: COLORS.muted, fontFamily: FONTS.display, fontSize: 22 },
  multiplierLabelActive: { color: COLORS.spark },
  multiplierTag:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  multiplierRisk:      { color: COLORS.mutedHigh, fontFamily: FONTS.body, fontSize: 10 },

  // Time bonus
  timeBonusCard:  { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start', backgroundColor: COLORS.spark + '11', borderWidth: 1, borderColor: COLORS.spark + '33', borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  timeBonusTitle: { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  timeBonusText:  { color: COLORS.mutedHigh, fontFamily: FONTS.body, fontSize: 11, lineHeight: 16 },

  // Payout card
  payoutCard:   { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.lg, gap: 10, borderWidth: 1, borderColor: COLORS.border },
  payoutRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payoutLabel:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },
  payoutOdds:   { color: COLORS.mutedHigh, fontFamily: FONTS.display, fontSize: 14 },
  payoutValue:  { color: COLORS.text, fontFamily: FONTS.display, fontSize: 17 },
  divider:      { height: 1, backgroundColor: COLORS.border, marginVertical: 2 },
  netRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: RADIUS.sm, padding: 10, marginTop: 4 },
  netLabel:     { color: COLORS.mutedHigh, fontFamily: FONTS.body, fontSize: 12, fontWeight: '600' },
  netValue:     { fontFamily: FONTS.display, fontSize: 19 },

  // Submit
  submitBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: RADIUS.md, marginBottom: SPACING.sm },
  submitLabel:    { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  cantAffordText: { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center', marginBottom: SPACING.sm },
  cancelBtn:      { alignItems: 'center', paddingVertical: 12 },
  cancelLabel:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
});

const oddsStyles = StyleSheet.create({
  container: { marginBottom: SPACING.lg },
  labels:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label:     { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },
  center:    { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1 },
  bar:       { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: COLORS.surfaceHigh },
  yesFill:   { backgroundColor: COLORS.yes },
  noFill:    { backgroundColor: COLORS.accent },
});

const pickerStyles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.md, paddingBottom: 34, borderTopWidth: 1, borderTopColor: COLORS.border },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title:         { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 18, letterSpacing: 2 },
  subtitle:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, marginBottom: SPACING.md },
  empty:         { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyIcon:     { fontSize: 32 },
  emptyText:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  videoRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  videoHandle:   { color: COLORS.text, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700' },
  videoBets:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10 },
  videoOddsCol:  { gap: 2, alignItems: 'flex-end' },
  videoOddsYes:  { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
  videoOddsNo:   { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11, fontWeight: '700' },
});

const modalStyles = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:               { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  iconCircle:          { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  iconText:            { fontSize: 30 },
  modalTitle:          { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  modalMessage:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  modalBtn:            { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  modalBtnLabel:       { color: COLORS.bg, fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  modalSecondaryBtn:   { width: '100%', paddingVertical: 10, alignItems: 'center' },
  modalSecondaryLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
});