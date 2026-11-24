import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { listJobsByClient } from '../../db/jobs';
import { Job } from '../../types';
import { JobCard } from '../../components/job-card';
import { vertical } from '../../verticals';

export default function ClientJobsScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  useFocusEffect(useCallback(() => { setJobs(listJobsByClient(name)); }, [name]));

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: name }} />
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No {vertical.terminology.jobPlural.toLowerCase()} for this{' '}
            {vertical.terminology.client.toLowerCase()} yet.
          </Text>
        }
        renderItem={({ item }) => (
          <JobCard job={item} onPress={() => router.push(`/job/${item.id}`)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 80, color: '#666' },
});
