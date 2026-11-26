import './src/background'; // defines the background task at module scope
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { computeInsight, describeWarning } from '@smart-expense/engine';
import { connectGmail, disconnectGmail, restoreGmail } from './src/gmail/auth';
import { enableBackgroundSync, disableBackgroundSync } from './src/background';
import { runGmailSync } from './src/syncRunner';
import { store } from './src/store';
import { fromStored, type StoredTransaction } from './src/transactions';

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [txs, setTxs] = useState<StoredTransaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  const reload = useCallback(async () => setTxs(await store.loadTransactions()), []);

  const sync = useCallback(async () => {
    setBusy(true);
    setStatus('Syncing Gmail…');
    try {
      const r = await runGmailSync();
      setStatus(`Scanned ${r.scanned} alert email(s), ${r.added} new transaction(s)` +
        (r.unparsed ? `, ${r.unparsed} not understood yet` : '') + (r.more ? ' — more to import' : ''));
      await reload();
    } catch (e) {
      setStatus(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [reload]);

  useEffect(() => {
    (async () => {
      await reload();
      const restored = await restoreGmail().catch(() => null);
      setEmail(restored);
      if (restored) {
        await enableBackgroundSync();
        await sync();
      }
    })();
  }, [reload, sync]);

  const onConnect = async () => {
    const r = await connectGmail();
    if (r.status === 'connected') {
      setEmail(r.email);
      await enableBackgroundSync();
      await sync();
    } else if (r.status === 'missing-permission') {
      setStatus('Gmail read permission was not granted. Tick the Gmail box to auto-import bank alerts.');
    } else if (r.status === 'error') {
      setStatus(`Could not connect: ${r.message}`);
    }
  };

  const onDisconnect = async () => {
    await disableBackgroundSync();
    await disconnectGmail().catch(() => undefined);
    await store.clearGmail();
    setEmail(null);
    setStatus('Gmail disconnected. Your saved transactions stay on this phone.');
  };

  const insight = useMemo(
    () => (txs.length ? computeInsight(txs.map(fromStored), { now: new Date() }) : null),
    [txs],
  );

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Smart Expense</Text>

      {email ? (
        <View style={styles.row}>
          <Text style={styles.muted} numberOfLines={1}>Gmail: {email}</Text>
          <Pressable onPress={sync} disabled={busy} style={styles.btnSmall}><Text style={styles.btnText}>Sync</Text></Pressable>
          <Pressable onPress={onDisconnect} style={[styles.btnSmall, styles.btnGhost]}><Text>Disconnect</Text></Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Auto-import bank alerts</Text>
          <Text style={styles.muted}>
            We search your Gmail only for bank and wallet alert emails. They are read on this phone;
            only the amount, merchant and date are kept. Emails never leave your device.
          </Text>
          <Pressable onPress={onConnect} style={styles.btn}><Text style={styles.btnText}>Connect Gmail</Text></Pressable>
        </View>
      )}

      {busy && <ActivityIndicator style={{ marginVertical: 8 }} />}
      {!!status && <Text style={styles.status}>{status}</Text>}

      {insight && (
        <View style={styles.card}>
          <Text>Average daily spend (30d): <Text style={styles.bold}>{pkr(insight.avgDaily30)}</Text></Text>
          <Text>This week: <Text style={styles.bold}>{pkr(insight.avgDaily7)}</Text>/day</Text>
          {insight.runsOutOn && <Text>Balance lasts until: <Text style={styles.bold}>{insight.runsOutOn.toDateString()}</Text></Text>}
          {insight.byCategory.slice(0, 4).map(c => (
            <Text key={c.category} style={styles.muted}>{c.category}: {pkr(c.amount)} ({Math.round(c.share * 100)}%)</Text>
          ))}
          {insight.warnings.map((w, i) => <Text key={i} style={styles.warn}>⚠ {describeWarning(w)}</Text>)}
        </View>
      )}

      <FlatList
        data={txs}
        keyExtractor={t => t.key}
        ListEmptyComponent={<Text style={styles.muted}>No transactions yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.tx}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{item.merchant ?? item.sender}</Text>
              <Text style={styles.muted}>{item.category} · {new Date(item.occurredAt).toLocaleDateString()}</Text>
            </View>
            <Text style={item.direction === 'credit' ? styles.credit : styles.debit}>
              {item.direction === 'credit' ? '+' : '−'}{pkr(item.amount)}
            </Text>
          </View>
        )}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 56, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, padding: 14, marginBottom: 12, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  muted: { color: '#666', flexShrink: 1 },
  bold: { fontWeight: '700' },
  status: { color: '#444', marginBottom: 8 },
  warn: { color: '#b45309', marginTop: 4 },
  btn: { backgroundColor: '#111', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnSmall: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  btnGhost: { backgroundColor: '#eee' },
  btnText: { color: '#fff', fontWeight: '600' },
  tx: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', gap: 8 },
  debit: { color: '#b91c1c', fontWeight: '600' },
  credit: { color: '#15803d', fontWeight: '600' },
});
