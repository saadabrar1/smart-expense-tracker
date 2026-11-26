import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { describeWarning } from '@smart-expense/engine';
import { useAppData } from '../../data/AppData';
import { Card, CapsuleButton, GLYPHS, Icon, Ring, Screen, SectionTitle, TextButton, TxRow, sourceLabel } from '../../ui/kit';
import { pkr, type, useTheme } from '../../ui/theme';
import { startOfDay, timeLabel, warningEnabled } from '../../insights';

const openTx = (key: string) => router.push({ pathname: '/tx/[key]', params: { key } });

export default function Today() {
  const t = useTheme();
  const { txs, unparsed, insight, settings } = useAppData();
  const now = new Date();
  const today0 = startOfDay(now).getTime();
  const spentToday = txs
    .filter(x => x.direction === 'debit' && !x.isTransfer && Date.parse(x.occurredAt) >= today0)
    .reduce((s, x) => s + x.amount, 0);
  const safe = insight?.safeToSpendPerDay ?? null;
  const pct = safe ? Math.round((spentToday / safe) * 100) : 0;
  const warning = insight?.warnings.find(w => warningEnabled(w, settings.warnings));
  const paceUp = insight && insight.avgDaily30 > 0 ? Math.round((insight.avgDaily7 / insight.avgDaily30 - 1) * 100) : 0;

  const addButton = (
    <Pressable
      accessibilityRole="button" accessibilityLabel="Add expense" onPress={() => router.push('/add')}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accentTint, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Icon d={GLYPHS.plus} size={22} color={t.accent} strokeWidth={2.5} />
    </Pressable>
  );

  return (
    <Screen title="Today" overline={now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} right={addButton}>
      {/* Hero */}
      <View style={{ backgroundColor: t.hero, borderColor: t.heroBorder, borderWidth: 1, borderRadius: 22, padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.subhead, { color: 'rgba(235,235,245,0.75)' }]}>{safe != null ? 'Safe to spend today' : 'Spent today'}</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: 40, fontWeight: '800', letterSpacing: -0.5, color: '#FFFFFF' }}>
              {safe != null ? pkr(Math.max(0, safe - spentToday)) : pkr(spentToday)}
            </Text>
            <Text style={[type.footnote, { color: 'rgba(235,235,245,0.75)' }]}>
              {safe != null ? `${pkr(spentToday)} of ${pkr(safe)} used` : insight ? `Usually ${pkr(insight.avgDaily30)} a day` : 'Nothing yet today'}
            </Text>
          </View>
          {safe != null ? (
            <View accessible accessibilityLabel={`${Math.min(pct, 100)} percent of today's safe amount used`}>
              <Ring pct={pct} color={pct >= 90 ? '#FF9F0A' : '#5AA9FF'} track="rgba(255,255,255,0.14)">
                <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>{Math.min(pct, 999)}%</Text>
                <Text style={{ color: 'rgba(235,235,245,0.75)', fontSize: 11 }}>used</Text>
              </Ring>
            </View>
          ) : null}
        </View>
        {warning ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,159,10,0.16)' }}>
            <Icon d={GLYPHS.warning} size={18} color="#FFB340" strokeWidth={2.2} />
            <Text style={{ flex: 1, color: '#FFD9A0', fontSize: 14, lineHeight: 19 }}>{describeWarning(warning)}</Text>
          </View>
        ) : null}
        {safe == null ? (
          <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: '#9CC8FF', fontSize: 15, fontWeight: '600' }}>Set your balance and payday to see what's safe to spend ›</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Alerts we couldn't read */}
      {unparsed.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/review')} style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: pressed ? t.fill : t.card,
        })}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.warnBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon d={GLYPHS.info} size={18} color={t.warn} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.label }}>{unparsed.length} alert{unparsed.length === 1 ? '' : 's'} need you</Text>
            <Text style={[type.footnote, { color: t.sec }]}>We couldn't read {unparsed.length === 1 ? 'it' : 'them'} yet</Text>
          </View>
          <Icon d={GLYPHS.chevron} size={16} color={t.ter} strokeWidth={2.5} />
        </Pressable>
      ) : null}

      {insight ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, gap: 4 }}>
            <Text style={[type.footnote, { color: t.sec }]}>Average a day</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', color: t.label }}>{pkr(insight.avgDaily30)}</Text>
            <Text style={[type.caption, { color: t.sec }]}>last 30 days</Text>
          </Card>
          <Card style={{ flex: 1, gap: 4 }}>
            <Text style={[type.footnote, { color: t.sec }]}>This week</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', color: t.label }}>{pkr(insight.avgDaily7)}</Text>
            <Text style={[type.caption, { color: paceUp > 0 ? t.warn : t.sec, fontWeight: '600' }]}>
              {paceUp > 0 ? `▲ ${paceUp}% above usual` : paceUp < 0 ? `▼ ${-paceUp}% below usual` : 'about usual'}
            </Text>
          </Card>
        </View>
      ) : null}

      {txs.length ? (
        <>
          <SectionTitle action={<TextButton label="See all" onPress={() => router.push('/activity')} />}>Recent</SectionTitle>
          <Card padded={false}>
            {txs.slice(0, 5).map((x, i, a) => (
              <TxRow key={x.key} tx={x} last={i === a.length - 1} subtitle={`${sourceLabel(x)} · ${timeLabel(new Date(x.occurredAt))}`} onPress={() => openTx(x.key)} />
            ))}
          </Card>
        </>
      ) : (
        <Card style={{ gap: 12 }}>
          <Text style={[type.headline, { color: t.label }]}>No transactions yet</Text>
          <Text style={[type.subhead, { color: t.sec, lineHeight: 21 }]}>
            Connect bank SMS, wallet alerts or Gmail and your spending appears here automatically. You can also add expenses yourself.
          </Text>
          <CapsuleButton label="Connect sources" onPress={() => router.push('/onboarding')} />
          <CapsuleButton label="Add an expense" kind="tinted" onPress={() => router.push('/add')} />
        </Card>
      )}
    </Screen>
  );
}
