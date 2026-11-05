<template>
  <div class="app-shell">
    <div v-if="currentFeature && activeTab !== 'pvp'" class="feature-page">
      <BackButton class="feature-back" @click="onFeatureBack" />
      <GameStatus
        :section="currentFeature.section"
        :sub="currentFeature.sub || ''"
      />
    </div>
    <div v-else-if="activeTab === 'pvp'" class="feature-page">
      <GameStatus section="fightPvp" />
    </div>
    <div v-else-if="activeTab === 'lineup'" class="dashboard-page">
      <CloudLineup />
    </div>
    <div v-else class="dashboard-page">
      <div class="feature-list">
        <template v-for="item in visibleItems" :key="item.id">
          <div v-if="item.kind === 'label'" class="feature-label">
            {{ item.title }}
          </div>
          <button
            v-else
            type="button"
            class="feature-row"
            :class="{
              'is-pressed': pressedItemId === item.id,
              'is-danger': item.danger,
            }"
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
        </template>
      </div>
    </div>

    <button
      v-if="showReconnect"
      type="button"
      class="reconnect-fab"
      :disabled="isConnecting"
      @click="reconnectSocket"
    >
      <span class="reconnect-title">{{
        isConnecting ? "正在连接" : "连接已断开"
      }}</span>
      <span class="reconnect-action">{{
        isConnecting ? "请稍候" : "点击重连"
      }}</span>
    </button>

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
  ChevronForward,
  Cloud,
  Cube,
  EllipsisHorizontal,
  GameController,
  Person,
  Trash,
  TrashBin,
  Trophy,
} from "@vicons/ionicons5";
import lz4 from "lz4js";
import { NSpin, useDialog, useMessage } from "naive-ui";
import {
  computed,
  defineAsyncComponent,
  defineComponent,
  h,
  onMounted,
  ref,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import CloudLineup from "@/components/Lineup/CloudLineup.vue";
import { useGameConnection } from "@/composables/useGameConnection";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";
import { findGameFeature, gameFeatures } from "@/utils/gameFeatureCatalog";

const FeatureLoading = defineComponent({
  name: "FeatureLoading",
  setup() {
    return () =>
      h("div", { class: "feature-loading" }, [
        h(NSpin, { size: "large" }, { description: () => "页面加载中..." }),
      ]);
  },
});

const GameStatus = defineAsyncComponent({
  loader: () => import("@/components/GameStatus.vue"),
  loadingComponent: FeatureLoading,
  delay: 0,
});

const router = useRouter();
const route = useRoute();
const message = useMessage();
const dialog = useDialog();
const tokenStore = useTokenStore();
const { getArrayBuffer } = useIndexedDB();

const currentFeature = computed(() => findGameFeature(route.params.feature));
const { reconnect } = useGameConnection(
  computed(() => Boolean(currentFeature.value)),
);
const reconnecting = ref(false);
const pressedItemId = ref("");

const wsStatus = computed(() => {
  const token = tokenStore.selectedToken;
  if (!token) return "disconnected";
  return tokenStore.getWebSocketStatus(token.id);
});

const isConnecting = computed(
  () => reconnecting.value || wsStatus.value === "connecting",
);

const showReconnect = computed(
  () => Boolean(tokenStore.selectedToken) && wsStatus.value !== "connected",
);

const reconnectSocket = async () => {
  if (!tokenStore.selectedToken || isConnecting.value) return;
  reconnecting.value = true;
  try {
    const ready = await reconnect();
    if (ready) {
      message.success("已重新连接");
    } else {
      message.error("重连失败，请稍后再试");
    }
  } finally {
    reconnecting.value = false;
  }
};

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
  { id: "lineup", title: "云端阵容", icon: Cloud },
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
    { kind: "label", id: "label-camp", title: "营地" },
    { kind: "feature", icon: Cube, ...featureById.camp },
    { kind: "label", id: "label-salt", title: "盐场" },
    ...["warrank", "week-battle", "month-battle", "war-map", "war-stats"].map(
      (id) => ({ kind: "feature", icon: Cube, ...featureById[id] }),
    ),
    { kind: "label", id: "label-peach", title: "蟠桃园" },
    ...["peach", "peach-battle"].map((id) => ({
      kind: "feature",
      icon: Cube,
      ...featureById[id],
    })),
  ],
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
      title: "账号连接测试",
      description: "测试账号连接状态",
      action: "websocket-test",
    },
    // {
    //   kind: "action",
    //   id: "delete-current-token",
    //   icon: Trash,
    //   title: "删除当前账号",
    //   description: "删除正在使用的这个账号",
    //   action: "delete-current-token",
    //   danger: true,
    // },
    // {
    //   kind: "action",
    //   id: "delete-all-tokens",
    //   icon: TrashBin,
    //   title: "删除所有账号",
    //   description: "清除全部账号并退出",
    //   action: "delete-all-tokens",
    //   danger: true,
    // },
  ],
};

const activeTab = computed(() => {
  const featureId = currentFeature.value?.id;
  if (featureId && featureTab[featureId]) return featureTab[featureId];
  if (["events", "more", "lineup"].includes(route.query.tab)) {
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

const onFeatureBack = (event) => {
  event.preventDefault();
  backToTab();
};

const openMenuItem = async (item) => {
  pressedItemId.value = item.id;
  try {
    if (item.kind === "feature") {
      await router.push(`/admin/dashboard/${item.id}`);
      return;
    }
    if (item.action === "open-game") {
      openGame();
      return;
    }
    if (item.action === "add-token") {
      await router.push({ path: "/tokens", query: { import: "1" } });
      return;
    }
    if (item.action === "batch-daily-tasks") {
      await router.push("/admin/batch-daily-tasks");
      return;
    }
    if (item.action === "websocket-test") {
      await router.push("/websocket-test");
      return;
    }
    if (item.action === "delete-current-token") {
      pressedItemId.value = "";
      confirmDeleteCurrentToken();
      return;
    }
    if (item.action === "delete-all-tokens") {
      pressedItemId.value = "";
      confirmDeleteAllTokens();
    }
  } catch (error) {
    pressedItemId.value = "";
    message.error("页面打开失败，请再试一次");
    console.error("菜单跳转失败:", error);
  }
};

const confirmDeleteCurrentToken = () => {
  const current = tokenStore.selectedToken;
  if (!current) {
    message.warning("当前没有可删除的账号");
    return;
  }
  dialog.warning({
    title: "删除当前账号",
    content: `确定删除「${current.name}」吗？删除后无法恢复。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      await tokenStore.removeToken(current.id);
      message.success("已删除当前账号");
      const nextToken = tokenStore.gameTokens[0];
      if (nextToken) {
        tokenStore.selectToken(nextToken.id);
      } else {
        router.push("/tokens");
      }
    },
  });
};

const confirmDeleteAllTokens = () => {
  if (!tokenStore.hasTokens) {
    message.warning("当前没有可删除的账号");
    return;
  }
  dialog.error({
    title: "删除所有账号",
    content: "确定删除所有账号吗？此操作无法恢复。",
    positiveText: "删除全部",
    negativeText: "取消",
    onPositiveClick: async () => {
      await tokenStore.clearAllTokens();
      message.success("已删除所有账号");
      router.push("/tokens");
    },
  });
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

.reconnect-fab {
  position: fixed;
  right: 16px;
  bottom: calc(72px + env(safe-area-inset-bottom));
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 96px;
  height: 72px;
  padding: 8px;
  border: 0;
  border-radius: 14px;
  background: #ff4d4f;
  color: #fff;
  box-shadow: 0 8px 20px rgba(255, 77, 79, 0.35);
  cursor: pointer;

  &:disabled {
    opacity: 0.75;
    cursor: wait;
  }
}

.reconnect-title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.reconnect-action {
  font-size: 12px;
  line-height: 1.2;
  opacity: 0.92;
}

.tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
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
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: var(--bg-tertiary);
  }

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

.feature-label {
  padding: 8px 4px 0;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 600;
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
  transition:
    transform 0.12s ease,
    background 0.12s ease,
    box-shadow 0.12s ease;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: var(--bg-tertiary);
  }

  &:active,
  &.is-pressed {
    transform: scale(0.98);
    background: var(--primary-color-light);
    box-shadow: none;
  }

  &.is-danger {
    .feature-icon {
      background: #fff1f0;
      color: #d03050;
    }

    .feature-title {
      color: #d03050;
    }

    &:active,
    &.is-pressed {
      background: #fff1f0;
    }
  }
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

.feature-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}

.feature-page {
  min-height: calc(100dvh - 64px);
  max-width: 100%;
  padding-bottom: calc(64px + env(safe-area-inset-bottom));
  overflow-x: hidden;
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
