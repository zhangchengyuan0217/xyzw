<template>
  <div class="weird-tower-page">
    <section class="panel">
      <div class="panel-head">
        <img
          src="/icons/1733492491706152.png"
          alt="怪异塔图标"
          class="status-icon"
        />
        <h3>怪异塔</h3>
        <span class="status-badge" :class="{ ready: statusReady }">{{
          statusText
        }}</span>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="stat-label">小鱼干</span>
          <span class="stat-value">{{ towerEnergy }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">当前层数</span>
          <span class="stat-value">{{ displayFloor }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">胜/败</span>
          <span class="stat-value">{{ winCount }}/{{ loseCount }}</span>
        </div>
      </div>

      <div class="action-row">
        <button
          class="primary-button"
          :disabled="!canClimb"
          @click="startTowerClimb"
        >
          {{ isClimbing ? "爬塔中..." : "开始爬塔" }}
        </button>
        <button
          class="ghost-button"
          :disabled="refreshing || isClimbing"
          @click="refreshTower"
        >
          刷新
        </button>
      </div>
      <div class="climb-limit">
        <span>本次最多</span>
        <input
          v-model.number="maxClimbInput"
          type="number"
          min="1"
          step="1"
          aria-label="怪异塔爬塔次数"
          :disabled="isClimbing || isUsingItems || isMerging"
        />
        <span>次</span>
      </div>
      <button v-if="isClimbing" class="stop-button" @click="stopClimbing">
        停止爬塔
      </button>
    </section>

    <section class="panel">
      <h3 class="section-title">购买小鱼干</h3>
      <div class="preset-row">
        <button
          v-for="n in buyPresets"
          :key="n"
          type="button"
          class="preset-button"
          :class="{ active: buyEnergyNum === n }"
          :disabled="buyLocked"
          @click="buyEnergyNum = n"
        >
          {{ n }}个
        </button>
      </div>
      <div class="buy-row">
        <input
          v-model.number="buyEnergyNum"
          class="qty-input"
          type="number"
          min="1"
          max="100"
          aria-label="购买数量"
          :disabled="buyLocked"
          @blur="clampBuyNum"
        />
        <button
          class="buy-button"
          :disabled="buyLocked || buyEnergyNum < 1 || buyEnergyNum > 100"
          @click="confirmBuyEnergy"
        >
          {{ isBuying ? "购买中" : "购买" }}
        </button>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3 class="section-title">阵容切换</h3>
          <p class="section-sub">当前阵容：阵容{{ currentTeam }}</p>
        </div>
        <button
          class="ghost-button small"
          :disabled="teamLoading || switchingTeam"
          @click="loadTeams(true)"
        >
          获取阵容
        </button>
      </div>
      <div class="team-row">
        <button
          v-for="team in teamCards"
          :key="team.id"
          type="button"
          class="team-card"
          :class="{ active: team.active }"
          :disabled="switchingTeam || teamLoading || isClimbing"
          @click="selectTeam(team.id)"
        >
          <span class="team-name">阵容{{ team.id }}</span>
          <span class="team-state">
            {{ team.active ? `使用中 · 第${team.id}阵容` : `第${team.id}阵容` }}
          </span>
          <span class="team-heroes">
            <img
              v-for="hero in team.heroes"
              v-show="hero.avatar"
              :key="hero.id"
              :src="hero.avatar"
              :alt="hero.name"
              :title="hero.name"
            />
          </span>
        </button>
      </div>
    </section>

    <section class="panel">
      <h3 class="section-title">道具</h3>
      <div class="action-row">
        <button
          v-if="!isUsingItems"
          class="ghost-button"
          :disabled="isClimbing || isMerging"
          @click="startUseItems"
        >
          一键使用道具
        </button>
        <button v-else class="stop-button inline" @click="stopUsingItems">
          停止使用
        </button>
        <button
          class="ghost-button"
          :disabled="isClimbing || isUsingItems || isMerging"
          @click="autoMergeItems"
        >
          {{ isMerging ? "合成中..." : "一键合成" }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useMessage } from "naive-ui";

// 停止批量爬塔操作
import { computed, onMounted, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { isSameGameValue } from "@/utils/gameValue.js";
import { HERO_DICT } from "@/utils/HeroList.js";
import {
  DEFAULT_WEIRD_TOWER_MAX_CLIMB,
  normalizeWeirdTowerMaxClimb,
} from "@/utils/towerClimbLimit.js";

let stopFlag = false;
let stopItemFlag = false;
let stopMergeFlag = false;

const stopClimbing = () => {
  stopFlag = true;
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }
  isClimbing.value = false;
  message.info("已手动停止批量爬塔");
};

const stopUsingItems = () => {
  stopItemFlag = true;
  if (itemTimeout.value) {
    clearTimeout(itemTimeout.value);
    itemTimeout.value = null;
  }
  isUsingItems.value = false;
  message.info("已手动停止使用道具");
};

const tokenStore = useTokenStore();
const message = useMessage();

// 响应式数据
const isClimbing = ref(false);
const isUsingItems = ref(false);
const isMerging = ref(false);
const isBuying = ref(false); // 购买小鱼干状态
const buyEnergyNum = ref(1); // 购买数量（1-100）
const buyPresets = [1, 10, 100];
const refreshing = ref(false);
const winCount = ref(0);
const loseCount = ref(0);
const teamLoading = ref(false);
const switchingTeam = ref(false);
const currentTeam = ref(1);
const availableTeams = ref([1, 2, 3]);
const maxClimbInput = ref(DEFAULT_WEIRD_TOWER_MAX_CLIMB);
const climbTimeout = ref(null); // 用于超时重置状态
const itemTimeout = ref(null); // 用于道具使用超时
const mergeTimeout = ref(null); // 用于合成超时
// 最后一次爬塔结果

// 计算属性 - 从gameData中获取塔相关信息
const evoTowerInfo = computed(() => {
  const data = tokenStore.gameData?.evoTowerInfo || null;
  return data;
});

const weirdTowerData = computed(() => {
  return evoTowerInfo.value?.evoTower || null;
});

const currentTowerId = computed(() => {
  return weirdTowerData.value?.towerId || 0;
});

// 已领取到的章号，与已通关章数不一致时游戏服会拒绝开战
const rewardTowerId = computed(() => {
  return weirdTowerData.value?.rewardTowerId || 0;
});

// 未领取的章节通关奖励数量：已通关章数(towerId / 10) - 已领章号
const pendingChapterRewards = computed(() => {
  const towerId = currentTowerId.value;
  if (!towerId) {
    return 0;
  }
  return Math.max(0, Math.floor(towerId / 10) - rewardTowerId.value);
});

const displayFloor = computed(() => {
  const towerId = currentTowerId.value;

  if (towerId === 0) {
    return "1-1";
  } else {
    // 计算章节和层数
    // 每章10层，0-9为第1章，10-19为第2章，20-29为第3章，以此类推
    const chapter = Math.floor(towerId / 10) + 1;
    const floor = (towerId % 10) + 1;
    return `${chapter}-${floor}`;
  }
});

const towerEnergy = computed(() => {
  return weirdTowerData.value?.energy || 0;
});

const canClimb = computed(() => {
  const hasEnergy = towerEnergy.value > 0;
  const notClimbing = !isClimbing.value;
  const notUsingItems = !isUsingItems.value;
  const notMerging = !isMerging.value;
  return hasEnergy && notClimbing && notUsingItems && notMerging;
});

const buyLocked = computed(
  () =>
    isBuying.value || isClimbing.value || isUsingItems.value || isMerging.value,
);

// ==================== 购买小鱼干 ====================
// 接口来源：逆向 game bundle (game/index.140bc.jsc) 解密后源码
//   EvoTowerService.buyEnergy({ energy: N })
// 对应 WebSocket 命令：evotower_buyenergy（命名规律 getInfo→evotower_getinfo）
// 价格：ConstantConf.config.evoTowerEnergyPrice，支付货币：金砖

const clampBuyNum = () => {
  if (!buyEnergyNum.value || buyEnergyNum.value < 1) buyEnergyNum.value = 1;
  if (buyEnergyNum.value > 100) buyEnergyNum.value = 100;
};

/**
 * 确认购买小鱼干，发送购买指令并刷新怪异塔能量。
 *
 * @returns {Promise<void>} 无返回值，结果通过 message 提示
 */
const confirmBuyEnergy = async () => {
  clampBuyNum();
  const num = buyEnergyNum.value;
  if (num < 1 || num > 100) {
    message.error("购买数量必须在 1-100 之间");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const beforeEnergy = towerEnergy.value;

  isBuying.value = true;
  try {
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "evotower_buyenergy",
      { energy: num },
      8000,
    );
    // 刷新怪异塔信息
    await getTowerInfo();
    const afterEnergy = towerEnergy.value;
    const gain = afterEnergy - beforeEnergy;
    if (gain > 0) {
      message.success(`购买成功！小鱼干 +${gain}（当前 ${afterEnergy}）`);
    } else if (gain === 0) {
      message.warning(`购买已执行（当前 ${afterEnergy}）`);
    } else {
      message.warning(`购买已执行，能量变化 ${gain}（当前 ${afterEnergy}）`);
    }
    console.log("[购买小鱼干] 响应:", JSON.stringify(res).slice(0, 500));
  } catch (error) {
    console.error("[购买小鱼干] 失败:", error);
    const errMsg = error?.message || String(error);
    if (errMsg.includes("1300050") || errMsg.includes("购买数量")) {
      message.error("购买数量超出限制，请调整数量");
    } else if (errMsg.includes("金砖")) {
      message.error("金砖不足，无法购买");
    } else {
      message.error(`购买失败：${errMsg.slice(0, 80)}`);
    }
  } finally {
    isBuying.value = false;
  }
};

const getCurrentActivityWeek = computed(() => {
  const now = new Date();
  const start = new Date("2025-12-12T12:00:00"); // 起始时间：黑市周开始
  const weekDuration = 7 * 24 * 60 * 60 * 1000; // 一周毫秒数
  const cycleDuration = 3 * weekDuration; // 三周期毫秒数

  const elapsed = now - start;
  if (elapsed < 0) return null; // 活动开始前

  const cyclePosition = elapsed % cycleDuration;

  if (cyclePosition < weekDuration) {
    return "黑市周";
  } else if (cyclePosition < 2 * weekDuration) {
    return "招募周";
  } else {
    return "宝箱周";
  }
});

const isWeirdTowerActivityOpen = computed(() => {
  return getCurrentActivityWeek.value === "黑市周";
});

// 方法
const startUseItems = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (isClimbing.value) {
    message.warning("正在爬塔中，请稍后再试");
    return;
  }

  if (isMerging.value) {
    message.warning("正在合成中，请稍后再试");
    return;
  }

  isUsingItems.value = true;
  stopItemFlag = false;

  // 设置超时保护，60秒后自动重置状态
  itemTimeout.value = setTimeout(() => {
    isUsingItems.value = false;
    itemTimeout.value = null;
    stopItemFlag = true;
    message.info("一键使用道具已超时自动停止");
  }, 60000);

  try {
    const tokenId = tokenStore.selectedToken.id;

    // 1. 获取活动信息
    const infoRes = await tokenStore.sendMessageWithPromise(
      tokenId,
      "mergebox_getinfo",
      { actType: 1 },
      5000,
    );

    // 获取怪异塔信息以读取剩余道具数量
    const towerInfoRes = await tokenStore.sendMessageWithPromise(
      tokenId,
      "evotower_getinfo",
      {},
      5000,
    );

    if (!infoRes || !infoRes.mergeBox) {
      throw new Error("获取活动信息失败");
    }

    let costTotalCnt = infoRes.mergeBox.costTotalCnt || 0;
    let lotteryLeftCnt = towerInfoRes?.evoTower?.lotteryLeftCnt || 0;

    if (lotteryLeftCnt <= 0) {
      message.info("没有剩余道具可使用");
      isUsingItems.value = false;
      if (itemTimeout.value) clearTimeout(itemTimeout.value);
      return;
    }

    message.success(
      `开始使用道具，剩余：${lotteryLeftCnt}，已用：${costTotalCnt}`,
    );
    let processedCount = 0;

    // eslint-disable-next-line no-unmodified-loop-condition -- The Stop button changes this flag while awaited requests yield.
    while (lotteryLeftCnt > 0 && !stopItemFlag) {
      let pos = {};
      if (costTotalCnt < 2) {
        pos = { gridX: 4, gridY: 5 };
      } else if (costTotalCnt < 102) {
        pos = { gridX: 7, gridY: 3 };
      } else {
        pos = { gridX: 6, gridY: 3 };
      }

      // 2. 使用道具
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "mergebox_openbox",
        {
          actType: 1,
          pos,
        },
        5000,
      );

      costTotalCnt++;
      lotteryLeftCnt--;
      processedCount++;

      await new Promise((res) => setTimeout(res, 500));
    }

    // 领取累计奖励
    await tokenStore
      .sendMessageWithPromise(
        tokenId,
        "mergebox_claimcostprogress",
        { actType: 1 },
        5000,
      )
      .catch(() => {});

    message.success(`已使用道具 ${processedCount} 次`);
    // 刷新一下
    await getTowerInfo();
  } catch (error) {
    message.error(`使用道具失败: ${error.message || "未知错误"}`);
  } finally {
    if (itemTimeout.value) {
      clearTimeout(itemTimeout.value);
      itemTimeout.value = null;
    }
    isUsingItems.value = false;
  }
};

const autoMergeItems = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (isClimbing.value || isUsingItems.value) {
    message.warning("正在执行其他操作，请稍后再试");
    return;
  }

  isMerging.value = true;
  stopMergeFlag = false;

  // 设置超时保护，60秒后自动重置状态
  mergeTimeout.value = setTimeout(() => {
    isMerging.value = false;
    mergeTimeout.value = null;
    stopMergeFlag = true;
    message.info("一键合成已超时自动停止");
  }, 60000);

  try {
    const tokenId = tokenStore.selectedToken.id;
    message.loading("正在执行一键合成...");

    let loopCount = 0;
    const MAX_LOOPS = 20;

    // eslint-disable-next-line no-unmodified-loop-condition -- The Stop button changes this flag while awaited requests yield.
    while (loopCount < MAX_LOOPS && !stopMergeFlag) {
      loopCount++;

      // 获取当前信息
      const infoRes = await tokenStore.sendMessageWithPromise(
        tokenId,
        "mergebox_getinfo",
        { actType: 1 },
        5000,
      );

      if (!infoRes || !infoRes.mergeBox) {
        throw new Error("返回数据缺少 mergeBox");
      }

      // 领取合成奖励
      if (infoRes.mergeBox.taskMap) {
        const taskMap = infoRes.mergeBox.taskMap;
        const taskClaimMap = infoRes.mergeBox.taskClaimMap || {};

        for (const taskId in taskMap) {
          if (stopMergeFlag) break;
          if (taskMap[taskId] !== 0 && !taskClaimMap[taskId]) {
            await tokenStore
              .sendMessageWithPromise(
                tokenId,
                "mergebox_claimmergeprogress",
                { actType: 1, taskId: Number.parseInt(taskId) },
                2000,
              )
              .catch(() => {});
            await new Promise((res) => setTimeout(res, 500));
          }
        }
      }

      // 解析 gridMap
      const gridMap = infoRes.mergeBox.gridMap || {};
      const items = [];

      // 收集所有 gridConfId === 0 的物品
      for (const xStr in gridMap) {
        for (const yStr in gridMap[xStr]) {
          const item = gridMap[xStr][yStr];
          if (
            isSameGameValue(item.gridConfId, 0) &&
            item.gridItemId > 0 &&
            !item.isLock
          ) {
            items.push({
              x: Number.parseInt(xStr),
              y: Number.parseInt(yStr),
              id: item.gridItemId,
            });
          }
        }
      }

      // 按 gridItemId 分组
      const groupedItems = {};
      items.forEach((item) => {
        if (!groupedItems[item.id]) {
          groupedItems[item.id] = [];
        }
        groupedItems[item.id].push(item);
      });

      // 检查是否有可合成项
      let hasPotentialMerge = false;
      for (const id in groupedItems) {
        if (groupedItems[id].length >= 2) {
          hasPotentialMerge = true;
          break;
        }
      }

      if (!hasPotentialMerge) {
        if (loopCount === 1) {
          message.info("当前没有可合成的物品");
        }
        break;
      }

      const isLevel8OrAbove =
        infoRes.mergeBox.taskMap &&
        infoRes.mergeBox.taskMap["251212208"] &&
        infoRes.mergeBox.taskMap["251212208"] !== 0;

      if (isLevel8OrAbove) {
        // 8级以上使用智能合成
        await tokenStore.sendMessageWithPromise(
          tokenId,
          "mergebox_automergeitem",
          { actType: 1 },
          10000,
        );
        await new Promise((res) => setTimeout(res, 1500));
      } else {
        // 8级以下手动合成
        for (const id in groupedItems) {
          if (stopMergeFlag) break;
          const group = groupedItems[id];
          // 两两合成
          while (group.length >= 2) {
            if (stopMergeFlag) break;
            const source = group.shift();
            const target = group.shift();

            await tokenStore
              .sendMessageWithPromise(
                tokenId,
                "mergebox_mergeitem",
                {
                  actType: 1,
                  sourcePos: { gridX: source.x, gridY: source.y },
                  targetPos: { gridX: target.x, gridY: target.y },
                },
                1000,
              )
              .catch(() => {});
            await new Promise((res) => setTimeout(res, 300));
          }
        }
      }

      // 继续下一轮循环
      await new Promise((res) => setTimeout(res, 500));
    }

    message.success("一键合成操作完成");
    // 刷新一下
    await getTowerInfo();
  } catch (error) {
    message.error(`一键合成失败: ${error.message || "未知错误"}`);
  } finally {
    if (mergeTimeout.value) {
      clearTimeout(mergeTimeout.value);
      mergeTimeout.value = null;
    }
    isMerging.value = false;
  }
};

const startTowerClimb = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (!isWeirdTowerActivityOpen.value) {
    message.warning("怪异塔活动未开始或已结束");
    return;
  }

  if (!canClimb.value) {
    message.warning("体力不足或正在执行其他操作");
    return;
  }

  // 清除之前的超时
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }

  isClimbing.value = true;
  stopFlag = false;
  let climbCount = 0;
  const maxClimb = normalizeWeirdTowerMaxClimb(maxClimbInput.value);
  maxClimbInput.value = maxClimb;
  // 设置超时保护，60秒后自动重置状态
  climbTimeout.value = setTimeout(() => {
    isClimbing.value = false;
    climbTimeout.value = null;
    stopFlag = true;
    message.info("批量爬塔已超时自动停止");
  }, 60000);

  try {
    const tokenId = tokenStore.selectedToken.id;
    // 爬塔前先补领未领取的章节奖励，否则 evotower_readyfight 会被拒绝（12200020）
    await claimPendingChapterRewards(tokenId);

    for (let i = 0; i < maxClimb; i++) {
      if (stopFlag) break;

      // 检查当前能量
      await getTowerInfo();
      const currentEnergy = towerEnergy.value;
      if (currentEnergy <= 0) break;

      const floorBefore = currentTowerId.value;

      // 准备战斗
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "evotower_readyfight",
        {},
        5000,
      );

      // 执行战斗
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "evotower_fight",
        {
          battleNum: 1,
          winNum: 1,
        },
        10000,
      );

      climbCount++;
      // message.success(`第${climbCount}次爬塔命令已发送`);

      // 更新爬塔信息，层数前进记胜，否则记败
      await getTowerInfo();
      if (currentTowerId.value > floorBefore) {
        winCount.value += 1;
      } else {
        loseCount.value += 1;
      }

      // 检查并领取每日任务奖励
      const towerData = evoTowerInfo.value?.evoTower;
      if (towerData && towerData.taskClaimMap) {
        const now = new Date();
        const year = now.getFullYear().toString().slice(2);
        const month = (now.getMonth() + 1).toString().padStart(2, "0");
        const day = now.getDate().toString().padStart(2, "0");
        const dateKey = `${year}${month}${day}`;

        const dailyTasks = towerData.taskClaimMap[dateKey] || {};
        const taskIds = [1, 2, 3];

        for (const taskId of taskIds) {
          if (!dailyTasks[taskId]) {
            await tokenStore
              .sendMessageWithPromise(
                tokenId,
                "evotower_claimtask",
                { taskId },
                2000,
              )
              .then(() => {
                message.success(`领取每日任务奖励 ${taskId} 成功`);
              })
              .catch(() => {
                // 失败静默，可能是还没达到条件
              });
            // 稍微延时避免请求过快
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }

      // 通关章节奖励：以 rewardTowerId 为准判断是否有未领取的章节
      // （原按 (towerId % 10) + 1 === 1 判断，towerId 为 10 的整数倍时恒成立，
      //   会重复发送领奖命令，且无法感知历史未领取的章节）
      await claimPendingChapterRewards(tokenId);

      await new Promise((res) => setTimeout(res, 400)); // 每次间隔400毫秒
    }
    // 获取免费道具数量
    const freeEnergyResult = await tokenStore.sendMessageWithPromise(
      tokenId,
      "mergebox_getinfo",
      {
        actType: 1,
      },
      5000,
    );
    if (freeEnergyResult && freeEnergyResult.mergeBox.freeEnergy > 0) {
      // 领取免费道具
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "mergebox_claimfreeenergy",
        {
          actType: 1,
        },
        5000,
      );
      message.success(
        `成功领取免费道具${freeEnergyResult.mergeBox.freeEnergy}个！`,
      );
    }
    await new Promise((res) => setTimeout(res, 500));
    message.success(`已自动爬塔${climbCount}次，体力已耗尽或达到上限。`);
  } catch (error) {
    message.error(`批量爬塔失败: ${error.message || "未知错误"}`);
  }

  // 清除超时并重置状态
  if (climbTimeout.value) {
    clearTimeout(climbTimeout.value);
    climbTimeout.value = null;
  }
  isClimbing.value = false;
};

const refreshTower = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  refreshing.value = true;
  try {
    await getTowerInfo();
    message.success("已刷新怪异塔");
  } finally {
    refreshing.value = false;
  }
};

const presetTeamRaw = computed(() => tokenStore.gameData?.presetTeam ?? null);

function normalizePresetTeam(raw) {
  if (!raw) return { useTeamId: 1, teams: {} };
  const root = raw.presetTeamInfo ?? raw;
  const useTeamId = root.useTeamId ?? root.presetTeamInfo?.useTeamId ?? 1;
  const dict = root.presetTeamInfo ?? root;
  const teams = {};
  const teamIds = Object.keys(dict || {}).filter((key) => /^\d+$/.test(key));
  for (const idStr of teamIds) {
    const node = dict[idStr];
    if (node?.teamInfo) {
      teams[Number(idStr)] = { teamInfo: node.teamInfo };
    } else if (node && typeof node === "object") {
      teams[Number(idStr)] = { teamInfo: node };
    } else {
      teams[Number(idStr)] = { teamInfo: {} };
    }
  }
  return { useTeamId: Number(useTeamId) || 1, teams };
}

const presetTeam = computed(() => normalizePresetTeam(presetTeamRaw.value));

function heroesOf(teamId) {
  const team = presetTeam.value.teams[teamId]?.teamInfo;
  if (!team) return [];
  return Object.entries(team)
    .map(([pos, hero]) => {
      const hid = hero?.heroId ?? hero?.id;
      if (!hid) return null;
      const meta = HERO_DICT[Number(hid)];
      const avatarPath = meta?.avatar;
      return {
        id: Number(hid),
        name: meta?.name ?? `英雄${hid}`,
        position: Number(pos),
        avatar: avatarPath
          ? import.meta.env.BASE_URL + String(avatarPath).replace(/^\//, "")
          : "",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.position - b.position);
}

const teamCards = computed(() =>
  availableTeams.value.map((id) => ({
    id,
    active: currentTeam.value === id,
    heroes: heroesOf(id),
  })),
);

const syncTeams = () => {
  const ids = Object.keys(presetTeam.value.teams)
    .map(Number)
    .filter((id) => !Number.isNaN(id))
    .sort((a, b) => a - b);
  availableTeams.value = ids.length ? ids : [1, 2, 3];
  currentTeam.value = presetTeam.value.useTeamId || 1;
};

const loadTeams = async (force = false, quiet = false) => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  if (!force && presetTeamRaw.value) {
    syncTeams();
    return;
  }
  teamLoading.value = true;
  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenStore.selectedToken.id,
      "presetteam_getinfo",
      {},
      8000,
    );
    tokenStore.$patch((state) => {
      state.gameData = { ...(state.gameData ?? {}), presetTeam: result };
    });
    syncTeams();
    if (force && !quiet) message.success("已获取阵容");
  } catch (error) {
    message.error(`获取阵容失败：${error?.message || error}`);
  } finally {
    teamLoading.value = false;
  }
};

const selectTeam = async (teamId) => {
  if (
    switchingTeam.value ||
    teamLoading.value ||
    currentTeam.value === teamId
  ) {
    return;
  }
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  const previous = currentTeam.value;
  switchingTeam.value = true;
  try {
    await tokenStore.sendMessageWithPromise(
      tokenStore.selectedToken.id,
      "presetteam_saveteam",
      { teamId },
      8000,
    );
    currentTeam.value = teamId;
    message.success(`已切换到阵容${teamId}`);
    await loadTeams(true, true);
  } catch (error) {
    currentTeam.value = previous;
    message.error(`切换阵容失败：${error?.message || error}`);
  } finally {
    switchingTeam.value = false;
  }
};

const getTowerInfo = async () => {
  if (!tokenStore.selectedToken) {
    return;
  }

  try {
    const tokenId = tokenStore.selectedToken.id;
    // 检查WebSocket连接状态
    const wsStatus = tokenStore.getWebSocketStatus(tokenId);

    if (wsStatus !== "connected") {
      return;
    }
    // 获取怪异塔信息
    await tokenStore.sendMessageWithPromise(
      tokenId,
      "evotower_getinfo",
      {},
      5000,
    );
    // 更新角色信息
    await tokenStore.sendMessage(tokenId, "role_getroleinfo");
  } catch (error) {
    // 获取塔信息失败：静默，避免噪声
  }
};

/**
 * 补领未领取的章节通关奖励
 *
 * towerId 是层号（如 240 表示已通关第 24 章），rewardTowerId 是已领取到的章号。
 * 两者不一致时 evotower_readyfight 会被游戏服拒绝并返回 12200020，导致爬塔无法开始，
 * 因此需在爬塔前先补齐。
 *
 * @param {string} tokenId - token id
 * @returns {Promise<number>} 实际补领的章节数
 */
const claimPendingChapterRewards = async (tokenId) => {
  let pending = pendingChapterRewards.value;
  if (pending <= 0) {
    return 0;
  }

  message.info(`检测到 ${pending} 个未领取的章节奖励，先行补领`);
  let claimed = 0;
  while (pending > 0) {
    try {
      await tokenStore.sendMessageWithPromise(
        tokenId,
        "evotower_claimreward",
        {},
        5000,
      );
      claimed++;
      pending--;
      await new Promise((r) => setTimeout(r, 300));
    } catch (error) {
      message.error(`领取章节奖励失败：${error?.message || error}`);
      break;
    }
  }

  if (claimed > 0) {
    message.success(`已补领 ${claimed} 个章节通关奖励`);
    await getTowerInfo();
  }
  return claimed;
};

// 监听WebSocket连接状态变化
const wsStatus = computed(() => {
  if (!tokenStore.selectedToken) return "disconnected";
  return tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
});

const statusText = computed(() => {
  if (!tokenStore.selectedToken || wsStatus.value !== "connected")
    return "未连接";
  if (isClimbing.value) return "爬塔中";
  if (isUsingItems.value) return "使用道具";
  if (isMerging.value) return "合成中";
  if (isBuying.value) return "购买中";
  if (!isWeirdTowerActivityOpen.value) return "未开放";
  return "就绪";
});

const statusReady = computed(() => statusText.value === "就绪");

// 监听WebSocket连接状态，连接成功后自动获取塔信息
watch(wsStatus, (newStatus, oldStatus) => {
  if (newStatus === "connected" && oldStatus !== "connected") {
    // 延迟一点时间让WebSocket完全就绪
    setTimeout(() => {
      getTowerInfo();
      loadTeams(false);
    }, 1000);
  }
});

// 监听选中Token变化
watch(
  () => tokenStore.selectedToken,
  (newToken, oldToken) => {
    if (newToken && newToken.id !== oldToken?.id) {
      // 检查WebSocket是否已连接
      const status = tokenStore.getWebSocketStatus(newToken.id);
      if (status === "connected") {
        getTowerInfo();
        loadTeams(false);
      }
    }
  },
);

// 生命周期
onMounted(() => {
  // 检查WebSocket客户端
  if (tokenStore.selectedToken) {
    tokenStore.getWebSocketClient(tokenStore.selectedToken.id);
  }

  // 组件挂载时获取塔信息
  if (tokenStore.selectedToken && wsStatus.value === "connected") {
    getTowerInfo();
    loadTeams(false);
  }
});

watch(presetTeamRaw, syncTeams, { deep: true });
</script>

<style scoped lang="scss">
.weird-tower-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.panel {
  padding: 14px;
  border: 1px solid var(--border-light);
  border-radius: 16px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-light);
}

.panel-head,
.section-head,
.action-row,
.buy-row,
.climb-limit {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-head h3,
.section-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.section-head {
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.section-sub {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.status-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.status-badge {
  margin-left: auto;
  color: var(--text-tertiary);
  font-size: 14px;
  font-weight: 700;
}

.status-badge.ready {
  color: #d48806;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 16px 0;
  padding: 12px 0;
  border-top: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.stat + .stat {
  border-left: 1px solid var(--border-light);
}

.stat-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.stat-value {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
}

.action-row {
  margin-top: 14px;
}

.primary-button,
.ghost-button,
.buy-button,
.preset-button,
.stop-button {
  min-height: 44px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  flex: 1.4;
  border: 0;
  background: #f5a623;
  color: #fff;
}

.ghost-button,
.preset-button,
.buy-button {
  flex: 1;
  border: 1px solid var(--border-light);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.ghost-button.small {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  font-size: 13px;
}

.preset-button.active,
.team-card.active {
  border-color: #f5a623;
  background: rgba(245, 166, 35, 0.12);
  color: #d48806;
}

.primary-button:disabled,
.ghost-button:disabled,
.buy-button:disabled,
.preset-button:disabled,
.team-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.climb-limit {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 13px;
}

.climb-limit input,
.qty-input {
  width: 72px;
  height: 36px;
  border: 1px solid var(--border-light);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: center;
  font-size: 16px;
}

.qty-input {
  flex: 1;
  width: auto;
}

.preset-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.buy-row {
  margin-top: 0;
}

.team-row {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(132px, 1fr);
  gap: 8px;
  overflow-x: auto;
}

.team-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-height: 108px;
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.team-name {
  font-size: 15px;
  font-weight: 700;
}

.team-state {
  color: var(--text-secondary);
  font-size: 12px;
}

.team-heroes {
  display: flex;
  gap: 4px;
  min-height: 28px;
  margin-top: auto;
}

.team-heroes img {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--bg-primary);
}

.stop-button {
  width: 100%;
  margin-top: 10px;
  border: 1px solid #fecdd3;
  background: #fff;
  color: #e11d48;
}

.stop-button.inline {
  width: auto;
  margin-top: 0;
}

.stop-button {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: 1px solid #e5e7eb;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
  background: #fff;
  color: #e11d48;

  &:hover {
    background: #e11d48;
    color: white;
    border-color: #e11d48;
  }
}

// 使用GameStatus中的统一卡片样式
.weird-tower {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px;
}

.status-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.status-info {
  flex: 1;
  min-width: 0;
}

.energy-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: var(--bg-tertiary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-medium);
  margin-left: auto; // 使小鱼干展示靠右
}

.energy-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.energy-count {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

/* ==================== 购买小鱼干按钮 ==================== */
.buy-energy-button {
  padding: 2px 10px;
  margin-left: 4px;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium);
  color: #fff;
  background: linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%);
  border: none;
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition:
    opacity 0.2s,
    transform 0.15s;
  white-space: nowrap;
  line-height: 20px;
}

.buy-energy-button:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(252, 74, 26, 0.35);
}

.buy-energy-button:active:not(.disabled) {
  transform: translateY(0);
}

.buy-energy-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==================== 购买小鱼干弹窗 ==================== */
.buy-energy-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: var(--spacing-md);
}

.buy-energy-dialog {
  width: 100%;
  max-width: 360px;
  background: var(--bg-primary, #fff);
  border-radius: var(--border-radius-large, 12px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.buy-energy-dialog .dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.buy-energy-dialog .dialog-header h3 {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.buy-energy-dialog .dialog-close {
  width: 28px;
  height: 28px;
  font-size: 20px;
  line-height: 1;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.buy-energy-dialog .dialog-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.buy-energy-dialog .dialog-body {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.buy-energy-dialog .dialog-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.buy-energy-dialog .row-label {
  flex-shrink: 0;
  width: 76px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.num-selector {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.num-btn {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  font-size: 18px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: background 0.2s;
}

.num-btn:hover {
  background: var(--bg-secondary);
}

.num-input {
  flex: 1;
  height: 36px;
  padding: 0 var(--spacing-sm);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
  text-align: center;
  color: var(--text-primary);
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-small, 6px);
  outline: none;
}

.num-input:focus {
  border-color: #fc4a1a;
  box-shadow: 0 0 0 2px rgba(252, 74, 26, 0.15);
}

.quick-btns {
  flex: 1;
  display: flex;
  gap: var(--spacing-xs);
}

.quick-btn {
  flex: 1;
  padding: 6px 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition: all 0.2s;
}

.quick-btn:hover {
  color: #fc4a1a;
  border-color: #fc4a1a;
}

.dialog-hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-secondary);
  text-align: center;
  padding-top: var(--spacing-xs);
  border-top: 1px dashed var(--border-color, #e5e7eb);
}

.dialog-hint .gold-icon {
  width: 15px;
  height: 15px;
  vertical-align: -2px;
  margin: 0 2px;
}

.buy-energy-dialog .dialog-footer {
  display: flex;
  gap: var(--spacing-md);
  padding: 0 var(--spacing-lg) var(--spacing-lg);
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 10px 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border-radius: var(--border-radius-small, 6px);
  cursor: pointer;
  transition:
    opacity 0.2s,
    transform 0.15s;
}

.btn-cancel {
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color, #e5e7eb);
}

.btn-cancel:hover {
  background: var(--bg-secondary);
}

.btn-confirm {
  color: #fff;
  background: linear-gradient(135deg, #f7b733 0%, #fc4a1a 100%);
  border: none;
}

.btn-confirm:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(252, 74, 26, 0.4);
}

.btn-confirm.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-content {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
  padding: 10px 12px;
  margin-bottom: 10px;
  flex: none;
  display: flex;
  align-items: center;
}

.tower-floor {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  .label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .floor-number {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    font-family: "SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace;
  }
}

.card-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: auto;
  padding-top: var(--spacing-sm);
}

.climb-action-row {
  display: flex;
  align-items: stretch;
  gap: var(--spacing-sm);
  width: 100%;

  .climb-button {
    flex: 1;
    min-width: 0;
  }
}

.climb-limit-input {
  flex: 0 0 86px;
  width: 86px;
  padding: var(--spacing-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  text-align: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: var(--border-radius-medium);
  outline: none;
  transition: border-color var(--transition-fast);

  &:focus {
    border-color: #8b5cf6;
  }

  &:disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
    background: var(--bg-secondary);
  }
}

.climb-limit-unit {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}

.climb-button {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: none;
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-fast);

  &.active {
    background: #8b5cf6;
    color: white;

    &:hover {
      background: #7c3aed;
    }
  }

  &.disabled {
    background: var(--bg-secondary);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }
}

// 响应式设计
@media (max-width: 768px) {
  .card-header {
    flex-direction: row;
    text-align: left;
  }

  .energy-display {
    align-self: center;
    margin-left: auto;
  }
}
</style>
