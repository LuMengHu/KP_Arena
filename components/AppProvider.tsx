'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { t as translate, type Key } from '@/lib/i18n';
import { isSealed, keyFromB64, unseal } from '@/lib/seal';
import type { Athlete, Live, Meet, PublicView } from '@/lib/types';

// Where the published JSON lives. In production this is the R2 custom domain,
// e.g. https://data.example.com. Without it we read through our own API route.
const BASE = (process.env.NEXT_PUBLIC_DATA_URL ?? '').replace(/\/$/, '') || '/api/public';
const LIVE_EVERY = 30_000;
const MEET_EVERY = 5 * 60_000;

/** Logged-in viewer. Not logged in (null) = visitor: schedule only. */
export type Identity = { type: 'athlete'; cls: string; bib: string } | { type: 'class'; cls: string };

interface Auth {
  identity: Identity;
  key: string; // base64 data key from /api/login
}

interface Ctx {
  t: (key: Key, vars?: Record<string, string | number>) => string;
  identity: Identity | null;
  loggedIn: boolean;
  /** resolves to an error message, or '' when logged in */
  login: (body: { type: 'class'; cls: string; pin: string } | { type: 'athlete'; cls: string; bib: string }) => Promise<string>;
  logout: () => void;
  /** set when a saved login stopped working (the school changed the key) */
  expired: boolean;
  meet: Meet | null;
  live: Live | null;
  offline: boolean;
  lastFetch: Date | null;
  athleteByBib: Map<string, Athlete>;
  assetUrl: (key: string) => string;
  refresh: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

function readLocal<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the app still works, just without offline copy */
  }
}

class NotFound extends Error {}
class BadKey extends Error {}

async function getText(name: string): Promise<string> {
  // no-cache = revalidate with the CDN every time (cheap 304 when unchanged)
  const res = await fetch(`${BASE}/${name}`, { cache: 'no-cache' });
  if (res.status === 404) throw new NotFound(name);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.text();
}

/** Visitors get the schedule only: rebuild Meet/Live shapes so every page renders from the same types. */
function fromPublic(p: PublicView): { meet: Meet; live: Live } {
  return {
    meet: {
      version: p.version,
      updatedAt: p.updatedAt,
      name: p.name,
      days: p.days,
      rounds: p.rounds,
      athletes: [],
      records: [],
      photos: [],
      notice: p.notice,
      demo: p.demo,
    },
    live: {
      version: p.version,
      updatedAt: p.updatedAt,
      running: p.running,
      results: Object.fromEntries(p.done.map((id) => [id, { rows: [], publishedAt: '', by: '' }])),
    },
  };
}

const CACHE_KEYS = ['kp_meet', 'kp_live', 'kp_public'];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [meet, setMeet] = useState<Meet | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const lastMeet = useRef(0);
  const key = useRef<{ b64: string; key: Promise<CryptoKey> } | null>(null);
  const authRef = useRef<Auth | null>(null);
  authRef.current = auth;

  useEffect(() => {
    writeLocal('kp_identity', null); // identity from the version without logins
    const saved = readLocal<Auth>('kp_auth');
    setAuth(saved);
    // show the last copy instantly (also covers a dead network at the stadium)
    if (saved) {
      const m = readLocal<Meet>('kp_meet');
      const l = readLocal<Live>('kp_live');
      if (m) setMeet(m);
      if (l) setLive(l);
    } else {
      const p = readLocal<PublicView>('kp_public');
      if (p) {
        const v = fromPublic(p);
        setMeet(v.meet);
        setLive(v.live);
      }
    }
    setReady(true);
  }, []);

  const signOut = useCallback((why: 'expired' | 'user') => {
    for (const k of ['kp_auth', ...CACHE_KEYS]) writeLocal(k, null);
    key.current = null;
    lastMeet.current = 0;
    setAuth(null);
    setMeet(null);
    setLive(null);
    setExpired(why === 'expired');
  }, []);

  const open = useCallback(async <T,>(text: string, b64: string): Promise<T> => {
    const parsed = JSON.parse(text);
    if (!isSealed(parsed)) return parsed as T; // only before the first upgrade re-seal
    if (key.current?.b64 !== b64) key.current = { b64, key: keyFromB64(b64) };
    try {
      return JSON.parse(await unseal(parsed, await key.current.key)) as T;
    } catch {
      throw new BadKey();
    }
  }, []);

  const poll = useCallback(
    async (forceMeet = false) => {
      const a = authRef.current;
      try {
        if (!a) {
          let p: PublicView;
          try {
            p = JSON.parse(await getText('public.json'));
          } catch (e) {
            if (!(e instanceof NotFound)) throw e;
            // public.json appears once staff open /admin after the upgrade; until then nothing to show
            p = {
              version: 0,
              updatedAt: '',
              name: { zh: '', en: '', pt: '' },
              days: [],
              rounds: [],
              notice: '',
              running: [],
              done: [],
            };
          }
          if (authRef.current) return; // logged in meanwhile
          const v = fromPublic(p);
          setMeet(v.meet);
          setLive(v.live);
          writeLocal('kp_public', p);
        } else {
          const jobs: Promise<unknown>[] = [
            getText('live.json')
              .then((t) => open<Live>(t, a.key))
              .then((l) => {
                if (authRef.current !== a) return;
                setLive(l);
                writeLocal('kp_live', l);
              }),
          ];
          if (forceMeet || Date.now() - lastMeet.current > MEET_EVERY) {
            jobs.push(
              getText('meet.json')
                .then((t) => open<Meet>(t, a.key))
                .then((m) => {
                  if (authRef.current !== a) return;
                  lastMeet.current = Date.now();
                  setMeet(m);
                  writeLocal('kp_meet', m);
                }),
            );
          }
          await Promise.all(jobs);
        }
        setOffline(false);
        setLastFetch(new Date());
      } catch (e) {
        if (e instanceof BadKey) signOut('expired');
        else setOffline(true);
      }
    },
    [open, signOut],
  );

  const login: Ctx['login'] = useCallback(
    async (body) => {
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return data.error ?? `登入失敗（${res.status}）`;
        const a: Auth = { identity: data.identity, key: data.key };
        for (const k of CACHE_KEYS) writeLocal(k, null);
        writeLocal('kp_auth', a);
        authRef.current = a;
        setAuth(a);
        setExpired(false);
        setMeet(null);
        setLive(null);
        await poll(true);
        return '';
      } catch {
        return '網絡不穩，請再試一次';
      }
    },
    [poll],
  );

  useEffect(() => {
    if (!ready) return;
    poll(true);
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') poll();
    }, LIVE_EVERY);
    const onVisible = () => document.visibilityState === 'visible' && poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll, ready, auth]);

  const athleteByBib = useMemo(() => new Map((meet?.athletes ?? []).map((a) => [a.bib, a])), [meet]);

  const value: Ctx = {
    t: translate,
    identity: auth?.identity ?? null,
    loggedIn: Boolean(auth),
    login,
    logout: () => signOut('user'),
    expired,
    meet,
    live,
    offline,
    lastFetch,
    athleteByBib,
    assetUrl: (key) => `${BASE}/${key}`,
    refresh: () => poll(true),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
