/**
 * 通用 HTTP 缓存客户端 — 替代 IndexedDB
 * 所有数据存储到服务端 .data/cache/ 目录
 */

/** 查询指定 store 下的所有条目 */
export async function cacheGetAll<T>(store: string): Promise<{ key: string; value: T }[]> {
  try {
    const resp = await $fetch(`/api/cache/${store}`);
    if (resp.code === 0 && Array.isArray(resp.data)) {
      return resp.data as { key: string; value: T }[];
    }
  } catch (e) {
    console.error(`[cache] getAll ${store} 失败:`, e);
  }
  return [];
}

/** 获取单个缓存条目 */
export async function cacheGet<T>(store: string, key: string): Promise<T | null> {
  try {
    const resp = await $fetch(`/api/cache/${store}/${encodeURIComponent(key)}`);
    if (resp.code === 0) {
      return resp.data as T;
    }
  } catch (e) {
    console.error(`[cache] get ${store}:${key} 失败:`, e);
  }
  return null;
}

/** 写入缓存条目（自动将 Blob 转为 base64） */
export async function cachePut(store: string, key: string, value: unknown): Promise<boolean> {
  try {
    const saved = await prepareValue(value);

    const resp = await $fetch(`/api/cache/${store}`, {
      method: 'POST',
      body: { action: 'put', key, value: saved },
    });
    return resp.code === 0;
  } catch (e) {
    console.error(`[cache] put ${store}:${key} 失败:`, e);
    return false;
  }
}

/** 删除单个缓存条目 */
export async function cacheDelete(store: string, key: string): Promise<boolean> {
  try {
    const resp = await $fetch(`/api/cache/${store}`, {
      method: 'POST',
      body: { action: 'delete', key },
    });
    return resp.code === 0;
  } catch (e) {
    console.error(`[cache] delete ${store}:${key} 失败:`, e);
    return false;
  }
}

/** 按前缀批量删除 */
export async function cacheDeleteByPrefix(store: string, prefix: string): Promise<boolean> {
  try {
    const resp = await $fetch(`/api/cache/${store}`, {
      method: 'POST',
      body: { action: 'deleteByPrefix', prefix },
    });
    return resp.code === 0;
  } catch (e) {
    console.error(`[cache] deleteByPrefix ${store}:${prefix} 失败:`, e);
    return false;
  }
}

// ====== 文章 NDJSON 专用操作 ======

/** 获取某个公众号的所有文章（从 NDJSON 读取） */
export async function articleGetByFakeid<T>(fakeid: string): Promise<{ key: string; value: T }[]> {
  try {
    const resp = await $fetch(`/api/cache/article/${encodeURIComponent(fakeid)}`);
    if (resp.code === 0 && Array.isArray(resp.data)) {
      return resp.data as { key: string; value: T }[];
    }
  } catch (e) {
    console.error(`[cache] articleGetByFakeid ${fakeid} 失败:`, e);
  }
  return [];
}

/** 追加一条新文章到 NDJSON */
export async function articleAppend(store: string, fakeid: string, key: string, value: unknown): Promise<boolean> {
  try {
    const saved = await prepareValue(value);
    const resp = await $fetch(`/api/cache/${store}`, {
      method: 'POST',
      body: { action: 'articleAppend', fakeid, key, value: saved },
    });
    return resp.code === 0;
  } catch (e) {
    console.error(`[cache] articleAppend ${store}:${key} 失败:`, e);
    return false;
  }
}

/** 更新或追加一条文章到 NDJSON */
export async function articleUpsert(store: string, fakeid: string, key: string, value: unknown): Promise<boolean> {
  try {
    const saved = await prepareValue(value);
    const resp = await $fetch(`/api/cache/${store}`, {
      method: 'POST',
      body: { action: 'articleUpsert', fakeid, key, value: saved },
    });
    return resp.code === 0;
  } catch (e) {
    console.error(`[cache] articleUpsert ${store}:${key} 失败:`, e);
    return false;
  }
}

/** 删除某个公众号的所有文章文件 */
export async function articleDeleteFakeid(store: string, fakeid: string): Promise<boolean> {
  try {
    const resp = await $fetch(`/api/cache/${store}`, {
      method: 'POST',
      body: { action: 'articleDeleteFakeid', fakeid },
    });
    return resp.code === 0;
  } catch (e) {
    console.error(`[cache] articleDeleteFakeid ${store}:${fakeid} 失败:`, e);
    return false;
  }
}

// ====== Blob 工具 ======

interface BlobObject {
  __blob: true;
  data: string; // base64
  type: string;
}

/**
 * 向 article NDJSON 存储写入/更新一条文章
 * key 格式为 fakeid:aid，自动从中提取 fakeid
 */
export async function articlePut(store: string, key: string, value: unknown): Promise<boolean> {
  const fakeid = key.split(':')[0];
  if (!fakeid) return false;
  return articleUpsert(store, fakeid, key, value);
}

/** 从 article NDJSON 读取某个公众号的所有文章 */
export async function articleGetAll<T>(fakeid: string): Promise<{ key: string; value: T }[]> {
  return articleGetByFakeid<T>(fakeid);
}

async function prepareValue(value: unknown): Promise<unknown> {
  if (value instanceof File || value instanceof Blob) {
    return blobToObject(value as Blob);
  }
  if (typeof value === 'object' && value !== null) {
    const saved = { ...value as Record<string, unknown> };
    for (const k of Object.keys(saved)) {
      const v = saved[k];
      if (v instanceof Blob || v instanceof File) {
        saved[k] = await blobToObject(v as Blob);
      }
    }
    return saved;
  }
  return value;
}

async function blobToObject(blob: Blob): Promise<BlobObject> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { __blob: true, data: btoa(binary), type: blob.type };
}

function objectToBlob(obj: BlobObject): Blob {
  const binary = atob(obj.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: obj.type });
}

/** 将读取出的数据中的 base64 blob 恢复为 Blob 对象 */
export function restoreBlobs<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(restoreBlobs) as unknown as T;

  const restored = { ...obj };
  for (const k of Object.keys(restored)) {
    const v = (restored as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && (v as BlobObject).__blob) {
      (restored as Record<string, unknown>)[k] = objectToBlob(v as BlobObject);
    } else if (v && typeof v === 'object') {
      (restored as Record<string, unknown>)[k] = restoreBlobs(v);
    }
  }
  return restored;
}
