export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed === undefined ? fallback : (parsed as T);
  } catch (error) {
    console.warn('Invalid JSON payload ignored:', error);
    return fallback;
  }
}
