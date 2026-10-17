'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { t as translate, type Key } from '@/lib/i18n';
import { isSealed, keyFromCode, normalizeCode, unseal } from '@/lib/seal';
import type { Athlete, Live, Meet } from '@/lib/types';

// Where the public JSON lives. In production this is the R2 custom domain,
// e.g. https://data.example.com. Without it we read through our own API route.
const BASE = (process.env.NEXT_PUBLIC_DATA_URL ?? '').replace(/\/$/, '') || '/api/public';
const LIVE_EVERY = 30_000;
const MEET_EVERY = 5 * 60_000;

export type Identity = { type: 'student'; bib: string } | { type: 'class'; cls: string } | { type: 'guest' };

interface Ctx {
  t: (key: Key, vars?: Record<string, string | number>) => string;
  identity: Identity | null;
  setIdentity: (i: Identity | null) => void;
  meet: Meet | null;
  live: Live | null;
  offline: boolean;
  lastFetch: Date | null;
  athleteByBib: Map<string, Athlete>;
  assetUrl: (key: string) => string;
  refresh: () => void;
  lock: Lock;
  unlock: (code: string) => Promise<boolean>;
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

async function getText(name: string): Promise<string> {
  // no-cache = revalidate with the CDN every time (cheap 304 when unchanged)
  const res = await fetch(`${BASE}/${name}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.text();
}

/** 'need': data is sealed and we have no code; 'wrong': the typed code failed; 'changed': the saved code stopped working. */
export type Lock = 'open' | 'need' | 'wrong' | 'changed';

class Locked extends Error {}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentityState] = useState<Identity | null>(null);
  const [meet, setMeet] = useState<Meet | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [offline, setOffline] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [lock, setLock] = useState<Lock>('open');
  const lastMeet = useRef(0);
  const key = useRef<CryptoKey | null>(null);

  useEffect(() => {
    setIdentityState(readLocal<Identity>('kp_identity'));
    // show the last copy instantly (also covers a dead network at the stadium)
    const m = readLocal<Meet>('kp_meet');
    const l = readLocal<Live>('kp_live');
    if (m) setMeet(m);
    if (l) setLive(l);
  }, []);

  /** Parse a downloaded file, decrypting it with the school access code when it is sealed. */
  const open = useCallback(async <T,>(text: string): Promise<T> => {
    const parsed = JSON.parse(text);
    if (!isSealed(parsed)) return parsed as T;
    if (!key.current) {
      const saved = readLocal<string>('kp_code');
      if (!saved) throw new Locked('need');
      key.current = await keyFromCode(saved);
    }
    try {
      return JSON.parse(await unseal(parsed, key.current)) as T;
    } catch {
      // the code was changed by the school: forget it and the copies it unlocked
      key.current = null;
      for (const k of ['kp_code', 'kp_meet', 'kp_live']) writeLocal(k, null);
      setMeet(null);
      setLive(null);
      throw new Locked('changed');
    }
  }, []);

  const poll = useCallback(
    async (forceMeet = false) => {
      try {
        const jobs: Promise<unknown>[] = [
          getText('live.json')
            .then((t) => open<Live>(t))
            .then((l) => {
              setLive(l);
              writeLocal('kp_live', l);
            }),
        ];
        if (forceMeet || Date.now() - lastMeet.current > MEET_EVERY) {
          jobs.push(
            getText('meet.json')
              .then((t) => open<Meet>(t))
              .then((m) => {
                lastMeet.current = Date.now();
                setMeet(m);
                writeLocal('kp_meet', m);
              }),
          );
        }
        await Promise.all(jobs);
        setLock('open');
        setOffline(false);
        setLastFetch(new Date());
      } catch (e) {
        if (e instanceof Locked) setLock(e.message as Lock);
        else setOffline(true);
      }
    },
    [open],
  );

  /** Try a typed access code; resolves false when it is wrong. */
  const unlock = useCallback(
    async (code: string) => {
      const text = await getText('live.json');
      const parsed = JSON.parse(text);
      const k = await keyFromCode(code);
      if (isSealed(parsed)) {
        try {
          await unseal(parsed, k);
        } catch {
          setLock('wrong');
          return false;
        }
      }
      key.current = k;
      writeLocal('kp_code', normalizeCode(code));
      await poll(true);
      return true;
    },
    [poll],
  );

  useEffect(() => {
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
  }, [poll]);

  const athleteByBib = useMemo(() => new Map((meet?.athletes ?? []).map((a) => [a.bib, a])), [meet]);

  const value: Ctx = {
    t: translate,
    identity,
    setIdentity: (i) => {
      setIdentityState(i);
      writeLocal('kp_identity', i);
    },
    meet,
    live,
    offline,
    lastFetch,
    athleteByBib,
    assetUrl: (key) => `${BASE}/${key}`,
    refresh: () => poll(true),
    lock,
    unlock,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}
