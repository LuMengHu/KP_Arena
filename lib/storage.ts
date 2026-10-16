// Server-only storage for the two JSON documents (meet.json, live.json) and photo thumbnails.
// Uses Cloudflare R2 (S3 API) when R2_* env vars are set, otherwise a local ./.data folder
// so the app runs on a laptop with zero setup.
import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import schedule from '@/data/schedule.json';
import type { Live, Meet } from './types';

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
}

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
  return { version: 1, updatedAt: new Date().toISOString(), results: {}, running: [] };
}

async function load<T>(key: string, fallback: () => T): Promise<Versioned<T>> {
  const raw = await getRaw(key);
  if (!raw) return { doc: fallback(), etag: null };
  return { doc: JSON.parse(raw.body.toString('utf8')) as T, etag: raw.etag };
}

export const loadMeet = () => load<Meet>('meet.json', emptyMeet);
export const loadLive = () => load<Live>('live.json', emptyLive);

// Short cache so the 30-second polling sees changes quickly while the CDN absorbs most hits.
const CACHE = { 'meet.json': 'public, max-age=30', 'live.json': 'public, max-age=10' } as const;

/**
 * Read-modify-write with optimistic concurrency: if two staff members save at the same
 * moment, R2 rejects the second write (If-Match) and we retry on the fresh copy.
 */
async function update<T extends { version: number; updatedAt: string }>(
  key: 'meet.json' | 'live.json',
  loader: () => Promise<Versioned<T>>,
  mutate: (doc: T) => void,
): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { doc, etag } = await loader();
    mutate(doc);
    doc.version += 1;
    doc.updatedAt = new Date().toISOString();
    try {
      await putRaw(key, JSON.stringify(doc), 'application/json; charset=utf-8', CACHE[key], etag);
      return doc;
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  throw new ConflictError('too many concurrent edits, please retry');
}

export const updateMeet = (mutate: (m: Meet) => void) => update('meet.json', loadMeet, mutate);
export const updateLive = (mutate: (l: Live) => void) => update('live.json', loadLive, mutate);

export async function putPhoto(key: string, jpeg: Buffer) {
  await putRaw(key, jpeg, 'image/jpeg', 'public, max-age=31536000, immutable');
}

export async function getFile(key: string) {
  return getRaw(key);
}
