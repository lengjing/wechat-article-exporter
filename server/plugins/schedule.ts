import { cookieStore } from '~/server/utils/CookieStore';
import { USER_AGENT } from '~/config';
import {
  getScheduleConfig,
  setScheduleConfig,
  getScheduleAccounts,
  setScheduleAccounts,
  setScheduleState,
} from '~/server/kv/schedule';
import type { ScheduleAccount, ScheduleConfig } from '~/types/schedule';

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
      this.startTimer();
    }
  }

  /**
   * 重新加载配置（由 toggle API 触发）
   */
  async reload() {
    this.config = await getScheduleConfig();
    this.stopTimer();

    if (this.config?.enabled) {
      this.startTimer();
    }
  }

  private startTimer() {
    if (this.timer) return;

    // 首次检查：延迟 30 秒启动（给服务端足够时间初始化）
    this.timer = setTimeout(() => this.tick(), 30_000) as unknown as ReturnType<typeof setInterval>;

    console.log(`[Schedule] 调度引擎已启动，基础间隔: ${this.config?.intervalHours || 2} 小时（带随机抖动）`);
  }

  private stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 计算下一次检查的随机延迟（毫秒）
   *
   * 模拟人的行为：
   *  - 基础间隔取自配置（默认 2 小时）
   *  - 每次叠加 ±40% 的随机抖动
   *  - 北京时间 23:00～07:00 夜间时段，额外延长 1～3 倍（正常人睡觉）
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
   */
  private async tick() {
    if (!this.config?.enabled) return;

    const authKey = this.config.authKey;
    const dingtalkUrl = this.config.dingtalkUrl;
    if (!authKey) {
      console.warn('[Schedule] 未配置 auth-key，跳过检查');
      this.scheduleNext();
      return;
    }

    // 获取 cookie 和 token
    const cookie = await cookieStore.getCookie(authKey);
    const token = await cookieStore.getToken(authKey);
    if (!cookie || !token) {
      const errorMsg = '登录已过期，请重新扫码登录';
      console.warn(`[Schedule] ${errorMsg}`);
      this.config.lastError = errorMsg;
      await setScheduleConfig(this.config);
      await setScheduleState({ lastCheckTime: Date.now(), nextCheckTime: null, isRunning: false, error: errorMsg });
      this.scheduleNext();
      return;
    }

    await setScheduleState({ lastCheckTime: null, nextCheckTime: null, isRunning: true, error: '' });

    try {
      const result = await this.checkAccounts(cookie, token);

      // 发送钉钉通知
      if (result.newArticles.length > 0 && dingtalkUrl) {
        await this.sendDingTalk(dingtalkUrl, this.config.dingtalkSecret, result.newArticles);
      }

      // 保存更新后的账号信息
      if (result.updatedAccounts.length > 0) {
        await setScheduleAccounts(result.updatedAccounts);
      }

      const nextDelay = this.nextDelay();
      const nextCheckTime = Date.now() + nextDelay;
      await setScheduleState({
        lastCheckTime: Date.now(),
        nextCheckTime,
        isRunning: false,
        error: '',
      });

      console.log(`[Schedule] 检查完成，发现 ${result.newArticles.length} 篇新文章，下次检查约 ${Math.round(nextDelay / 60000)} 分钟后`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Schedule] 检查失败: ${errorMsg}`);
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
    this.timer = setTimeout(() => this.tick(), delay) as unknown as ReturnType<typeof setInterval>;
  }

  /**
   * 检查所有已订阅公众号的最新文章
   */
  private async checkAccounts(
    cookie: string,
    token: string,
  ): Promise<{ newArticles: NewArticle[]; updatedAccounts: ScheduleAccount[] }> {
    const accounts = await getScheduleAccounts();
    const enabledAccounts = accounts.filter(a => a.enabled);

    const newArticles: NewArticle[] = [];
    const updatedAccounts: ScheduleAccount[] = [];

    for (const account of enabledAccounts) {
      try {
        const latestArticles = await this.fetchLatestArticles(account.fakeid, cookie, token);

        if (latestArticles.length === 0) continue;

        const latestArticle = latestArticles[0];
        const latestTime = latestArticle.create_time;
        const storedTime = account.lastArticleTime;

        // 判断是否有新文章
        if (latestTime > storedTime) {
          // 找出所有比 storedTime 新的文章
          const newOnes = latestArticles.filter(a => a.create_time > storedTime);
          for (const article of newOnes) {
            newArticles.push({
              account: account.nickname,
              title: article.title,
              url: article.link,
              createTime: article.create_time,
              digest: article.digest || '',
            });
          }

          // 更新账号的最新文章信息
          account.lastArticleTime = latestTime;
          account.lastArticleTitle = latestArticle.title;
          account.lastArticleUrl = latestArticle.link;
          updatedAccounts.push(account);
        }
      } catch (err) {
        console.error(`[Schedule] 检查公众号 "${account.nickname}" 失败:`, err);
      }

      // 模拟人工：每个公众号之间随机延迟 30 秒～5 分钟
      const delay = 30_000 + Math.random() * 270_000; // 30s～5min
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    return { newArticles, updatedAccounts };
  }

  /**
   * 获取某个公众号的最新文章列表
   */
  private async fetchLatestArticles(
    fakeid: string,
    cookie: string,
    token: string,
  ): Promise<ArticleSnippet[]> {
    const params = {
      sub: 'list',
      search_field: 'null',
      begin: '0',
      count: '5',
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
        console.error(`[Schedule] 钉钉通知发送失败:`, result);
      } else {
        console.log(`[Schedule] 钉钉通知发送成功，共 ${newArticles.length} 篇`);
      }
    } catch (err) {
      console.error(`[Schedule] 钉钉通知发送异常:`, err);
    }
  }
}

interface ArticleSnippet {
  title: string;
  link: string;
  create_time: number;
  digest: string;
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
