import { Text, Pressable, StyleSheet } from 'react-native';
import { Job } from '../types';

const statusLabel: Record<Job['status'], string> = {
  draft: '📝 Draft', quoted: '📤 Quoted', won: '✅ Won', done: '🏁 Done',
};

export function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Text style={styles.title}>{job.title}</Text>
      <Text style={styles.meta}>
        {job.clientName ? `${job.clientName} · ` : ''}{statusLabel[job.status]}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#666', marginTop: 2 },
});
