// screens/OnboardingScreen.js
import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  Dimensions, FlatList, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    emoji: '🎬',
    title: 'Predict the\nNext Viral',
    body: 'TikTok videos blow up every day. We give you a chance to call it before it happens — and earn rewards for being right.',
    gradient: ['#FF3B5C', '#CC1F3F'],
    accent: COLORS.accent,
  },
  {
    id: '2',
    emoji: '⚡',
    title: 'Earn Sparks\nfor Free',
    body: 'Every correct prediction earns you Sparks. Log in daily for your free bonus. Build streaks for bigger rewards.',
    gradient: ['#FFB800', '#FF8C00'],
    accent: COLORS.spark,
  },
  {
    id: '3',
    emoji: '🧠',
    title: 'Your Insight\nMatters',
    body: 'When you predict, you tag WHY — trending sound, strong hook, viral topic. Your reasoning powers real market intelligence.',
    gradient: ['#7C3AED', '#5B21B6'],
    accent: COLORS.purple,
  },
  {
    id: '4',
    emoji: '🏆',
    title: 'Compete &\nDominate',
    body: 'Weekly leaderboards. Badges for streaks, accuracy, and rare calls. Become the top predictor in your region.',
    gradient: ['#00E87A', '#00A855'],
    accent: COLORS.yes,
  },
];

export default function OnboardingScreen({ onDone }) {
  const flatRef  = useRef(null);
  const scrollX  = useRef(new Animated.Value(0)).current;
  const [index,  setIndex]  = useState(0);

  const slide = SLIDES[index];

  const goNext = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (index < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      await AsyncStorage.setItem('onboarding_done', '1');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    }
  };

  const skip = async () => {
    await AsyncStorage.setItem('onboarding_done', '1');
    onDone();
  };

  const onViewable = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setIndex(viewableItems[0].index ?? 0);
  }).current;

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Skip */}
      {!isLast && (
        <Pressable style={styles.skipBtn} onPress={skip}>
          <Text style={styles.skipLabel}>Skip</Text>
        </Pressable>
      )}

      {/* Slides */}
      <Animated.FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            {/* Big emoji in a gradient circle */}
            <LinearGradient
              colors={item.gradient}
              style={styles.emojiCircle}
              start={[0, 0]} end={[1, 1]}
            >
              <Text style={styles.emoji}>{item.emoji}</Text>
            </LinearGradient>

            <Text style={[styles.title, { color: item.accent }]}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((s, i) => {
          const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
          const width = scrollX.interpolate({ inputRange, outputRange: [8, 28, 8], extrapolate: 'clamp' });
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
          return (
            <Animated.View
              key={i}
              style={[styles.dot, { width, opacity, backgroundColor: SLIDES[index]?.accent || COLORS.accent }]}
            />
          );
        })}
      </View>

      {/* CTA button */}
      <Pressable style={styles.btn} onPress={goNext}>
        <LinearGradient
          colors={slide.gradient}
          style={styles.btnGrad}
          start={[0, 0]} end={[1, 0]}
        >
          <Text style={styles.btnLabel}>
            {isLast ? 'GET STARTED' : 'NEXT'}
          </Text>
          <Ionicons
            name={isLast ? 'rocket-outline' : 'arrow-forward'}
            size={18}
            color={isLast ? '#000' : '#fff'}
          />
        </LinearGradient>
      </Pressable>

      {/* Data use notice on last slide */}
      {isLast && (
        <Text style={styles.notice}>
          By continuing you agree to our Terms of Service and Privacy Policy.
          {'\n'}Your prediction data may be used for analytics.
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center' },

  skipBtn:   { position: 'absolute', top: 56, right: SPACING.lg, zIndex: 10, padding: 8 },
  skipLabel: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13 },

  slide: {
    width: W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: 24,
    paddingTop: 40,
  },

  emojiCircle: {
    width: 140, height: 140, borderRadius: 70,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  emoji: { fontSize: 64 },

  title: {
    fontFamily: FONTS.display,
    fontSize: 38,
    letterSpacing: 1,
    textAlign: 'center',
    lineHeight: 46,
  },
  body: {
    color: COLORS.textSub,
    fontFamily: FONTS.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
  },

  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  dot:     { height: 8, borderRadius: 4 },

  btn:     { borderRadius: RADIUS.full, overflow: 'hidden', width: W - 48, marginBottom: 8 },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  btnLabel: { color: '#fff', fontFamily: FONTS.body, fontWeight: '700', fontSize: 16, letterSpacing: 2 },

  notice: {
    color: COLORS.muted,
    fontFamily: FONTS.body,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
});
