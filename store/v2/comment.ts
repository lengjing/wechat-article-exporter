import { cacheGet, cachePut } from './cache-client';

export interface CommentAsset {
  fakeid: string;
  url: string;
  title: string;
  data: any;
}

/**
 * 更新 comment 缓存
 */
export async function updateCommentCache(comment: CommentAsset): Promise<boolean> {
  try {
    await cachePut('comment', comment.url, comment);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 comment 缓存
 */
export async function getCommentCache(url: string): Promise<CommentAsset | undefined> {
  const result = await cacheGet<CommentAsset>('comment', url);
  return result ?? undefined;
}
