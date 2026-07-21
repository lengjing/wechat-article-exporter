import { cacheGet, cachePut } from './cache-client';

export interface ResourceMapAsset {
  fakeid: string;
  url: string;
  resources: string[];
}

/**
 * 更新 resource-map 缓存
 */
export async function updateResourceMapCache(resourceMap: ResourceMapAsset): Promise<boolean> {
  try {
    await cachePut('resource-map', resourceMap.url, resourceMap);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 resource-map 缓存
 */
export async function getResourceMapCache(url: string): Promise<ResourceMapAsset | undefined> {
  const result = await cacheGet<ResourceMapAsset>('resource-map', url);
  return result ?? undefined;
}
