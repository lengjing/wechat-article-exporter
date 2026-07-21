<template>
  <div class="h-full overflow-scroll p-6">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">定时订阅</h1>
    </Teleport>

    <!-- 配置卡片 -->
    <UCard class="mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold">推送配置</h3>
          <div class="flex items-center gap-2">
            <span class="text-sm text-slate-10">调度状态：</span>
            <UBadge :color="status.enabled ? 'green' : 'gray'" variant="solid">
              {{ status.enabled ? '运行中' : '已停止' }}
            </UBadge>
          </div>
        </div>
      </template>

      <div class="space-y-5">
        <!-- 钉钉机器人 URL -->
        <div>
          <label class="block text-sm font-medium mb-1">钉钉机器人 Webhook 地址</label>
          <div class="flex gap-2">
            <UInput
              v-model="dingtalkUrl"
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
              class="flex-1 font-mono"
              size="lg"
            />
            <UButton @click="saveDingtalkUrl" color="black" :loading="savingDingtalk">
              保存
            </UButton>
          </div>
          <p class="text-xs text-slate-10 mt-1">
            在钉钉群中添加自定义机器人，复制 Webhook 地址粘贴到此处
          </p>
        </div>

        <!-- 钉钉签名密钥 -->
        <div>
          <label class="block text-sm font-medium mb-1">
            签名密钥
            <UBadge color="gray" variant="subtle" size="xs" class="ml-1">可选</UBadge>
          </label>
          <div class="flex gap-2">
            <UInput
              v-model="dingtalkSecret"
              placeholder="SECabcd..."
              class="flex-1 font-mono"
              size="lg"
            />
          </div>
          <p class="text-xs text-slate-10 mt-1">
            如果钉钉机器人开启了「加签」，在此填写签名密钥。未开启则留空
          </p>
        </div>

        <!-- 检查间隔 -->
        <div>
          <label class="block text-sm font-medium mb-1">检查间隔（小时）</label>
          <div class="flex gap-2 items-center">
            <UInput
              v-model.number="intervalHours"
              type="number"
              :min="1"
              :max="48"
              class="w-32"
            />
            <span class="text-sm text-slate-10">小时（建议 2 小时以上）</span>
          </div>
        </div>

        <!-- 启用/禁用 -->
        <div class="flex items-center justify-between pt-2 border-t border-slate-6 dark:border-slate-600">
          <div>
            <p class="font-medium">启用定时调度</p>
            <p class="text-sm text-slate-10">启用后将按间隔时间自动检查已订阅公众号的最新文章</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="black"
              variant="outline"
              :loading="runningNow"
              :disabled="!status.enabled"
              @click="runNow"
            >
              立即执行
            </UButton>
            <UButton
              :color="status.enabled ? 'red' : 'green'"
              :loading="toggling"
              @click="toggleSchedule"
            >
              {{ status.enabled ? '停止调度' : '启动调度' }}
            </UButton>
          </div>
        </div>

        <!-- 状态信息 -->
        <div v-if="status.enabled || status.lastCheckTime" class="bg-slate-2 dark:bg-slate-800 rounded-lg p-3 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-10">最近检查：</span>
            <span>{{ formatTime(status.lastCheckTime) || '尚未检查' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-10">下次检查：</span>
            <span>{{ formatTime(status.nextCheckTime) || '-' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-10">已订阅账号：</span>
            <span>{{ status.accountCount }} / {{ status.totalAccounts }} 个</span>
          </div>
          <div v-if="status.error" class="flex justify-between text-red-500">
            <span>错误信息：</span>
            <span class="max-w-[400px] text-right">{{ status.error }}</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- 公众号列表（数据源：公众号管理） -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold">定时监控的公众号</h3>
          <span class="text-sm text-slate-10">共 {{ accounts.length }} 个</span>
        </div>
      </template>

      <!-- 登录提示 -->
      <div v-if="!isLoggedIn" class="text-center py-8">
        <p class="text-slate-10 mb-3">请先登录后再管理订阅</p>
        <UButton @click="showLogin" color="primary">去登录</UButton>
      </div>

      <!-- 搜索添加 -->
      <div v-else class="mb-6">
        <label class="block text-sm font-medium mb-2">搜索添加公众号</label>
        <div class="flex gap-2">
          <UInput
            v-model="searchKeyword"
            placeholder="输入公众号名称搜索"
            class="flex-1 font-mono"
            size="lg"
            @keyup.enter="searchAccounts"
          />
          <UButton @click="searchAccounts" color="black" :loading="searching">
            搜索
          </UButton>
        </div>

        <!-- 搜索结果 -->
        <div v-if="searchResults.length > 0" class="mt-3 space-y-2">
          <div
            v-for="result in searchResults"
            :key="result.fakeid"
            class="flex items-center gap-3 p-3 rounded-lg border border-slate-6 dark:border-slate-600"
          >
            <img
              v-if="result.round_head_img"
              :src="result.round_head_img"
              class="size-8 rounded-full flex-shrink-0"
              alt=""
            />
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ result.nickname }}</p>
              <p class="text-xs text-slate-10 truncate">{{ result.service_type || result.verify_info || '' }}</p>
            </div>
            <UBadge
              v-if="isInAccounts(result.fakeid)"
              color="green"
              variant="subtle"
              size="sm"
            >已添加</UBadge>
            <UButton
              v-else
              @click="addAccount(result)"
              color="black"
              variant="outline"
              size="sm"
            >添加并启用监控</UButton>
          </div>
        </div>
        <p v-else-if="searchKeyword && !searching" class="text-sm text-slate-10 mt-2">未找到相关公众号</p>
      </div>

      <!-- 已添加的公众号 -->
      <div v-if="accounts.length === 0" class="text-center py-8 text-slate-10">
        <p>暂无公众号</p>
        <p class="text-sm mt-1">在上方搜索并添加需要监控的公众号</p>
      </div>

      <div v-else>
        <div class="grid gap-3">
          <div
            v-for="account in accounts"
            :key="account.fakeid"
            class="flex items-center gap-3 p-3 rounded-lg border border-slate-6 dark:border-slate-600 hover:bg-slate-2 dark:hover:bg-slate-800 transition-colors"
          >
            <UCheckbox
              :model-value="!!account.scheduleEnabled"
              :label="account.nickname || account.fakeid"
              @update:model-value="toggleMonitor(account)"
            />
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ account.nickname || '未知' }}</p>
              <p class="text-xs text-slate-10">文章 {{ account.articles }} 篇</p>
            </div>
            <UBadge :color="account.scheduleEnabled ? 'green' : 'gray'" variant="subtle" size="sm">
              {{ account.scheduleEnabled ? '监控中' : '已暂停' }}
            </UBadge>
          </div>
        </div>

        <div class="mt-4 flex items-center gap-3">
          <UButton @click="enableAll" color="black" variant="outline" size="sm">全部启用监控</UButton>
          <UButton @click="disableAll" color="black" variant="outline" size="sm">全部暂停监控</UButton>
          <div class="flex-1"></div>
          <span class="text-sm text-slate-10">{{ monitoringCount }}/{{ accounts.length }} 监控中</span>
        </div>
      </div>
    </UCard>

    <div class="h-[20vh]"></div>
  </div>
</template>

<script setup lang="ts">
import { websiteName } from '~/config';
import type { AccountInfo } from '~/types/types';
import type { MpAccount } from '~/store/v2/info';

useHead({
  title: `定时订阅 | ${websiteName}`,
});

const modal = useModal();
const loginAccount = useLoginAccount();
const { checkLogin } = useLoginCheck();
const toast = useToast();

const isLoggedIn = computed(() => !!loginAccount.value);

// ======= 调度状态 =======

const status = ref({
  enabled: false,
  dingtalkUrl: '',
  dingtalkSecret: '',
  intervalHours: 2,
  lastCheckTime: null as number | null,
  nextCheckTime: null as number | null,
  isRunning: false,
  error: '',
});

const dingtalkUrl = ref('');
const dingtalkSecret = ref('');
const intervalHours = ref(2);
const savingDingtalk = ref(false);
const toggling = ref(false);
const runningNow = ref(false);

// ======= 公众号数据（数据源：公众号管理 .data/accounts.json）=======

/** 所有公众号列表 */
const accounts = ref<MpAccount[]>([]);

/** 启用监控的数量 */
const monitoringCount = computed(() => accounts.value.filter(a => a.scheduleEnabled).length);

/** 搜索关键词与结果 */
const searchKeyword = ref('');
const searching = ref(false);
const searchResults = ref<AccountInfo[]>([]);

// ======= 加载 =======

async function loadStatus() {
  try {
    const resp = await $fetch('/api/schedule/status');
    if (resp.code === 0) {
      status.value = { ...status.value, ...resp.data };
      dingtalkUrl.value = resp.data.dingtalkUrl || '';
      dingtalkSecret.value = resp.data.dingtalkSecret || '';
      intervalHours.value = resp.data.intervalHours || 2;
    }
  } catch (e) {
    console.error('加载调度状态失败:', e);
  }
}

/** 从公众号管理加载所有账号 */
async function loadAccounts() {
  try {
    const resp = await $fetch('/api/accounts');
    if (resp.code === 0 && Array.isArray(resp.data)) {
      accounts.value = resp.data as MpAccount[];
    }
  } catch (e) {
    console.error('加载公众号列表失败:', e);
  }
}

// ======= 搜索 =======

async function searchAccounts() {
  const kw = searchKeyword.value.trim();
  if (!kw) return;
  searching.value = true;
  searchResults.value = [];
  try {
    const resp = await $fetch('/api/web/mp/searchbiz', { query: { keyword: kw, begin: 0, size: 5 } });
    if (resp.base_resp?.ret === 0 && resp.list) {
      searchResults.value = resp.list;
    }
  } catch (e) {
    console.error('搜索公众号失败:', e);
  } finally {
    searching.value = false;
  }
}

function isInAccounts(fakeid: string): boolean {
  return accounts.value.some(a => a.fakeid === fakeid);
}

/** 搜索添加 → 加入公众号管理并启用监控 */
async function addAccount(info: AccountInfo) {
  const now = Math.round(Date.now() / 1000);
  const newAccount: MpAccount = {
    fakeid: info.fakeid,
    nickname: info.nickname,
    round_head_img: info.round_head_img,
    completed: false,
    count: 0,
    articles: 0,
    total_count: 0,
    create_time: now,
    update_time: now,
    scheduleEnabled: true,
  };
  accounts.value.push(newAccount);
  searchResults.value = [];
  searchKeyword.value = '';

  try {
    await $fetch('/api/accounts', { method: 'POST', body: newAccount });
    toast.add({ title: `已添加「${info.nickname}」并启用监控`, color: 'green' });
  } catch (e) {
    console.error('添加公众号失败:', e);
  }
}

// ======= 启用/暂停监控 =======

async function toggleMonitor(account: MpAccount) {
  account.scheduleEnabled = !account.scheduleEnabled;
  try {
    await $fetch('/api/accounts', { method: 'POST', body: account });
  } catch (e) {
    // 回滚
    account.scheduleEnabled = !account.scheduleEnabled;
    console.error('更新监控状态失败:', e);
  }
}

async function enableAll() {
  for (const acc of accounts.value) {
    acc.scheduleEnabled = true;
    try {
      await $fetch('/api/accounts', { method: 'POST', body: acc });
    } catch (e) {
      console.error(`启用监控失败: ${acc.nickname}`, e);
    }
  }
}

async function disableAll() {
  for (const acc of accounts.value) {
    acc.scheduleEnabled = false;
    try {
      await $fetch('/api/accounts', { method: 'POST', body: acc });
    } catch (e) {
      console.error(`暂停监控失败: ${acc.nickname}`, e);
    }
  }
}

// ======= 钉钉配置 =======

async function saveDingtalkUrl() {
  savingDingtalk.value = true;
  try {
    const resp = await $fetch('/api/schedule/dingtalk', {
      method: 'POST',
      body: { url: dingtalkUrl.value, secret: dingtalkSecret.value },
    });
    if (resp.code === 0) {
      toast.add({ title: 'Webhook 地址已保存', color: 'green' });
    } else {
      toast.add({ title: resp.message || '保存失败', color: 'red' });
    }
  } catch (e) {
    toast.add({ title: '保存失败', color: 'red' });
    console.error('保存 Webhook 失败:', e);
  } finally {
    savingDingtalk.value = false;
  }
}

// ======= 调度开关 =======

async function toggleSchedule() {
  toggling.value = true;
  try {
    const newEnabled = !status.value.enabled;
    const resp = await $fetch('/api/schedule/toggle', {
      method: 'POST',
      body: { enabled: newEnabled },
    });
    if (resp.code === 0) {
      status.value.enabled = newEnabled;
      toast.add({ title: newEnabled ? '调度已启动' : '调度已停止', color: 'green' });
      await loadStatus();
    } else {
      toast.add({ title: resp.message || '操作失败', color: 'red' });
    }
  } catch (e) {
    toast.add({ title: '操作失败', color: 'red' });
    console.error('切换调度状态失败:', e);
  } finally {
    toggling.value = false;
  }
}

/** 立即执行一次检查 */
async function runNow() {
  runningNow.value = true;
  try {
    const resp = await $fetch('/api/schedule/run-now', { method: 'POST' });
    if (resp.code === 0) {
      toast.add({ title: '已触发立即检查，请稍后查看结果', color: 'green' });
      // 延迟刷新状态
      setTimeout(() => loadStatus(), 2000);
    } else {
      toast.add({ title: resp.message || '操作失败', color: 'red' });
    }
  } catch (e) {
    toast.add({ title: '操作失败', color: 'red' });
    console.error('立即执行失败:', e);
  } finally {
    runningNow.value = false;
  }
}

function showLogin() {
  const { checkLogin } = useLoginCheck();
  checkLogin();
}

function formatTime(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

onMounted(async () => {
  await loadStatus();
  await loadAccounts();
});
</script>
