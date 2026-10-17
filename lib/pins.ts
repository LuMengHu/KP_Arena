import 'server-only';
import { randomInt } from 'node:crypto';
import type { Meet } from './types';

/** Class codes are typed on phones: compare without case or spaces. */
export const normCls = (s: string) => s.replace(/\s+/g, '').toUpperCase();

export const classesOf = (m: Meet) => [...new Set(m.athletes.map((a) => a.cls).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));

const newPin = (taken: Set<string>) => {
  // distinct PINs per class, so a PIN typed under the wrong class never opens another one by accident
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, '0');
    if (!taken.has(pin)) return pin;
  }
};

/** Give every class on the roster a PIN (keeps existing ones). `all` regenerates every PIN. */
export function ensurePins(m: Meet, all = false) {
  const old = all ? {} : (m.classPins ?? {});
  const pins: Record<string, string> = {};
  const taken = new Set<string>();
  for (const cls of classesOf(m)) {
    const keep = old[cls];
    pins[cls] = keep && !taken.has(keep) ? keep : newPin(taken);
    taken.add(pins[cls]);
  }
  m.classPins = pins;
}
