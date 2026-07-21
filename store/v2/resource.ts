import { cacheGet, cachePut } from './cache-client';

export interface ResourceAsset {
  fakeid: string;
  url: string;
  file: Blob;
}

/**
 * 更新 resource 缓存
 */
export async function updateResourceCache(resource: ResourceAsset): Promise<boolean> {
  try {
    await cachePut('resource', resource.url, resource);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 resource 缓存
 */
export async function getResourceCache(url: string): Promise<ResourceAsset | undefined> {
  const result = await cacheGet<ResourceAsset>('resource', url);
  return result ?? undefined;
}
