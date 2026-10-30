<template>
  <div class="app-shell">
    <div v-if="currentFeature && activeTab !== 'pvp'" class="feature-page">
      <button type="button" class="feature-back" @click="backToTab">
        <ChevronBack />
        <span>{{ currentFeature.title }}</span>
      </button>
      <GameStatus
        :section="currentFeature.section"
        :sub="currentFeature.sub || ''"
      />
    </div>
    <div v-else-if="activeTab === 'pvp'" class="feature-page">
      <GameStatus section="fightPvp" />
    </div>
    <div v-else class="dashboard-page">
      <div class="feature-list">
        <button
          v-for="item in visibleItems"
          :key="item.id"
          type="button"
          class="feature-row"
          @click="openMenuItem(item)"
        >
          <span class="feature-icon">
            <component :is="item.icon" />
          </span>
          <span class="feature-text">
            <span class="feature-title">{{ item.title }}</span>
            <span class="feature-desc">{{ item.description }}</span>
          </span>
          <span class="feature-arrow">
            <ChevronForward />
          </span>
        </button>
      </div>
    </div>

    <nav class="tabbar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tabbar-item"
        :class="{ active: activeTab === tab.id }"
        @click="selectTab(tab.id)"
      >
        <component :is="tab.icon" />
        <span>{{ tab.title }}</span>
      </button>
    </nav>
  </div>
</template>

<script setup>
import {
  Add,
  CheckmarkCircle,
  ChevronBack,
  ChevronForward,
  Cloud,
  Cube,
  EllipsisHorizontal,
  GameController,
  Person,
  Trophy,
} from "@vicons/ionicons5";
import lz4 from "lz4js";
import { useMessage } from "naive-ui";
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useGameConnection } from "@/composables/useGameConnection";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";
import { findGameFeature, gameFeatures } from "@/utils/gameFeatureCatalog";

const router = useRouter();
const route = useRoute();
const message = useMessage();
const tokenStore = useTokenStore();
const { getArrayBuffer } = useIndexedDB();

const currentFeature = computed(() => findGameFeature(route.params.feature));
useGameConnection(computed(() => Boolean(currentFeature.value)));

// ============ BIN 格式转换 ============

function extractKey(bytes) {
  return (
    (((bytes[2] >> 6) & 1) << 7) |
    (((bytes[2] >> 4) & 1) << 6) |
    (((bytes[2] >> 2) & 1) << 5) |
    ((bytes[2] & 1) << 4) |
    (((bytes[3] >> 6) & 1) << 3) |
    (((bytes[3] >> 4) & 1) << 2) |
    (((bytes[3] >> 2) & 1) << 1) |
    (bytes[3] & 1)
  );
}

function encodeKey(bytes, r) {
  bytes[2] =
    (bytes[2] & 0b10101010) |
    (((r >> 7) & 1) << 6) |
    (((r >> 6) & 1) << 4) |
    (((r >> 5) & 1) << 2) |
    ((r >> 4) & 1);
  bytes[3] =
    (bytes[3] & 0b10101010) |
    (((r >> 3) & 1) << 6) |
    (((r >> 2) & 1) << 4) |
    (((r >> 1) & 1) << 2) |
    (r & 1);
}

function xDecrypt(buf) {
  const e = new Uint8Array(buf);
  const t = extractKey(e);
  const out = new Uint8Array(e);
  for (let n = out.length; --n >= 4;) out[n] ^= t;
  return out.subarray(4);
}

function lxEncrypt(plain) {
  const compressed = lz4.compress(plain);
  const out = new Uint8Array(compressed.length);
  out.set(compressed);
  const r = 2 + ~~(Math.random() * 248);
  for (let n = Math.min(out.length, 100); --n >= 0;) out[n] ^= r;
  out[0] = 112;
  out[1] = 108;
  encodeKey(out, r);
  return out;
}

function convertBinToLx(buf) {
  const e = new Uint8Array(buf);
  if (e.length > 4 && e[0] === 112 && e[1] === 108) return e;
  if (e.length > 4 && e[0] === 112 && e[1] === 120) {
    const plain = xDecrypt(e);
    return lxEncrypt(plain);
  }
  return e;
}

const openGame = async () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择一个Token");
    return;
  }
  const binData = await getArrayBuffer(token.id);
  if (!binData) {
    message.error("未找到该Token的BIN数据");
    return;
  }
  const converted = convertBinToLx(binData);
  const hex = Array.from(converted)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  localStorage.setItem(`bin_data_${token.id}`, hex);
  localStorage.setItem("current_bin_id", token.id);
  let binList = [];
  try {
    binList = JSON.parse(localStorage.getItem("bin_file_list") || "[]");
  } catch (e) {}
  if (!binList.find((i) => i.id === token.id)) {
    binList.push({
      id: token.id,
      name: token.name || "Token",
      byteLength: binData.byteLength,
      size: `${(binData.byteLength / 1024).toFixed(1)} KB`,
      order: binList.length,
    });
    localStorage.setItem("bin_file_list", JSON.stringify(binList));
  }
  router.push("/game");
};

const tabs = [
  { id: "mine", title: "我的", icon: Person },
  { id: "events", title: "活动", icon: Trophy },
  { id: "pvp", title: "切磋", icon: GameController },
  { id: "more", title: "其他", icon: EllipsisHorizontal },
];

const featureTab = {
  daily: "mine",
  club: "mine",
  activity: "mine",
  camp: "events",
  warrank: "events",
  "week-battle": "events",
  "month-battle": "events",
  "war-map": "events",
  "war-stats": "events",
  peach: "events",
  "peach-battle": "events",
  pvp: "pvp",
};

const featureById = Object.fromEntries(
  gameFeatures.map((feature) => [feature.id, feature]),
);

const tabItems = {
  mine: [
    {
      kind: "action",
      id: "open-game",
      icon: GameController,
      title: "打开游戏",
      description: "使用当前Token直接进入游戏",
      action: "open-game",
    },
    { kind: "feature", icon: Cube, ...featureById.daily },
    { kind: "feature", icon: Cube, ...featureById.club },
    { kind: "feature", icon: Cube, ...featureById.activity },
  ],
  events: [
    "camp",
    "warrank",
    "week-battle",
    "month-battle",
    "war-map",
    "war-stats",
    "peach",
    "peach-battle",
  ].map((id) => ({ kind: "feature", icon: Cube, ...featureById[id] })),
  more: [
    {
      kind: "action",
      id: "add-token",
      icon: Add,
      title: "添加账号",
      description: "快速添加新的游戏账号",
      action: "add-token",
    },
    {
      kind: "action",
      id: "batch-daily-tasks",
      icon: CheckmarkCircle,
      title: "批量任务",
      description: "批量执行任务",
      action: "batch-daily-tasks",
    },
    {
      kind: "action",
      id: "websocket-test",
      icon: Cloud,
      title: "WebSocket测试",
      description: "测试WebSocket连接和游戏命令",
      action: "websocket-test",
    },
  ],
};

const activeTab = computed(() => {
  const featureId = currentFeature.value?.id;
  if (featureId && featureTab[featureId]) return featureTab[featureId];
  if (route.query.tab === "events" || route.query.tab === "more") {
    return route.query.tab;
  }
  return "mine";
});

const visibleItems = computed(() => tabItems[activeTab.value] || tabItems.mine);

const selectTab = (id) => {
  if (id === "pvp") {
    router.push("/admin/dashboard/pvp");
    return;
  }
  router.push({
    path: "/admin/dashboard",
    query: id === "mine" ? {} : { tab: id },
  });
};

const backToTab = () => {
  selectTab(featureTab[currentFeature.value?.id] || "mine");
};

const openMenuItem = (item) => {
  if (item.kind === "feature") {
    router.push(`/admin/dashboard/${item.id}`);
    return;
  }
  if (item.action === "open-game") {
    openGame();
    return;
  }
  if (item.action === "add-token") {
    handleManageTokens();
    return;
  }
  if (item.action === "batch-daily-tasks") {
    router.push("/admin/batch-daily-tasks");
    return;
  }
  if (item.action === "websocket-test") {
    router.push("/websocket-test");
  }
};

const handleManageTokens = () => {
  router.push("/tokens");
};

/*
const getActivityIcon = (type) => {
  switch (type) {
    case "success":
      return CheckmarkCircle;
    case "warning":
      return Time;
    case "info":
    default:
      return Cube;
  }
};

const formatTime = (timestamp) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) {
    return `${days}天前`;
  } else if (hours > 0) {
    return `${hours}小时前`;
  } else if (minutes > 0) {
    return `${minutes}分钟前`;
  } else {
    return "刚刚";
  }
};
*/

// 生命周期
onMounted(async () => {
  // 确保有Token
  if (!tokenStore.hasTokens) {
    router.push("/tokens");
    return;
  }

  // 初始化Token数据
  tokenStore.initTokenStore();
});
</script>

<style scoped lang="scss">
.app-shell {
  min-height: calc(100dvh - 64px);
}

.dashboard-page {
  min-height: calc(100dvh - 64px);
  padding: 12px 12px calc(76px + env(safe-area-inset-bottom));
  background: var(--bg-secondary);
}

.tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  border-top: 1px solid var(--border-light);
  background: var(--bg-primary);
}

.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;

  :deep(svg) {
    width: 22px;
    height: 22px;
  }

  &.active {
    color: var(--primary-color);
    font-weight: 600;
  }
}

@media (max-width: 768px) {
  .dashboard-page {
    min-height: calc(100dvh - 56px);
  }
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
  margin: 0 auto;
}

.feature-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  padding: 12px;
  border: 0;
  border-radius: 14px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-light);
  text-align: left;
  color: inherit;
  cursor: pointer;
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--primary-color-light);
  color: var(--primary-color);

  :deep(svg) {
    width: 22px;
    height: 22px;
  }
}

.feature-text {
  flex: 1;
  min-width: 0;
}

.feature-title {
  display: block;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.feature-desc {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-arrow {
  display: flex;
  flex: none;
  color: var(--text-tertiary);

  :deep(svg) {
    width: 18px;
    height: 18px;
  }
}

.feature-page {
  min-height: calc(100dvh - 64px);
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
  background: var(--bg-secondary);
}

.feature-back {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 12px;
  border: 0;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  :deep(svg) {
    width: 20px;
    height: 20px;
  }
}

@media (max-width: 768px) {
  .feature-page {
    min-height: calc(100dvh - 56px);
  }
}
</style>
