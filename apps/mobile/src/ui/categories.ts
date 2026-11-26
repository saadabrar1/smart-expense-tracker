import type { Category } from '@smart-expense/engine';

/** Stroke icon paths (24×24 viewBox) and colours per category, as in the approved mockup. */
export const ICONS = {
  food: 'M6 3v7a2 2 0 002 2h0a2 2 0 002-2V3M8 12v9M16 3c-1.7 1.5-2.5 3.7-2.5 6.5V13H16v8',
  clothing: 'M8 3l-5 4 3 4 2-1v11h8V10l2 1 3-4-5-4c-.5 1.7-2 3-4 3s-3.5-1.3-4-3z',
  groceries: 'M3 4h2l2.4 11h10.8L20 8H6.2M9 20h.01M17 20h.01',
  transport: 'M5 16h14M6 16v3M18 16v3M5 16l1.6-5.4A2 2 0 018.5 9h7a2 2 0 011.9 1.6L19 16M8 13h.01M16 13h.01',
  bills: 'M13 2L4 14h7l-1 8 9-12h-7z',
  fuel: 'M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M14 10h2a2 2 0 012 2v4a1.5 1.5 0 003 0V8l-3-3M7 8h4',
  mobile: 'M8 2h8a1 1 0 011 1v18a1 1 0 01-1 1H8a1 1 0 01-1-1V3a1 1 0 011-1zM11 18h2',
  income: 'M12 4v14M6 12l6 6 6-6',
  transfer: 'M4 8h15l-3-3M20 16H5l3 3',
  other: 'M5 12h.01M12 12h.01M19 12h.01',
  health: 'M12 21s-7-4.4-9.3-9A5 5 0 0112 6a5 5 0 019.3 6c-2.3 4.6-9.3 9-9.3 9z',
  education: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  entertainment: 'M5 3l14 9-14 9z',
  rent: 'M3 11l9-7 9 7M5 10v10h14V10',
  cash: 'M3 7h18v10H3zM12 12h.01M7 12h.01M17 12h.01',
  shopping: 'M6 7h12l-1 13H7zM9 7a3 3 0 016 0',
} as const;

export interface CategoryStyle {
  short: string;
  icon: string;
  fg: string;
  bg: string;
}

export const CATEGORY_STYLE: Record<Category, CategoryStyle> = {
  'Food & Dining': { short: 'Food', icon: ICONS.food, fg: '#C2410C', bg: '#FFEDD5' },
  'Groceries': { short: 'Groceries', icon: ICONS.groceries, fg: '#15803D', bg: '#DCFCE7' },
  'Clothing': { short: 'Clothing', icon: ICONS.clothing, fg: '#BE185D', bg: '#FCE7F3' },
  'Transport': { short: 'Transport', icon: ICONS.transport, fg: '#1D4ED8', bg: '#DBEAFE' },
  'Fuel': { short: 'Fuel', icon: ICONS.fuel, fg: '#6D28D9', bg: '#EDE9FE' },
  'Bills & Utilities': { short: 'Bills', icon: ICONS.bills, fg: '#A16207', bg: '#FEF3C7' },
  'Mobile & Internet': { short: 'Mobile', icon: ICONS.mobile, fg: '#0E7490', bg: '#CFFAFE' },
  'Shopping': { short: 'Shopping', icon: ICONS.shopping, fg: '#9D174D', bg: '#FDF2F8' },
  'Health': { short: 'Health', icon: ICONS.health, fg: '#B91C1C', bg: '#FEE2E2' },
  'Education': { short: 'Education', icon: ICONS.education, fg: '#3730A3', bg: '#E0E7FF' },
  'Entertainment': { short: 'Fun', icon: ICONS.entertainment, fg: '#7E22CE', bg: '#F3E8FF' },
  'Rent': { short: 'Rent', icon: ICONS.rent, fg: '#92400E', bg: '#FEF3C7' },
  'Transfers': { short: 'Transfer', icon: ICONS.transfer, fg: '#4B5563', bg: '#E5E7EB' },
  'Income': { short: 'Income', icon: ICONS.income, fg: '#15803D', bg: '#DCFCE7' },
  'Cash Withdrawal': { short: 'Cash', icon: ICONS.cash, fg: '#4B5563', bg: '#E5E7EB' },
  'Other': { short: 'Other', icon: ICONS.other, fg: '#4B5563', bg: '#E5E7EB' },
};

export function styleFor(category: string): CategoryStyle {
  return CATEGORY_STYLE[category as Category] ?? CATEGORY_STYLE.Other;
}

/** Categories offered when adding an expense (most common first). */
export const PICKER_CATEGORIES: Category[] = [
  'Food & Dining', 'Groceries', 'Clothing', 'Transport', 'Fuel', 'Bills & Utilities', 'Mobile & Internet', 'Shopping',
  'Health', 'Education', 'Entertainment', 'Rent', 'Cash Withdrawal', 'Other',
];
