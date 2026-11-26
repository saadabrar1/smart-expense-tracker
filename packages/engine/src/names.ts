/**
 * Same person, spelled differently by different banks? ("AHMED KHAN" at a bank vs "AHMAD KHAN"
 * at a wallet is real.) Same number of name parts, each part equal or one edit apart.
 */
export function isSameName(a: string, b: string): boolean {
  const parts = (s: string) => s.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);
  const pa = parts(a);
  const pb = parts(b);
  if (!pa.length || pa.length !== pb.length) return false;
  return pa.every((x, i) => x === pb[i] || (x.length >= 4 && pb[i].length >= 4 && editDistance(x, pb[i]) <= 1));
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}
