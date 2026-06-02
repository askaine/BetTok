// screens/SubmitVideoScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, ActivityIndicator, SafeAreaView, Modal,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { callApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation, useRoute } from '@react-navigation/native';
import TagSearch from '../components/TagSearch';

function ResultModal({ visible, type, title, message, onClose, onAction, actionLabel }) {
  const colors = { success: COLORS.yes, error: COLORS.accent, warning: COLORS.spark };
  const icons  = { success: '⚡', error: '❌', warning: '⚠️' };
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

export default function SubmitVideoScreen() {
  const navigation = useNavigation();
  const route      = useRoute();

  const [url,        setUrl]        = useState('');
  const [viralTags,  setViralTags]  = useState([]); // "why might this go viral" tags
  const [submitting, setSubmitting] = useState(false);
  const [modal,      setModal]      = useState({ visible: false });
  const [urlFilled,  setUrlFilled]  = useState(false);

  const inputRef   = useRef(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sharedUrl = route.params?.sharedUrl;
    if (sharedUrl && typeof sharedUrl === 'string' && sharedUrl.trim()) {
      const clean = sharedUrl.split('?')[0];
      setUrl(clean);
      setUrlFilled(true);
      Animated.spring(bannerAnim, { toValue: 1, tension: 80, friction: 12, useNativeDriver: true }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [route.params?.sharedUrl]);

  const clearUrl = () => {
    setUrl('');
    setUrlFilled(false);
    Animated.timing(bannerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setModal({ visible: true, type: 'warning', title: 'No URL', message: 'Paste a TikTok URL first.' });
      return;
    }
    if (!trimmed.includes('tiktok.com')) {
      setModal({ visible: true, type: 'warning', title: 'Invalid URL', message: "This doesn't look like a TikTok link." });
      return;
    }
    if (viralTags.length === 0) {
      setModal({ visible: true, type: 'warning', title: 'Tag Required', message: 'Please select at least 1 prediction tag before submitting.' });
      return;
    }

    setSubmitting(true);
    try {
      // Pass viralTags as whyReasons so they're stored as submitter insight
      const result = await callApi('/ingestVideo', { tiktokUrl: trimmed, categories: [], whyReasons: viralTags });
      if (result.accepted) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setModal({
          visible: true, type: 'success',
          title: '⚡ Video submitted!',
          message: "It's now live in the prediction pool. Earn bonus Sparks if it goes viral!",
          actionLabel: 'Back to Feed',
          onAction: () => { setModal({ visible: false }); setTimeout(() => navigation.goBack(), 150); },
        });
        setUrl('');
        setViralTags([]);
        setUrlFilled(false);
      } else {
        setModal({ visible: true, type: 'error', title: 'Not eligible', message: result.reason || 'This video doesn\'t meet the criteria.' });
      }
    } catch (err) {
      setModal({ visible: true, type: 'error', title: 'Something went wrong', message: err.message || 'Try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const isValidUrl = url.trim().includes('tiktok.com');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SUBMIT VIDEO</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="close" size={22} color={COLORS.muted} />
        </Pressable>
      </View>

      <Animated.View style={[
        styles.sharedBanner,
        {
          opacity: bannerAnim,
          transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          display: urlFilled ? 'flex' : 'none',
        },
      ]}>
        <Ionicons name="checkmark-circle" size={16} color={COLORS.yes} />
        <Text style={styles.sharedBannerText}>TikTok URL detected from share ✓</Text>
        <Pressable onPress={clearUrl} hitSlop={8}>
          <Text style={styles.sharedBannerClear}>Clear</Text>
        </Pressable>
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* URL input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TIKTOK URL <Text style={styles.required}>*required</Text></Text>
            <View style={[
              styles.inputWrapper,
              url.length > 0 && styles.inputWrapperFilled,
              isValidUrl && styles.inputWrapperValid,
            ]}>
              <Ionicons
                name={isValidUrl ? 'checkmark-circle' : 'link-outline'}
                size={16}
                color={isValidUrl ? COLORS.yes : COLORS.muted}
                style={{ marginRight: 8 }}
              />
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="https://www.tiktok.com/@user/video/..."
                placeholderTextColor={COLORS.muted}
                value={url}
                onChangeText={(v) => { setUrl(v); if (urlFilled && !v) setUrlFilled(false); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {url.length > 0 && (
                <Pressable onPress={clearUrl} hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={COLORS.muted} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Eligibility */}
          <View style={styles.eligibilityCard}>
            <Text style={styles.eligibilityTitle}>✅ AUTO-CHECKED ON SUBMIT</Text>
            {[
              ['heart-outline',   '500 – 5,000 likes'],
              ['time-outline',    'Posted within the last 7 days'],
              ['eye-off-outline', 'Under 50,000 views'],
              ['copy-outline',    'Not already in the pool'],
            ].map(([icon, text]) => (
              <View key={text} style={styles.eligibilityRow}>
                <Ionicons name={icon} size={13} color={COLORS.yes} />
                <Text style={styles.eligibilityText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* Why might this go viral — tag search */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WHY MIGHT THIS GO VIRAL? <Text style={styles.required}>*required (minimum 1)</Text></Text>
            <Text style={styles.sectionSub}>
              Tag what makes this video special. This requirement powers the prediction market intelligence.
            </Text>
            <TagSearch
              selectedTags={viralTags}
              onChange={setViralTags}
              maxTags={5}
              placeholder="e.g. strong_hook, trending_sound…"
            />
          </View>

          <Text style={styles.disclaimer}>
            By submitting, you confirm this is a publicly available TikTok video and agree to our Terms of Service. Your prediction and analytical tag data may be used for aggregated insights.
          </Text>

          <Pressable
            style={[styles.submitBtn, (submitting || !url.trim() || viralTags.length === 0) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !url.trim() || viralTags.length === 0}
          >
            <LinearGradient
              colors={(isValidUrl && viralTags.length > 0) ? ['#FF3B5C', '#CC1F3F'] : ['#2A2A2A', '#1A1A1A']}
              style={styles.submitBtnGrad}
              start={[0, 0]} end={[1, 0]}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : (
                  <View style={styles.submitBtnInner}>
                    <Ionicons name="flash" size={16} color={(isValidUrl && viralTags.length > 0) ? '#fff' : COLORS.muted} />
                    <Text style={[styles.submitBtnLabel, (!isValidUrl || viralTags.length === 0) && { color: COLORS.muted }]}>
                      VERIFY & SUBMIT
                    </Text>
                  </View>
                )
              }
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

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
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:  { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 20, letterSpacing: 3 },

  sharedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.yesGlow, borderBottomWidth: 1, borderBottomColor: COLORS.yes + '33', paddingHorizontal: SPACING.md, paddingVertical: 10 },
  sharedBannerText: { color: COLORS.yes, fontFamily: FONTS.body, fontSize: 12, fontWeight: '700', flex: 1 },
  sharedBannerClear: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, textDecorationLine: 'underline' },

  content:      { padding: SPACING.md, gap: SPACING.md, paddingBottom: 40 },
  section:      { gap: SPACING.sm },
  sectionTitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2 },
  sectionSub:   { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12, lineHeight: 18 },
  required:     { color: COLORS.accent },

  inputWrapper:       { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm },
  inputWrapperFilled: { borderColor: COLORS.accent + '55' },
  inputWrapperValid:  { borderColor: COLORS.yes + '66', backgroundColor: COLORS.yesGlow },
  input:              { flex: 1, color: COLORS.text, fontFamily: FONTS.body, fontSize: 13, paddingVertical: 16 },

  eligibilityCard:  { backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, padding: SPACING.md, gap: 10, borderWidth: 1, borderColor: COLORS.border },
  eligibilityTitle: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 2, marginBottom: 2 },
  eligibilityRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eligibilityText:  { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12 },

  disclaimer:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, lineHeight: 16, textAlign: 'center', paddingHorizontal: SPACING.md },

  submitBtn:         { borderRadius: RADIUS.md, overflow: 'hidden' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnGrad:     { paddingVertical: 16, alignItems: 'center' },
  submitBtnInner:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitBtnLabel:    { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1.5 },
});

const modalStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: '#000000BB', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:        { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  iconCircle:   { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  iconText:     { fontSize: 30 },
  title:        { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  message:      { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn:          { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  btnLabel:     { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14 },
  secondaryBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  secondaryLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
});