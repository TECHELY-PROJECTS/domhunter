export function lengthScore(len: number): number {
  if (len <= 4) return 100;
  if (len === 5) return 92;
  if (len === 6) return 82;
  if (len === 7) return 72;
  if (len === 8) return 60;
  if (len === 9) return 48;
  if (len === 10) return 38;
  if (len <= 12) return 25;
  if (len <= 15) return 15;
  return 5;
}
