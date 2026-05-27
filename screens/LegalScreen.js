// screens/LegalScreen.js
// Displays either Privacy Policy or Terms of Service
// Usage: navigation.navigate('Legal', { type: 'privacy' }) or { type: 'tos' }
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';

const LAST_UPDATED = 'May 24, 2026';
const COMPANY      = 'BetTok Ltd.';
const EMAIL        = 'bettoksupport@gmail.com';

const PRIVACY_POLICY = `
PRIVACY POLICY

Last Updated: ${LAST_UPDATED}

This Privacy Policy describes how ${COMPANY} ("BetTok," "we," "us," or "our") collects, uses, shares, and sells information about you when you use our mobile application and related services (collectively, the "Service").

PLEASE READ THIS POLICY CAREFULLY. BY USING THE SERVICE, YOU CONSENT TO THE PRACTICES DESCRIBED IN THIS POLICY, INCLUDING THE COMMERCIAL SALE OF AGGREGATED AND ANONYMIZED DATA DERIVED FROM YOUR ACTIVITY.

1. INFORMATION WE COLLECT

1.1 Information You Provide
— Email address and username upon registration
— Prediction selections (e.g., "Viral" or "Flop" votes)
— Qualitative insight tags (e.g., "trending sound," "strong hook") you submit alongside predictions
— Video category tags you apply during submission
— Any communications you send us

1.2 Information Collected Automatically
— Device identifiers (device type, OS version, unique device ID)
— App usage data (screens viewed, time spent, tap patterns, session duration)
— Prediction behavior (frequency, timing, accuracy rates, wager amounts)
— Push notification interaction data
— IP address and approximate geolocation (country/city level)
— Crash logs and performance diagnostics

1.3 Information From Third Parties
— We use TikWM (tikwm.com), a third-party service, to retrieve publicly available TikTok video metadata. We do not store any content; only URLs and metadata (view counts, like counts, upload dates) are stored.

2. HOW WE USE YOUR INFORMATION

We use the information we collect to:
— Operate, maintain, and improve the Service
— Process predictions and award virtual currency ("Sparks")
— Send push notifications (which you may disable at any time in device settings)
— Detect, investigate, and prevent fraud and abuse
— Aggregate and analyze prediction data for our B2B data products (see Section 3)
— Comply with legal obligations

3. COMMERCIAL DATA USE — WHAT WE SELL

THIS IS IMPORTANT. OUR PRIMARY BUSINESS MODEL IS B2B DATA MONETIZATION.

3.1 What We Sell
We aggregate and sell anonymized, de-identified data derived from user predictions to brands, marketing agencies, talent agencies, and content creators. This data includes:
— Aggregated trend predictions (e.g., "72% of users predicted this video category would go viral")
— Aggregated insight tags (e.g., "The top reason users predicted virality in Week 12 was 'trending sound'")
— Category-level prediction accuracy rates
— Demographic trend signals at aggregate/cohort level

3.2 What We Do NOT Sell
We do NOT sell:
— Your name, email address, or any directly identifying information
— Your individual prediction history linked to your identity
— Any data that could be used to identify you as an individual

3.3 De-identification Standard
Before any data is shared with third parties, it is aggregated across a minimum of 1,000 users and stripped of any personally identifiable information. We apply industry-standard de-identification techniques consistent with GDPR Recital 26.

4. SHARING YOUR INFORMATION

We may share your information with:
— Service providers who operate on our behalf (e.g., Supabase for database hosting, Expo for push notifications) under data processing agreements
— Law enforcement or regulators when required by law
— Acquirers in the event of a merger or acquisition (you will be notified)
— No other third parties receive your personal data

5. DATA RETENTION

— Account data: retained while your account is active, then deleted within 90 days of account deletion request
— Prediction data: retained indefinitely in aggregate/anonymized form for the data product
— Video metadata: deleted 3 days after resolution
— Push tokens: deleted upon account deletion

6. YOUR RIGHTS

6.1 GDPR Rights (EEA/UK Residents)
You have the right to: access your data, correct inaccurate data, request deletion, restrict processing, data portability, and object to processing for legitimate interests purposes (including our data monetization activity). To exercise these rights, email ${EMAIL}.

6.2 CCPA Rights (California Residents)
You have the right to: know what personal information is collected, know whether your personal information is sold or disclosed (and to whom), opt out of the sale of personal information, request deletion, and not be discriminated against for exercising your rights.

TO OPT OUT OF THE SALE OF AGGREGATED DATA DERIVED FROM YOUR ACTIVITY, EMAIL: ${EMAIL} with subject "CCPA Opt-Out." We will exclude your data from all future B2B data sales within 15 business days.

6.3 All Users
You may delete your account at any time from the Profile screen. We will delete your personal data within 30 days.

7. COOKIES AND TRACKING

Our mobile app does not use browser cookies. We use Supabase authentication tokens stored securely on your device. We use no third-party advertising trackers.

8. CHILDREN'S PRIVACY

The Service is not directed to children under 13 (or 16 in the EEA). We do not knowingly collect personal information from children. If you believe a child has provided us personal information, contact ${EMAIL}.

9. SECURITY

We implement industry-standard security measures including TLS encryption in transit and row-level security in our database. No system is 100% secure. Notify us immediately at ${EMAIL} if you suspect a breach.

10. INTERNATIONAL TRANSFERS

Your data is stored on servers located in the European Union (Supabase Frankfurt region). If you access the Service from outside the EU, your data may be transferred internationally under appropriate safeguards (Standard Contractual Clauses).

11. CHANGES TO THIS POLICY

We will notify you of material changes via push notification or prominent in-app notice at least 30 days before changes take effect. Continued use after that date constitutes acceptance.

12. CONTACT US

${COMPANY}
Email: ${EMAIL}

`;

const TERMS_OF_SERVICE = `
TERMS OF SERVICE

Last Updated: ${LAST_UPDATED}

These Terms of Service ("Terms") constitute a legally binding agreement between you and ${COMPANY} ("BetTok," "we," "us," or "our") governing your use of the BetTok mobile application and related services (the "Service").

BY CREATING AN ACCOUNT OR USING THE SERVICE, YOU AGREE TO THESE TERMS IN FULL. IF YOU DO NOT AGREE, DO NOT USE THE SERVICE.

1. ELIGIBILITY

You must be at least 13 years old (or 16 in the EEA/UK) to use the Service. By using the Service, you represent that you meet this requirement.

2. ACCOUNT

You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activity under your account. You may not share, sell, or transfer your account.

3. THE SERVICE — WHAT IT IS

BetTok is a prediction and forecasting platform where users predict whether publicly available TikTok videos will reach certain performance thresholds. The Service is intended for entertainment, data contribution, and community engagement purposes.

4. SPARKS — VIRTUAL CURRENCY

4.1 "Sparks" are a virtual in-app currency with no monetary value. They cannot be withdrawn, transferred, exchanged for cash or any real-world value, or used outside the Service.

4.2 We may modify, suspend, or discontinue Sparks at any time without liability.

4.3 Sparks are awarded for accurate predictions, daily check-ins, and watching optional rewarded advertisements. They are deducted when predictions are placed.

4.4 Sparks are not property. They are a limited license to access certain features of the Service.

5. PREDICTIONS — NOT GAMBLING

5.1 BetTok is a skill-based prediction and forecasting game, not a gambling service. We do not facilitate the wagering of real money. No real money changes hands.

5.2 Predictions are made using virtual currency (Sparks) only. There is no mechanism to convert Sparks to cash or real-world value.

5.3 We make no guarantee about the accuracy of any prediction outcome or the performance of any video.

6. USER CONTENT AND DATA — CRITICAL PROVISION

6.1 By using the Service, you grant BetTok a perpetual, irrevocable, worldwide, royalty-free, sublicensable license to use, reproduce, modify, aggregate, de-identify, and commercially exploit any data generated by your use of the Service (including prediction selections, insight tags, and behavioral data) for any lawful purpose, including sale to third parties as described in our Privacy Policy.

6.2 This license survives account deletion. De-identified, aggregated data that has already been incorporated into our data products cannot be recalled.

6.3 You acknowledge that providing qualitative insights (e.g., "this video will go viral because of its trending sound") is the primary contribution you make to the platform, and that such contributions, in aggregated and anonymized form, constitute the commercial value of the platform.

7. PROHIBITED CONDUCT

You may not:
— Submit videos you do not have the right to submit (we only use publicly available TikTok URLs)
— Create multiple accounts to manipulate predictions or the leaderboard
— Use bots, scripts, or automation to interact with the Service
— Attempt to reverse-engineer or scrape the Service
— Submit videos containing illegal content, nudity, hate speech, or content targeting minors
— Impersonate any person or entity
— Attempt to manipulate or game the Sparks system

8. SUBMITTED VIDEOS

8.1 You may only submit publicly available TikTok videos via their public URL. You do not upload video files.

8.2 We retrieve publicly available metadata using third-party tools. We are not responsible for the content of submitted videos.

8.3 We reserve the right to remove any video from the platform at our discretion, including in response to DMCA notices or community flags.

8.4 We are not affiliated with, endorsed by, or partnered with TikTok or ByteDance.

9. REWARDED ADVERTISEMENTS

The Service may display optional rewarded video advertisements from third-party ad networks. Watching these ads is entirely voluntary and earns you Sparks. We are not responsible for the content of third-party advertisements.

10. INTELLECTUAL PROPERTY

All rights in and to the Service (excluding user-generated data, which is governed by Section 6) are owned by BetTok. Our name, logo, and product names are our trademarks. You may not use them without our prior written consent.

11. DISCLAIMERS

THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE.

12. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY LAW, BETTOK SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY SHALL NOT EXCEED $100 USD.

13. INDEMNIFICATION

You agree to indemnify and hold BetTok harmless from any claims, damages, losses, and costs (including legal fees) arising from your use of the Service, violation of these Terms, or infringement of any third-party rights.

14. GOVERNING LAW AND DISPUTES

These Terms are governed by the laws of England and Wales. Any dispute shall first be submitted to binding mediation. If mediation fails, disputes shall be resolved by the courts of England and Wales.

15. TERMINATION

We may suspend or terminate your account at any time for violation of these Terms or for any other reason at our discretion. You may delete your account at any time from the Profile screen. Sections 6, 10, 11, 12, and 13 survive termination.

16. CHANGES TO TERMS

We will notify you of material changes via push notification or prominent in-app notice at least 14 days before changes take effect. Continued use constitutes acceptance.

17. CONTACT

${COMPANY}
Email: ${EMAIL}
`;

export default function LegalScreen() {
  const navigation = useNavigation();
  const route      = useRoute();
  const type       = route.params?.type || 'privacy';
  const isPrivacy  = type === 'privacy';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={COLORS.muted} />
        </Pressable>
        <Text style={styles.headerTitle}>{isPrivacy ? 'PRIVACY POLICY' : 'TERMS OF SERVICE'}</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.body}>{isPrivacy ? PRIVACY_POLICY : TERMS_OF_SERVICE}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bg },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.text, fontFamily: FONTS.display, fontSize: 14, letterSpacing: 2 },
  content:     { padding: SPACING.md, paddingBottom: 60 },
  body:        { color: COLORS.textSub, fontFamily: FONTS.body, fontSize: 12, lineHeight: 20 },
});
