import { cacheGet, cachePut, cacheGetAll } from './cache-client';

export interface DebugAsset {
  type: string;
  url: string;
  file: Blob;
  title: string;
  fakeid: string;
}

/**
 * 更新 debug 缓存
 */
export async function updateDebugCache(html: DebugAsset): Promise<boolean> {
  try {
    await cachePut('debug', html.url, html);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 debug 缓存
 */
export async function getDebugCache(url: string): Promise<DebugAsset | undefined> {
  const result = await cacheGet<DebugAsset>('debug', url);
  return result ?? undefined;
}

export async function getDebugInfo(): Promise<DebugAsset[]> {
  const all = await cacheGetAll<DebugAsset>('debug');
  return all.map(item => item.value);
}
