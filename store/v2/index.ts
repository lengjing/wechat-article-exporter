import { cacheDeleteByPrefix, articleDeleteFakeid } from './cache-client';
import { cacheGetAll } from './cache-client';

const STORES = ['article', 'asset', 'comment', 'comment_reply', 'debug', 'html', 'metadata', 'resource', 'resource-map', 'api'];

// 删除公众号数据
export async function deleteAccountData(ids: string[]): Promise<void> {
  // 删除服务端账号
  for (const id of ids) {
    try {
      await $fetch(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      console.error('删除服务端账号失败:', id, e);
    }
  }

  // 清除服务端缓存
  for (const id of ids) {
    // article NDJSON：删除整个文件
    await articleDeleteFakeid('article', id);
    for (const store of ['asset', 'comment', 'comment_reply', 'debug', 'html', 'metadata', 'resource', 'resource-map', 'api']) {
      await deleteByFakeid(store, id);
    }
  }
}

/** 在 store 中查找并删除所有 fakeid 匹配的条目 */
async function deleteByFakeid(store: string, fakeid: string): Promise<void> {
  const all = await cacheGetAll<{ fakeid?: string }>(store);
  for (const item of all) {
    if (item.value?.fakeid === fakeid) {
      try {
        await $fetch(`/api/cache/${store}`, {
          method: 'POST',
          body: { action: 'delete', key: item.key },
        });
      } catch (e) {
        console.error(`删除 cache ${store}:${item.key} 失败`, e);
      }
    }
  }
}
