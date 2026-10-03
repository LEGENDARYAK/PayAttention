export function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

export function hostnameFromUrl(value: string): string {
  return normalizeHostname(safeUrl(value)?.hostname ?? '');
}

export function isSupportedWebUrl(value: string): boolean {
  const parsed = safeUrl(value);
  return parsed?.protocol === 'http:' || parsed?.protocol === 'https:' || parsed?.protocol === 'file:';
}

export function makeId(prefix = 'pa'): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomPart}`;
}
