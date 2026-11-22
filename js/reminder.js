// Daily reminder: one notification a day at the hour you chose – only when you have not learned yet that day.
// Off by default. The browser's push subscription, the hour and the time zone are stored on the server (Supabase
// function "ev-push", see server/ev-push); nothing about your words or your account is sent. On the iPhone
// notifications only work when the app is on the home screen.

import { SYNC_CONFIG } from './sync-config.js';

export const REMINDER_KEY = 'english-vocabulary:reminder';
export const DEFAULT_HOUR = 18;
export const REMINDER_HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 … 23:00

export class ReminderError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason; // 'unsupported' | 'denied' | 'network' | 'timeout'
  }
}

// The server's public key as the bytes the browser wants.
export function keyBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const validHour = (hour) => (Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR);

export function createReminder({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  config = SYNC_CONFIG,
  nav = globalThis.navigator,
  win = globalThis,
  timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  const url = `${config.url}/functions/v1/ev-push`;

  const read = () => {
    try {
      const saved = JSON.parse(storage?.getItem(REMINDER_KEY) ?? 'null');
      return { on: saved?.on === true, hour: validHour(saved?.hour), endpoint: saved?.endpoint ?? null, studiedDay: saved?.studiedDay ?? null };
    } catch {
      return { on: false, hour: DEFAULT_HOUR, endpoint: null, studiedDay: null };
    }
  };
  const write = (value) => {
    try {
      storage?.setItem(REMINDER_KEY, JSON.stringify(value));
    } catch {}
  };

  async function post(body) {
    let response;
    try {
      response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new ReminderError('network');
    }
    if (!response.ok) throw new ReminderError('network');
  }

  const supported = () => Boolean(config?.url && nav && 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win);

  // The service worker is not there in a plain file preview or right after the very first start.
  const registration = () =>
    Promise.race([
      nav.serviceWorker.ready,
      new Promise((_, reject) => {
        setTimeout(() => reject(new ReminderError('timeout')), 8000);
      }),
    ]);

  async function enable({ hour = read().hour, lang = 'de', studiedDay = null } = {}) {
    if (!supported()) throw new ReminderError('unsupported');
    // Asked first, directly in the tap – Safari refuses the question after any waiting.
    const permission = await win.Notification.requestPermission();
    if (permission !== 'granted') throw new ReminderError('denied');
    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      let publicKey;
      try {
        publicKey = (await (await fetchImpl(url)).json()).publicKey;
      } catch {
        throw new ReminderError('network');
      }
      if (!publicKey) throw new ReminderError('network');
      try {
        subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      } catch {
        throw new ReminderError(win.Notification.permission === 'denied' ? 'denied' : 'unsupported');
      }
    }
    const sub = subscription.toJSON();
    const h = validHour(hour);
    await post({ action: 'subscribe', subscription: { endpoint: sub.endpoint, keys: sub.keys }, hour: h, tz: timeZone(), lang, studiedDay });
    const value = { on: true, hour: h, endpoint: sub.endpoint, studiedDay };
    write(value);
    return value;
  }

  async function disable() {
    const before = read();
    write({ ...before, on: false, endpoint: null });
    try {
      if (before.endpoint) await post({ action: 'unsubscribe', endpoint: before.endpoint });
    } catch {}
    try {
      const reg = await registration();
      await (await reg.pushManager.getSubscription())?.unsubscribe();
    } catch {}
    return read();
  }

  // Tell the server once a day that you have learned – then no reminder comes that day.
  async function studied(day) {
    const s = read();
    if (!s.on || !s.endpoint || !day || s.studiedDay === day) return false;
    write({ ...s, studiedDay: day }); // written first, so a burst of saved cards sends only one request
    try {
      await post({ action: 'studied', endpoint: s.endpoint, day });
      return true;
    } catch {
      write({ ...read(), studiedDay: s.studiedDay });
      return false;
    }
  }

  return { supported, status: read, enable, disable, studied };
}
