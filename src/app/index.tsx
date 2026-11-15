import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkConnection, type ConnectionResult, type ConnectionStatus } from '@/lib/supabase';

const STATUS_TEXT: Record<ConnectionStatus | 'checking', { label: string; color: string }> = {
  checking: { label: 'Checking database…', color: '#9CA3AF' },
  connected: { label: 'Database connected', color: '#22C55E' },
  'no-tables': { label: 'Database connected · tables not set up yet', color: '#F59E0B' },
  'missing-keys': { label: 'Database keys not added yet', color: '#F59E0B' },
  'bad-key': { label: 'Database key rejected', color: '#EF4444' },
  unreachable: { label: 'Can’t reach database', color: '#EF4444' },
};

export default function HomeScreen() {
  const [result, setResult] = useState<ConnectionResult | null>(null);

  useEffect(() => {
    checkConnection().then(setResult);
  }, []);

  const s = STATUS_TEXT[result?.status ?? 'checking'];
  const label =
    result?.status === 'connected' ? `${s.label} · ${result.talentCount} talent` : s.label;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>DayOnes</Text>
        <Text style={styles.tagline}>Draft them before they blow up.</Text>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: s.color }]} />
        <Text style={styles.statusText}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 8, marginBottom: 48 },
  title: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  tagline: { color: '#A1A1AA', fontSize: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#E4E4E7', fontSize: 15 },
});
