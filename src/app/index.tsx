import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  checkConnection,
  lastDataUpdate,
  topScores,
  type ConnectionResult,
  type ConnectionStatus,
  type LastUpdate,
  type TopScore,
} from '@/lib/supabase';

const SIGNAL_NAMES: Record<string, string> = { wikipedia: 'Wikipedia', youtube: 'YouTube', twitch: 'Twitch' };

/** Plain-English reason for a score, e.g. "Heat: Wikipedia 3.7x normal". */
function describeScore(t: TopScore): string {
  const parts: string[] = [];
  if (t.heat > 0 && t.heatWinner) parts.push(`Heat: ${SIGNAL_NAMES[t.heatWinner] ?? t.heatWinner} ${t.heatRatio}x normal`);
  if (t.growth !== 0) parts.push(`Growth ${t.growth > 0 ? '+' : ''}${t.growth}`);
  if (t.milestones > 0) parts.push(`Milestones +${t.milestones}`);
  return parts.join(' · ') || 'A normal week';
}

function weekLabel(weekStart: string): string {
  return new Date(`${weekStart}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function describeUpdate(u: LastUpdate): string {
  if (!u) return 'No data update yet';
  const when = new Date(u.finishedAt);
  const today = new Date().toDateString() === when.toDateString();
  const day = today ? 'today' : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const flag = u.status === 'ok' ? '' : ` (${u.status})`;
  return `Last data update: ${day} · ${u.talentUpdated} talent updated${flag}`;
}

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
  const [update, setUpdate] = useState<LastUpdate>(null);
  const [top, setTop] = useState<TopScore[]>([]);

  useEffect(() => {
    checkConnection().then(setResult);
    lastDataUpdate().then(setUpdate);
    topScores(5).then(setTop);
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
      {result?.status === 'connected' && <Text style={styles.subText}>{describeUpdate(update)}</Text>}
      {top.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            Top 5 · week of {weekLabel(top[0].weekStart)}
            {top[0].isFinal ? '' : ' (so far)'}
          </Text>
          {top.map((t, i) => (
            <View key={t.name} style={styles.row}>
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{t.name}</Text>
                <Text style={styles.reason}>{describeScore(t)}</Text>
              </View>
              <Text style={styles.points}>{t.total.toFixed(1)}</Text>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 8, marginBottom: 32 },
  title: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  tagline: { color: '#A1A1AA', fontSize: 17 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: '#E4E4E7', fontSize: 15 },
  subText: { color: '#71717A', fontSize: 13, marginTop: 8 },
  card: { alignSelf: 'stretch', marginHorizontal: 20, marginTop: 28, padding: 16, borderRadius: 16, backgroundColor: '#16161D' },
  cardTitle: { color: '#A1A1AA', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  rank: { color: '#71717A', fontSize: 15, width: 16, textAlign: 'center' },
  rowBody: { flex: 1 },
  name: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  reason: { color: '#A1A1AA', fontSize: 12, marginTop: 2 },
  points: { color: '#22C55E', fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
