// Account and sync: sign in with your e-mail address (e.g. Gmail) and the same learning progress is on every device.
// Learning stays local-first – the app works offline and without an account; with an account each course's saved
// state is also kept in the cloud (Supabase, Frankfurt) and joined with the other devices' state (js/engine/merge.js).
// Only your own rows can be read or written (row level security). The password is never stored, only the session.

import { mergeStates, sameLearning } from './engine/merge.js';
import { SYNC_CONFIG } from './sync-config.js';

export const SESSION_KEY = 'english-vocabulary:account';
const META_PREFIX = 'english-vocabulary:sync:';

export class SyncError extends Error {
  constructor(reason, detail = '') {
    super(detail || reason);
    this.reason = reason; // 'network' | 'credentials' | 'exists' | 'weak' | 'email' | 'offline-server' | 'auth' | 'server'
  }
}

const readJson = (storage, key) => {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};
const writeJson = (storage, key, value) => {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {}
};

export function createSync({ fetchImpl = globalThis.fetch?.bind(globalThis), storage = globalThis.localStorage, config = SYNC_CONFIG, now = () => Date.now() } = {}) {
  const enabled = Boolean(config?.url && config?.key);
  const headers = (token) => ({ apikey: config.key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });

  async function call(path, { method = 'GET', body, token, prefer, keepalive = false } = {}) {
    let response;
    try {
      response = await fetchImpl(`${config.url}${path}`, {
        method,
        headers: { ...headers(token), ...(prefer ? { Prefer: prefer } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        keepalive,
      });
    } catch {
      throw new SyncError('network');
    }
    let data = null;
    try {
      data = await response.json();
    } catch {}
    if (!response.ok) {
      const text = `${data?.error_code ?? ''} ${data?.msg ?? ''} ${data?.error_description ?? ''} ${data?.message ?? ''} ${data?.error ?? ''}`.toLowerCase();
      if (response.status === 400 && /invalid.*(credential|grant)|invalid login/.test(text)) throw new SyncError('credentials');
      if (/already|exists|registered/.test(text)) throw new SyncError('exists');
      if (/weak|password.*(short|least)/.test(text)) throw new SyncError('weak');
      if (/email.*(invalid|valid)|invalid.*email/.test(text)) throw new SyncError('email');
      if (response.status === 401 || response.status === 403) throw new SyncError('auth');
      if (response.status === 540 || response.status === 503) throw new SyncError('offline-server');
      throw new SyncError('server', text.trim());
    }
    return data;
  }

  const session = () => readJson(storage, SESSION_KEY);
  // Name and profile picture come from the account (Google fills them in); kept from before when a refresh lacks them.
  const profileOf = (user) => ({
    name: user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null,
    avatar: user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null,
    provider: user?.app_metadata?.provider ?? null,
  });
  const saveSession = (data, email) => {
    const before = session();
    const p = profileOf(data.user);
    const s = {
      email: data.user?.email ?? email ?? before?.email,
      userId: data.user?.id ?? before?.userId,
      name: p.name ?? before?.name ?? null,
      avatar: p.avatar ?? before?.avatar ?? null,
      provider: p.provider ?? before?.provider ?? null,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now() + (data.expires_in ?? 3600) * 1000,
    };
    writeJson(storage, SESSION_KEY, s);
    return s;
  };

  async function token() {
    const s = session();
    if (!s) throw new SyncError('auth');
    if (s.expiresAt - now() > 60_000) return s;
    try {
      const data = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refreshToken } });
      return saveSession(data, s.email);
    } catch (e) {
      if (e.reason === 'auth' || e.reason === 'credentials' || e.reason === 'server') writeJson(storage, SESSION_KEY, null);
      throw e.reason === 'network' ? e : new SyncError('auth');
    }
  }

  const meta = (course) => readJson(storage, META_PREFIX + course) ?? { remoteAt: null, syncedAt: null };
  const saveMeta = (course, m) => writeJson(storage, META_PREFIX + course, m);

  async function signIn(email, password) {
    const data = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: String(email).trim(), password } });
    return saveSession(data, email);
  }

  // Which sign-in ways the project has switched on (Google needs a one-time setup in Supabase).
  const PROVIDERS_KEY = 'english-vocabulary:auth-providers';
  async function providers() {
    try {
      const data = await call('/auth/v1/settings');
      const out = { google: Boolean(data?.external?.google) };
      writeJson(storage, PROVIDERS_KEY, out);
      return out;
    } catch {
      return readJson(storage, PROVIDERS_KEY) ?? { google: false };
    }
  }

  return {
    enabled,
    account: () => session(),
    providers,
    knownProviders: () => readJson(storage, PROVIDERS_KEY) ?? { google: false },
    // "Mit Google anmelden": Google asks for the account, then sends the browser back to `returnTo` with the
    // session in the address (#access_token=…), which completeRedirect() picks up.
    googleUrl: (returnTo) => `${config.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(returnTo)}`,
    async completeRedirect(hash) {
      const params = new URLSearchParams(String(hash).replace(/^#/, ''));
      if (params.get('error') || params.get('error_description')) throw new SyncError('google', params.get('error_description') ?? params.get('error'));
      const accessToken = params.get('access_token');
      if (!accessToken) return null;
      const user = await call('/auth/v1/user', { token: accessToken });
      return saveSession({ access_token: accessToken, refresh_token: params.get('refresh_token'), expires_in: Number(params.get('expires_in')) || 3600, user }, user?.email);
    },
    lastSync: (course) => meta(course).syncedAt,
    signIn,
    // A new account (no confirmation e-mail needed), then signed in right away.
    async signUp(email, password) {
      await call('/functions/v1/ev-signup', { method: 'POST', body: { email: String(email).trim(), password } });
      return signIn(email, password);
    },
    async signOut() {
      const s = session();
      writeJson(storage, SESSION_KEY, null);
      for (const course of ['de-en', 'zh-de']) saveMeta(course, null);
      if (s) call('/auth/v1/logout', { method: 'POST', token: s.accessToken }).catch(() => {});
    },
    // Joins the local state with the cloud state and uploads the result.
    // Returns { state, changed } – `changed` when the local state got something from another device.
    // allowApply: false while a card is on screen – then nothing is changed locally and the next sync catches up.
    async sync(course, local, { allowApply = true } = {}) {
      const s = await token();
      const where = `user_id=eq.${s.userId}&course=eq.${encodeURIComponent(course)}`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const rows = await call(`/rest/v1/ev_sync?select=state,updated_at&${where}`, { token: s.accessToken });
        const remote = rows?.[0] ?? null;
        const m = meta(course);
        const remoteChanged = Boolean(remote) && remote.updated_at !== m.remoteAt;
        if (remoteChanged && !allowApply) return { state: local, changed: false, deferred: true };
        // Nothing new in the cloud since the last sync → this device's state is simply the newest one.
        const merged = remoteChanged ? mergeStates(local, remote.state) : local;
        if (remote && sameLearning(merged, remote.state)) {
          saveMeta(course, { remoteAt: remote.updated_at, syncedAt: now() });
          return { state: merged, changed: !sameLearning(merged, local) };
        }
        // Upload; with an existing row only if nobody else uploaded in between (otherwise join again).
        const saved = remote
          ? await call(`/rest/v1/ev_sync?${where}&updated_at=eq.${encodeURIComponent(remote.updated_at)}`, { method: 'PATCH', token: s.accessToken, body: { state: merged }, prefer: 'return=representation' })
          : await call('/rest/v1/ev_sync?on_conflict=user_id,course', { method: 'POST', token: s.accessToken, body: { user_id: s.userId, course, state: merged }, prefer: 'return=representation,resolution=ignore-duplicates' });
        if (saved?.length) {
          saveMeta(course, { remoteAt: saved[0].updated_at, syncedAt: now() });
          return { state: merged, changed: !sameLearning(merged, local) };
        }
      }
      throw new SyncError('server', 'busy');
    },
  };
}
