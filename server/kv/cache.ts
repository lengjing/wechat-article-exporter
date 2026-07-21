import { promises as fs } from 'node:fs';
import { resolve, dirname } from 'node:path';

const CACHE_DIR = resolve(process.cwd(), '.data', 'cache');

// ====== 通用 JSON 存储（适用于非 article 的 store）======

function storePath(store: string): string {
  return resolve(CACHE_DIR, `${store}.json`);
}

async function readStore<T>(store: string): Promise<Map<string, T>> {
  const path = storePath(store);
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const arr = JSON.parse(raw) as { key: string; value: T }[];
    return new Map(arr.map(i => [i.key, i.value]));
  } catch {
    return new Map();
  }
}

async function writeStore<T>(store: string, map: Map<string, T>): Promise<void> {
  const path = storePath(store);
  await fs.mkdir(dirname(path), { recursive: true });
  const arr = Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  await fs.writeFile(path, JSON.stringify(arr, null, 2), 'utf-8');
}

/** 获取单个缓存 */
export async function cacheGet<T>(store: string, key: string): Promise<T | undefined> {
  const map = await readStore<T>(store);
  return map.get(key);
}

/** 写入缓存 */
export async function cachePut<T>(store: string, key: string, value: T): Promise<void> {
  const map = await readStore<T>(store);
  map.set(key, value);
  await writeStore(store, map);
}

/** 获取 store 下所有缓存 */
export async function cacheGetAll<T>(store: string): Promise<{ key: string; value: T }[]> {
  const map = await readStore<T>(store);
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

/** 删除单个缓存 */
export async function cacheDelete(store: string, key: string): Promise<void> {
  const map = await readStore(store);
  map.delete(key);
  await writeStore(store, map);
}

/** 批量删除（按 key 前缀匹配） */
export async function cacheDeleteByPrefix(store: string, prefix: string): Promise<number> {
  const map = await readStore(store);
  let count = 0;
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) {
      map.delete(key);
      count++;
    }
  }
  if (count > 0) {
    await writeStore(store, map);
  }
  return count;
}

// ====== NDJSON 文章存储（按 fakeid 目录分隔）======
//
// 存储结构: .data/cache/article/{fakeid}.ndjson
// 每行一条 JSON: {"key":"fakeid:aid","value":{...article...}}

/** 获取文章的 NDJSON 文件路径 */
function articleNdjsonPath(fakeid: string): string {
  return resolve(CACHE_DIR, 'article', `${fakeid}.ndjson`);
}

/** 从 NDJSON 文件读取所有文章 */
export async function articleNdjsonGetAll(fakeid: string): Promise<{ key: string; value: any }[]> {
  const path = articleNdjsonPath(fakeid);
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    return lines.map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

/** 追加一条文章到 NDJSON（新文章） */
export async function articleNdjsonAppend(fakeid: string, key: string, value: any): Promise<void> {
  const path = articleNdjsonPath(fakeid);
  await fs.mkdir(dirname(path), { recursive: true });
  const line = JSON.stringify({ key, value }) + '\n';
  await fs.appendFile(path, line, 'utf-8');
}

/**
 * 更新或追加一条文章到 NDJSON
 * 因为需要去重，所以读取全部 → 修改 → 重写
 */
export async function articleNdjsonUpsert(fakeid: string, key: string, value: any): Promise<void> {
  const path = articleNdjsonPath(fakeid);
  await fs.mkdir(dirname(path), { recursive: true });

  let entries: { key: string; value: any }[] = [];
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    entries = lines.map(line => JSON.parse(line));
  } catch {
    // 文件不存在，为空
  }

  const idx = entries.findIndex(e => e.key === key);
  if (idx >= 0) {
    entries[idx] = { key, value };
  } else {
    entries.push({ key, value });
  }

  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(path, content, 'utf-8');
}

/** 删除一个 fakeid 对应的所有文章（删除文件） */
export async function articleNdjsonDeleteFakeid(fakeid: string): Promise<void> {
  const path = articleNdjsonPath(fakeid);
  try {
    await fs.unlink(path);
  } catch {
    // 文件不存在，忽略
  }
}

/** 删除文章 NDJSON 中指定 key 的条目 */
export async function articleNdjsonDeleteKey(fakeid: string, key: string): Promise<void> {
  const path = articleNdjsonPath(fakeid);
  try {
    const raw = await fs.readFile(path, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const entries = lines.map(line => JSON.parse(line) as { key: string; value: any });
    const filtered = entries.filter(e => e.key !== key);
    if (filtered.length === entries.length) return; // 没有变化
    const content = filtered.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.writeFile(path, content, 'utf-8');
  } catch {
    // 文件不存在，忽略
  }
}

/** 获取所有 fakeid 目录下的 NDJSON 文章列表 */
export async function articleNdjsonListAllFakeids(): Promise<string[]> {
  const dir = resolve(CACHE_DIR, 'article');
  try {
    const files = await fs.readdir(dir);
    return files
      .filter(f => f.endsWith('.ndjson'))
      .map(f => f.replace(/\.ndjson$/, ''));
  } catch {
    return [];
  }
}

