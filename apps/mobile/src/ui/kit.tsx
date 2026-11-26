import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { pkr, type, useTheme } from './theme';
import { styleFor } from './categories';
import type { StoredTransaction } from '../transactions';

export function Icon({ d, size = 20, color, strokeWidth = 2 }: { d: string; size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export const GLYPHS = {
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  warning: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 8v5M12 16h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  check: 'M5 12l5 5 9-10',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  phone: 'M8 2h8a1 1 0 011 1v18a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1zM11 18h2',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  forward: 'M4 12h12M12 6l6 6-6 6',
  wallet: 'M3 7h18v12H3zM3 11h18M7 15h3',
  calendar: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4',
  trend: 'M3 17l6-6 4 4 8-8',
  bars: 'M4 20V11M10 20V5M16 20v-6',
  clock: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  backspace: 'M21 5H9l-6 7 6 7h12zM18 9l-6 6M12 9l6 6',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  chart: 'M4 20V11M10 20V5M16 20v-6M21 20H3',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.5-1-2 3.4 2.1 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.4-2.6a7 7 0 002-1.2l2.5 1 2-3.4-2.1-1.6c.1-.4.2-.8.2-1.2z',
  trendUp: 'M3 17l6-6 4 4 8-8M15 7h6v6',
};

/** Scrollable tab screen with the safe-area top inset and a large title. */
export function Screen({ title, overline, right, children }: { title: string; overline?: string; right?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: 32, gap: 16 }}
      contentInsetAdjustmentBehavior="never"
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 4 }}>
        <View>
          {overline ? <Text style={[type.footnote, { color: t.sec, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }]}>{overline}</Text> : null}
          <Text accessibilityRole="header" style={[type.largeTitle, { color: t.label }]}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 16, overflow: 'hidden' }, padded && { padding: 16 }, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginTop: 4, marginBottom: -6 }}>
      <Text accessibilityRole="header" style={[type.title3, { color: t.label }]}>{children}</Text>
      {action}
    </View>
  );
}

export function TextButton({ label, onPress, color, bold }: { label: string; onPress: () => void; color?: string; bold?: boolean }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
      <Text style={[type.body, { color: color ?? t.accent, fontWeight: bold ? '600' : '400' }]}>{label}</Text>
    </Pressable>
  );
}

export function CapsuleButton({ label, onPress, kind = 'primary', disabled, icon }: {
  label: string; onPress: () => void; kind?: 'primary' | 'tinted' | 'plain'; disabled?: boolean; icon?: string;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accentFill : kind === 'tinted' ? t.accentTint : 'transparent';
  const fg = kind === 'primary' ? '#FFFFFF' : kind === 'tinted' ? t.accent : t.sec;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: kind === 'plain' ? 44 : 52, borderRadius: 26, backgroundColor: bg, alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', gap: 8, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      {icon ? <Icon d={icon} size={18} color={fg} strokeWidth={2.2} /> : null}
      <Text style={{ color: fg, fontSize: kind === 'plain' ? 15 : 17, fontWeight: kind === 'plain' ? '500' : '600' }}>{label}</Text>
    </Pressable>
  );
}

export function IconCircle({ d, fg, bg, size = 38 }: { d: string; fg: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon d={d} size={Math.round(size / 2)} color={fg} />
    </View>
  );
}

export function Segmented<K extends string>({ options, value, onChange, label }: {
  options: [K, string][]; value: K; onChange: (k: K) => void; label: string;
}) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: 10, backgroundColor: t.fill }}>
      {options.map(([k, text]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(k)}
            style={{
              flex: 1, minHeight: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? t.segOn : 'transparent',
              shadowColor: '#000', shadowOpacity: on ? 0.12 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: on ? 1 : 0,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: on ? '600' : '500', color: t.label }}>{text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Progress ring (spent vs safe-to-spend). */
export function Ring({ pct, color, track, size = 88, stroke = 9, children }: {
  pct: number; color: string; track: string; size?: number; stroke?: number; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no">
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${(circ * clamped) / 100} ${circ}`} rotation={-90} origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function amountText(tx: Pick<StoredTransaction, 'direction' | 'amount'>): string {
  return `${tx.direction === 'credit' ? '+' : '−'}${pkr(tx.amount)}`;
}

export function sourceLabel(tx: Pick<StoredTransaction, 'source' | 'parsedBy'>): string {
  if (tx.parsedBy === 'user-fix') return 'From alert';
  if (tx.source === 'manual') return 'Added by you';
  if (tx.source === 'email') return 'Gmail';
  return 'SMS / app alert';
}

export function TxRow({ tx, subtitle, onPress, last }: { tx: StoredTransaction; subtitle: string; onPress: () => void; last?: boolean }) {
  const t = useTheme();
  const s = styleFor(tx.category);
  const color = tx.direction === 'credit' ? t.income : tx.isTransfer ? t.sec : t.label;
  const name = tx.merchant ?? tx.category;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${amountText(tx)}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 16,
        backgroundColor: pressed ? t.fill : 'transparent',
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: t.sep,
      })}
    >
      <IconCircle d={s.icon} fg={s.fg} bg={s.bg} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: t.label }}>{name}</Text>
        <Text numberOfLines={1} style={[type.footnote, { color: t.sec }]}>{subtitle}</Text>
      </View>
      <Text style={{ fontSize: 16, fontWeight: '600', color }}>{amountText(tx)}</Text>
    </Pressable>
  );
}

/** Sheet top bar: leading action, centred title, trailing action (HIG). */
export function SheetHeader({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, minHeight: 56 }}>
      <View style={{ minWidth: 72, alignItems: 'flex-start' }}>{left}</View>
      <Text accessibilityRole="header" numberOfLines={1} style={[type.headline, { color: t.label, flexShrink: 1 }]}>{title}</Text>
      <View style={{ minWidth: 72, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 6 }}>
      <Text style={[type.headline, { color: t.label, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.subhead, { color: t.sec, textAlign: 'center', lineHeight: 21 }]}>{body}</Text>
    </View>
  );
}
