// screens/AuthScreen.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
  ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { getApi } from '../Supabaseconfig';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation } from '@react-navigation/native';

function ResultModal({ visible, type, title, message, onClose }) {
  const colors = { error: COLORS.accent, warning: COLORS.spark, success: COLORS.yes };
  const color  = colors[type] || COLORS.accent;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
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

export default function AuthScreen() {
  const navigation = useNavigation();
  const { login, register, resendVerification } = useAuth();

  const [mode,             setMode]             = useState('login');
  const [email,            setEmail]            = useState('');
  const [password,         setPassword]         = useState('');
  const [username,         setUsername]         = useState('');
  const [usernameStatus,   setUsernameStatus]   = useState(null); // null | 'checking' | 'available' | 'taken' | 'invalid'
  const [showPassword,     setShowPassword]     = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [agreedToTerms,    setAgreedToTerms]    = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [modal,            setModal]            = useState({ visible: false });

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const checkTimer = useRef(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
    ]).start();
  }, []);

  // Debounced username availability check
  const checkUsername = useCallback((val) => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!val || val.length < 3) { setUsernameStatus(null); return; }
    setUsernameStatus('checking');
    checkTimer.current = setTimeout(async () => {
      try {
        const r = await getApi('/checkUsername', { username: val });
        setUsernameStatus(r.available ? 'available' : (r.reason ? 'invalid' : 'taken'));
      } catch (_) {
        setUsernameStatus(null);
      }
    }, 600);
  }, []);

  const handleUsernameChange = (val) => {
    setUsername(val);
    checkUsername(val);
  };

  const handleSubmit = async () => {
  if (!email.trim() || !password) {
    setModal({ visible: true, type: 'error', title: 'Missing fields', message: 'Please fill in all fields.' });
    return;
  }
  
  if (mode === 'register') {
    if (!username.trim()) {
      setModal({ visible: true, type: 'error', title: 'Username required', message: 'Choose a username.' });
      return;
    }
    if (usernameStatus === 'taken') {
      setModal({ visible: true, type: 'error', title: 'Username taken', message: 'That username is already in use. Try another.' });
      return;
    }
    if (usernameStatus === 'invalid') {
      setModal({ visible: true, type: 'error', title: 'Invalid username', message: '3–20 characters, letters, numbers, and underscores only.' });
      return;
    }
    if (password.length < 6) {
      setModal({ visible: true, type: 'error', title: 'Password too short', message: 'Minimum 6 characters.' });
      return;
    }
    if (!agreedToTerms) {
      setModal({ visible: true, type: 'warning', title: 'Please agree', message: 'You must agree to the Terms of Service and Privacy Policy to continue.' });
      return;
    }

    try {
      const emailCheck = await getApi('/checkUsername', { email: email.trim() });
      if (!emailCheck.available) {
        setModal({ 
          visible: true, 
          type: 'error', 
          title: 'Email taken', 
          message: 'That email is already registered to an account.' 
        });
        return;
      }
    } catch (_) {
      // Ignore API check errors or handle silently
    }
  } // <-- This closes the `if (mode === 'register')` block cleanly

  setLoading(true);
  try {
    if (mode === 'login') {
      await login(email.trim(), password);
    } else {
      await register(email.trim(), password, username.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVerificationSent(true);
    }
  } catch (err) {
    const msg =
      err.message?.includes('Email not confirmed') ? 'Please verify your email first. Check your inbox.'
      : err.message?.includes('Invalid login') || err.message?.includes('Invalid email or password') ? 'Wrong email or password.'
      : err.message?.includes('already registered') || err.message?.includes('already been registered') ? 'That email is already registered.'
      : err.message || 'Something went wrong.';
    setModal({ visible: true, type: 'error', title: 'Error', message: msg });
  } finally {
    setLoading(false);
  }
};

  const handleResend = async () => {
    if (!email.trim()) {
      setModal({ visible: true, type: 'warning', title: 'Enter your email', message: 'Type your email first.' });
      return;
    }
    setLoading(true);
    try {
      await resendVerification(email.trim());
      setModal({ visible: true, type: 'success', title: 'Sent!', message: 'Check your inbox for the verification link.' });
    } catch (err) {
      setModal({ visible: true, type: 'error', title: 'Error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setUsernameStatus(null);
    setUsername('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const usernameIcon = () => {
    if (usernameStatus === 'checking')  return <ActivityIndicator size="small" color={COLORS.muted} />;
    if (usernameStatus === 'available') return <Ionicons name="checkmark-circle" size={18} color={COLORS.yes} />;
    if (usernameStatus === 'taken')     return <Ionicons name="close-circle" size={18} color={COLORS.accent} />;
    if (usernameStatus === 'invalid')   return <Ionicons name="alert-circle" size={18} color={COLORS.spark} />;
    return null;
  };

  // ── Verification sent screen ──
  if (verificationSent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.verifyContainer}>
          <Text style={{ fontSize: 64 }}>📧</Text>
          <Text style={styles.verifyTitle}>Check your email</Text>
          <Text style={styles.verifyText}>
            We sent a verification link to{'\n'}
            <Text style={{ color: COLORS.accent }}>{email}</Text>
            {'\n\n'}Click the link to activate your account, then come back to log in.
          </Text>
          <Pressable
            style={styles.verifyBtn}
            onPress={() => { setVerificationSent(false); setMode('login'); }}
          >
            <LinearGradient colors={['#FF3B5C','#CC1F3F']} style={styles.verifyBtnGrad} start={[0,0]} end={[1,0]}>
              <Text style={styles.verifyBtnLabel}>GO TO LOGIN</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={handleResend} disabled={loading} style={{ marginTop: 8 }}>
            <Text style={styles.resendLink}>{loading ? 'Sending…' : 'Resend verification email'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], gap: SPACING.lg }}>

            {/* Logo */}
            <View style={styles.logoArea}>
              <Text style={styles.logo}>BetTok</Text>
              <Text style={styles.tagline}>predict the next viral</Text>
            </View>

            {/* Mode toggle */}
            <View style={styles.modeToggle}>
              <Pressable style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]} onPress={() => switchMode('login')}>
                <Text style={[styles.modeBtnLabel, mode === 'login' && styles.modeBtnLabelActive]}>Login</Text>
              </Pressable>
              <Pressable style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]} onPress={() => switchMode('register')}>
                <Text style={[styles.modeBtnLabel, mode === 'register' && styles.modeBtnLabelActive]}>Register</Text>
              </Pressable>
            </View>

            {/* Fields */}
            <View style={styles.fields}>
              {mode === 'register' && (
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={16} color={COLORS.muted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Username"
                    placeholderTextColor={COLORS.muted}
                    value={username}
                    onChangeText={handleUsernameChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {usernameIcon()}
                </View>
              )}
              {mode === 'register' && usernameStatus === 'taken' && (
                <Text style={styles.usernameError}>Username taken — try another</Text>
              )}
              {mode === 'register' && usernameStatus === 'available' && (
                <Text style={styles.usernameSuccess}>Username available ✓</Text>
              )}

              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={16} color={COLORS.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor={COLORS.muted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={16} color={COLORS.muted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={mode === 'register' ? 'Password (min 6 characters)' : 'Password'}
                  placeholderTextColor={COLORS.muted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable onPress={() => setShowPassword(p => !p)} hitSlop={10}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.muted} />
                </Pressable>
              </View>
            </View>

            {/* Terms agreement — only on register */}
            {mode === 'register' && (
              <Pressable style={styles.termsRow} onPress={() => setAgreedToTerms(p => !p)}>
                <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}>
                  {agreedToTerms && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={styles.termsText}>
                  I agree to the{' '}
                  <Text style={styles.termsLink} onPress={() => navigation.navigate('Legal', { type: 'tos' })}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={styles.termsLink} onPress={() => navigation.navigate('Legal', { type: 'privacy' })}>Privacy Policy</Text>
                  , including the collection and commercial use of aggregated prediction data.
                </Text>
              </Pressable>
            )}

            {/* Submit */}
            <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
              <LinearGradient colors={['#FF3B5C','#CC1F3F']} style={styles.submitBtnGrad} start={[0,0]} end={[1,0]}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitLabel}>
                      {mode === 'login' ? 'ENTER THE ARENA' : 'CREATE ACCOUNT'}
                    </Text>
                }
              </LinearGradient>
            </Pressable>

            {mode === 'login' && (
              <Pressable onPress={handleResend} disabled={loading}>
                <Text style={styles.resendLink}>Didn't get a verification email? Resend</Text>
              </Pressable>
            )}

            {mode === 'register' && (
              <View style={styles.bonusHint}>
                <Text style={{ fontSize: 18 }}>⚡</Text>
                <Text style={styles.bonusHintText}>New accounts start with 1,000 free Sparks</Text>
              </View>
            )}

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

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

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  scroll:       { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xl },

  logoArea:     { alignItems: 'center', gap: 6 },
  logo:         { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 52, letterSpacing: 4 },
  tagline:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, letterSpacing: 2 },

  modeToggle:   { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  modeBtn:      { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: RADIUS.sm },
  modeBtnActive: { backgroundColor: COLORS.accent },
  modeBtnLabel:  { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14 },
  modeBtnLabelActive: { color: '#fff', fontWeight: '700' },

  fields:       { gap: SPACING.sm },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  inputIcon:    { marginRight: 8 },
  input:        { flex: 1, color: COLORS.text, fontFamily: FONTS.body, fontSize: 14, paddingVertical: 16 },
  usernameError:   { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 11, marginTop: -4 },
  usernameSuccess: { color: COLORS.yes,    fontFamily: FONTS.body, fontSize: 11, marginTop: -4 },

  termsRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  checkbox:     { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surfaceHigh, justifyContent: 'center', alignItems: 'center', marginTop: 1, flexShrink: 0 },
  checkboxActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  termsText:    { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12, lineHeight: 18, flex: 1 },
  termsLink:    { color: COLORS.accent, textDecorationLine: 'underline' },

  submitBtn:    { borderRadius: RADIUS.md, overflow: 'hidden' },
  submitBtnGrad: { paddingVertical: 18, alignItems: 'center' },
  submitLabel:  { color: '#fff', fontFamily: FONTS.body, fontSize: 14, fontWeight: '700', letterSpacing: 2 },

  resendLink:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  bonusHint:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.sparkGlow, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.spark + '33' },
  bonusHintText: { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 12 },

  verifyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg, gap: SPACING.md },
  verifyTitle:  { color: COLORS.text, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 2 },
  verifyText:   { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  verifyBtn:    { borderRadius: RADIUS.full, overflow: 'hidden', width: '100%' },
  verifyBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  verifyBtnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 2 },
});

const modalStyles = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: '#000000BB', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet:    { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  title:    { fontFamily: FONTS.display, fontSize: 20, letterSpacing: 1, textAlign: 'center' },
  message:  { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn:      { width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  btnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14 },
});
