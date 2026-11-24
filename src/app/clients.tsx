import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listClients, ClientSummary } from '../db/jobs';
import { vertical } from '../verticals';

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  useFocusEffect(useCallback(() => { setClients(listClients()); }, []));

  return (
    <View style={styles.container}>
      <FlatList
        data={clients}
        keyExtractor={(c) => c.name}
        ListEmptyComponent={<Text style={styles.empty}>No clients yet.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              router.push({ pathname: '/clients/[name]', params: { name: item.name } })
            }
          >
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {item.jobCount}{' '}
              {item.jobCount === 1
                ? vertical.terminology.job.toLowerCase()
                : vertical.terminology.jobPlural.toLowerCase()}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 80, color: '#666' },
  row: { padding: 16, borderBottomWidth: 1, borderColor: '#eee' },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#666', marginTop: 2 },
});
