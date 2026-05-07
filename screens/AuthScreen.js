// screens/AuthScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export default function AuthScreen() {
  const { login, register, resendVerification, resetPassword } = useAuth();

  // mode: 'login' | 'register' | 'forgot'
  const [mode, setMode]                   = useState('login');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername]           = useState('');
  const [loading, setLoading]             = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resetSent, setResetSent]         = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // Clear sensitive fields when switching modes to avoid state bleed.
  const switchMode = (newMode) => {
    setPassword('');
    setConfirmPassword('');
    setMode(newMode);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Login / Register submit
  // ─────────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmedEmail    = email.trim();
    const trimmedUsername = username.trim();

    // Shared validation
    if (!trimmedEmail) {
      Alert.alert('Validation', 'Please enter your email'); return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      Alert.alert('Validation', 'Please enter a valid email address'); return;
    }
    if (!password) {
      Alert.alert('Validation', 'Please enter a password'); return;
    }
    if (password.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters'); return;
    }

    // Register-only validation
    if (mode === 'register') {
      if (!trimmedUsername) {
        Alert.alert('Validation', 'Please enter a username'); return;
      }
      if (!USERNAME_REGEX.test(trimmedUsername)) {
        Alert.alert('Validation', 'Username must be 3–20 characters: letters, numbers, and underscores only');
        return;
      }
      if (password !== confirmPassword) {
        Alert.alert('Validation', "Passwords don't match — please re-enter them");
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(trimmedEmail, password);
      } else {
        await register(trimmedEmail, password, trimmedUsername);
        setVerificationSent(true);
      }
    } catch (err) {
      const raw = err.message || '';
      const msg =
        raw.includes('Email not confirmed')
          ? 'Please verify your email first. Check your inbox.'
        : raw.includes('Invalid login') || raw.includes('invalid_credentials')
          ? 'Wrong email or password'
        : raw.includes('already registered') || raw.includes('already been registered')
          ? 'That email is already registered. Try logging in.'
        : raw.includes('3–20 characters')
          ? raw   // surface our own validation message from AuthContext
        : 'Something went wrong. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Forgot password
  // ─────────────────────────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Validation', 'Enter your email address first'); return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      Alert.alert('Validation', 'Please enter a valid email address'); return;
    }
    setLoading(true);
    try {
      await resetPassword(trimmedEmail);
      setResetSent(true);
    } catch (err) {
      Alert.alert('Error', 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Resend verification
  // ─────────────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Validation', 'Enter your email first'); return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      Alert.alert('Validation', 'Please enter a valid email address'); return;
    }
    setLoading(true);
    try {
      await resendVerification(trimmedEmail);
      Alert.alert('Sent!', 'Check your inbox for the verification link.');
    } catch (err) {
      Alert.alert('Error', 'Could not resend. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Verification sent screen
  // ─────────────────────────────────────────────────────────────────────────
  if (verificationSent) {
    return (
      <View style={styles.verifyContainer}>
        <Text style={styles.verifyIcon}>📧</Text>
        <Text style={styles.verifyTitle}>Check your email</Text>
        <Text style={styles.verifyText}>
          We sent a verification link to{'\n'}
          <Text style={{ color: COLORS.accent }}>{email.trim()}</Text>
          {'\n\n'}Click the link to activate your account, then come back to log in.
        </Text>
        <Pressable
          style={styles.submitBtn}
          onPress={() => { setVerificationSent(false); switchMode('login'); }}
        >
          <Text style={styles.submitLabel}>GO TO LOGIN</Text>
        </Pressable>
        <Pressable style={styles.resendBtn} onPress={handleResend} disabled={loading}>
          <Text style={styles.resendLabel}>{loading ? 'Sending...' : 'Resend verification email'}</Text>
        </Pressable>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Password reset sent screen
  // ─────────────────────────────────────────────────────────────────────────
  if (resetSent) {
    return (
      <View style={styles.verifyContainer}>
        <Text style={styles.verifyIcon}>🔑</Text>
        <Text style={styles.verifyTitle}>Check your email</Text>
        <Text style={styles.verifyText}>
          We sent a password reset link to{'\n'}
          <Text style={{ color: COLORS.accent }}>{email.trim()}</Text>
          {'\n\n'}Open the link on this device to be taken back into the app to set your new password.
        </Text>
        <Pressable
          style={styles.submitBtn}
          onPress={() => { setResetSent(false); switchMode('login'); }}
        >
          <Text style={styles.submitLabel}>BACK TO LOGIN</Text>
        </Pressable>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Forgot password screen
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
          <View style={styles.logoArea}>
            <Text style={styles.logo}>BetTok</Text>
            <Text style={styles.tagline}>reset your password</Text>
          </View>
          <View style={styles.fields}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>
          <Pressable style={styles.submitBtn} onPress={handleForgotPassword} disabled={loading}>
            {loading
              ? <ActivityIndicator color={COLORS.bg} />
              : <Text style={styles.submitLabel}>SEND RESET LINK</Text>}
          </Pressable>
          <Pressable onPress={() => switchMode('login')} disabled={loading}>
            <Text style={[styles.resendLabel, { textAlign: 'center' }]}>← Back to login</Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main login / register screen
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>

        <View style={styles.logoArea}>
          <Text style={styles.logo}>BetTok</Text>
          <Text style={styles.tagline}>predict the next viral</Text>
        </View>

        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
            onPress={() => switchMode('login')}
          >
            <Text style={[styles.modeBtnLabel, mode === 'login' && styles.modeBtnLabelActive]}>
              Login
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
            onPress={() => switchMode('register')}
          >
            <Text style={[styles.modeBtnLabel, mode === 'register' && styles.modeBtnLabelActive]}>
              Register
            </Text>
          </Pressable>
        </View>

        <View style={styles.fields}>
          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Username (3–20 chars, letters / numbers / _)"
              placeholderTextColor={COLORS.muted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={COLORS.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={COLORS.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && (
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={COLORS.muted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
            />
          )}
        </View>

        <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color={COLORS.bg} />
            : <Text style={styles.submitLabel}>
                {mode === 'login' ? 'ENTER THE ARENA' : 'CREATE ACCOUNT'}
              </Text>}
        </Pressable>

        {mode === 'login' && (
          <View style={styles.loginFooter}>
            <Pressable onPress={() => switchMode('forgot')} disabled={loading}>
              <Text style={styles.resendLabel}>Forgot password?</Text>
            </Pressable>
            <Pressable onPress={handleResend} disabled={loading}>
              <Text style={styles.resendLabel}>Didn't get a verification email? Resend</Text>
            </Pressable>
          </View>
        )}

        {mode === 'register' && (
          <Text style={styles.bonusHint}>⚡ New accounts start with 1,000 free Sparks</Text>
        )}

      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.bg },
  inner:            { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.lg },
  logoArea:         { alignItems: 'center', marginBottom: SPACING.lg },
  logo:             { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 52, letterSpacing: 4 },
  tagline:          { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, letterSpacing: 2 },
  modeToggle:       { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  modeBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  modeBtnActive:    { backgroundColor: COLORS.accent },
  modeBtnLabel:     { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  modeBtnLabelActive: { color: COLORS.bg, fontWeight: '700' },
  fields:           { gap: SPACING.sm },
  input:            { backgroundColor: COLORS.surface, color: COLORS.text, fontFamily: FONTS.body, fontSize: 14, paddingHorizontal: SPACING.md, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  submitBtn:        { backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: RADIUS.md, alignItems: 'center' },
  submitLabel:      { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  resendBtn:        { alignItems: 'center' },
  resendLabel:      { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  bonusHint:        { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  loginFooter:      { gap: SPACING.sm, alignItems: 'center' },
  verifyContainer:  { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.md },
  verifyIcon:       { fontSize: 56 },
  verifyTitle:      { color: COLORS.text, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 2 },
  verifyText:       { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});