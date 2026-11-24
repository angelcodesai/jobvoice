import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { vertical } from '../verticals';
import { startupSync } from '../sync';
import { refreshWeeklySummary } from '../notifications/weekly';

export default function RootLayout() {
  // Background mirror pull/push once per app start; never blocks the UI.
  // The weekly summary is rescheduled with fresh counts on every launch.
  useEffect(() => {
    void startupSync();
    void refreshWeeklySummary();
  }, []);
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: vertical.appName }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ title: 'My business' }} />
      <Stack.Screen name="clients" options={{ title: vertical.terminology.clientPlural }} />
      {/* Static fallback title; the screen overrides it at runtime with the client name. */}
      <Stack.Screen name="clients/[name]" options={{ title: vertical.terminology.clientPlural }} />
      <Stack.Screen name="record" options={{ title: 'New voice note' }} />
      <Stack.Screen name="job/[id]" options={{ title: `Review ${vertical.terminology.job.toLowerCase()}` }} />
      <Stack.Screen name="job/[id]/quote" options={{ title: vertical.terminology.quote }} />
      <Stack.Screen name="paywall" options={{ title: 'Go Pro', presentation: 'modal' }} />
      <Stack.Screen name="restore" options={{ title: 'Restore data' }} />
    </Stack>
  );
}
