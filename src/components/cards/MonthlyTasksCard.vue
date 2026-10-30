<template>
  <MyCard class="monthly-tasks" :status-class="monthActivity ? 'active' : ''">
    <template #icon>
      <img src="/icons/1736425783912140.png" alt="月度任务" />
    </template>
    <template #title>
      <h3>月度任务</h3>
    </template>
    <template #extra>
      <button
        type="button"
        class="header-refresh"
        :disabled="monthLoading || fishToppingUp || arenaToppingUp"
        @click="fetchMonthlyActivity({ notify: true, settle: true })"
      >
        {{ monthLoading ? "刷新中" : "刷新" }}
      </button>
    </template>
    <template #badge>
      <span v-if="remainingDays > 0">剩余 {{ remainingDays }} 天</span>
      <span v-else>最后一天</span>
    </template>
    <template #default>
      <div class="progress-item">
        <div class="progress-head">
          <span>钓鱼</span>
          <strong>{{
            monthReady ? `${fishNum}/${FISH_TARGET}` : "加载中"
          }}</strong>
        </div>
        <div class="bar"><i :style="{ width: `${fishPercent}%` }" /></div>
      </div>
      <div class="progress-item">
        <div class="progress-head">
          <span>竞技场</span>
          <strong>
            {{ monthReady ? `${arenaNum}/${ARENA_TARGET}` : "加载中" }}
            <em v-if="monthReady && !isArenaActivityOpen">未开放</em>
          </strong>
        </div>
        <div class="bar"><i :style="{ width: `${arenaPercent}%` }" /></div>
      </div>
      <div class="action-grid">
        <button
          v-if="fishToppingUp"
          type="button"
          class="action-button stop"
          @click="stopTopUp('fish')"
        >
          中断
        </button>
        <button
          v-else
          type="button"
          class="action-button"
          :disabled="monthLoading"
          @click="topUpMonthly('fish')"
        >
          钓鱼一键补齐
        </button>
        <button
          v-if="arenaToppingUp"
          type="button"
          class="action-button stop"
          @click="stopTopUp('arena')"
        >
          中断
        </button>
        <button
          v-else
          type="button"
          class="action-button"
          :disabled="monthLoading || !isArenaActivityOpen"
          @click="topUpMonthly('arena')"
        >
          竞技场一键补齐
        </button>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { useMessage } from "naive-ui";
import { computed, onUnmounted, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import MyCard from "../Common/MyCard.vue";

const tokenStore = useTokenStore();
const message = useMessage();

const FISH_TARGET = 320;
const ARENA_TARGET = 240;

const monthLoading = ref(false);
const fishToppingUp = ref(false);
const arenaToppingUp = ref(false);
const stopFish = ref(false);
const stopArena = ref(false);

const stopTopUp = (type) => {
  if (type === "fish") stopFish.value = true;
  else stopArena.value = true;
};
const monthActivity = ref(null);
const monthReady = ref(false);

const now = new Date();
const daysInMonth = new Date(
  now.getFullYear(),
  now.getMonth() + 1,
  0,
).getDate();
const dayOfMonth = now.getDate();
const remainingDays = computed(() => Math.max(0, daysInMonth - dayOfMonth));

const pickMonthActivity = (raw) => {
  const candidates = [
    raw,
    raw?.body,
    raw?.data,
    raw?.activity,
    raw?.body?.activity,
  ].filter((item) => item && typeof item === "object");
  return (
    candidates.find((item) => item.myMonthInfo || item.myArenaInfo) ||
    candidates[0] ||
    null
  );
};

const readCount = (value) => {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  return Number(value.num ?? value.count ?? value.value ?? 0) || 0;
};

const myMonthInfo = computed(() => monthActivity.value?.myMonthInfo || {});
const myArenaInfo = computed(() => monthActivity.value?.myArenaInfo || {});

const fishNum = computed(() =>
  readCount(myMonthInfo.value?.["2"] ?? myMonthInfo.value?.[2]),
);
const arenaNum = computed(() => readCount(myArenaInfo.value));

const writeFishNum = (num) => {
  const current = monthActivity.value || {};
  const myMonthInfo = { ...(current.myMonthInfo || {}) };
  myMonthInfo["2"] = { ...(myMonthInfo["2"] || {}), num };
  monthActivity.value = { ...current, myMonthInfo };
};

const writeArenaNum = (num) => {
  const current = monthActivity.value || {};
  monthActivity.value = {
    ...current,
    myArenaInfo: { ...(current.myArenaInfo || {}), num },
  };
};
const fishPercent = computed(() =>
  Math.min(100, Math.round((fishNum.value / FISH_TARGET) * 100)),
);
const arenaPercent = computed(() =>
  Math.min(100, Math.round((arenaNum.value / ARENA_TARGET) * 100)),
);


const isConnected = computed(() => {
  if (!tokenStore.selectedToken) return false;
  return (
    tokenStore.getWebSocketStatus(tokenStore.selectedToken.id) === "connected"
  );
});

const isArenaActivityOpen = computed(() => {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 22;
});

const fetchMonthlyActivity = async ({
  notify = false,
  keepProgress = false,
  settle = false,
} = {}) => {
  if (!tokenStore.selectedToken) {
    if (notify) message.warning("请先选择Token");
    return;
  }
  if (!isConnected.value) return;
  const prevFish = fishNum.value;
  const prevArena = arenaNum.value;
  if (!keepProgress) monthLoading.value = true;
  try {
    const tokenId = tokenStore.selectedToken.id;
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      "activity_get",
      {},
      10000,
    );
    const act = pickMonthActivity(result);
    if (!(act?.myMonthInfo || act?.myArenaInfo)) return false;
    if (keepProgress) {
      const nextFish = readCount(act.myMonthInfo?.["2"] ?? act.myMonthInfo?.[2]);
      const nextArena = readCount(act.myArenaInfo);
      if (nextFish < prevFish) {
        act.myMonthInfo = {
          ...(act.myMonthInfo || {}),
          2: { ...(act.myMonthInfo?.["2"] || {}), num: prevFish },
        };
      }
      if (nextArena < prevArena) {
        act.myArenaInfo = { ...(act.myArenaInfo || {}), num: prevArena };
      }
    }
    monthActivity.value = act;
    const progressed = fishNum.value > 0 || arenaNum.value > 0;
    if (progressed || settle) monthReady.value = true;
    if (notify) message.success("月度任务进度已更新");
    return progressed;
  } catch (e) {
    if (notify) message.error(`获取月度任务失败：${e.message}`);
    return false;
  } finally {
    monthLoading.value = false;
  }
};

const getTodayStartSec = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};
const isTodayAvailable = (lastTimeSec) => {
  if (!lastTimeSec || typeof lastTimeSec !== "number") return true;
  return lastTimeSec < getTodayStartSec();
};

const topUpMonthly = (type) => {
  const isFish = type === "fish";
  const target = isFish ? FISH_TARGET : ARENA_TARGET;
  const current = isFish ? fishNum.value : arenaNum.value;
  const need = Math.max(0, target - current);
  if (need <= 0) return message.success(`已满额 ${current}/${target}`);
  return isFish
    ? autoTopUpFish(need, target, target)
    : autoTopUpArena(need, target, target);
};

const autoTopUpFish = async (need, shouldBe, target) => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  if (!isConnected.value) return message.warning("请先建立WS连接");
  stopFish.value = false;
  fishToppingUp.value = true;
  let stopped = false;
  try {
    const tokenId = tokenStore.selectedToken.id;
    let role = tokenStore.gameData?.roleInfo?.role;
    if (!role) {
      try {
        await tokenStore.sendGetRoleInfo(tokenId);
      } catch {}
      role = tokenStore.gameData?.roleInfo?.role;
    }
    let freeUsed = 0;
    const lastFreeTime = Number(
      role?.statisticsTime?.["artifact:normal:lottery:time"] || 0,
    );
    if (isTodayAvailable(lastFreeTime)) {
      for (let i = 0; i < 3; i++) {
        if (stopFish.value) {
          stopped = true;
          break;
        }
        try {
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "artifact_lottery",
            { lotteryNumber: 1, newFree: true, type: 1 },
            8000,
          );
          freeUsed++;
          writeFishNum(Math.min(FISH_TARGET, fishNum.value + 1));
          await new Promise((r) => setTimeout(r, 500));
        } catch {
          break;
        }
      }
      if (freeUsed > 0 && !stopped)
        await fetchMonthlyActivity({ keepProgress: true });
    }
    if (stopFish.value) stopped = true;
    let remaining = stopped ? 0 : Math.max(0, shouldBe - fishNum.value);
    if (!stopped && remaining <= 0) return message.success("已补到满额");
    while (!stopped && remaining > 0) {
      if (stopFish.value) {
        stopped = true;
        break;
      }
      const batch = Math.min(10, remaining);
      try {
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "artifact_lottery",
          { lotteryNumber: batch, newFree: true, type: 1 },
          12000,
        );
      } catch (e) {
        message.error(`钓鱼失败：${e.message}`);
        break;
      }
      if (stopFish.value) {
        stopped = true;
        break;
      }
      remaining -= batch;
      writeFishNum(Math.min(target, fishNum.value + batch));
      await fetchMonthlyActivity({ keepProgress: true });
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!stopped) await fetchMonthlyActivity({ keepProgress: true });
    if (stopped) message.info("已中断钓鱼补齐");
    else if (fishNum.value >= shouldBe || fishNum.value >= target)
      message.success("钓鱼补齐完成");
    else message.warning("钓鱼补齐已停止，未达到目标");
  } finally {
    fishToppingUp.value = false;
  }
};

const pickArenaTargetId = (targets) => {
  const candidate =
    targets?.rankList?.[0] ||
    targets?.roleList?.[0] ||
    targets?.targets?.[0] ||
    targets?.targetList?.[0] ||
    targets?.list?.[0];

  if (candidate?.roleId) return candidate.roleId;
  if (candidate?.id) return candidate.id;
  return targets?.roleId || targets?.id;
};

const autoTopUpArena = async (need, shouldBe, target) => {
  if (!tokenStore.selectedToken) return message.warning("请先选择Token");
  if (!isConnected.value) return message.warning("请先建立WS连接");
  if (!isArenaActivityOpen.value)
    return message.warning("竞技场活动已关闭，请在 6:00-22:00 时间段内操作");
  stopArena.value = false;
  arenaToppingUp.value = true;
  let stopped = false;
  try {
    const tokenId = tokenStore.selectedToken.id;
    try {
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "arena_startarea",
        {},
        6000,
      );
    } catch {}
    let safetyCounter = 0;
    const safetyMaxFights = 100;
    let round = 1;
    let remaining = need;
    while (!stopped && remaining > 0 && safetyCounter < safetyMaxFights) {
      if (stopArena.value) {
        stopped = true;
        break;
      }
      const planFights = Math.ceil(remaining / 2);
      message.info(
        `竞技场补齐 第${round}轮：计划战斗 ${planFights} 场（估算每胜+2）`,
      );
      for (
        let i = 0;
        i < planFights && safetyCounter < safetyMaxFights;
        i++
      ) {
        if (stopArena.value) {
          stopped = true;
          break;
        }
        let targets;
        try {
          targets = await tokenStore.sendMessageWithPromise(
            tokenId,
            "arena_getareatarget",
            {},
            8000,
          );
        } catch (err) {
          message.error(`获取竞技场目标失败：${err.message}`);
          break;
        }

        console.info("[Arena] 获取竞技场目标响应", targets);
        const targetId = pickArenaTargetId(targets);
        if (!targetId) {
          message.warning("未找到可用的竞技场目标，已停止此轮");
          break;
        }
        try {
          await tokenStore.sendMessageWithPromise(
            tokenId,
            "fight_startareaarena",
            { targetId },
            15000,
          );
          await fetchMonthlyActivity({ keepProgress: true });
        } catch (e) {
          message.error(`竞技场对决失败：${e.message}`);
        }
        if (stopArena.value) {
          stopped = true;
          break;
        }
        safetyCounter++;
        await new Promise((r) => setTimeout(r, 400));
      }
      if (stopped) break;
      await fetchMonthlyActivity({ keepProgress: true });
      remaining = Math.max(0, shouldBe - arenaNum.value);
      round++;
    }
    if (stopped || stopArena.value) message.info("已中断竞技场补齐");
    else if (arenaNum.value >= shouldBe || arenaNum.value >= target)
      message.success("竞技场补齐完成");
    else if (safetyCounter >= safetyMaxFights)
      message.warning("达到安全上限，已停止竞技场补齐");
    else message.warning("竞技场补齐已停止，未达到目标");
  } finally {
    arenaToppingUp.value = false;
  }
};

let autoLoaded = false;
let autoLoading = false;
let autoAttempts = 0;
let autoLoadTimer = 0;

const resetMonthlyLoad = () => {
  window.clearTimeout(autoLoadTimer);
  monthActivity.value = null;
  monthReady.value = false;
  autoLoaded = false;
  autoLoading = false;
  autoAttempts = 0;
};

const autoLoadMonthly = async () => {
  if (autoLoaded || autoLoading || !isConnected.value) return;
  if (!tokenStore.gameData?.roleInfo?.role) {
    window.clearTimeout(autoLoadTimer);
    autoLoadTimer = window.setTimeout(autoLoadMonthly, 800);
    return;
  }
  if (autoAttempts >= 5) return;
  autoAttempts += 1;
  autoLoading = true;
  try {
    const progressed = await fetchMonthlyActivity({
      keepProgress: true,
      settle: autoAttempts >= 5,
    });
    if (progressed || autoAttempts >= 5) autoLoaded = true;
  } finally {
    autoLoading = false;
  }
  if (!autoLoaded && isConnected.value) {
    window.clearTimeout(autoLoadTimer);
    autoLoadTimer = window.setTimeout(autoLoadMonthly, 800);
  }
};

watch(
  () => tokenStore.selectedToken?.id,
  () => {
    resetMonthlyLoad();
    autoLoadMonthly();
  },
);

watch(
  () => [isConnected.value, Boolean(tokenStore.gameData?.roleInfo?.role)],
  ([connected]) => {
    if (connected) autoLoadMonthly();
  },
  { immediate: true },
);

watch(
  () => tokenStore.gameData?.commonActivityInfo,
  (body) => {
    const act = pickMonthActivity(body);
    if (!(act?.myMonthInfo || act?.myArenaInfo)) return;
    const nextFish = readCount(act.myMonthInfo?.["2"] ?? act.myMonthInfo?.[2]);
    const nextArena = readCount(act.myArenaInfo);
    if (!monthReady.value && nextFish === 0 && nextArena === 0) return;
    if (nextFish < fishNum.value) {
      act.myMonthInfo = {
        ...(act.myMonthInfo || {}),
        2: { ...(act.myMonthInfo?.["2"] || {}), num: fishNum.value },
      };
    }
    if (nextArena < arenaNum.value) {
      act.myArenaInfo = { ...(act.myArenaInfo || {}), num: arenaNum.value };
    }
    monthActivity.value = act;
    if (fishNum.value > 0 || arenaNum.value > 0) {
      monthReady.value = true;
      autoLoaded = true;
    }
  },
);

onUnmounted(() => {
  window.clearTimeout(autoLoadTimer);
});

defineExpose({ fetchMonthlyActivity });
</script>

<style scoped lang="scss">
.monthly-tasks {
  min-height: 0;

  &:hover {
    transform: none;
  }

  :deep(.card-header) {
    align-items: center;
    margin-bottom: 12px;

    .header-refresh {
      order: 1;
    }

    .status-badge {
      order: 2;
      flex-shrink: 0;
    }
  }

  :deep(.status-title h3) {
    margin-bottom: 0;
  }

  :deep(.card-content) {
    margin-bottom: 0;
  }

  :deep(.card-action:empty) {
    display: none;
  }
}

.progress-item + .progress-item {
  margin-top: 10px;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--text-secondary);

  strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  em {
    margin-left: 6px;
    font-style: normal;
    font-size: 12px;
    color: var(--error-color, #dc2626);
  }
}

.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  overflow: hidden;

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }
}

.header-refresh {
  height: 28px;
  margin-right: 8px;
  padding: 0 12px;
  border: 1px solid var(--border-light);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
  }
}

.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}

.action-button {
  height: 40px;
  padding: 0 8px;
  border: none;
  border-radius: 10px;
  background: var(--primary-color);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }

  &.stop {
    background: #dc2626;
  }
}
</style>
