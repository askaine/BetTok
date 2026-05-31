// App.js
import React, { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFonts, Oswald_600SemiBold } from '@expo-google-fonts/oswald';
import { SpaceMono_400Regular } from '@expo-google-fonts/space-mono';

import { AuthProvider, useAuth } from './context/AuthContext';
import { callApi } from './Supabaseconfig';
import { COLORS } from './theme';

import FeedScreen          from './screens/FeedScreen';
import TrendingScreen      from './screens/TrendingScreen';
import ResultsScreen       from './screens/Resultsscreen';
import LeaderboardScreen   from './screens/LeaderboardScreen';
import ProfileScreen       from './screens/ProfileScreen';
import SubmitVideoScreen   from './screens/SubmitVideoScreen';
import BetScreen           from './screens/BetScreen';
import AuthScreen          from './screens/AuthScreen';
import OnboardingScreen    from './screens/OnboardingScreen';
import VideoScreen         from './screens/VideoScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import LegalScreen         from './screens/LegalScreen';
import AdminScreen         from './screens/AdminScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export const navigationRef = createNavigationContainerRef();

// Configure push notification display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

// ── Helper: extract TikTok URL from any text ───────────────
function extractTikTokUrl(text) {
  if (!text) return null;
  const patterns = [
    /https?:\/\/(?:www\.)?tiktok\.com\/[^\s]+/i,
    /https?:\/\/vm\.tiktok\.com\/[^\s]+/i,
    /https?:\/\/m\.tiktok\.com\/[^\s]+/i,
    /https?:\/\/vt\.tiktok\.com\/[^\s]+/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

// ── Main Tab Navigator ─────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor:  COLORS.bg,
          borderTopColor:   COLORS.border,
          borderTopWidth:   1,
          paddingBottom:    10,
          paddingTop:       8,
          height:           68,
        },
        tabBarActiveTintColor:   COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'SpaceMono_400Regular', marginTop: 2 },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            Feed:        ['flash',       'flash-outline'],
            Trending:    ['trending-up', 'trending-up-outline'],
            Results:     ['trophy',      'trophy-outline'],
            Leaderboard: ['podium',      'podium-outline'],
            Profile:     ['person',      'person-outline'],
          };
          const [activeIcon, inactiveIcon] = icons[route.name] || ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? activeIcon : inactiveIcon} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed"        component={FeedScreen}        options={{ tabBarLabel: 'Feed' }} />
      <Tab.Screen name="Trending"    component={TrendingScreen}    options={{ tabBarLabel: 'Hot' }} />
      <Tab.Screen name="Results"     component={ResultsScreen}     options={{ tabBarLabel: 'Results' }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} options={{ tabBarLabel: 'Ranks' }} />
      <Tab.Screen name="Profile"     component={ProfileScreen}     options={{ tabBarLabel: 'Me' }} />
    </Tab.Navigator>
  );
}

// ── Share Intent Handler ───────────────────────────────────
function ShareIntentHandler() {
  const handled = React.useRef(null);

  let useShareIntent = null;
  try {
    useShareIntent = require('expo-share-intent').useShareIntent;
  } catch (_) {}

  const shareIntentHook = useShareIntent ? useShareIntent() : null;

  useEffect(() => {
    if (!shareIntentHook?.shareIntent) return;
    const { shareIntent, resetShareIntent } = shareIntentHook;

    let sharedUrl = null;
    if (shareIntent.type === 'text' || shareIntent.type === 'url') {
      sharedUrl = extractTikTokUrl(shareIntent.text || '');
    }

    if (sharedUrl && sharedUrl !== handled.current) {
      handled.current = sharedUrl;
      setTimeout(() => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Submit', { sharedUrl });
        }
      }, 300);
    }

    resetShareIntent();
  }, [shareIntentHook?.shareIntent]);

  // Method 2: Deep link fallback (bettok://submit?url=...)
  useEffect(() => {
    const handleUrl = ({ url }) => {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (parsed.pathname === '/submit' || parsed.host === 'submit') {
          const tiktokUrl = parsed.searchParams.get('url');
          if (tiktokUrl && navigationRef.isReady()) {
            setTimeout(() => {
              navigationRef.navigate('Submit', { sharedUrl: tiktokUrl });
            }, 300);
          }
        }
        if (parsed.pathname === '/reset-password' || parsed.host === 'reset-password') {
          if (navigationRef.isReady()) {
            navigationRef.navigate('ResetPassword');
          }
        }
      } catch (_) {}
    };

    Linking.getInitialURL().then(url => { if (url) handleUrl({ url }); });

    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub?.remove();
  }, []);

  return null;
}

// ── Push notification registration ────────────────────────
async function registerPushToken() {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    if (tokenData?.data) {
      await callApi('/registerPushToken', { token: tokenData.data });
    }
  } catch (_) {}
}

// ── Root Navigator ─────────────────────────────────────────
function RootNavigator() {
  const { user, loading } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then(val => {
      setOnboardingDone(val === '1');
    });
  }, []);

  useEffect(() => {
    if (user) registerPushToken();
  }, [user]);

  if (loading || onboardingDone === null) return null;

  if (!onboardingDone) {
    return <OnboardingScreen onDone={() => setOnboardingDone(true)} />;
  }

  return (
    <>
      <ShareIntentHandler />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Auth"          component={AuthScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
            <Stack.Screen name="Legal"         component={LegalScreen} options={{ presentation: 'modal' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main"   component={MainTabs} />
            <Stack.Screen name="Bet"    component={BetScreen}          options={{ presentation: 'modal' }} />
            <Stack.Screen name="Submit" component={SubmitVideoScreen}  options={{ presentation: 'modal' }} />
            <Stack.Screen name="Video"  component={VideoScreen}        options={{ presentation: 'modal' }} />
            <Stack.Screen name="Legal"  component={LegalScreen}        options={{ presentation: 'modal' }} />
            <Stack.Screen name="Admin"  component={AdminScreen}        options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

// ── Deep link config ───────────────────────────────────────
const linking = {
  prefixes: [Linking.createURL('/'), 'bettok://'],
  config: {
    screens: {
      Auth:          'auth',
      ResetPassword: 'reset-password',
      Submit:        'submit',
      Legal:         'legal',
      Main: {
        screens: {
          Feed:        'feed',
          Trending:    'trending',
          Results:     'results',
          Leaderboard: 'leaderboard',
          Profile:     'profile',
        },
      },
    },
  },
};

// ── Root App ───────────────────────────────────────────────
export default function App() {
  const [fontsLoaded] = useFonts({
    Oswald_600SemiBold,
    SpaceMono_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NavigationContainer linking={linking} ref={navigationRef}>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}