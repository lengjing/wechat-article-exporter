import { cacheGet, cachePut } from './cache-client';

export interface CommentReplyAsset {
  fakeid: string;
  url: string;
  title: string;
  data: any;
  contentID: string;
}

/**
 * 更新 comment 缓存
 */
export async function updateCommentReplyCache(reply: CommentReplyAsset): Promise<boolean> {
  try {
    await cachePut('comment_reply', `${reply.url}:${reply.contentID}`, reply);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 comment 缓存
 */
export async function getCommentReplyCache(url: string, contentID: string): Promise<CommentReplyAsset | undefined> {
  const result = await cacheGet<CommentReplyAsset>('comment_reply', `${url}:${contentID}`);
  return result ?? undefined;
}
