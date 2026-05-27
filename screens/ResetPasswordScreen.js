// screens/ResetPasswordScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useNavigation } from '@react-navigation/native';

export default function ResetPasswordScreen() {
  const navigation = useNavigation();
  const { updatePassword } = useAuth();

  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw,          setShowPw]          = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState(null);
  const [done,            setDone]            = useState(false);

  const handleReset = async () => {
    setError(null);
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }

    setLoading(true);
    try {
      await updatePassword(password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (err) {
      setError('Could not update password. The link may have expired. Request a new one from the login screen.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 56 }}>✅</Text>
          <Text style={styles.doneTitle}>Password updated!</Text>
          <Text style={styles.doneText}>You can now log in with your new password.</Text>
          <Pressable style={styles.btn} onPress={() => navigation.replace('Auth')}>
            <LinearGradient colors={['#FF3B5C', '#CC1F3F']} style={styles.btnGrad} start={[0,0]} end={[1,0]}>
              <Text style={styles.btnLabel}>GO TO LOGIN</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.center}>
          <Text style={{ fontSize: 48 }}>🔐</Text>
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.sub}>Choose a strong password — at least 6 characters.</Text>

          <View style={styles.fields}>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor={COLORS.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                autoComplete="new-password"
              />
              <Pressable onPress={() => setShowPw(p => !p)} hitSlop={10}>
                <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.muted} />
              </Pressable>
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.muted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={COLORS.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPw}
                autoComplete="new-password"
              />
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={14} color={COLORS.accent} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable style={[styles.btn, loading && { opacity: 0.6 }]} onPress={handleReset} disabled={loading}>
            <LinearGradient colors={['#FF3B5C', '#CC1F3F']} style={styles.btnGrad} start={[0,0]} end={[1,0]}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnLabel}>SET NEW PASSWORD</Text>
              }
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.bg },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg, gap: SPACING.md },
  title:      { color: COLORS.text, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 1, textAlign: 'center' },
  sub:        { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  doneTitle:  { color: COLORS.yes,  fontFamily: FONTS.display, fontSize: 28 },
  doneText:   { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center' },
  fields:     { width: '100%', gap: SPACING.sm },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm },
  input:      { flex: 1, color: COLORS.text, fontFamily: FONTS.body, fontSize: 14, paddingVertical: 16 },
  errorBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: COLORS.accentGlow, borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.accent + '44', width: '100%' },
  errorText:  { color: COLORS.accent, fontFamily: FONTS.body, fontSize: 12, flex: 1, lineHeight: 18 },
  btn:        { borderRadius: RADIUS.full, overflow: 'hidden', width: '100%' },
  btnGrad:    { paddingVertical: 16, alignItems: 'center' },
  btnLabel:   { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 2 },
});
