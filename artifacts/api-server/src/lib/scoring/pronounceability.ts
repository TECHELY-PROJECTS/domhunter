export function pronounceabilityScore(name: string): number {
  const s = name.toLowerCase();
  let score = 100;

  const vowels = (s.match(/[aeiou]/g) || []).length;
  const ratio = vowels / s.length;
  if (ratio >= 0.3 && ratio <= 0.55) score += 0;
  else if (ratio >= 0.2 && ratio <= 0.65) score -= 15;
  else score -= 35;

  if (/[^aeiou]{4,}/i.test(s)) score -= 40;
  else if (/[^aeiou]{3,}/i.test(s)) score -= 20;

  if (/[aeiou]{3,}/i.test(s)) score -= 25;

  if (/^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz][aeiou]/i.test(s)) score += 20;
  else if (/^[bcdfghjklmnpqrstvwxyz][aeiou][bcdfghjklmnpqrstvwxyz]/i.test(s)) score += 10;

  if (/[qxz]/i.test(s)) score -= 15;

  if (/[aeioynrlts]$/i.test(s)) score += 10;

  if (/-/.test(s)) score -= 50;
  if (/\d/.test(s)) score -= 30;

  return Math.max(0, Math.min(100, score));
}
