// screens/AuthScreen.js
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

export default function AuthScreen() {
  const { login, register, resendVerification } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const handleSubmit = async () => {
    if (!email || !password) { Alert.alert('Fill in all fields'); return; }
    if (mode === 'register' && !username) { Alert.alert('Enter a username'); return; }
    if (password.length < 6) { Alert.alert('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, username);
        setVerificationSent(true);
      }
    } catch (err) {
      const msg =
        err.message?.includes('Email not confirmed') ? 'Please verify your email first. Check your inbox.'
        : err.message?.includes('Invalid login') ? 'Wrong email or password'
        : err.message?.includes('already registered') ? 'That email is already registered'
        : err.message || 'Something went wrong';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) { Alert.alert('Enter your email first'); return; }
    setLoading(true);
    try {
      await resendVerification(email);
      Alert.alert('Sent!', 'Check your inbox for the verification link.');
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (verificationSent) {
    return (
      <View style={styles.verifyContainer}>
        <Text style={styles.verifyIcon}>📧</Text>
        <Text style={styles.verifyTitle}>Check your email</Text>
        <Text style={styles.verifyText}>
          We sent a verification link to{'\n'}
          <Text style={{ color: COLORS.accent }}>{email}</Text>
          {'\n\n'}Click the link to activate your account, then come back to log in.
        </Text>
        <Pressable style={styles.submitBtn} onPress={() => { setVerificationSent(false); setMode('login'); }}>
          <Text style={styles.submitLabel}>GO TO LOGIN</Text>
        </Pressable>
        <Pressable style={styles.resendBtn} onPress={handleResend} disabled={loading}>
          <Text style={styles.resendLabel}>{loading ? 'Sending...' : 'Resend verification email'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        <View style={styles.logoArea}>
          <Text style={styles.logo}>BetTok</Text>
          <Text style={styles.tagline}>predict the next viral</Text>
        </View>
        <View style={styles.modeToggle}>
          <Pressable style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]} onPress={() => setMode('login')}>
            <Text style={[styles.modeBtnLabel, mode === 'login' && styles.modeBtnLabelActive]}>Login</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]} onPress={() => setMode('register')}>
            <Text style={[styles.modeBtnLabel, mode === 'register' && styles.modeBtnLabelActive]}>Register</Text>
          </Pressable>
        </View>
        <View style={styles.fields}>
          {mode === 'register' && (
            <TextInput style={styles.input} placeholder="Username" placeholderTextColor={COLORS.muted}
              value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          )}
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.muted}
            value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} placeholder="Password (min 6 characters)" placeholderTextColor={COLORS.muted}
            value={password} onChangeText={setPassword} secureTextEntry />
        </View>
        <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={COLORS.bg} />
            : <Text style={styles.submitLabel}>{mode === 'login' ? 'ENTER THE ARENA' : 'CREATE ACCOUNT'}</Text>}
        </Pressable>
        {mode === 'login' && (
          <Pressable onPress={handleResend} disabled={loading}>
            <Text style={styles.resendLabel}>Didn't get a verification email? Resend</Text>
          </Pressable>
        )}
        {mode === 'register' && (
          <Text style={styles.bonusHint}>⚡ New accounts start with 1,000 free Sparks</Text>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.lg },
  logoArea: { alignItems: 'center', marginBottom: SPACING.lg },
  logo: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 52, letterSpacing: 4 },
  tagline: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, letterSpacing: 2 },
  modeToggle: { flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: RADIUS.sm },
  modeBtnActive: { backgroundColor: COLORS.accent },
  modeBtnLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },
  modeBtnLabelActive: { color: COLORS.bg, fontWeight: '700' },
  fields: { gap: SPACING.sm },
  input: { backgroundColor: COLORS.surface, color: COLORS.text, fontFamily: FONTS.body, fontSize: 14, paddingHorizontal: SPACING.md, paddingVertical: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  submitBtn: { backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: RADIUS.md, alignItems: 'center' },
  submitLabel: { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 13, fontWeight: '700', letterSpacing: 2 },
  resendBtn: { alignItems: 'center' },
  resendLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  bonusHint: { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center' },
  verifyContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.lg, gap: SPACING.md },
  verifyIcon: { fontSize: 56 },
  verifyTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 2 },
  verifyText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});