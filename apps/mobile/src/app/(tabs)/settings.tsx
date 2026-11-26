import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAppData } from '../../data/AppData';
import { GLYPHS, Icon, Screen } from '../../ui/kit';
import { pkr, type, useTheme } from '../../ui/theme';
import type { Settings } from '../../store';

function Group({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={[type.footnote, { color: t.sec, textTransform: 'uppercase', paddingHorizontal: 16 }]}>{title}</Text>
      <View style={{ backgroundColor: t.card, borderRadius: 12, overflow: 'hidden' }}>{children}</View>
      {footer ? <Text style={[type.footnote, { color: t.sec, paddingHorizontal: 16, lineHeight: 18 }]}>{footer}</Text> : null}
    </View>
  );
}

function Row({ icon, iconBg, label, sub, right, onPress, last, destructive }: {
  icon: string; iconBg: string; label: string; sub?: string; right?: ReactNode; onPress?: () => void; last?: boolean; destructive?: boolean;
}) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6, paddingHorizontal: 16, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.sep }}>
      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={icon} size={17} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: destructive ? t.danger : t.label }]}>{label}</Text>
        {sub ? <Text style={[type.footnote, { color: t.sec }]}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? t.fill : 'transparent' })}>
      {body}
    </Pressable>
  );
}

function Value({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={[type.body, { color: t.sec }]}>{text}</Text>
      <Icon d={GLYPHS.chevron} size={14} color={t.ter} strokeWidth={2.5} />
    </View>
  );
}

/** Number field that saves on blur; empty means "not set". */
function NumberField({ value, placeholder, onSave, label, max }: { value: number | null; placeholder: string; onSave: (n: number | null) => void; label: string; max?: number }) {
  const t = useTheme();
  const [text, setText] = useState(value != null ? String(value) : '');
  useEffect(() => setText(value != null ? String(value) : ''), [value]);
  const commit = () => {
    const n = text.trim() ? Number(text.replace(/[^0-9.]/g, '')) : null;
    if (n != null && (!Number.isFinite(n) || n < 0 || (max != null && n > max))) {
      setText(value != null ? String(value) : '');
      return;
    }
    onSave(n);
  };
  return (
    <TextInput
      accessibilityLabel={label} value={text} onChangeText={setText} onEndEditing={commit} onSubmitEditing={commit}
      placeholder={placeholder} placeholderTextColor={t.sec} keyboardType="number-pad" returnKeyType="done"
      style={{ minWidth: 96, minHeight: 44, textAlign: 'right', fontSize: 17, color: t.label }}
    />
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const d = useAppData();
  const s = d.settings;
  const alertBalance = d.txs.find(x => x.balance != null)?.balance ?? null;

  const toggle = (key: keyof Settings['warnings']) => (on: boolean) => d.updateSettings({ warnings: { ...s.warnings, [key]: on } });
  const sw = (key: keyof Settings['warnings']) => (
    <Switch
      accessibilityLabel={key} value={s.warnings[key]} onValueChange={toggle(key)}
      trackColor={{ true: t.switchOn, false: t.dark ? '#39393D' : '#E9E9EA' }} thumbColor="#FFFFFF" ios_backgroundColor={t.dark ? '#39393D' : '#E9E9EA'}
    />
  );

  const onGmail = () => {
    if (!d.gmailEmail) {
      d.connectGmail().then(r => {
        if (r.status === 'missing-permission') Alert.alert('Gmail not connected', 'Tick the Gmail box on the Google screen so we can read bank alert emails.');
        else if (r.status === 'error') Alert.alert('Could not connect', r.message);
      });
      return;
    }
    Alert.alert('Gmail', d.gmailEmail, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sync now', onPress: () => d.syncGmail() },
      { text: 'Disconnect', style: 'destructive', onPress: () => d.disconnectGmail() },
    ]);
  };

  const onDeleteAll = () =>
    Alert.alert('Delete all data on this phone?', 'Transactions, settings and Gmail connection are removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await d.clearAll(); d.showToast('All data deleted'); } },
    ]);

  return (
    <Screen title="Settings">
      <Group title="Sources" footer="Messages are read on this phone. Only the amount, merchant and date are kept.">
        {d.notifAvailable ? (
          <Row icon={GLYPHS.phone} iconBg="#0A66D8" label="SMS & wallet alerts" sub="Bank SMS, JazzCash, Easypaisa, bank apps"
            right={<Value text={d.notifAccess ? 'On' : 'Off'} />} onPress={d.openNotificationSettings} />
        ) : (
          <Row icon={GLYPHS.phone} iconBg="#8E8E93" label="SMS & wallet alerts" sub="Android only, in the full app build" />
        )}
        <Row icon={GLYPHS.mail} iconBg="#D93025" label="Gmail" sub={d.gmailEmail ?? 'Import bank alert emails'}
          right={<Value text={d.syncing ? 'Syncing…' : d.gmailEmail ? 'Connected' : 'Connect'} />} onPress={onGmail} />
        <Row icon={GLYPHS.forward} iconBg="#5E5CE6" label="Email forwarding" sub="Set up from the web dashboard" last />
      </Group>

      <Group title="Money" footer={s.balance == null && alertBalance != null ? `Using ${pkr(alertBalance)} from your latest bank alert.` : 'Used to work out what is safe to spend until payday.'}>
        <Row icon={GLYPHS.wallet} iconBg="#248A3D" label="Balance (Rs)"
          right={<NumberField label="Balance in rupees" value={s.balance} placeholder={alertBalance != null ? 'From alerts' : 'Not set'} onSave={n => d.updateSettings({ balance: n })} />} />
        <Row icon={GLYPHS.calendar} iconBg="#C93400" label="Payday" sub={d.payday ? `Next: ${d.payday.toDateString()}` : 'Day of the month salary arrives'} last
          right={<NumberField label="Payday, day of month" value={s.paydayDay} placeholder="e.g. 1" max={31} onSave={n => d.updateSettings({ paydayDay: n ? Math.round(n) || null : null })} />} />
      </Group>

      <Group title="Warn me when">
        <Row icon={GLYPHS.warning} iconBg="#C93400" label="Money may run out" sub="Before your next payday" right={sw('runout')} />
        <Row icon={GLYPHS.trend} iconBg="#0A66D8" label="Spending faster than usual" sub="This week above your 30-day average" right={sw('pace')} />
        <Row icon={GLYPHS.bars} iconBg="#5E5CE6" label="A category jumps" sub="e.g. Clothing doubles in a week" right={sw('jump')} />
        <Row icon={GLYPHS.clock} iconBg="#636366" label="Daily summary" sub="Every day at 9 pm" right={sw('daily')} last />
      </Group>

      <Group title="Privacy" footer="Your emails and SMS never leave this phone.">
        <Row icon={GLYPHS.shield} iconBg="#636366" label="Set up sources again" right={<Value text="" />} onPress={() => router.push('/onboarding')} />
        <Row icon={GLYPHS.trash} iconBg="#D70015" label="Delete all data on this phone" destructive last onPress={onDeleteAll} />
      </Group>
    </Screen>
  );
}
