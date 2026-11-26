/** Applies one keypad press to the amount string: max 9 digits, 2 decimals, one decimal point. */
export function pressKey(amount: string, key: string): string {
  if (key === 'del') return amount.slice(0, -1);
  if (key === '.') return amount.includes('.') ? amount : (amount || '0') + '.';
  if (amount.includes('.') && amount.split('.')[1].length >= 2) return amount;
  if (amount.replace('.', '').length >= 9) return amount;
  return (amount === '0' ? '' : amount) + key;
}
