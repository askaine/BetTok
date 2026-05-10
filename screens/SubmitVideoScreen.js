// screens/SubmitVideoScreen.js
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, SafeAreaView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { callApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation } from '@react-navigation/native';

// ── Result Modal ───────────────────────────────────────────
function ResultModal({ visible, type, title, message, onClose, onAction, actionLabel }) {
  const iconMap = { success: '⚡', error: '❌', warning: '⚠️' };
  const colorMap = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark };
  const color = colorMap[type] || COLORS.accent;

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
          <Pressable
            style={[modalStyles.modalSecondaryBtn, onAction && { borderTopWidth: 1, borderTopColor: COLORS.border }]}
            onPress={onClose}
          >
            <Text style={modalStyles.modalSecondaryLabel}>{onAction ? 'Stay here' : 'Got it'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Eligibility criteria — must match index.ts constants ──
// MIN_LIKES = 500, MAX_LIKES = 5000, VIRALITY_THRESHOLD = 100_000, MAX_AGE_HOURS = 168 (7 days)
const CRITERIA = [
  { icon: 'heart-outline',    text: '500 – 5,000 likes' },
  { icon: 'time-outline',     text: 'Posted within the last 7 days' },
  { icon: 'eye-off-outline',  text: 'Under 50,000 views' },
  { icon: 'copy-outline',     text: 'Not already submitted' },
];

export default function SubmitVideoScreen() {
  const navigation = useNavigation();
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState({
    visible: false,
    type: 'info',
    title: '',
    message: '',
    onAction: null,
    actionLabel: '',
  });

  const showModal = (opts) => setModal({ visible: true, ...opts });
  const closeModal = () => setModal(m => ({ ...m, visible: false }));

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed.includes('tiktok.com')) {
      showModal({
        type: 'warning',
        title: 'Invalid URL',
        message: 'Please paste a TikTok video link (must contain tiktok.com)',
      });
      return;
    }

    setSubmitting(true);
    try {
      const result = await callApi('/ingestVideo', { tiktokUrl: trimmed });
      const { accepted, reason } = result;

      if (accepted) {
        showModal({
          type: 'success',
          title: 'Video submitted!',
          message: "We verified the stats — it's now live in the prediction pool. You'll earn a bonus if it goes viral!",
          actionLabel: 'Back to Feed',
          onAction: () => {
            closeModal();
            setTimeout(() => navigation.goBack(), 150);
          },
        });
        setUrl('');
      } else {
        showModal({
          type: 'error',
          title: 'Not eligible',
          message: reason || 'This video doesn\'t meet the criteria. Check the requirements below and try a different video.',
        });
      }
    } catch (err) {
      showModal({
        type: 'error',
        title: 'Something went wrong',
        message: err.message || 'Submission failed. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SUBMIT VIDEO</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={22} color={COLORS.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Paste TikTok URL</Text>
          <Text style={styles.stepHint}>
            Paste the link and we'll automatically verify if it's eligible for the prediction pool.
          </Text>

          {/* URL input */}
          <View style={[styles.inputWrapper, url.length > 0 && styles.inputWrapperActive]}>
            <Ionicons name="link" size={16} color={COLORS.muted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="https://www.tiktok.com/@user/video/..."
              placeholderTextColor={COLORS.muted}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {url.length > 0 && (
              <Pressable onPress={() => setUrl('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.muted} />
              </Pressable>
            )}
          </View>

          {/* Eligibility card */}
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

          {/* Submit button */}
          <Pressable
            style={[styles.primaryBtn, (submitting || !url.trim()) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !url.trim()}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.bg} />
              : (
                <View style={styles.btnInner}>
                  <Ionicons name="flash" size={16} color={COLORS.bg} />
                  <Text style={styles.primaryBtnLabel}>VERIFY & SUBMIT</Text>
                </View>
              )
            }
          </Pressable>

          <Text style={styles.disclaimer}>
            Submitting costs 0 Sparks — earn a bonus if the video goes viral!
          </Text>
        </View>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 20, letterSpacing: 3 },
  content: { padding: SPACING.md, paddingBottom: 40 },
  stepContent: { gap: SPACING.md, marginTop: 10 },
  stepTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 22, letterSpacing: 1 },
  stepHint: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, lineHeight: 18 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm,
  },
  inputWrapperActive: { borderColor: COLORS.accent + '66' },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, color: COLORS.text, fontFamily: FONTS.body,
    fontSize: 13, paddingVertical: 16,
  },
  eligibilityCard: {
    backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md,
    padding: SPACING.md, gap: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  eligibilityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  eligibilityTitle: {
    color: COLORS.mutedHigh, fontFamily: FONTS.body,
    fontSize: 10, letterSpacing: 2,
  },
  eligibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eligibilityText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  primaryBtn: {
    backgroundColor: COLORS.accent, paddingVertical: 16,
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnLabel: {
    color: COLORS.bg, fontFamily: FONTS.body,
    fontSize: 14, fontWeight: '700', letterSpacing: 1.5,
  },
  btnDisabled: { opacity: 0.45 },
  disclaimer: {
    color: COLORS.muted, fontSize: 11,
    textAlign: 'center', marginTop: 4, fontStyle: 'italic',
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  sheet: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: 28, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: COLORS.border, width: '100%',
  },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  iconText: { fontSize: 30 },
  modalTitle: { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  modalMessage: {
    color: COLORS.muted, fontFamily: FONTS.body,
    fontSize: 13, textAlign: 'center', lineHeight: 20,
  },
  modalBtn: {
    width: '100%', paddingVertical: 14, borderRadius: RADIUS.md,
    alignItems: 'center', marginTop: 4,
  },
  modalBtnLabel: {
    color: COLORS.bg, fontFamily: FONTS.body,
    fontWeight: '700', fontSize: 14, letterSpacing: 1,
  },
  modalSecondaryBtn: { width: '100%', paddingVertical: 12, alignItems: 'center' },
  modalSecondaryLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
});