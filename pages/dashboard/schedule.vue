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
          <UButton
            :color="status.enabled ? 'red' : 'green'"
            :loading="toggling"
            @click="toggleSchedule"
          >
            {{ status.enabled ? '停止调度' : '启动调度' }}
          </UButton>
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

    <!-- 订阅公众号列表 -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-semibold">订阅的公众号</h3>
          <UButton @click="refreshAccounts" color="black" variant="outline" size="sm">
            刷新列表
          </UButton>
        </div>
      </template>

      <!-- 登录提示 -->
      <div v-if="!isLoggedIn" class="text-center py-8">
        <p class="text-slate-10 mb-3">请先登录后再管理订阅</p>
        <UButton @click="showLogin" color="primary">去登录</UButton>
      </div>

      <!-- 公众号列表 -->
      <div v-else-if="allAccounts.length === 0" class="text-center py-8 text-slate-10">
        <p>暂无已添加的公众号</p>
        <p class="text-sm mt-1">请先在「公众号管理」页面添加公众号</p>
      </div>

      <div v-else>
        <div class="grid gap-3">
          <div
            v-for="account in allAccounts"
            :key="account.fakeid"
            class="flex items-center gap-3 p-3 rounded-lg border border-slate-6 dark:border-slate-600 hover:bg-slate-2 dark:hover:bg-slate-800 transition-colors"
          >
            <UCheckbox
              v-model="subscribedMap[account.fakeid]"
              :label="account.nickname || account.fakeid"
            />
            <div class="flex-1">
              <p class="font-medium">{{ account.nickname || '未知公众号' }}</p>
              <p v-if="account.lastArticleTitle" class="text-xs text-slate-10 truncate">
                最新：{{ account.lastArticleTitle }}
              </p>
            </div>
            <span class="text-xs text-slate-9">
              {{ account.completed ? '已同步' : '同步中' }}
            </span>
          </div>
        </div>

        <div class="mt-4 flex items-center gap-3">
          <UButton @click="selectAll" color="black" variant="outline" size="sm">全选</UButton>
          <UButton @click="deselectAll" color="black" variant="outline" size="sm">取消全选</UButton>
          <div class="flex-1"></div>
          <UButton @click="saveAccounts" color="black" :loading="savingAccounts">
            保存订阅
          </UButton>
        </div>
      </div>
    </UCard>

    <div class="h-[20vh]"></div>
  </div>
</template>

<script setup lang="ts">
import { websiteName } from '~/config';
import { getAllInfo, type MpAccount } from '~/store/v2/info';
import type { ScheduleAccount } from '~/types/schedule';

useHead({
  title: `定时订阅 | ${websiteName}`,
});

const modal = useModal();
const loginAccount = useLoginAccount();
const { checkLogin } = useLoginCheck();
const toast = useToast();

const isLoggedIn = computed(() => !!loginAccount.value);

// 状态
const status = ref({
  enabled: false,
  dingtalkUrl: '',
  dingtalkSecret: '',
  intervalHours: 2,
  lastCheckTime: null as number | null,
  nextCheckTime: null as number | null,
  isRunning: false,
  error: '',
  accountCount: 0,
  totalAccounts: 0,
});

// 表单
const dingtalkUrl = ref('');
const dingtalkSecret = ref('');
const intervalHours = ref(2);
const savingDingtalk = ref(false);
const toggling = ref(false);
const savingAccounts = ref(false);

// 所有本地账号
const allAccounts = ref<MpAccount[]>([]);
// 订阅映射：fakeid -> 是否订阅
const subscribedMap = ref<Record<string, boolean>>({});
// 已订阅账号的详细信息
const scheduledAccounts = ref<ScheduleAccount[]>([]);

// 加载状态
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

async function loadAccounts() {
  try {
    // 从 IndexedDB 获取所有本地账号
    allAccounts.value = await getAllInfo();
  } catch (e) {
    console.error('加载本地账号失败:', e);
  }

  try {
    // 从服务器获取已订阅账号
    const resp = await $fetch('/api/schedule/accounts');
    if (resp.code === 0) {
      scheduledAccounts.value = resp.data || [];
      // 构建订阅映射
      const map: Record<string, boolean> = {};
      for (const acc of scheduledAccounts.value) {
        map[acc.fakeid] = acc.enabled;
      }
      // 合并已删除但仍然订阅的账号
      for (const acc of allAccounts.value) {
        if (map[acc.fakeid] === undefined) {
          map[acc.fakeid] = false;
        }
      }
      subscribedMap.value = map;
    }
  } catch (e) {
    console.error('加载订阅账号失败:', e);
  }
}

function refreshAccounts() {
  loadAccounts();
}

function selectAll() {
  for (const acc of allAccounts.value) {
    subscribedMap.value[acc.fakeid] = true;
  }
}

function deselectAll() {
  for (const acc of allAccounts.value) {
    subscribedMap.value[acc.fakeid] = false;
  }
}

// 保存订阅账号列表
async function saveAccounts() {
  savingAccounts.value = true;
  try {
    // 构建账号列表
    const accounts: ScheduleAccount[] = allAccounts.value
      .filter(acc => subscribedMap.value[acc.fakeid])
      .map(acc => {
        const existing = scheduledAccounts.value.find(s => s.fakeid === acc.fakeid);
        return {
          fakeid: acc.fakeid,
          nickname: acc.nickname || '',
          round_head_img: acc.round_head_img || '',
          lastArticleTime: existing?.lastArticleTime || 0,
          lastArticleTitle: existing?.lastArticleTitle || '',
          lastArticleUrl: existing?.lastArticleUrl || '',
          enabled: true,
        };
      });

    const resp = await $fetch('/api/schedule/accounts', {
      method: 'POST',
      body: { accounts },
    });

    if (resp.code === 0) {
      toast.add({ title: '订阅已保存', color: 'green' });
    } else {
      toast.add({ title: resp.message || '保存失败', color: 'red' });
    }
  } catch (e) {
    toast.add({ title: '保存失败', color: 'red' });
    console.error('保存订阅失败:', e);
  } finally {
    savingAccounts.value = false;
  }
}

// 保存钉钉 URL
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

// 启用/禁用调度
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
