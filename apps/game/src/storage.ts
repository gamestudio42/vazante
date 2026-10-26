import { decodeSave, encodeSave, type SaveGame, type SaveMeta } from '@vazante/shared';

/** Saves live in IndexedDB (structured clone, no encoding) and can be exported to a file. */
const DB = 'vazante';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

interface Record_ {
  meta: SaveMeta;
  save: SaveGame;
}

export async function putSave(slot: string, save: SaveGame): Promise<SaveMeta> {
  const meta: SaveMeta = { slot, scenario: save.scenario, seed: save.seed, tick: save.tick, savedAt: Date.now() };
  await run('readwrite', (s) => s.put({ meta, save } satisfies Record_, slot));
  return meta;
}

export async function getSave(slot: string): Promise<SaveGame | null> {
  const r = await run<Record_ | undefined>('readonly', (s) => s.get(slot));
  return r?.save ?? null;
}

export async function listSaves(): Promise<SaveMeta[]> {
  try {
    const all = await run<Record_[]>('readonly', (s) => s.getAll());
    return all.map((r) => r.meta).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function deleteSave(slot: string): Promise<void> {
  await run('readwrite', (s) => s.delete(slot));
}

/** Gzipped JSON. */
export async function exportSave(save: SaveGame): Promise<Blob> {
  const text = new Blob([encodeSave(save)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(text).blob();
}

export async function importSave(file: Blob): Promise<SaveGame> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  const text = gz ? await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await file.text();
  return decodeSave(text);
}

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
