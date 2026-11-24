import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Platform } from 'react-native';
import { Link, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { listJobs } from '../db/jobs';
import { isOnboarded } from '../db/profile';
import { Job } from '../types';
import { vertical } from '../verticals';
import { JobCard } from '../components/job-card';

export default function HomeScreen() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  useFocusEffect(useCallback(() => { setJobs(listJobs()); }, []));

  // After all hooks (rules of hooks). Web never redirects: the preview store
  // is ephemeral, so onboarding there would loop on every page load.
  if (Platform.OS !== 'web' && !isOnboarded()) return <Redirect href="/onboarding" />;

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <View style={styles.webBanner}>
          <Text style={styles.webBannerText}>Web preview — data is not saved.</Text>
        </View>
      )}
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        ListEmptyComponent={
          <Text style={styles.empty}>{vertical.terminology.emptyState}</Text>
        }
        renderItem={({ item }) => (
          <JobCard job={item} onPress={() => router.push(`/job/${item.id}`)} />
        )}
      />
      <View style={styles.footer}>
        <Link href="/profile" asChild>
          <Pressable style={styles.secondary}><Text>⚙️ My business</Text></Pressable>
        </Link>
        <Pressable
          style={styles.secondary}
          accessibilityLabel={vertical.terminology.clientPlural}
          onPress={() => router.push('/clients')}
        >
          <Text>👥</Text>
        </Pressable>
        <Pressable
          style={[styles.recordBtn, { backgroundColor: vertical.primaryColor }]}
          onPress={() => router.push('/record')}
        >
          <Text style={styles.recordText}>{vertical.terminology.newNoteCta}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webBanner: { backgroundColor: '#fff8e1', paddingVertical: 6, paddingHorizontal: 12 },
  webBannerText: { color: '#8a6d00', fontSize: 12, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 80, color: '#666', lineHeight: 24 },
  footer: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'center' },
  secondary: { padding: 12 },
  recordBtn: {
    flex: 1, borderRadius: 24,
    padding: 16, alignItems: 'center',
  },
  recordText: { color: 'white', fontSize: 16, fontWeight: '700' },
});
