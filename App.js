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
import { useShareIntent } from 'expo-share-intent';
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

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

export const navigationRef = createNavigationContainerRef();

// Configure push notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

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
            Feed:        focused ? 'flash'        : 'flash-outline',
            Trending:    focused ? 'trending-up'  : 'trending-up-outline',
            Results:     focused ? 'trophy'       : 'trophy-outline',
            Leaderboard: focused ? 'podium'       : 'podium-outline',
            Profile:     focused ? 'person'       : 'person-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
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
  const { shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (!shareIntent) return;
    let sharedUrl = null;
    if (shareIntent.type === 'text' && shareIntent.text) {
      const m = shareIntent.text.match(/https?:\/\/[^\s]*tiktok[^\s]*/i)
             || shareIntent.text.match(/https?:\/\/vm\.tiktok[^\s]*/i)
             || shareIntent.text.match(/https?:\/\/[^\s]+/);
      if (m) sharedUrl = m[0].trim();
    } else if (shareIntent.type === 'url' && shareIntent.text) {
      sharedUrl = shareIntent.text.trim();
    }
    if (sharedUrl && navigationRef.isReady()) {
      navigationRef.navigate('Submit', { sharedUrl });
    }
    resetShareIntent();
  }, [shareIntent]);

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
    await callApi('/registerPushToken', { token: tokenData.data });
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
      Main: {
        screens: {
          Feed:        'feed',
          Trending:    'trending',
          Results:     'results',
          Leaderboard: 'leaderboard',
          Profile:     'profile',
        },
      },
      Submit: 'submit',
      Legal:  'legal',
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
