import { cookieStore } from '~/server/utils/CookieStore';
import { USER_AGENT } from '~/config';
import {
  getScheduleConfig,
  setScheduleConfig,
  getScheduleState,
  setScheduleState,
} from '~/server/kv/schedule';
import { getAllAccounts, upsertAccount } from '~/server/kv/account';
import type { ScheduleConfig } from '~/types/schedule';
import type { MpAccount } from '~/store/v2/info';

/**
 * 公众号定时调度引擎
 *
 * 负责定时拉取已订阅公众号的最新文章并推送钉钉通知。
 * 仅在 Nitro 服务端持续运行时有效（Docker / 本地 dev）。
 */
class ScheduleEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: ScheduleConfig | null = null;
  private initialized = false;

  /**
   * 初始化引擎（由 Nitro 插件在启动时触发）
   */
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    this.config = await getScheduleConfig();
    if (this.config?.enabled) {
      console.log(`[Schedule] 配置文件加载成功: intervalHours=${this.config.intervalHours || 2}, dingtalk=${this.config.dingtalkUrl ? '已配置' : '未配置'}, secret=${this.config.dingtalkSecret ? '已配置' : '未配置'}`);
      this.startTimer();
    } else {
      console.log('[Schedule] 配置文件已加载，调度未启用');
    }
  }

  /**
   * 重新加载配置（由 toggle API 触发）
   */
  async reload() {
    this.config = await getScheduleConfig();
    this.stopTimer();

    if (this.config?.enabled) {
      console.log('[Schedule] 配置已重新加载，调度已启用');
      this.startTimer();
    } else {
      console.log('[Schedule] 配置已重新加载，调度已停止');
    }
  }

  /**
   * 立即执行一次检查（由 run-now API 触发）
   */
  async runNow(): Promise<void> {
    const state = await getScheduleState();
    if (state.isRunning) {
      console.warn('[Schedule] ⚠️ 立即执行被跳过：引擎正在运行中');
      return;
    }
    this.config = await getScheduleConfig();
    console.log('[Schedule] 🔔 触发立即执行');
    this.tick(true).catch(err => console.error('[Schedule] ❌ 立即执行失败:', err));
  }

  private startTimer() {
    if (this.timer) return;

    const baseInterval = this.config?.intervalHours || 2;
    console.log(`[Schedule] 🟢 调度引擎已启动，基础间隔: ${baseInterval} 小时（实际每次随机 0.2x~2.5x，夜间再拉长）`);
    // 首次检查：延迟 30 秒启动（给服务端足够时间初始化）
    this.timer = setTimeout(() => {
      console.log('[Schedule] 首次检查启动（延迟 30 秒后）');
      this.tick();
    }, 30_000) as unknown as ReturnType<typeof setInterval>;
  }

  private stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Schedule] ⏹ 定时器已停止');
    }
  }

  /**
   * 计算下一次检查的随机延迟（毫秒）
   *
   * 模拟人的行为：
   *  - 基础间隔取自配置（默认 2 小时）
   *  - 每次大幅随机 0.2x～2.5x
   *  - 北京时间 23:00～07:00 夜间时段，额外延长 1.5～4 倍（正常人睡觉）
   */
  private nextDelay(): number {
    const baseMs = (this.config?.intervalHours || 2) * 60 * 60 * 1000;
    // 大幅随机：0.2x～2.5x，实际范围宽，不规律
    const jitter = baseMs * (0.2 + Math.random() * 2.3);
    let delay = Math.round(jitter);

    // 北京时间 23:00～07:00 夜间再拉长 1.5～4 倍
    const hour = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false });
    const h = Number.parseInt(hour, 10);
    if (h >= 23 || h < 7) {
      delay *= 1.5 + Math.random() * 2; // 1.5～3.5 倍
    }

    return Math.round(delay);
  }

  /**
   * 执行一次检查
   * @param immediate 为 true 时跳过公众号之间的随机延迟（用于立即执行）
   */
  private async tick(immediate = false) {
    const startTime = Date.now();
    const source = immediate ? '立即执行' : '定时调度';
    console.log(`[Schedule] [${source}] 开始检查，当前时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

    if (!this.config?.enabled) {
      console.warn(`[Schedule] [${source}] 调度未启用，跳过检查`);
      return;
    }

    const dingtalkUrl = this.config.dingtalkUrl;

    // 1. 优先用 config 中保存的 auth-key 引用（服务重启后仍有效，指向 KV 中的 session）
    let cookie: string | null = null;
    let token: string | null = null;
    let usedAuthKey: string | null = this.config.authKey || null;

    if (usedAuthKey) {
      cookie = await cookieStore.getCookie(usedAuthKey);
      token = await cookieStore.getToken(usedAuthKey);
    }

    // 2. 如果 config 中的 auth-key 失效，尝试遍历内存中的其他 key
    if (!cookie || !token) {
      const authKeys = await cookieStore.getAllValidAuthKeys();
      for (const key of authKeys) {
        if (key === usedAuthKey) continue;
        const c = await cookieStore.getCookie(key);
        const t = await cookieStore.getToken(key);
        if (c && t) {
          cookie = c;
          token = t;
          usedAuthKey = key;
          break;
        }
      }
    }

    if (!cookie || !token) {
      const errorMsg = '登录已过期，请重新扫码登录';
      console.warn(`[Schedule] [${source}] ❌ ${errorMsg}`);
      this.config.lastError = errorMsg;
      this.config.authKey = '';
      await setScheduleConfig(this.config);
      await setScheduleState({ lastCheckTime: Date.now(), nextCheckTime: null, isRunning: false, error: errorMsg });
      this.scheduleNext();
      return;
    }
    console.log(`[Schedule] [${source}] ✅ 使用 auth-key=${usedAuthKey?.substring(0, 8)}...，token=${token.substring(0, 8)}...`);

    await setScheduleState({ lastCheckTime: null, nextCheckTime: null, isRunning: true, error: '' });

    try {
      const result = await this.checkAccounts(cookie, token, immediate, source);

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Schedule] [${source}] ✅ 检查完成，耗时 ${elapsed}s，发现 ${result.newArticles.length} 篇新文章，检查 ${result.checkedCount} 个公众号`);

      // 发送钉钉通知
      if (result.newArticles.length > 0 && dingtalkUrl) {
        console.log(`[Schedule] [${source}] 发现新文章，正在发送钉钉通知...`);
        await this.sendDingTalk(dingtalkUrl, this.config.dingtalkSecret, result.newArticles);
      } else if (result.newArticles.length > 0 && !dingtalkUrl) {
        console.log(`[Schedule] [${source}] 发现 ${result.newArticles.length} 篇新文章，但未配置钉钉 Webhook，跳过通知`);
      } else {
        console.log(`[Schedule] [${source}] 无新文章`);
      }

      // 保存更新后的账号信息
      for (const acc of result.updatedAccounts) {
        await upsertAccount(acc);
      }
      if (result.updatedAccounts.length > 0) {
        console.log(`[Schedule] [${source}] 已更新 ${result.updatedAccounts.length} 个公众号的最后文章时间`);
      }

      const nextDelay = this.nextDelay();
      const nextCheckTime = Date.now() + nextDelay;
      await setScheduleState({
        lastCheckTime: Date.now(),
        nextCheckTime,
        isRunning: false,
        error: '',
      });

      console.log(`[Schedule] [${source}] 下次检查约 ${Math.round(nextDelay / 60000)} 分钟后（${new Date(nextCheckTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Schedule] [${source}] ❌ 检查失败: ${errorMsg}`);
      await setScheduleState({
        lastCheckTime: Date.now(),
        nextCheckTime: null,
        isRunning: false,
        error: errorMsg,
      });
    }

    // 每次 tick 完成后递归调度下一次，使用随机延迟模拟人工
    this.scheduleNext();
  }

  /**
   * 用随机延迟调度下一次检查
   */
  private scheduleNext() {
    this.stopTimer();
    if (!this.config?.enabled) return;
    const delay = this.nextDelay();
    const delayMinutes = Math.round(delay / 60000);
    const nextTime = new Date(Date.now() + delay).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    console.log(`[Schedule] 📅 下次检查时间: ${nextTime}（${delayMinutes} 分钟后）`);
    this.timer = setTimeout(() => this.tick(), delay) as unknown as ReturnType<typeof setInterval>;
  }

  /**
   * 检查所有已订阅公众号的最新文章
   */
  private async checkAccounts(
    cookie: string,
    token: string,
    immediate = false,
    source = '定时调度',
  ): Promise<{ newArticles: NewArticle[]; updatedAccounts: MpAccount[]; checkedCount: number }> {
    const allAccounts = await getAllAccounts();
    const enabledAccounts = allAccounts.filter(a => a.scheduleEnabled);

    console.log(`[Schedule] [${source}] 共有 ${allAccounts.length} 个公众号，其中 ${enabledAccounts.length} 个启用了定时监控`);
    for (const acc of enabledAccounts) {
      console.log(`[Schedule] [${source}]   - ${acc.nickname || acc.fakeid}（上次文章时间: ${acc.lastArticleTime ? new Date(acc.lastArticleTime * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未知'}）`);
    }

    const newArticles: NewArticle[] = [];
    const updatedAccounts: MpAccount[] = [];
    let checkedCount = 0;

    for (const account of enabledAccounts) {
      checkedCount++;
      const tag = `[${source}][${checkedCount}/${enabledAccounts.length}]`;
      console.log(`[Schedule] ${tag} 正在检查公众号「${account.nickname || account.fakeid}」...`);

      try {
        const fetchStart = Date.now();
        const latestArticles = await this.fetchLatestArticles(account.fakeid, cookie, token, source);
        const fetchElapsed = Date.now() - fetchStart;

        if (latestArticles.length === 0) {
          console.log(`[Schedule] ${tag} 「${account.nickname || account.fakeid}」: 微信返回为空，可能无文章`);
          continue;
        }

        // 北京时间的今日 0 点（Unix 秒），只取当天发布的文章
        const now = new Date();
        const beijingDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
        const todayStart = Math.floor(beijingDate.setHours(0, 0, 0, 0) / 1000);
        const todayArticles = latestArticles.filter(a => a.create_time >= todayStart);

        if (todayArticles.length === 0) {
          console.log(`[Schedule] ${tag} 「${account.nickname || account.fakeid}」: ✅ 今天无新文章，最新 ${new Date(latestArticles[0].create_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 非今日`);
          continue;
        }

        // 已推送过的 appmsgid 集合
        const pushedSet = new Set(account.pushedAppmsgIds || []);

        // 找出所有未推送过的当日文章
        const newOnes = todayArticles.filter(a => !pushedSet.has(a.appmsgid));

        if (newOnes.length > 0) {
          console.log(`[Schedule] ${tag} 「${account.nickname || account.fakeid}」: 🆕 发现 ${newOnes.length} 篇新文章（已推送 ${pushedSet.size} 篇）`);

          for (const article of newOnes) {
            newArticles.push({
              account: account.nickname || account.fakeid,
              title: article.title,
              url: article.link,
              createTime: article.create_time,
              digest: article.digest || '',
            });
            console.log(`[Schedule] ${tag}   → 「${article.title}」(${article.link})`);
          }

          // 记录已推送的 appmsgid（最多保留 500 个，防无限增长）
          account.pushedAppmsgIds = [...new Set([
            ...(account.pushedAppmsgIds || []),
            ...newOnes.map(a => a.appmsgid),
          ])].slice(-500);

          // 更新最新文章信息
          const latestArticle = latestArticles[0];
          account.lastArticleTime = latestArticle.create_time;
          account.lastArticleTitle = latestArticle.title;
          account.lastArticleUrl = latestArticle.link;
          updatedAccounts.push(account);
        } else {
          console.log(`[Schedule] ${tag} 「${account.nickname || account.fakeid}」: ✅ 无新文章（已推送 ${pushedSet.size} 篇，最新 ${new Date(latestArticles[0].create_time * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）`);
        }
      } catch (err) {
        console.error(`[Schedule] ${tag} ❌ 检查公众号「${account.nickname || account.fakeid}」失败:`, err);
      }

      // 模拟人工：每个公众号之间随机延迟 30 秒～5 分钟（仅定时调度时生效）
      if (!immediate && checkedCount < enabledAccounts.length) {
        const delay = 30_000 + Math.random() * 270_000;
        const delayMinutes = Math.round(delay / 1000);
        console.log(`[Schedule] ${tag} 等待 ${delayMinutes}s 后检查下一个公众号...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    console.log(`[Schedule] [${source}] 公众号检查完毕: 共检查 ${checkedCount} 个，其中 ${newArticles.length} 篇新文章`);
    return { newArticles, updatedAccounts, checkedCount };
  }

  /**
   * 获取某个公众号的最新文章列表
   */
  private async fetchLatestArticles(
    fakeid: string,
    cookie: string,
    token: string,
    source = '定时调度',
  ): Promise<ArticleSnippet[]> {
    const params = {
      sub: 'list',
      search_field: 'null',
      begin: '0',
      count: '20',
      query: '',
      fakeid,
      type: '101_1',
      free_publish_type: '1',
      sub_action: 'list_ex',
      token,
      lang: 'zh_CN',
      f: 'json',
      ajax: '1',
    };

    const url = `https://mp.weixin.qq.com/cgi-bin/appmsgpublish?${new URLSearchParams(params).toString()}`;

    const response = await fetch(url, {
      headers: {
        Referer: 'https://mp.weixin.qq.com/',
        Origin: 'https://mp.weixin.qq.com',
        'User-Agent': USER_AGENT,
        Cookie: cookie,
      },
    });

    const json = await response.json();
    const { base_resp, publish_page } = json;

    if (base_resp?.ret === 200003) {
      throw new Error('登录已过期（200003）');
    }
    if (base_resp?.ret !== 0) {
      throw new Error(`微信接口错误: ${base_resp?.ret}:${base_resp?.err_msg}`);
    }
    if (!publish_page) {
      return [];
    }

    const publishPage = JSON.parse(publish_page);
    const publishList = (publishPage.publish_list || []).filter(
      (item: any) => !!item.publish_info,
    );

    const articles: ArticleSnippet[] = [];
    for (const item of publishList) {
      const publishInfo = JSON.parse(item.publish_info);
      for (const msg of publishInfo.appmsgex || []) {
        articles.push({
          title: msg.title,
          link: msg.link,
          create_time: msg.create_time,
          digest: msg.digest || '',
          appmsgid: msg.appmsgid,
        });
      }
    }

    // 按 create_time 降序排列
    articles.sort((a, b) => b.create_time - a.create_time);
    return articles;
  }

  /**
   * 发送钉钉机器人通知
   */
  private async sendDingTalk(webhookUrl: string, secret: string, newArticles: NewArticle[]) {
    // 如果有签名密钥，使用 Web Crypto API 计算签名
    let targetUrl = webhookUrl;
    if (secret) {
      const timestamp = Date.now();
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${timestamp}\n${secret}`));
      const sign = encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(signature))));
      targetUrl = `${webhookUrl}&timestamp=${timestamp}&sign=${sign}`;
    }

    const dateStr = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    // 按公众号分组
    const groups = new Map<string, NewArticle[]>();
    for (const article of newArticles) {
      const list = groups.get(article.account) || [];
      list.push(article);
      groups.set(article.account, list);
    }

    const lines: string[] = [`## 📢 公众号新文章通知（${dateStr}）\n`];
    for (const [accountName, articles] of groups) {
      lines.push(`**🏢 ${accountName}** 新增 ${articles.length} 篇：\n`);
      for (const article of articles) {
        const time = new Date(article.createTime * 1000).toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        lines.push(`> 📄 [${article.title}](${article.url})`);
        if (article.digest) {
          lines.push(`> > ${article.digest}`);
        }
        lines.push(`> 🕐 ${time}\n`);
      }
      lines.push('---\n');
    }
    lines.push(`> 🔍 共检测 **${newArticles.length}** 篇新文章`);

    const payload = {
      msgtype: 'markdown',
      markdown: {
        title: `公众号新文章 · ${newArticles.length}篇`,
        text: lines.join('\n'),
      },
    };

    try {
      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await resp.json();
      if (result.errcode !== 0) {
        console.error(`[Schedule] 钉钉通知发送失败: errcode=${result.errcode}, errmsg=${result.errmsg}`);
      } else {
        console.log(`[Schedule] ✅ 钉钉通知发送成功，共 ${newArticles.length} 篇`);
      }
    } catch (err) {
      console.error(`[Schedule] ❌ 钉钉通知发送异常:`, err);
    }
  }
}

interface ArticleSnippet {
  title: string;
  link: string;
  create_time: number;
  digest: string;
  appmsgid: number;
}

interface NewArticle {
  account: string;
  title: string;
  url: string;
  createTime: number;
  digest: string;
}

// 导出单例，供 toggle API 调用 reload
export const scheduleEngine = new ScheduleEngine();

export default defineNitroPlugin(async () => {
  await scheduleEngine.init();
});
