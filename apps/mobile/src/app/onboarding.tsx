import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '../data/AppData';
import { CapsuleButton, GLYPHS, Icon } from '../ui/kit';
import { type, useTheme } from '../ui/theme';

function SourceRow({ icon, fg, bg, title, body, done, action, onPress, last }: {
  icon: string; fg: string; bg: string; title: string; body: string; done: boolean; action: string; onPress: () => void; last?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: t.sep }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon d={icon} size={22} color={fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.headline, { color: t.label }]}>{title}</Text>
        <Text style={[type.footnote, { color: t.sec, lineHeight: 18 }]}>{body}</Text>
      </View>
      <Pressable
        accessibilityRole="button" accessibilityLabel={done ? `${title} is on` : `${action} ${title}`} disabled={done} onPress={onPress}
        style={({ pressed }) => ({ minHeight: 36, minWidth: 72, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: done ? '#DCFCE7' : t.accentFill, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ fontSize: 15, fontWeight: '600', color: done ? '#15803D' : '#FFFFFF' }}>{done ? 'On' : action}</Text>
      </Pressable>
    </View>
  );
}

export default function Onboarding() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const d = useAppData();

  const finish = async () => {
    await d.updateSettings({ onboarded: true });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const connectGmail = async () => {
    const r = await d.connectGmail();
    if (r.status === 'missing-permission') Alert.alert('Gmail not connected', 'Tick the Gmail box on the Google screen so we can read bank alert emails.');
    else if (r.status === 'error') Alert.alert('Could not connect', r.message);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 16, paddingHorizontal: 20, gap: 24 }}>
      <View style={{ gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#111114', alignItems: 'center', justifyContent: 'center' }}>
          <Icon d={GLYPHS.trendUp} size={28} color="#FFFFFF" />
        </View>
        <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -0.5, color: t.label, marginTop: 8 }}>
          Let's find your spending, automatically.
        </Text>
        <Text style={[type.body, { color: t.sec, lineHeight: 24 }]}>Turn on at least one source. You can always add expenses by hand too.</Text>
      </View>

      <View style={{ backgroundColor: t.card, borderRadius: 16, overflow: 'hidden' }}>
        {d.notifAvailable ? (
          <SourceRow icon={GLYPHS.phone} fg="#1D4ED8" bg="#DBEAFE" title="Bank SMS & wallet alerts"
            body="HBL, Meezan, JazzCash, Easypaisa… read as they arrive. Chats are ignored."
            done={d.notifAccess} action="Allow" onPress={d.openNotificationSettings} />
        ) : null}
        <SourceRow icon={GLYPHS.mail} fg="#BE185D" bg="#FCE7F3" title="Gmail" body="Imports 90 days of bank emails. Read on this phone only."
          done={!!d.gmailEmail} action="Connect" onPress={connectGmail} last />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Icon d={GLYPHS.shield} size={16} color={t.sec} />
        <Text style={[type.footnote, { flex: 1, color: t.sec, lineHeight: 18 }]}>Your messages never leave your phone. Only the amount, merchant and date are kept.</Text>
      </View>

      <View style={{ marginTop: 'auto', gap: 8 }}>
        <CapsuleButton label="Continue" onPress={finish} />
        <CapsuleButton label="Skip for now" kind="plain" onPress={finish} />
      </View>
    </View>
  );
}
