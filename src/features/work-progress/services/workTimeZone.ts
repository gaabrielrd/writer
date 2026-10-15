export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
export function availableTimeZones(): string[] {
  try {
    return [...new Set(['UTC', deviceTimeZone(), ...Intl.supportedValuesOf('timeZone')])];
  } catch {
    return [...new Set(['UTC', deviceTimeZone()])];
  }
}
export function formatWorkDate(value: number, timeZone: string): string {
  if (!Number.isFinite(value) || value < 0 || value > 8_640_000_000_000_000)
    return 'Data indisponível';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value);
  } catch {
    return 'Data indisponível';
  }
}
