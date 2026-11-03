<template>
  <div class="ws-page">
    <header class="ws-top">
      <BackButton class="ws-back" />
      <h1>连接测试</h1>
    </header>

    <label class="ws-label">角色</label>
    <NSelect
      v-model:value="selectedRoleId"
      placeholder="选择要测试的角色"
      :options="roleOptions"
      @update:value="onRoleChange"
    />

    <div class="ws-result" :class="status">
      <b>{{ statusText }}</b>
      <span v-if="errorText">{{ errorText }}</span>
      <button
        v-if="status === 'connected'"
        type="button"
        class="ws-text-btn"
        @click="disconnectWebSocket"
      >
        断开
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();

const selectedRoleId = ref(null);
const status = ref("idle");
const errorText = ref("");

const roleOptions = computed(() =>
  tokenStore.gameTokens.map((token) => ({
    label: token.name,
    value: token.id,
  })),
);

const statusText = computed(() => {
  const textMap = {
    idle: "选择角色后开始测试",
    connected: "可以连通",
    connecting: "正在连接",
    disconnected: "连不上",
    reconnecting: "正在重连",
    error: "连不上",
  };
  return textMap[status.value] || "连不上";
});

const updateStatus = () => {
  if (!selectedRoleId.value) {
    status.value = "idle";
    errorText.value = "";
    return;
  }
  const connection = tokenStore.wsConnections[selectedRoleId.value];
  status.value = connection?.status || "disconnected";
  errorText.value = connection?.lastError?.error || "";
};

const connectWebSocket = () => {
  const token = tokenStore.gameTokens.find(
    (item) => item.id === selectedRoleId.value,
  );
  if (!token) {
    status.value = "error";
    errorText.value = "没有找到这个角色";
    return;
  }
  status.value = "connecting";
  errorText.value = "";
  tokenStore.createWebSocketConnection(token.id, token.token, token.wsUrl);
};

const onRoleChange = () => {
  updateStatus();
  if (!selectedRoleId.value) return;
  if (status.value === "connected" || status.value === "connecting") return;
  connectWebSocket();
};

const disconnectWebSocket = () => {
  if (!selectedRoleId.value) return;
  tokenStore.closeWebSocketConnection(selectedRoleId.value);
  status.value = "disconnected";
};

let statusTimer = null;

onMounted(() => {
  statusTimer = setInterval(() => {
    if (selectedRoleId.value) updateStatus();
  }, 1000);
});

onUnmounted(() => {
  if (statusTimer) clearInterval(statusTimer);
});
</script>

<style scoped>
.ws-page {
  min-height: 100dvh;
  box-sizing: border-box;
  padding: 12px 12px 28px;
  background: var(--bg-secondary, #f4f6fb);
}

.ws-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.ws-top h1 {
  margin: 0;
  font-size: 18px;
}

.ws-label {
  display: block;
  margin: 14px 0 6px;
  font-size: 13px;
  color: #64748b;
}

.ws-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-primary, #fff);
}

.ws-result b {
  font-size: 16px;
}

.ws-result span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.ws-result.connected b {
  color: #18a058;
}

.ws-result.connecting b,
.ws-result.reconnecting b {
  color: #f0a020;
}

.ws-result.disconnected b,
.ws-result.error b {
  color: #d03050;
}

.ws-text-btn {
  border: 0;
  background: transparent;
  color: #18a058;
  font-size: 15px;
  cursor: pointer;
}
</style>
