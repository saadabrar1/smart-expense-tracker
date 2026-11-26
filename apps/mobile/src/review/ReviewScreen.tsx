import { useCallback, useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { CATEGORIES, learnRule, type Category, type Direction } from '@smart-expense/engine';
import type { UnparsedAlert } from '../gmail/sync';
import { store } from '../store';
import { mergeTransactions } from '../transactions';
import { buildSampleMailUrl, guessFromText, redact, transactionFromFix, validateFix } from './review';

/** Where shared samples go. Set EXPO_PUBLIC_SAMPLES_EMAIL in apps/mobile/.env */
const SAMPLES_EMAIL = process.env.EXPO_PUBLIC_SAMPLES_EMAIL ?? '';
const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';

const fmtDate = (ms: number) => new Date(ms).toLocaleString();

export function ReviewScreen({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<UnparsedAlert[]>([]);
  const [selected, setSelected] = useState<UnparsedAlert | null>(null);

  const load = useCallback(async () => {
    const all = await store.loadUnparsed();
    setItems([...all].sort((a, b) => b.receivedAt - a.receivedAt));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <AlertDetail
        alert={selected}
        onBack={() => setSelected(null)}
        onResolved={async () => {
          setSelected(null);
          await load();
          onChanged();
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts we couldn't read</Text>
        <Pressable onPress={onClose} hitSlop={12}><Text style={styles.link}>Done</Text></Pressable>
      </View>
      <Text style={styles.muted}>
        These look like money alerts, but your bank's format is new to us. Add them yourself, and if you like,
        share an anonymised copy so we can support your bank for everyone.
      </Text>
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        style={{ marginTop: 12 }}
        ListEmptyComponent={<Text style={[styles.muted, { marginTop: 24 }]}>All caught up 🎉</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setSelected(item)} style={styles.item}>
            <Text style={styles.bold} numberOfLines={1}>{item.from}</Text>
            <Text style={styles.muted}>{fmtDate(item.receivedAt)} · {item.source === 'email' ? 'Email' : 'SMS / app'}</Text>
            <Text numberOfLines={2}>{item.text}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

function AlertDetail({ alert, onBack, onResolved }: { alert: UnparsedAlert; onBack: () => void; onResolved: () => void }) {
  const guess = guessFromText(alert.text);
  const [amount, setAmount] = useState(guess.amount != null ? String(guess.amount) : '');
  const [direction, setDirection] = useState<Direction>(guess.direction);
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<Category>(guess.direction === 'credit' ? 'Income' : 'Other');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [sharing, setSharing] = useState(false);
  const [sample, setSample] = useState(() => redact(alert.text));
  const [shareNote, setShareNote] = useState<string | null>(null);

  const save = async () => {
    const parsed = amount.trim() ? Number(amount.replace(/,/g, '')) : null;
    const problem = validateFix({ amount: parsed, merchant });
    if (problem) return setError(problem);
    setSaving(true);
    try {
      const tx = transactionFromFix(alert, { amount: parsed as number, direction, merchant, category });
      await store.updateTransactions(prev => mergeTransactions(prev, [tx]));
      if (merchant.trim()) {
        // Future alerts from this merchant get this category automatically.
        await store.saveUserRules(learnRule(await store.loadUserRules(), merchant, category));
      }
      await store.removeUnparsed(alert.id);
      onResolved();
    } finally {
      setSaving(false);
    }
  };

  const dismiss = async () => {
    await store.removeUnparsed(alert.id);
    onResolved();
  };

  const openEmailDraft = async () => {
    const url = buildSampleMailUrl({ to: SAMPLES_EMAIL, sender: alert.from, source: alert.source, text: sample, appVersion: APP_VERSION });
    try {
      await Linking.openURL(url);
      setShareNote('Email draft opened. It is only sent if you press Send.');
    } catch {
      // No email app: fall back to the system share sheet so the user can pick how to send it.
      await Share.share({ message: `To: ${SAMPLES_EMAIL}\nSender: ${alert.from}\n\n${sample}` });
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}><Text style={styles.link}>‹ Back</Text></Pressable>
      </View>

      <Text style={styles.bold}>{alert.from}</Text>
      <Text style={styles.muted}>{fmtDate(alert.receivedAt)} · {alert.source === 'email' ? 'Email' : 'SMS / app notification'}</Text>
      <View style={styles.quote}><Text selectable>{alert.text}</Text></View>

      {/* 1. Fix it */}
      <Text style={styles.section}>Add it yourself</Text>
      <View style={styles.row}>
        {(['debit', 'credit'] as const).map(d => (
          <Pressable key={d} onPress={() => setDirection(d)} style={[styles.chip, direction === d && styles.chipOn]}>
            <Text style={direction === d ? styles.chipTextOn : undefined}>{d === 'debit' ? 'Money out' : 'Money in'}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Amount (Rs)"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={v => { setAmount(v); setError(null); }}
      />
      <TextInput style={styles.input} placeholder="Merchant / person (optional)" value={merchant} onChangeText={setMerchant} />
      <View style={styles.chips}>
        {CATEGORIES.map(c => (
          <Pressable key={c} onPress={() => setCategory(c)} style={[styles.chip, category === c && styles.chipOn]}>
            <Text style={category === c ? styles.chipTextOn : undefined}>{c}</Text>
          </Pressable>
        ))}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable onPress={save} disabled={saving} style={[styles.btn, saving && { opacity: 0.6 }]}>
        <Text style={styles.btnText}>Save transaction</Text>
      </Pressable>

      {/* 2. Share an anonymised sample */}
      <Text style={styles.section}>Help us support this bank</Text>
      {!sharing ? (
        <Pressable onPress={() => setSharing(true)} style={[styles.btn, styles.btnGhost]}>
          <Text>Share an anonymised copy…</Text>
        </Pressable>
      ) : SAMPLES_EMAIL ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.muted}>
            We removed account numbers, phone numbers, emails, ID numbers and your name where we could.
            Check the text below and edit out anything personal. Nothing is sent until you press Send
            in your email app.{alert.source === 'email' ? ' This alert came from your Gmail.' : ''}
          </Text>
          <TextInput style={[styles.input, styles.multiline]} multiline value={sample} onChangeText={setSample} />
          <Pressable onPress={openEmailDraft} style={styles.btn}><Text style={styles.btnText}>Open email draft</Text></Pressable>
          {shareNote && <Text style={styles.muted}>{shareNote}</Text>}
        </View>
      ) : (
        <Text style={styles.muted}>Sharing isn't set up in this build yet (EXPO_PUBLIC_SAMPLES_EMAIL).</Text>
      )}

      {/* 3. Not a transaction */}
      <Pressable onPress={dismiss} style={{ marginTop: 24, alignItems: 'center' }}>
        <Text style={styles.link}>Not a transaction — remove</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', paddingTop: 56, paddingHorizontal: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 32 },
  title: { fontSize: 20, fontWeight: '700' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  muted: { color: '#666' },
  bold: { fontWeight: '700' },
  link: { color: '#2563eb', fontSize: 16 },
  error: { color: '#b91c1c', marginTop: 6 },
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', gap: 2 },
  quote: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, marginTop: 10 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, minHeight: 36 },
  chipOn: { backgroundColor: '#111', borderColor: '#111' },
  chipTextOn: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, fontSize: 16 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  btn: { backgroundColor: '#111', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnGhost: { backgroundColor: '#eee' },
  btnText: { color: '#fff', fontWeight: '600' },
});
