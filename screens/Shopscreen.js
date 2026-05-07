// screens/ShopScreen.js
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  ActivityIndicator, SafeAreaView, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

// ─── RevenueCat ────────────────────────────────────────────────────────────
// Install: npm install react-native-purchases
// Then rebuild: npx expo prebuild --clean && npx expo run:android
//
// Setup steps:
//  1. Create a RevenueCat account at revenuecat.com
//  2. Create a new project → add Android/iOS app
//  3. In Google Play Console: create in-app products with these product IDs:
//       sparks_100, sparks_500, sparks_1200, sparks_2800, sparks_6500
//  4. Paste your RevenueCat API key below (Settings → API Keys → Public SDK key)
//  5. In RevenueCat dashboard: create an Offering called "sparks_shop" and
//     attach the 5 products to it
// ──────────────────────────────────────────────────────────────────────────
let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch (_) {
  // react-native-purchases not installed yet — shop will show in demo mode
}

const REVENUECAT_API_KEY = 'YOUR_REVENUECAT_PUBLIC_KEY'; // replace this

// Fallback packages shown when RevenueCat isn't configured yet
const DEMO_PACKAGES = [
  { id: 'sparks_100',  sparks: 100,  price: '$0.99',  label: 'Starter',    icon: '⚡',  badge: null },
  { id: 'sparks_500',  sparks: 500,  price: '$3.99',  label: 'Popular',    icon: '🔥',  badge: 'POPULAR' },
  { id: 'sparks_1200', sparks: 1200, price: '$7.99',  label: 'Value Pack', icon: '💎',  badge: 'BEST VALUE' },
  { id: 'sparks_2800', sparks: 2800, price: '$14.99', label: 'Pro',        icon: '🚀',  badge: null },
  { id: 'sparks_6500', sparks: 6500, price: '$29.99', label: 'Whale',      icon: '🐳',  badge: null },
];

function SuccessModal({ visible, sparks, onClose }) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <Text style={modalStyles.emoji}>⚡</Text>
          <Text style={modalStyles.title}>Sparks Added!</Text>
          <Text style={modalStyles.message}>
            +{sparks?.toLocaleString()} Sparks have been added to your balance.
          </Text>
          <Pressable style={modalStyles.btn} onPress={onClose}>
            <Text style={modalStyles.btnLabel}>LET'S GO</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function PackageCard({ pkg, onBuy, buying }) {
  const isBuying = buying === pkg.id;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.packageCard,
        pkg.badge === 'BEST VALUE' && styles.packageCardHighlight,
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => onBuy(pkg)}
      disabled={!!buying}
    >
      {pkg.badge && (
        <View style={[styles.badge, pkg.badge === 'BEST VALUE' && styles.badgePrimary]}>
          <Text style={styles.badgeText}>{pkg.badge}</Text>
        </View>
      )}

      <View style={styles.packageLeft}>
        <Text style={styles.packageIcon}>{pkg.icon}</Text>
        <View>
          <Text style={styles.packageLabel}>{pkg.label}</Text>
          <Text style={styles.packageSparks}>
            <Ionicons name="flash" size={13} color={COLORS.spark} /> {pkg.sparks.toLocaleString()} Sparks
          </Text>
        </View>
      </View>

      <View style={[styles.priceBtn, isBuying && { opacity: 0.6 }]}>
        {isBuying
          ? <ActivityIndicator color={COLORS.bg} size="small" />
          : <Text style={styles.priceText}>{pkg.price}</Text>
        }
      </View>
    </Pressable>
  );
}

export default function ShopScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const fromBet    = route.params?.fromBet ?? false; // true when navigated from BetScreen

  const [packages, setPackages]   = useState(DEMO_PACKAGES);
  const [loading, setLoading]     = useState(true);
  const [buying, setBuying]       = useState(null);   // product id currently being purchased
  const [success, setSuccess]     = useState(null);   // sparks just bought

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    if (!Purchases) {
      setLoading(false);
      return;
    }
    try {
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
      const offerings = await Purchases.getOfferings();
      const offering  = offerings.current || offerings.all?.sparks_shop;

      if (offering?.availablePackages?.length) {
        const mapped = offering.availablePackages.map(pkg => {
          const sparksMap = {
            sparks_100:  100,
            sparks_500:  500,
            sparks_1200: 1200,
            sparks_2800: 2800,
            sparks_6500: 6500,
          };
          const productId = pkg.product.identifier;
          return {
            id:       productId,
            sparks:   sparksMap[productId] || 100,
            price:    pkg.product.priceString,
            label:    pkg.product.title || productId,
            icon:     sparksMap[productId] >= 6500 ? '🐳' : sparksMap[productId] >= 2800 ? '🚀' : sparksMap[productId] >= 1200 ? '💎' : sparksMap[productId] >= 500 ? '🔥' : '⚡',
            badge:    productId === 'sparks_1200' ? 'BEST VALUE' : productId === 'sparks_500' ? 'POPULAR' : null,
            _rcPkg:   pkg, // keep original for purchase
          };
        });
        setPackages(mapped);
      }
    } catch (err) {
      console.log('RevenueCat load error:', err);
      // Fall through to demo packages
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async (pkg) => {
    if (!Purchases) {
      Alert.alert(
        'Payments not configured',
        'react-native-purchases is not installed yet. Run:\n\nnpm install react-native-purchases\n\nthen rebuild the app.',
      );
      return;
    }

    setBuying(pkg.id);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg._rcPkg);

      // Purchase successful — tell your backend to credit the sparks
      // Your backend verifies the receipt server-side via RevenueCat webhooks
      // (set up a webhook in RevenueCat dashboard → your Supabase edge function)
      // For now we optimistically show success:
      setSuccess(pkg.sparks);
    } catch (err) {
      if (!err.userCancelled) {
        Alert.alert('Purchase failed', err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setBuying(null);
    }
  };

  const handleSuccessClose = () => {
    setSuccess(null);
    if (fromBet) navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={COLORS.muted} />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>SPARK SHOP</Text>
          <Text style={styles.headerSub}>fuel your predictions</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {fromBet && (
        <View style={styles.fromBetBanner}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.spark} />
          <Text style={styles.fromBetText}>
            You need more Sparks to place this bet
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>⚡</Text>
          <Text style={styles.heroTitle}>Sparks</Text>
          <Text style={styles.heroSub}>
            Use Sparks to place predictions. Win more by predicting correctly.
            Free daily bonus: +100 Sparks every 24h.
          </Text>
        </View>

        {/* Packages */}
        {loading
          ? <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
          : packages.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg} onBuy={handleBuy} buying={buying} />
            ))
        }

        {/* Legal */}
        <Text style={styles.legal}>
          Purchases are processed through the {'\n'}
          App Store / Google Play. Sparks are virtual currency{'\n'}
          with no cash value and cannot be refunded.
        </Text>

        {!Purchases && (
          <View style={styles.devNote}>
            <Ionicons name="code-slash-outline" size={14} color={COLORS.muted} />
            <Text style={styles.devNoteText}>
              Demo mode — install react-native-purchases to enable real payments
            </Text>
          </View>
        )}
      </ScrollView>

      <SuccessModal
        visible={!!success}
        sparks={success}
        onClose={handleSuccessClose}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { color: COLORS.accent, fontFamily: FONTS.display, fontSize: 20, letterSpacing: 3, textAlign: 'center' },
  headerSub: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10, letterSpacing: 1, textAlign: 'center' },
  fromBetBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.spark + '18', borderBottomWidth: 1, borderBottomColor: COLORS.spark + '44',
    paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  fromBetText: { color: COLORS.spark, fontFamily: FONTS.body, fontSize: 12 },
  content: { padding: SPACING.md, paddingBottom: 60, gap: SPACING.sm },
  hero: { alignItems: 'center', paddingVertical: SPACING.lg, gap: 8 },
  heroIcon: { fontSize: 52 },
  heroTitle: { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 36, letterSpacing: 2 },
  heroSub: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: SPACING.lg },
  packageCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    position: 'relative', overflow: 'hidden',
  },
  packageCardHighlight: { borderColor: COLORS.spark, backgroundColor: COLORS.spark + '08' },
  badge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 3,
    borderBottomLeftRadius: RADIUS.sm,
  },
  badgePrimary: { backgroundColor: COLORS.spark },
  badgeText: { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  packageLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  packageIcon: { fontSize: 32 },
  packageLabel: { color: COLORS.text, fontFamily: FONTS.body, fontSize: 14, fontWeight: '700' },
  packageSparks: { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 16, marginTop: 2 },
  priceBtn: {
    backgroundColor: COLORS.accent, paddingHorizontal: 18,
    paddingVertical: 10, borderRadius: RADIUS.md, minWidth: 72, alignItems: 'center',
  },
  priceText: { color: COLORS.bg, fontFamily: FONTS.body, fontSize: 14, fontWeight: '700' },
  legal: {
    color: COLORS.muted, fontFamily: FONTS.body, fontSize: 10,
    textAlign: 'center', lineHeight: 16, marginTop: SPACING.md,
  },
  devNote: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surfaceHigh, borderRadius: RADIUS.md,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  devNoteText: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 11, flex: 1 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center', padding: 32 },
  sheet: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 32, alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.border, width: '100%' },
  emoji: { fontSize: 56 },
  title: { color: COLORS.spark, fontFamily: FONTS.display, fontSize: 28, letterSpacing: 2 },
  message: { color: COLORS.muted, fontFamily: FONTS.body, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn: { backgroundColor: COLORS.accent, width: '100%', paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 4 },
  btnLabel: { color: COLORS.bg, fontFamily: FONTS.body, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
});
