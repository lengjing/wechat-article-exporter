import { cacheGet, cachePut } from './cache-client';

export interface Asset {
  url: string;
  file: Blob;
  fakeid: string;
}

export type { Asset };

/**
 * 更新 asset 缓存
 */
export async function updateAssetCache(asset: Asset): Promise<boolean> {
  try {
    await cachePut('asset', asset.url, asset);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 asset 缓存
 */
export async function getAssetCache(url: string): Promise<Asset | undefined> {
  const result = await cacheGet<Asset>('asset', url);
  return result ?? undefined;
}
