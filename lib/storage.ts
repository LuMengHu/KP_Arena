// Server-only storage for the JSON documents (see the file list below) and photo thumbnails.
// Uses Cloudflare R2 (S3 API) when R2_* env vars are set, otherwise a local ./.data folder
// so the app runs on a laptop with zero setup.
import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import schedule from '@/data/schedule.json';
import { createHash } from 'node:crypto';
import { ensurePins } from './pins';
import { isSealed, keyFromB64, keyFromCode, seal, unseal } from './seal';
import type { Live, Meet, PublicView } from './types';

const useR2 = Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET);
const bucket = process.env.R2_BUCKET ?? '';
const localDir = path.join(process.cwd(), '.data');

let client: S3Client | null = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }
  return client;
}

export const storageMode = useR2 ? 'r2' : 'local';

interface Versioned<T> {
  doc: T;
  etag: string | null;
  /** false when the stored copy is in an old format (plain text, old key): re-seal from /admin */
  current: boolean;
}

// Files in the bucket (all publicly readable through the R2 domain, hence the sealing):
//   public.json          plain   schedule + which rounds are running/done          -> everyone
//   meet.json            sealed with the data key (roster, start lists, records)   -> logged-in classes/students
//   live.json            sealed with the data key (results)                        -> logged-in classes/students
//   private/meet.json    sealed with the server key: master copy incl. class PINs   -> server only
// The data key is handed out by /api/login. Both keys derive from SESSION_SECRET; to retire a leaked
// data key, change SESSION_SECRET (old one in PREVIOUS_SESSION_SECRET), redeploy, and re-seal in /admin.
const secrets = [process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret'), process.env.PREVIOUS_SESSION_SECRET || ''].filter(
  Boolean,
);
const derive = (secret: string, purpose: string) => createHash('sha256').update(`kp-arena:${purpose}:${secret}`).digest();
const keyCache = new Map<string, Promise<CryptoKey>>();
function keyOf(secret: string, purpose: 'data' | 'server') {
  const id = purpose + secret;
  if (!keyCache.has(id)) keyCache.set(id, keyFromB64(derive(secret, purpose).toString('base64')));
  return keyCache.get(id)!;
}
function requireSecret() {
  if (!secrets.length) throw new Error('伺服器未設定 SESSION_SECRET');
  return secrets[0];
}

/** Raw data key for /api/login to hand to a logged-in visitor. */
export const dataKeyB64 = () => derive(requireSecret(), 'data').toString('base64');

async function decode<T>(body: Buffer, purpose: 'data' | 'server'): Promise<{ doc: T; current: boolean }> {
  const parsed = JSON.parse(body.toString('utf8'));
  if (!isSealed(parsed)) return { doc: parsed as T, current: false };
  for (const [i, secret] of secrets.entries()) {
    for (const p of [purpose, purpose === 'data' ? 'server' : 'data'] as const) {
      try {
        return {
          doc: JSON.parse(await unseal(parsed, await keyOf(secret, p))) as T,
          current: i === 0 && p === purpose,
        };
      } catch {
        /* try the next key */
      }
    }
  }
  // files sealed by the short-lived ACCESS_CODE version
  if (process.env.ACCESS_CODE) {
    try {
      return {
        doc: JSON.parse(await unseal(parsed, await keyFromCode(process.env.ACCESS_CODE))) as T,
        current: false,
      };
    } catch {
      /* fall through */
    }
  }
  throw new Error('無法解密資料：SESSION_SECRET 被改過？請把舊值填進 PREVIOUS_SESSION_SECRET 後重新部署。');
}

const sealWith = async (doc: unknown, purpose: 'data' | 'server') => seal(JSON.stringify(doc), await keyOf(requireSecret(), purpose));

async function getRaw(key: string): Promise<{ body: Buffer; etag: string | null } | null> {
  if (useR2) {
    try {
      const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), etag: res.ETag ?? null };
    } catch (e: unknown) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }
  try {
    const body = await readFile(path.join(localDir, key));
    return { body, etag: null };
  } catch {
    return null;
  }
}

export class ConflictError extends Error {}

async function putRaw(key: string, body: Buffer | string, contentType: string, cacheControl: string, ifMatch?: string | null) {
  if (useR2) {
    try {
      await s3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
          ...(ifMatch ? { IfMatch: ifMatch } : {}),
        }),
      );
    } catch (e: unknown) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 412) throw new ConflictError('changed by someone else');
      throw e;
    }
    return;
  }
  // Vercel's filesystem is read-only, so local mode there means the R2 settings are missing.
  if (process.env.VERCEL) throw new Error('伺服器未設定 R2 環境變數，無法儲存。請在 Vercel 填好 R2_* 後重新部署。');
  const file = path.join(localDir, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export function emptyMeet(): Meet {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    name: {
      zh: '2026學年度鏡平學校田徑運動會',
      en: 'Kiang Ping School Athletics Meet 2026',
      pt: 'Encontro de Atletismo da Escola Kiang Ping 2026',
    },
    days: schedule.days,
    rounds: schedule.rounds as Meet['rounds'],
    athletes: [],
    records: [],
    photos: [],
    notice: '',
  };
}

export function emptyLive(): Live {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    results: {},
    running: [],
  };
}

const JSON_TYPE = 'application/json; charset=utf-8';
// Short cache so the 30-second polling sees changes quickly while the CDN absorbs most hits.
const SHORT = 'public, max-age=10';
const MEET_CACHE = 'public, max-age=30';

export async function loadMeet(): Promise<Versioned<Meet>> {
  const raw = await getRaw('private/meet.json');
  if (raw) return { ...(await decode<Meet>(raw.body, 'server')), etag: raw.etag };
  // first run after the upgrade: the master still lives in meet.json
  const legacy = await getRaw('meet.json');
  if (legacy)
    return {
      ...(await decode<Meet>(legacy.body, 'data')),
      etag: null,
      current: false,
    };
  return { doc: emptyMeet(), etag: null, current: false };
}

export async function loadLive(): Promise<Versioned<Live>> {
  const raw = await getRaw('live.json');
  if (!raw) return { doc: emptyLive(), etag: null, current: false };
  return { ...(await decode<Live>(raw.body, 'data')), etag: raw.etag };
}

/** The copy logged-in visitors download: everything except the class PINs. */
function visitorMeet(m: Meet): Meet {
  const { classPins: _pins, ...rest } = m;
  return rest;
}

function publicView(m: Meet, l: Live): PublicView {
  return {
    version: m.version + l.version,
    updatedAt: new Date().toISOString(),
    name: m.name,
    days: m.days,
    rounds: m.rounds.map((r) => ({ ...r, entries: [] })),
    notice: m.notice,
    demo: m.demo,
    running: l.running,
    done: Object.keys(l.results),
  };
}

const putPublic = (m: Meet, l: Live) => putRaw('public.json', JSON.stringify(publicView(m, l)), JSON_TYPE, SHORT);

/**
 * Read-modify-write with optimistic concurrency: if two staff members save at the same
 * moment, R2 rejects the second write (If-Match) and we retry on the fresh copy.
 */
async function update<T extends { version: number; updatedAt: string }>(
  loader: () => Promise<Versioned<T>>,
  write: (doc: T, etag: string | null) => Promise<void>,
  mutate: (doc: T) => void,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { doc, etag } = await loader();
    mutate(doc);
    doc.version += 1;
    doc.updatedAt = new Date().toISOString();
    try {
      await write(doc, etag);
      return doc;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new ConflictError('too many concurrent edits, please retry');
}

export async function updateMeet(mutate: (m: Meet) => void): Promise<Meet> {
  const meet = await update(
    loadMeet,
    async (m, etag) => putRaw('private/meet.json', await sealWith(m, 'server'), JSON_TYPE, 'private, no-store', etag),
    mutate,
  );
  const { doc: live } = await loadLive();
  await putRaw('meet.json', await sealWith(visitorMeet(meet), 'data'), JSON_TYPE, MEET_CACHE);
  await putPublic(meet, live);
  return meet;
}

export async function updateLive(mutate: (l: Live) => void): Promise<Live> {
  const live = await update(loadLive, async (l, etag) => putRaw('live.json', await sealWith(l, 'data'), JSON_TYPE, SHORT, etag), mutate);
  const { doc: meet } = await loadMeet();
  await putPublic(meet, live);
  return live;
}

/** Re-write every published file with the current keys (after the upgrade or a SESSION_SECRET change). */
export async function resealAll() {
  await updateMeet((m) => {
    if (!m.classPins) ensurePins(m); // rosters imported before class PINs existed
  });
  await updateLive(() => {});
}

export async function putPhoto(key: string, jpeg: Buffer) {
  await putRaw(key, jpeg, 'image/jpeg', 'public, max-age=31536000, immutable');
}

export async function getFile(key: string) {
  return getRaw(key);
}
