import type { ArticleMetadata } from '~/utils/download/types';
import { cacheGet, cachePut } from './cache-client';

export type Metadata = ArticleMetadata & {
  fakeid: string;
  url: string;
  title: string;
};

/**
 * 更新 metadata
 */
export async function updateMetadataCache(metadata: Metadata): Promise<boolean> {
  try {
    await cachePut('metadata', metadata.url, metadata);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 metadata
 */
export async function getMetadataCache(url: string): Promise<Metadata | undefined> {
  const result = await cacheGet<Metadata>('metadata', url);
  return result ?? undefined;
}
