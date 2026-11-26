import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAppData } from '../../data/AppData';
import { Card, EmptyState, GLYPHS, Icon, Screen, Segmented, TxRow, sourceLabel } from '../../ui/kit';
import { pkr, type, useTheme } from '../../ui/theme';
import { dayLabel, timeLabel } from '../../insights';
import type { StoredTransaction } from '../../transactions';

type Filter = 'all' | 'debit' | 'credit';
const MAX_ROWS = 300;

export default function Activity() {
  const t = useTheme();
  const { txs } = useAppData();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const now = new Date();
    const q = query.trim().toLowerCase();
    const rows = txs
      .filter(x => filter === 'all' || x.direction === filter)
      .filter(x => !q || `${x.merchant ?? ''} ${x.category} ${x.amount}`.toLowerCase().includes(q))
      .slice(0, MAX_ROWS);
    const out: { title: string; total: number; rows: StoredTransaction[] }[] = [];
    for (const x of rows) {
      const title = dayLabel(new Date(x.occurredAt), now);
      let s = out[out.length - 1];
      if (!s || s.title !== title) out.push((s = { title, total: 0, rows: [] }));
      s.rows.push(x);
      if (x.direction === 'debit' && !x.isTransfer) s.total += x.amount;
    }
    return out;
  }, [txs, filter, query]);

  return (
    <Screen title="Activity">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.fill }}>
        <Icon d={GLYPHS.search} size={17} color={t.sec} strokeWidth={2.2} />
        <TextInput
          accessibilityLabel="Search transactions" placeholder="Search" placeholderTextColor={t.sec}
          value={query} onChangeText={setQuery} returnKeyType="search" clearButtonMode="while-editing"
          style={{ flex: 1, fontSize: 17, color: t.label, paddingVertical: 8 }}
        />
      </View>
      <Segmented<Filter> label="Filter" value={filter} onChange={setFilter} options={[['all', 'All'], ['debit', 'Money out'], ['credit', 'Money in']]} />

      {sections.length === 0 ? (
        <EmptyState title={query ? 'No matches' : 'Nothing here yet'} body={query ? 'Try a merchant name or an amount.' : 'Transactions from SMS, wallet apps, Gmail and ones you add appear here.'} />
      ) : sections.map(s => (
        <View key={s.title} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 4 }}>
            <Text style={[type.footnote, { color: t.sec, fontWeight: '600', textTransform: 'uppercase' }]}>{s.title}</Text>
            {s.total ? <Text style={[type.footnote, { color: t.sec, fontWeight: '600' }]}>−{pkr(s.total)}</Text> : null}
          </View>
          <Card padded={false}>
            {s.rows.map((x, i) => (
              <TxRow
                key={x.key} tx={x} last={i === s.rows.length - 1}
                subtitle={`${x.isTransfer ? 'Transfer, not counted' : x.category} · ${sourceLabel(x)} · ${timeLabel(new Date(x.occurredAt))}`}
                onPress={() => router.push({ pathname: '/tx/[key]', params: { key: x.key } })}
              />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
