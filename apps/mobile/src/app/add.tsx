import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Category, Direction } from '@smart-expense/engine';
import { useAppData } from '../data/AppData';
import { GLYPHS, Icon, IconCircle, Segmented, SheetHeader, TextButton } from '../ui/kit';
import { PICKER_CATEGORIES, styleFor } from '../ui/categories';
import { type, useTheme } from '../ui/theme';
import { validateFix } from '../review/review';

import { pressKey } from '../keypad';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

export default function AddExpense() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ alert?: string; amount?: string; direction?: Direction }>();
  const { addTransaction, showToast } = useAppData();
  const [amount, setAmount] = useState(params.amount ?? '');
  const [direction, setDirection] = useState<Direction>(params.direction ?? 'debit');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<Category>(params.alert ? 'Other' : 'Food & Dining');
  const [saving, setSaving] = useState(false);

  const value = amount ? Number(amount.replace(/\.$/, '')) : null;
  const valid = validateFix({ amount: value, merchant }) == null;
  const display = amount
    ? `Rs ${Number(amount.replace(/\.$/, '') || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}${amount.endsWith('.') ? '.' : ''}`
    : 'Rs 0';

  const save = async () => {
    if (!valid || saving || value == null) return;
    setSaving(true);
    try {
      await addTransaction({ amount: value, direction, merchant, category, fromAlertId: params.alert });
      showToast(`Added ${display}`);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.sheet }}>
      <SheetHeader
        title={params.alert ? 'Add from alert' : 'Add expense'}
        left={<TextButton label="Cancel" onPress={() => router.back()} />}
        right={<TextButton label="Add" bold onPress={save} color={valid ? t.accent : t.ter} />}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', paddingTop: 4 }}>
          <Text style={[type.subhead, { color: t.sec }]}>Amount</Text>
          <Text accessibilityLiveRegion="polite" adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 52, fontWeight: '800', letterSpacing: -0.5, color: amount ? t.label : t.ter }}>{display}</Text>
        </View>
        <Segmented<Direction> label="Direction" value={direction} onChange={setDirection} options={[['debit', 'Money out'], ['credit', 'Money in']]} />
        <TextInput
          accessibilityLabel="Merchant or note" value={merchant} onChangeText={setMerchant} placeholder="Merchant or note, e.g. Chai dhaba"
          placeholderTextColor={t.sec} returnKeyType="done"
          style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.fill, fontSize: 17, color: t.label }}
        />
        {direction === 'debit' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PICKER_CATEGORIES.map(c => {
              const s = styleFor(c);
              const on = c === category;
              return (
                <Pressable
                  key={c} accessibilityRole="button" accessibilityLabel={c} accessibilityState={{ selected: on }} onPress={() => setCategory(c)}
                  style={{ width: '23.5%', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 2, borderColor: on ? t.accentFill : 'transparent', backgroundColor: t.card }}
                >
                  <IconCircle d={s.icon} fg={s.fg} bg={s.bg} size={34} />
                  <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '500', color: t.label }}>{s.short}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 10, paddingBottom: insets.bottom + 10, backgroundColor: t.keypadBg }}>
        {KEYS.map(k => (
          <Pressable
            key={k} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            onPress={() => setAmount(a => pressKey(a, k))}
            style={({ pressed }) => ({ width: '32.4%', minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.fill : t.key })}
          >
            {k === 'del' ? <Icon d={GLYPHS.backspace} size={24} color={t.label} /> : <Text style={{ fontSize: 24, fontWeight: '500', color: t.label }}>{k}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
