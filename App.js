// App.js
import React, { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useShareIntent } from 'expo-share-intent';

import { AuthProvider, useAuth } from './context/AuthContext';
import { COLORS } from './theme';

import FeedScreen         from './screens/FeedScreen';
import TrendingScreen     from './screens/TrendingScreen';
import LeaderboardScreen  from './screens/LeaderboardScreen';
import ProfileScreen      from './screens/ProfileScreen';
import SubmitVideoScreen  from './screens/SubmitVideoScreen';
import BetScreen          from './screens/BetScreen';
import AuthScreen         from './screens/AuthScreen';
import ResultsScreen      from './screens/Resultsscreen';
import ShopScreen         from './screens/Shopscreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import VideoScreen        from './screens/VideoScreen';

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Ref so we can navigate from outside React tree (share intent handler)
export const navigationRef = createNavigationContainerRef();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor:   COLORS.accent,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'SpaceMono', marginTop: 2 },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Feed:        'flash',
            Trending:    'trending-up',
            Results:     'trophy-outline',
            Leaderboard: 'trophy',
            Profile:     'person',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed"        component={FeedScreen} />
      <Tab.Screen name="Trending"    component={TrendingScreen} />
      <Tab.Screen name="Results"     component={ResultsScreen} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile"     component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// Handles share intent — extracts TikTok URL and navigates to Submit
function ShareIntentHandler() {
  const { shareIntent, resetShareIntent } = useShareIntent();

  useEffect(() => {
    if (!shareIntent) return;

    // Extract TikTok URL from shared text
    let sharedUrl = null;

    if (shareIntent.type === 'text' && shareIntent.text) {
      // TikTok shares as plain text containing the URL
      const urlMatch = shareIntent.text.match(/https?:\/\/[^\s]+tiktok[^\s]*/i)
        || shareIntent.text.match(/https?:\/\/vm\.tiktok[^\s]*/i)
        || shareIntent.text.match(/https?:\/\/[^\s]+/);
      if (urlMatch) sharedUrl = urlMatch[0].trim();
    } else if (shareIntent.type === 'url' && shareIntent.text) {
      sharedUrl = shareIntent.text.trim();
    }

    if (sharedUrl) {
      // Navigate to Submit screen with the URL pre-filled
      if (navigationRef.isReady()) {
        navigationRef.navigate('Submit', { sharedUrl });
      }
    }

    resetShareIntent();
  }, [shareIntent]);

  return null;
}

function RootNavigator() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <>
      <ShareIntentHandler />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Auth"          component={AuthScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main"   component={MainTabs} />
            <Stack.Screen name="Bet"    component={BetScreen}    options={{ presentation: 'modal' }} />
            <Stack.Screen name="Shop"   component={ShopScreen}   options={{ presentation: 'modal' }} />
            <Stack.Screen name="Submit" component={SubmitVideoScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Video"  component={VideoScreen}  options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

const linking = {
  prefixes: [Linking.createURL('/'), 'bettok://'],
  config: {
    screens: {
      ResetPassword: 'reset-password',
      Main: { screens: { Feed: 'feed' } },
      Submit: 'submit',
    },
  },
};

export default function App() {
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