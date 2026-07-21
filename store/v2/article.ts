import type { AppMsgExWithFakeID, PublishInfo, PublishPage } from '~/types/types';
import { type MpAccount, updateInfoCache } from './info';
import { articlePut, articleGetAll, articleGetByFakeid, articleDeleteFakeid, cacheGetAll } from './cache-client';

export type ArticleAsset = AppMsgExWithFakeID;

const STORE = 'article';

/** 获取某个公众号的所有缓存文章 */
async function getArticlesByFakeid(fakeid: string): Promise<AppMsgExWithFakeID[]> {
  const all = await articleGetByFakeid<AppMsgExWithFakeID>(fakeid);
  return all.map(item => item.value);
}

/**
 * 更新文章缓存
 */
export async function updateArticleCache(account: MpAccount, publish_page: PublishPage) {
  const fakeid = account.fakeid;
  const total_count = publish_page.total_count;
  const publish_list = publish_page.publish_list.filter(item => !!item.publish_info);

  // 读取已存在的 keys（从该公众号的 NDJSON）
  const existingKeys = new Set<string>();
  const existing = await articleGetAll<AppMsgExWithFakeID>(fakeid);
  for (const item of existing) {
    existingKeys.add(item.key);
  }

  let msgCount = 0;
  let articleCount = 0;

  for (const item of publish_list) {
    const publish_info: PublishInfo = JSON.parse(item.publish_info);
    let newEntryCount = 0;

    for (const article of publish_info.appmsgex) {
      const key = `${fakeid}:${article.aid}`;
      if (!existingKeys.has(key)) {
        newEntryCount++;
        articleCount++;
      }
      await articlePut(STORE, key, { ...article, fakeid, _status: '' });
    }

    if (newEntryCount > 0) {
      msgCount++;
    }
  }

  await updateInfoCache({
    fakeid,
    completed: publish_list.length === 0,
    count: msgCount,
    articles: articleCount,
    nickname: account.nickname,
    round_head_img: account.round_head_img,
    total_count,
  });
}

/**
 * 检查是否存在指定时间之前的缓存
 */
export async function hitCache(fakeid: string, create_time: number): Promise<boolean> {
  const articles = await getArticlesByFakeid(fakeid);
  return articles.some(a => a.create_time < create_time);
}

/**
 * 读取缓存中的指定时间之前的历史文章
 */
export async function getArticleCache(fakeid: string, create_time: number): Promise<AppMsgExWithFakeID[]> {
  const articles = await getArticlesByFakeid(fakeid);
  return articles
    .filter(a => a.create_time < create_time)
    .sort((a, b) => b.create_time - a.create_time);
}

/**
 * 根据 url 获取文章对象
 */
export async function getArticleByLink(url: string): Promise<AppMsgExWithFakeID> {
  const all = await cacheGetAll<AppMsgExWithFakeID>(STORE);
  const article = all.find(item => item.value.link === url);
  if (!article) {
    throw new Error(`Article(${url}) does not exist`);
  }
  return article.value;
}

/**
 * 根据 url 获取 SINGLE_ARTICLE_FAKEID 文章对象
 */
export async function getSingleArticleByLink(url: string): Promise<AppMsgExWithFakeID> {
  const all = await cacheGetAll<AppMsgExWithFakeID>(STORE);
  const article = all.find(item => item.value.link === url && item.value.fakeid === 'SINGLE_ARTICLE_FAKEID');
  if (!article) {
    throw new Error(`Article(${url}) does not exist`);
  }
  return article.value;
}

/**
 * 文章被删除
 */
export async function articleDeleted(url: string, is_deleted = true): Promise<void> {
  const all = await cacheGetAll<AppMsgExWithFakeID>(STORE);
  for (const item of all) {
    if (item.value.link === url) {
      item.value.is_deleted = is_deleted;
      await articlePut(STORE, item.key, item.value);
    }
  }
}

/**
 * 更新文章状态
 */
export async function updateArticleStatus(url: string, status: string): Promise<void> {
  const all = await cacheGetAll<AppMsgExWithFakeID>(STORE);
  for (const item of all) {
    if (item.value.link === url) {
      item.value._status = status;
      await articlePut(STORE, item.key, item.value);
    }
  }
}

/**
 * 更新文章的fakeid
 */
export async function updateArticleFakeid(url: string, newFakeid: string): Promise<void> {
  const all = await cacheGetAll<AppMsgExWithFakeID>(STORE);
  for (const item of all) {
    if (item.value.link === url && item.value.fakeid === 'SINGLE_ARTICLE_FAKEID') {
      item.value.fakeid = newFakeid;
      item.value._single = true;
      await articlePut(STORE, item.key, item.value);
    }
  }
}
