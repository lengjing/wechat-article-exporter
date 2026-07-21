import { cacheGet, cacheGetAll } from '~/server/kv/cache';
import { articleNdjsonGetAll, articleNdjsonListAllFakeids } from '~/server/kv/cache';

/**
 * 缓存读取
 *
 * GET /api/cache/:store          → 获取 store 下所有条目
 * GET /api/cache/:store/:key    → 获取单个条目
 * GET /api/cache/article        → 获取所有文章（遍历所有 NDJSON 文件）
 * GET /api/cache/article/:fakeid → 获取指定公众号的所有文章
 */
export default defineEventHandler(async event => {
  const slug = getRouterParam(event, 'slug') || '';
  const parts = slug.split('/').filter(Boolean);
  const store = parts[0] || '';
  const key = parts.slice(1).join('/');

  if (!store) {
    return { code: -1, message: 'store 不能为空' };
  }

  // article 特殊处理：按 fakeid 目录的 NDJSON 存储
  if (store === 'article') {
    if (key) {
      const entries = await articleNdjsonGetAll(key);
      return { code: 0, data: entries };
    }
    // 获取所有公众号的所有文章
    const fakeids = await articleNdjsonListAllFakeids();
    const all: { key: string; value: any }[] = [];
    for (const fakeid of fakeids) {
      const entries = await articleNdjsonGetAll(fakeid);
      all.push(...entries);
    }
    return { code: 0, data: all };
  }

  if (key) {
    const value = await cacheGet(store, key);
    return { code: 0, data: value ?? null };
  }

  const all = await cacheGetAll(store);
  return { code: 0, data: all };
});
