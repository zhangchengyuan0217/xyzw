<template>
  <div class="dashboard-page">
    <div class="feature-list">
      <button
        v-for="action in quickActions"
        :key="action.id"
        type="button"
        class="feature-row"
        @click="handleQuickAction(action)"
      >
        <span class="feature-icon">
          <component :is="action.icon" />
        </span>
        <span class="feature-text">
          <span class="feature-title">{{ action.title }}</span>
          <span class="feature-desc">{{ action.description }}</span>
        </span>
        <span class="feature-arrow">
          <ChevronForward />
        </span>
      </button>
    </div>
  </div>
</template>

<script setup>
import {
  Add,
  CheckmarkCircle,
  ChevronForward,
  Cloud,
  Cube,
  GameController,
} from "@vicons/ionicons5";
import lz4 from "lz4js";
import { useMessage } from "naive-ui";
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import useIndexedDB from "@/hooks/useIndexedDB";
import { useTokenStore } from "@/stores/tokenStore";

const router = useRouter();
const message = useMessage();
const tokenStore = useTokenStore();
const { getArrayBuffer } = useIndexedDB();

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

const quickActions = ref([
  {
    id: 1,
    icon: GameController,
    title: "打开游戏",
    description: "使用当前Token直接进入游戏",
    action: "open-game",
  },
  {
    id: 2,
    icon: Cube,
    title: "游戏功能",
    description: "访问所有游戏功能模块",
    action: "game-features",
  },
  {
    id: 3,
    icon: Add,
    title: "添加Token",
    description: "快速添加新的游戏Token",
    action: "add-token",
  },
  {
    id: 4,
    icon: CheckmarkCircle,
    title: "批量任务",
    description: "批量执行任务",
    action: "batch-daily-tasks",
  },
  {
    id: 5,
    icon: Cloud,
    title: "WebSocket测试",
    description: "测试WebSocket连接和游戏命令",
    action: "websocket-test",
  },
]);

const handleManageTokens = () => {
  // 降噪
  /* 当前Token状态:
    hasTokens: tokenStore.hasTokens,
    selectedToken: tokenStore.selectedToken?.name,
    tokenCount: tokenStore.gameTokens.length
  */

  try {
    router.push("/tokens");
    // 降噪
  } catch (error) {
    console.error("❌ 导航失败:", error);
    message.error("导航到Token管理页面失败");
  }
};

const handleQuickAction = (action) => {
  switch (action.action) {
    case "open-game":
      openGame();
      break;
    case "game-features":
      router.push("/admin/game-features");
      break;
    case "add-token":
      handleManageTokens();
      break;
    case "execute-tasks":
      router.push("/admin/game-features");
      break;
    case "websocket-test":
      router.push("/websocket-test");
      break;
    case "open-settings":
      router.push("/admin/profile");
      break;
    case "batch-daily-tasks":
      router.push("/admin/batch-daily-tasks");
      break;
  }
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
.dashboard-page {
  min-height: calc(100dvh - 64px);
  padding: 12px;
  background: var(--bg-secondary);
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
</style>
