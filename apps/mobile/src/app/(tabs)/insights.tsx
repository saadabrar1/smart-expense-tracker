import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { describeWarning } from '@smart-expense/engine';
import { useAppData } from '../../data/AppData';
import { Card, EmptyState, GLYPHS, Icon, IconCircle, Screen, Segmented, SectionTitle } from '../../ui/kit';
import { styleFor } from '../../ui/categories';
import { pkr, type, useTheme } from '../../ui/theme';
import { dailySpend, warningEnabled } from '../../insights';

type Period = 'week' | 'month';
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Insights() {
  const t = useTheme();
  const { txs, insight, settings } = useAppData();
  const [period, setPeriod] = useState<Period>('week');
  const [sel, setSel] = useState<number | null>(null);

  const days = useMemo(() => dailySpend(txs, new Date(), period === 'week' ? 7 : 30), [txs, period]);
  const max = Math.max(1, ...days.map(d => d.total));
  const selected = sel != null && sel < days.length ? sel : days.reduce((best, d, i) => (d.total > days[best].total ? i : best), 0);
  const avg = insight?.avgDaily30 ?? 0;
  const warnings = (insight?.warnings ?? []).filter(w => warningEnabled(w, settings.warnings));

  if (!insight) {
    return (
      <Screen title="Insights">
        <EmptyState title="Insights appear after a few days" body="Once some transactions come in, you'll see daily spending, trends and warnings here." />
      </Screen>
    );
  }

  const label = (d: Date, i: number) =>
    period === 'week' ? (i === days.length - 1 ? 'Today' : WD[d.getDay()]) : (i % 7 === 6 ? String(d.getDate()) : '');

  return (
    <Screen title="Insights">
      <Segmented<Period> label="Period" value={period} onChange={p => { setPeriod(p); setSel(null); }} options={[['week', 'Week'], ['month', 'Month']]} />

      <Card style={{ gap: 12 }}>
        <View>
          <Text style={[type.footnote, { color: t.sec }]}>
            {days[selected].date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: t.label }}>{pkr(days[selected].total)}</Text>
          <Text style={[type.footnote, { color: t.sec }]}>Average {pkr(avg)} a day · tap a bar</Text>
        </View>
        <View style={{ height: 170, flexDirection: 'row', alignItems: 'flex-end', gap: period === 'week' ? 10 : 3 }}>
          <View pointerEvents="none" style={{
            position: 'absolute', left: 0, right: 0, bottom: `${Math.min(100, (avg / max) * 100)}%`,
            borderTopWidth: 2, borderStyle: 'dashed', borderColor: t.ter,
          }} />
          {days.map((d, i) => (
            <Pressable
              key={d.date.toISOString()}
              accessibilityRole="button"
              accessibilityLabel={`${d.date.toDateString()}, ${pkr(d.total)}`}
              accessibilityState={{ selected: i === selected }}
              onPress={() => setSel(i)}
              style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}
            >
              <View style={{
                height: `${Math.max(2, (d.total / max) * 100)}%`,
                backgroundColor: i === selected ? t.accentFill : t.barSoft,
                borderTopLeftRadius: period === 'week' ? 8 : 3, borderTopRightRadius: period === 'week' ? 8 : 3,
                borderBottomLeftRadius: period === 'week' ? 4 : 0, borderBottomRightRadius: period === 'week' ? 4 : 0,
              }} />
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: period === 'week' ? 10 : 3 }}>
          {days.map((d, i) => (
            <Text key={d.date.toISOString()} numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: t.sec }}>{label(d.date, i)}</Text>
          ))}
        </View>
      </Card>

      {warnings.length ? <SectionTitle>Heads up</SectionTitle> : null}
      {warnings.map((w, i) => (
        <Card key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.warnBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={GLYPHS.warning} size={17} color={t.warn} strokeWidth={2.2} />
          </View>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: t.label }}>{describeWarning(w)}</Text>
        </Card>
      ))}

      <SectionTitle>Where it went</SectionTitle>
      <Card padded={false} style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        {insight.byCategory.slice(0, 8).map((c, i, a) => {
          const s = styleFor(c.category);
          return (
            <View key={c.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === a.length - 1 ? 0 : 0.5, borderBottomColor: t.sep }}>
              <IconCircle d={s.icon} fg={s.fg} bg={s.bg} size={32} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: t.label }}>{c.category}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: t.label }}>{pkr(c.amount)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.fill, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${(c.amount / a[0].amount) * 100}%`, borderRadius: 3, backgroundColor: t.accentFill }} />
                </View>
              </View>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
