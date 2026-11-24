// Web twin of weekly.ts. Local scheduled notifications are a native-app
// retention feature; the web preview does nothing (and keeps
// expo-notifications out of the web bundle entirely).
export async function requestNotificationPermission(): Promise<void> {}

export async function refreshWeeklySummary(): Promise<void> {}
