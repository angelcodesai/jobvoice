// Local weekly retention nudge. Rescheduled on every app launch with fresh
// counts; no push infrastructure. Silently disabled without notification
// permission. Web twin (weekly.web.ts) is a no-op — expo-notifications never
// enters the web bundle.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { countByStatusSince } from '../db/jobs';
import { vertical } from '../verticals';

const WEEKLY_ID = 'weekly-summary';
const CHANNEL_ID = 'default';

// Onboarding calls this instead of importing expo-notifications directly so
// the web build resolves the .web.ts no-op twin and never bundles the module.
export async function requestNotificationPermission(): Promise<void> {
  try {
    // Result intentionally ignored: refreshWeeklySummary re-checks on every
    // launch and stays silent if permission was denied.
    await Notifications.requestPermissionsAsync();
  } catch (err) {
    console.warn('Notification permission request failed', err);
  }
}

export async function refreshWeeklySummary(): Promise<void> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return;
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { quoted, won } = countByStatusSince(weekAgo);
    const body = quoted === 0
      ? `Got a ${vertical.terminology.job.toLowerCase()} coming up? Quote it by voice in under a minute.`
      : `You quoted ${quoted} ${quoted === 1 ? vertical.terminology.job.toLowerCase() : vertical.terminology.jobPlural.toLowerCase()} last week — ${won} won 🎉`;
    if (Platform.OS === 'android') {
      // Android 8+ requires a channel before any notification can post.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.cancelScheduledNotificationAsync(WEEKLY_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: WEEKLY_ID,
      content: { title: vertical.appName, body },
      // SDK 57 WeeklyTriggerInput: fires every week at weekday/hour/minute
      // (always repeating — the type has no `repeats` field). Weekday follows
      // the UNCalendar convention: 1 = Sunday, so 2 = Monday.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        channelId: CHANNEL_ID,
        weekday: 2, // Monday
        hour: 8,
        minute: 0,
      },
    });
  } catch (e) {
    console.warn('weekly summary scheduling skipped', e);
  }
}
