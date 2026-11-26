import { useState } from 'react';
import { Linking, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useAppData } from '../data/AppData';
import { CapsuleButton, EmptyState, GLYPHS, Icon, SheetHeader, TextButton } from '../ui/kit';
import { type, useTheme } from '../ui/theme';
import { buildSampleMailUrl, guessFromText, redact } from '../review/review';

/** Where shared samples go. Set EXPO_PUBLIC_SAMPLES_EMAIL in apps/mobile/.env */
const SAMPLES_EMAIL = process.env.EXPO_PUBLIC_SAMPLES_EMAIL ?? '';
const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';

export default function Review() {
  const t = useTheme();
  const { unparsed, resolveAlert, showToast } = useAppData();
  const items = [...unparsed].sort((a, b) => b.receivedAt - a.receivedAt);
  const alert = items[0];
  const [step, setStep] = useState<'view' | 'share'>('view');
  const [sample, setSample] = useState('');

  const done = <TextButton label="Done" bold onPress={() => router.back()} />;

  if (!alert) {
    return (
      <View style={{ flex: 1, backgroundColor: t.sheet }}>
        <SheetHeader title="Review" right={done} />
        <EmptyState title="All caught up" body="Thanks for helping us support more banks." />
      </View>
    );
  }

  const when = new Date(alert.receivedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const addIt = () => {
    const g = guessFromText(alert.text);
    router.replace({ pathname: '/add', params: { alert: alert.id, amount: g.amount != null ? String(g.amount) : '', direction: g.direction } });
  };
  const startShare = () => {
    setSample(redact(alert.text));
    setStep('share');
  };
  const openDraft = async () => {
    const url = buildSampleMailUrl({ to: SAMPLES_EMAIL, sender: alert.from, source: alert.source, text: sample, appVersion: APP_VERSION });
    try {
      await Linking.openURL(url);
    } catch {
      await Share.share({ message: `To: ${SAMPLES_EMAIL}\nSender: ${alert.from}\n\n${sample}` });
    }
    setStep('view');
    showToast('Thank you for helping!');
  };
  const dismiss = async () => {
    await resolveAlert(alert.id);
    showToast('Removed');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.sheet }}>
      <SheetHeader
        title={step === 'share' ? 'Share anonymised' : items.length > 1 ? `1 of ${items.length}` : "Alert we couldn't read"}
        left={step === 'share' ? <TextButton label="Back" onPress={() => setStep('view')} /> : undefined}
        right={done}
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">
        {step === 'view' ? (
          <>
            <Text style={[type.subhead, { color: t.sec, lineHeight: 21 }]}>This looks like a money alert, but your bank's format is new to us.</Text>
            <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 16, gap: 8 }}>
              <Text style={[type.footnote, { color: t.sec }]}>{alert.from} · {when} · {alert.source === 'email' ? 'Email' : 'SMS / app'}</Text>
              <Text selectable style={{ fontFamily: 'monospace', fontSize: 15, lineHeight: 22, color: t.label }}>{alert.text}</Text>
            </View>
            <CapsuleButton label="Add it myself" onPress={addIt} />
            <CapsuleButton label="Help us support this bank" kind="tinted" onPress={startShare} />
            <CapsuleButton label="Not a transaction" kind="plain" onPress={dismiss} />
          </>
        ) : SAMPLES_EMAIL ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: t.card, borderRadius: 16, padding: 14 }}>
              <Icon d={GLYPHS.shield} size={20} color={t.accent} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: t.sec }}>
                We removed account numbers, phone numbers, emails and names where we could.{' '}
                <Text style={{ color: t.label, fontWeight: '600' }}>Check and edit below.</Text> Nothing is sent until you press Send in your email app.
                {alert.source === 'email' ? ' This alert came from your Gmail.' : ''}
              </Text>
            </View>
            <TextInput
              accessibilityLabel="Anonymised copy" value={sample} onChangeText={setSample} multiline textAlignVertical="top"
              style={{ minHeight: 140, padding: 12, borderRadius: 12, backgroundColor: t.card, fontFamily: 'monospace', fontSize: 15, lineHeight: 22, color: t.label }}
            />
            <CapsuleButton label="Open email draft" icon={GLYPHS.mail} onPress={openDraft} disabled={!sample.trim()} />
          </>
        ) : (
          <Text style={[type.subhead, { color: t.sec }]}>Sharing isn't set up in this build yet (EXPO_PUBLIC_SAMPLES_EMAIL).</Text>
        )}
      </ScrollView>
    </View>
  );
}
