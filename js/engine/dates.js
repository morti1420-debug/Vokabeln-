// All calendar logic uses Europe/Berlin. Days are represented as 'YYYY-MM-DD' strings,
// which compare correctly with < and > and are stable across DST changes.

export const TIME_ZONE = 'Europe/Berlin';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dayKey(date = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(key, days) {
  return new Date(toUtc(key) + days * 86400000).toISOString().slice(0, 10);
}

export function diffDays(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 86400000);
}

// 0 = Sunday … 6 = Saturday
export function weekday(key) {
  return new Date(toUtc(key)).getUTCDay();
}

// The Sunday that starts the week containing `key`.
export function weekStart(key) {
  return addDays(key, -weekday(key));
}

export function formatDay(key, locale = 'de-DE') {
  return new Date(toUtc(key)).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
