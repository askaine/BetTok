// screens/ResetPasswordScreen.js
import React, { useState } from 'react';
import { View, TextInput, Pressable, Text, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordScreen({ navigation }) {
  const { updatePassword } = useAuth();
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]             = useState(false);

  const handleReset = async () => {
    if (password.length < 8) {
      Alert.alert('Password must be at least 8 characters'); return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match"); return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      Alert.alert('Done!', 'Your password has been updated.', [
        { text: 'OK', onPress: () => navigation.replace('Main') },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Could not update password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <TextInput
        placeholder="New password (min 8 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <TextInput
        placeholder="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      <Pressable onPress={handleReset} disabled={loading}>
        {loading
          ? <ActivityIndicator />
          : <Text>SET NEW PASSWORD</Text>}
      </Pressable>
    </View>
  );
}