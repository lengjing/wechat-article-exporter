import { cachePut, cacheDelete, cacheDeleteByPrefix } from '~/server/kv/cache';
import { articleNdjsonAppend, articleNdjsonUpsert, articleNdjsonDeleteKey, articleNdjsonDeleteFakeid } from '~/server/kv/cache';

/**
 * 缓存写入/删除
 *
 * POST /api/cache/:store      body: { action, key, value?, prefix?, fakeid? }
 *
 * action:
 *   'put'    → 写入 key/value（通用 JSON store）
 *   'delete' → 删除指定 key
 *   'deleteByPrefix' → 按前缀批量删除
 *
 *   以下 action 专用于 article store（NDJSON 按 fakeid 目录）：
 *   'articleAppend' → 追加一条文章
 *   'articleUpsert' → 更新或追加
 *   'articleDelete' → 删除指定 key 的文章
 *   'articleDeleteFakeid' → 删除整个公众号的文章文件
 */
export default defineEventHandler(async event => {
  const slug = getRouterParam(event, 'slug') || '';
  const store = slug.split('/').filter(Boolean)[0] || '';

  if (!store) {
    return { code: -1, message: 'store 不能为空' };
  }

  const body = await readBody<{
    action: 'put' | 'delete' | 'deleteByPrefix' | 'articleAppend' | 'articleUpsert' | 'articleDelete' | 'articleDeleteFakeid';
    key?: string;
    value?: unknown;
    prefix?: string;
    fakeid?: string;
  }>(event);

  if (!body || !body.action) {
    return { code: -1, message: '参数错误：action 不能为空' };
  }

  try {
    // ====== 通用操作 ======
    if (body.action === 'put') {
      if (!body.key) return { code: -1, message: 'key 不能为空' };
      await cachePut(store, body.key, body.value);
      return { code: 0, message: '写入成功' };
    }

    if (body.action === 'delete') {
      if (!body.key) return { code: -1, message: 'key 不能为空' };
      await cacheDelete(store, body.key);
      return { code: 0, message: '删除成功' };
    }

    if (body.action === 'deleteByPrefix') {
      if (!body.prefix) return { code: -1, message: 'prefix 不能为空' };
      const count = await cacheDeleteByPrefix(store, body.prefix);
      return { code: 0, message: `删除了 ${count} 条` };
    }

    // ====== 文章 NDJSON 操作 ======
    if (body.action === 'articleAppend') {
      if (!body.fakeid || !body.key) return { code: -1, message: 'fakeid 和 key 不能为空' };
      await articleNdjsonAppend(body.fakeid, body.key, body.value);
      return { code: 0, message: '追加成功' };
    }

    if (body.action === 'articleUpsert') {
      if (!body.fakeid || !body.key) return { code: -1, message: 'fakeid 和 key 不能为空' };
      await articleNdjsonUpsert(body.fakeid, body.key, body.value);
      return { code: 0, message: '写入成功' };
    }

    if (body.action === 'articleDelete') {
      if (!body.fakeid || !body.key) return { code: -1, message: 'fakeid 和 key 不能为空' };
      await articleNdjsonDeleteKey(body.fakeid, body.key);
      return { code: 0, message: '删除成功' };
    }

    if (body.action === 'articleDeleteFakeid') {
      if (!body.fakeid) return { code: -1, message: 'fakeid 不能为空' };
      await articleNdjsonDeleteFakeid(body.fakeid);
      return { code: 0, message: '删除成功' };
    }

    return { code: -1, message: `未知 action: ${body.action}` };
  } catch (err) {
    console.error(`[cache] ${body.action} ${store} 失败:`, err);
    return { code: -1, message: String(err) };
  }
});
