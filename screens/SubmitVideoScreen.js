// screens/SubmitVideoScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, SafeAreaView, Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callApi, getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation, useRoute } from '@react-navigation/native';

// ── Modal ──────────────────────────────────────────────────
function ResultModal({ visible, type, title, message, onClose, onAction, actionLabel }) {
  const iconMap  = { success: '⚡', error: '❌', warning: '⚠️' };
  const colorMap = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark };
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
              <Text style={modalStyles.modalBtnLabel}>{actionLabel || 'Continue'}</Text>
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

// Eligibility criteria — mirrors index.ts constants
const CRITERIA = [
  { icon: 'heart-outline',   text: '500 – 5,000 likes' },
  { icon: 'time-outline',    text: 'Posted within the last 7 days' },
  { icon: 'eye-off-outline', text: 'Under 100,000 views' },
  { icon: 'copy-outline',    text: 'Not already submitted' },
];

// ── Eligibility badge ──────────────────────────────────────
function EligibilityRow({ pass, label }) {
  return (
    <View style={styles.eligRow}>
      <Ionicons
        name={pass ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={pass ? COLORS.yes : COLORS.accent}
      />
      <Text style={[styles.eligText, { color: pass ? COLORS.text : COLORS.accent }]}>{label}</Text>
    </View>
  );
}

// ── Video preview card (shown after checking) ──────────────
function VideoPreview({ preview }) {
  const { video, creator, eligibility } = preview;
  const allPass = Object.values(eligibility).every(Boolean);

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewTop}>
        {video.thumbnail
          ? <Image source={{ uri: video.thumbnail }} style={styles.previewThumb} />
          : <View style={[styles.previewThumb, { backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="play-circle-outline" size={32} color={COLORS.muted} />
            </View>
        }
        <View style={styles.previewInfo}>
          {/* Creator stats — anonymous, no name/handle shown */}
          <Text style={styles.previewSectionLabel}>CREATOR</Text>
          <View style={styles.statRow}>
            <Ionicons name="people-outline" size={12} color={COLORS.muted} />
            <Text style={styles.statText}>
              {formatCount(creator.followers)} followers
            </Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="videocam-outline" size={12} color={COLORS.muted} />
            <Text style={styles.statText}>
              {formatCount(creator.videoCount)} videos
            </Text>
          </View>

          {/* Video stats */}
          <Text style={[styles.previewSectionLabel, { marginTop: 8 }]}>VIDEO</Text>
          <View style={styles.statRow}>
            <Ionicons name="heart-outline" size={12} color={COLORS.muted} />
            <Text style={styles.statText}>{formatCount(video.likes)} likes</Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="eye-outline" size={12} color={COLORS.muted} />
            <Text style={styles.statText}>{formatCount(video.views)} views</Text>
          </View>
          <View style={styles.statRow}>
            <Ionicons name="time-outline" size={12} color={COLORS.muted} />
            <Text style={styles.statText}>Posted {getTimeAgo(new Date(video.uploadedAt))}</Text>
          </View>
        </View>
      </View>

      {/* Eligibility checklist */}
      <View style={styles.eligContainer}>
        <Text style={styles.previewSectionLabel}>ELIGIBILITY</Text>
        <EligibilityRow pass={eligibility.likes}    label={`${formatCount(video.likes)} likes (need 500–5,000)`} />
        <EligibilityRow pass={eligibility.views}    label={`${formatCount(video.views)} views (need <100K)`} />
        <EligibilityRow pass={eligibility.age}      label={`Posted ${getTimeAgo(new Date(video.uploadedAt))} (need <7 days)`} />
        <EligibilityRow pass={eligibility.notDupe}  label={eligibility.notDupe ? 'Not already in pool' : 'Already submitted'} />
      </View>

      {/* Overall verdict */}
      <View style={[styles.verdictRow, { backgroundColor: allPass ? COLORS.yes + '18' : COLORS.accent + '18' }]}>
        <Ionicons
          name={allPass ? 'checkmark-circle' : 'close-circle'}
          size={18}
          color={allPass ? COLORS.yes : COLORS.accent}
        />
        <Text style={[styles.verdictText, { color: allPass ? COLORS.yes : COLORS.accent }]}>
          {allPass ? 'Eligible for the pool!' : 'Not eligible — see issues above'}
        </Text>
      </View>
    </View>
  );
}

// ── SubmitVideoScreen ──────────────────────────────────────
export default function SubmitVideoScreen() {
  const navigation = useNavigation();
  const route      = useRoute();

  // Accept pre-filled URL from share intent (App.js passes it as param)
  const [url, setUrl]           = useState(route.params?.sharedUrl || '');
  const [checking, setChecking] = useState(false);
  const [preview, setPreview]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({ visible: false, type: 'info', title: '', message: '', onAction: null, actionLabel: '' });

  const showModal = (opts) => setModal({ visible: true, ...opts });
  const closeModal = () => setModal(m => ({ ...m, visible: false }));

  // Auto-check if URL was shared from TikTok
  useEffect(() => {
    if (route.params?.sharedUrl && route.params.sharedUrl.includes('tiktok')) {
      handleCheck(route.params.sharedUrl);
    }
  }, [route.params?.sharedUrl]);

  // When URL changes, clear old preview
  const handleUrlChange = (text) => {
    setUrl(text);
    if (preview) setPreview(null);
  };

  const handleCheck = async (urlOverride) => {
    const trimmed = (urlOverride || url).trim();
    if (!trimmed.includes('tiktok')) {
      showModal({ type: 'warning', title: 'Invalid URL', message: 'Please paste a TikTok video link.' });
      return;
    }
    setChecking(true);
    setPreview(null);
    try {
      const result = await callApi('/previewVideo', { tiktokUrl: trimmed });
      if (result.error) {
        showModal({ type: 'error', title: 'Could not fetch video', message: result.error });
      } else {
        setPreview(result);
      }
    } catch (err) {
      showModal({ type: 'error', title: 'Check failed', message: err.message || 'Could not fetch video details.' });
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async () => {
    const trimmed = url.trim();
    setSubmitting(true);
    try {
      const result = await callApi('/ingestVideo', { tiktokUrl: trimmed });
      const { accepted, reason } = result;
      if (accepted) {
        showModal({
          type: 'success',
          title: 'Video submitted!',
          message: "Stats verified — it's now live in the prediction pool. You'll earn a bonus if it goes viral!",
          actionLabel: 'Back to Feed',
          onAction: () => { closeModal(); setTimeout(() => navigation.goBack(), 150); },
        });
        setUrl('');
        setPreview(null);
      } else {
        showModal({ type: 'error', title: 'Not eligible', message: reason || 'Criteria not met.' });
      }
    } catch (err) {
      showModal({ type: 'error', title: 'Something went wrong', message: err.message || 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit  = preview && Object.values(preview.eligibility).every(Boolean);
  const hasChecked = !!preview;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <Text style={styles.title}>SUBMIT VIDEO</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color={COLORS.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Shared URL banner */}
        {route.params?.sharedUrl && (
          <View style={styles.sharedBanner}>
            <Ionicons name="share-social" size={14} color={COLORS.spark} />
            <Text style={styles.sharedBannerText}>Shared from TikTok — checking eligibility…</Text>
          </View>
        )}

        <Text style={styles.stepTitle}>Paste TikTok URL</Text>
        <Text style={styles.stepHint}>
          Paste a link or share directly from TikTok. We'll check the stats before submitting.
        </Text>

        {/* URL input */}
        <View style={[styles.inputWrapper, url.length > 0 && styles.inputWrapperActive]}>
          <Ionicons name="link" size={16} color={COLORS.muted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="https://www.tiktok.com/@user/video/..."
            placeholderTextColor={COLORS.muted}
            value={url}
            onChangeText={handleUrlChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {url.length > 0 && (
            <Pressable onPress={() => { setUrl(''); setPreview(null); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color={COLORS.muted} />
            </Pressable>
          )}
        </View>

        {/* Check button (first step) */}
        {!hasChecked && (
          <Pressable
            style={[styles.checkBtn, (checking || !url.trim()) && styles.btnDisabled]}
            onPress={() => handleCheck()}
            disabled={checking || !url.trim()}
          >
            {checking
              ? <ActivityIndicator color={COLORS.bg} />
              : (
                <View style={styles.btnInner}>
                  <Ionicons name="search" size={16} color={COLORS.bg} />
                  <Text style={styles.checkBtnLabel}>CHECK VIDEO</Text>
                </View>
              )
            }
          </Pressable>
        )}

        {/* Video preview with stats */}
        {preview && <VideoPreview preview={preview} />}

        {/* Change video / re-check */}
        {hasChecked && (
          <Pressable style={styles.recheckBtn} onPress={() => setPreview(null)}>
            <Ionicons name="refresh" size={14} color={COLORS.muted} />
            <Text style={styles.recheckLabel}>Check a different URL</Text>
          </Pressable>
        )}

        {/* Submit button (second step, only shown after check) */}
        {hasChecked && (
          <Pressable
            style={[styles.primaryBtn, (!canSubmit || submitting) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.bg} />
              : (
                <View style={styles.btnInner}>
                  <Ionicons name="flash" size={16} color={COLORS.bg} />
                  <Text style={styles.primaryBtnLabel}>
                    {canSubmit ? 'SUBMIT TO POOL ⚡' : 'NOT ELIGIBLE'}
                  </Text>
                </View>
              )
            }
          </Pressable>
        )}

        {/* Static eligibility guide (shown before checking) */}
        {!hasChecked && (
          <View style={styles.eligibilityCard}>
            <View style={styles.eligibilityTitleRow}>
              <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.accent} />
              <Text style={styles.eligibilityTitle}>AUTO-VERIFIED CRITERIA</Text>
            </View>
            {CRITERIA.map(({ icon, text }) => (
              <View key={text} style={styles.eligibilityRow}>
                <Ionicons name={icon} size={13} color={COLORS.accent} />
                <Text style={styles.eligibilityText}>{text}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.disclaimer}>
          Submitting costs 0 Sparks — earn a bonus if it goes viral!
        </Text>
      </ScrollView>

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

function formatCount(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
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
  container:        { flex: 1, backgroundColor: COLORS.surface },
  handle:           { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10 },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:            { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 20, letterSpacing: 3 },
  content:          { padding: SPACING.md, paddingBottom: 40, gap: SPACING.md },
  sharedBanner:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.spark + '18', borderWidth: 1, borderColor: COLORS.spark + '44', borderRadius: RADIUS.sm, padding: 10 },
  sharedBannerText: { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 12 },
  stepTitle:        { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22, letterSpacing: 1 },
  stepHint:         { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, lineHeight: 18 },
  inputWrapper:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm },
  inputWrapperActive: { borderColor: COLORS.accent + '66' },
  inputIcon:        { marginRight: 8 },
  input:            { flex: 1, color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, paddingVertical: 16 },

  // Check button
  checkBtn:         { backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.accent, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  checkBtnLabel:    { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },

  // Preview card
  previewCard:      { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  previewTop:       { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.sm },
  previewThumb:     { width: 90, height: 120, borderRadius: RADIUS.sm },
  previewInfo:      { flex: 1, gap: 4 },
  previewSectionLabel: { color: COLORS.mutedHigh, fontFamily: FONTS.body, fontSize: 9, letterSpacing: 2 },
  statRow:          { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText:         { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },

  // Eligibility inside preview
  eligContainer:    { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm, gap: 6 },
  eligRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eligText:         { fontFamily: FONTS.body, fontSize: 12 },
  verdictRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  verdictText:      { fontFamily: FONTS.body, fontSize: 13, fontWeight: '700' },

  recheckBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  recheckLabel:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12 },

  // Submit button
  primaryBtn:       { backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: RADIUS.md, alignItems: 'center' },
  btnInner:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnLabel:  { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 14, fontWeight: '700', letterSpacing: 1.5 },
  btnDisabled:      { opacity: 0.4 },

  // Static eligibility guide
  eligibilityCard:      { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.md, gap: 10, borderWidth: 1, borderColor: COLORS.border },
  eligibilityTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  eligibilityTitle:     { color: COLORS.mutedHigh, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  eligibilityRow:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eligibilityText:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  disclaimer:           { color: COLORS.muted, fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
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