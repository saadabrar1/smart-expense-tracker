import { useColorScheme } from 'react-native';

/**
 * Design tokens from the approved mobile mockup (Apple-style). Contrast-checked:
 * secondary text and accent text pass 4.5:1 on their backgrounds in both modes.
 */
const light = {
  dark: false,
  bg: '#F2F2F7',
  card: '#FFFFFF',
  sheet: '#F2F2F7',
  label: '#000000',
  sec: '#6C6C70',
  ter: '#C7C7CC',
  sep: '#E5E5EA',
  fill: '#E3E3E8',
  bar: '#F9F9FB',
  accent: '#0A66D8',
  accentFill: '#0A66D8',
  accentTint: 'rgba(10,102,216,0.1)',
  barSoft: '#B9D3F5',
  warn: '#9A5B00',
  warnBg: '#FFF1DC',
  income: '#1E7F35',
  danger: '#D70015',
  hero: '#111114',
  heroBorder: '#111114',
  segOn: '#FFFFFF',
  keypadBg: '#D1D3D9',
  key: '#FFFFFF',
  switchOn: '#34C759',
};

export type Theme = typeof light;

const dark: Theme = {
  dark: true,
  bg: '#000000',
  card: '#1C1C1E',
  sheet: '#1C1C1E',
  label: '#FFFFFF',
  sec: '#AEAEB2',
  ter: '#636366',
  sep: '#2C2C2E',
  fill: '#2C2C2E',
  bar: '#121214',
  accent: '#5AA9FF',
  accentFill: '#0A66D8',
  accentTint: 'rgba(10,132,255,0.18)',
  barSoft: '#2F4E78',
  warn: '#FFB340',
  warnBg: 'rgba(255,159,10,0.18)',
  income: '#30D158',
  danger: '#FF6961',
  hero: '#1C1C1E',
  heroBorder: '#2C2C2E',
  segOn: '#636366',
  keypadBg: '#2C2C2E',
  key: '#48484A',
  switchOn: '#30D158',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Type scale (iOS): large title 34, title2 22, title3 20, body 17, subhead 15, footnote 13, caption 12. */
export const type = {
  largeTitle: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title2: { fontSize: 22, fontWeight: '700' as const },
  title3: { fontSize: 20, fontWeight: '700' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17 },
  callout: { fontSize: 16 },
  subhead: { fontSize: 15 },
  footnote: { fontSize: 13 },
  caption: { fontSize: 12 },
};

export const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`;
