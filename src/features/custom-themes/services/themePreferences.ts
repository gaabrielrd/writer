import type { CustomTheme } from '../model/customTheme';
import { validateTheme } from '../model/customTheme';
const key = (uid: string) => 'writer_custom_theme_v1:' + uid;
export function readThemePreference(uid: string): CustomTheme | null {
  try {
    const raw = localStorage.getItem(key(uid));
    return raw ? validateTheme(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
export function saveThemePreference(uid: string, theme: CustomTheme | null): void {
  if (theme) localStorage.setItem(key(uid), JSON.stringify(theme));
  else localStorage.removeItem(key(uid));
}
