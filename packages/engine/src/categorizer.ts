import type { CategorizedTransaction, ParsedTransaction } from './types.ts';

/**
 * Layer 2 — categorisation. Priority: user rules → merchant dictionary → keywords → fallback.
 * "Learning" = every user correction becomes a user rule (see learnRule).
 * Unknown merchants are the ones to send to the LLM in batch.
 */

export const CATEGORIES = [
  'Food & Dining', 'Groceries', 'Clothing', 'Transport', 'Fuel', 'Bills & Utilities',
  'Mobile & Internet', 'Shopping', 'Health', 'Education', 'Entertainment', 'Rent',
  'Transfers', 'Income', 'Cash Withdrawal', 'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Seed dictionary of common Pakistani merchants. Lowercase substring → category. */
const MERCHANTS: Record<string, Category> = {
  foodpanda: 'Food & Dining', kfc: 'Food & Dining', mcdonald: 'Food & Dining', 'pizza hut': 'Food & Dining',
  cheezious: 'Food & Dining', 'savour': 'Food & Dining', 'gloria jean': 'Food & Dining', starbucks: 'Food & Dining',
  imtiaz: 'Groceries', carrefour: 'Groceries', 'al-fatah': 'Groceries', 'al fatah': 'Groceries', naheed: 'Groceries',
  metro: 'Groceries', chaseup: 'Groceries', 'chase up': 'Groceries', greenvalley: 'Groceries',
  khaadi: 'Clothing', 'gul ahmed': 'Clothing', 'sapphire': 'Clothing', 'junaid jamshed': 'Clothing',
  outfitters: 'Clothing', breakout: 'Clothing', 'bonanza': 'Clothing', 'alkaram': 'Clothing', limelight: 'Clothing',
  'nishat': 'Clothing', 'zellbury': 'Clothing', 'ethnic': 'Clothing', 'bata': 'Clothing', 'servis': 'Clothing',
  careem: 'Transport', uber: 'Transport', indrive: 'Transport', bykea: 'Transport', yango: 'Transport',
  'pso': 'Fuel', shell: 'Fuel', 'total parco': 'Fuel', attock: 'Fuel', 'go petrol': 'Fuel',
  'k-electric': 'Bills & Utilities', lesco: 'Bills & Utilities', iesco: 'Bills & Utilities', sngpl: 'Bills & Utilities',
  ssgc: 'Bills & Utilities', 'kwsb': 'Bills & Utilities', mepco: 'Bills & Utilities', fesco: 'Bills & Utilities',
  // Not plain "jazz"/"telenor": those would swallow JazzCash / Easypaisa wallet transfers.
  'jazz load': 'Mobile & Internet', 'jazz bundle': 'Mobile & Internet', zong: 'Mobile & Internet', ufone: 'Mobile & Internet',
  ptcl: 'Mobile & Internet', nayatel: 'Mobile & Internet', stormfiber: 'Mobile & Internet',
  daraz: 'Shopping', 'temu': 'Shopping', amazon: 'Shopping', aliexpress: 'Shopping',
  netflix: 'Entertainment', spotify: 'Entertainment', youtube: 'Entertainment', cinepax: 'Entertainment', nueplex: 'Entertainment',
  'shaukat khanum': 'Health', 'agha khan': 'Health', 'aga khan': 'Health', dawaai: 'Health', 'servaid': 'Health', 'd. watson': 'Health',
};

const KEYWORDS: [RegExp, Category][] = [
  [/\b(atm|cash withdrawal|withdrawn)\b/i, 'Cash Withdrawal'],
  [/\b(mobile package|mobile load|easyload|recharge|bundle|top ?up)\b/i, 'Mobile & Internet'],
  [/\b(restaurant|cafe|bakery|biryani|tikka|karahi|burger|pizza)\b/i, 'Food & Dining'],
  [/\b(mart|store|grocer|super ?market|kiryana)\b/i, 'Groceries'],
  [/\b(garments?|cloth|tailor|boutique|apparel|shoes|footwear)\b/i, 'Clothing'],
  [/\b(petrol|fuel|filling station)\b/i, 'Fuel'],
  [/\b(electric|gas bill|water bill|utility)\b/i, 'Bills & Utilities'],
  [/\b(pharmacy|hospital|clinic|medical|lab)\b/i, 'Health'],
  [/\b(school|college|university|academy|fee)\b/i, 'Education'],
  [/\b(rent)\b/i, 'Rent'],
];

export type UserRules = Map<string, Category>;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function categorize(tx: ParsedTransaction, userRules: UserRules = new Map()): CategorizedTransaction {
  if (tx.isTransfer) return { ...tx, category: 'Transfers', categorizedBy: 'keyword' };
  if (tx.direction === 'credit') return { ...tx, category: 'Income', categorizedBy: 'keyword' };

  const merchant = tx.merchant ? norm(tx.merchant) : '';
  if (merchant) {
    const rule = userRules.get(merchant);
    if (rule) return { ...tx, category: rule, categorizedBy: 'user-rule' };
    for (const [key, cat] of Object.entries(MERCHANTS)) {
      if (merchant.includes(key)) return { ...tx, category: cat, categorizedBy: 'dictionary' };
    }
  }
  // The bank's own merchant category (card networks' MCC descriptions) beats guessing from the name.
  const fromBank = tx.bankCategory ? categoryFromBank(tx.bankCategory) : null;
  if (fromBank) return { ...tx, category: fromBank, categorizedBy: 'bank' };
  for (const [re, cat] of KEYWORDS) {
    if (re.test(merchant)) return { ...tx, category: cat, categorizedBy: 'keyword' };
  }
  return { ...tx, category: 'Other', categorizedBy: 'fallback' };
}

/** Bank / card-network merchant category text (MCC descriptions) → our category. */
const BANK_CATEGORY: [RegExp, Category][] = [
  [/grocer|supermarket|convenience|food store|bakeries/i, 'Groceries'],
  [/restaurant|eating|fast food|caterer|bars?\b|cafe|food deliver/i, 'Food & Dining'],
  [/fuel|petrol|service station|gas station|automated fuel/i, 'Fuel'],
  [/clothing|apparel|shoe|fashion|tailor|boutique/i, 'Clothing'],
  [/telecom|mobile|cellular|internet|cable/i, 'Mobile & Internet'],
  [/utilit|electric|gas supply|water/i, 'Bills & Utilities'],
  [/pharmac|drug|medical|hospital|doctor|dental|health|optic/i, 'Health'],
  [/school|college|universit|education/i, 'Education'],
  [/taxi|ride|transport|airline|bus|railway|parking|toll/i, 'Transport'],
  [/cinema|movie|entertainment|recreation|sport|game|stream/i, 'Entertainment'],
  [/department|retail|e-?commerce|online|electronics|merchandise|store/i, 'Shopping'],
];

export function categoryFromBank(text: string): Category | null {
  for (const [re, cat] of BANK_CATEGORY) if (re.test(text)) return cat;
  return null;
}

/** Call when the user changes a transaction's category — future ones from that merchant follow it. */
export function learnRule(rules: UserRules, merchant: string, category: Category): UserRules {
  const next = new Map(rules);
  next.set(norm(merchant), category);
  return next;
}
