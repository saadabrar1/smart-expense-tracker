import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Category } from '@smart-expense/engine';
import { useAppData } from '../../data/AppData';
import { EmptyState, IconCircle, SheetHeader, TextButton, amountText, sourceLabel } from '../../ui/kit';
import { PICKER_CATEGORIES, styleFor } from '../../ui/categories';
import { type, useTheme } from '../../ui/theme';

const ALL: Category[] = [...PICKER_CATEGORIES, 'Income', 'Transfers'];

export default function TransactionDetail() {
  const t = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { txs, setCategory, deleteTransaction, showToast } = useAppData();
  const tx = txs.find(x => x.key === key);
  const [always, setAlways] = useState(false);

  if (!tx) {
    return (
      <View style={{ flex: 1, backgroundColor: t.sheet }}>
        <SheetHeader title="Transaction" right={<TextButton label="Done" bold onPress={() => router.back()} />} />
        <EmptyState title="Transaction not found" body="It may have been deleted." />
      </View>
    );
  }

  const s = styleFor(tx.category);
  const when = new Date(tx.occurredAt);
  const pick = async (c: Category) => {
    await setCategory(tx.key, c, always);
    if (always && tx.merchant) showToast(`${tx.merchant} → ${c}`);
  };
  const toggleAlways = async (on: boolean) => {
    setAlways(on);
    if (on && tx.merchant) {
      await setCategory(tx.key, tx.category as Category, true);
      showToast(`Always ${tx.category} for ${tx.merchant}`);
    }
  };
  const remove = () =>
    Alert.alert('Delete this transaction?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTransaction(tx.key); showToast('Transaction deleted'); router.back(); } },
    ]);

  const infoRow = (label: string, value: string, last?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: t.sep }}>
      <Text style={[type.body, { color: t.label }]}>{label}</Text>
      <Text style={[type.body, { color: t.sec }]}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.sheet }}>
      <SheetHeader title="" right={<TextButton label="Done" bold onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <IconCircle d={s.icon} fg={s.fg} bg={s.bg} size={64} />
          <Text style={[type.title2, { color: t.label, textAlign: 'center' }]}>{tx.merchant ?? tx.category}</Text>
          <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: -0.5, color: tx.direction === 'credit' ? t.income : t.label }}>{amountText(tx)}</Text>
          <Text style={[type.subhead, { color: t.sec }]}>
            {when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {tx.isTransfer ? ' · Transfer, not counted' : ''}
          </Text>
        </View>

        <View style={{ backgroundColor: t.card, borderRadius: 12, overflow: 'hidden' }}>
          {infoRow('Source', sourceLabel(tx))}
          {infoRow('Account', tx.accountHint ? `••••${tx.accountHint}` : '—')}
          {infoRow('Balance after', tx.balance != null ? `Rs ${tx.balance.toLocaleString('en-US')}` : '—', true)}
        </View>

        <Text style={[type.footnote, { color: t.sec, textTransform: 'uppercase', paddingHorizontal: 4, marginBottom: -8 }]}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ALL.map(c => {
            const on = c === tx.category;
            return (
              <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(c)}
                style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? t.accentFill : t.card }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: on ? '#FFFFFF' : t.label }}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        {tx.merchant && tx.direction === 'debit' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 12, backgroundColor: t.card }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: t.label }]}>Always use for {tx.merchant}</Text>
              <Text style={[type.footnote, { color: t.sec }]}>Applies to past and future payments here</Text>
            </View>
            <Switch accessibilityLabel={`Always use this category for ${tx.merchant}`} value={always} onValueChange={toggleAlways}
              trackColor={{ true: t.switchOn, false: t.dark ? '#39393D' : '#E9E9EA' }} thumbColor="#FFFFFF" />
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={remove} style={({ pressed }) => ({ minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.fill : t.card })}>
          <Text style={[type.body, { color: t.danger }]}>Delete transaction</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
