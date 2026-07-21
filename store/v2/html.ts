import { cacheGet, cachePut } from './cache-client';

export interface HtmlAsset {
  fakeid: string;
  url: string;
  file: Blob;
  title: string;
  commentID: string | null;
}

/**
 * 更新 html 缓存
 */
export async function updateHtmlCache(html: HtmlAsset): Promise<boolean> {
  try {
    await cachePut('html', html.url, html);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取 html 缓存
 */
export async function getHtmlCache(url: string): Promise<HtmlAsset | undefined> {
  const result = await cacheGet<HtmlAsset>('html', url);
  return result ?? undefined;
}
