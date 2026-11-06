import {
  defaultTypography,
  parseTypography,
  type TypographyPreferences,
} from '../typography/typography';

const key = (uid: string | null) => 'writer:typography:v1:' + (uid ? 'user:' + uid : 'anonymous');

export function readTypography(uid: string | null): TypographyPreferences {
  try {
    const raw = localStorage.getItem(key(uid));
    return (raw && parseTypography(JSON.parse(raw))) || defaultTypography();
  } catch {
    return defaultTypography();
  }
}

export function saveTypography(uid: string | null, preferences: TypographyPreferences): void {
  const parsed = parseTypography(preferences);
  if (!parsed) throw new Error('A combinação de fontes é inválida.');
  localStorage.setItem(key(uid), JSON.stringify(parsed));
}
