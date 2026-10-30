import { useMessage } from "naive-ui";
import { watch } from "vue";
import { useRouter } from "vue-router";
import { useTokenStore } from "@/stores/tokenStore";

export function useGameConnection(isActive) {
  const router = useRouter();
  const message = useMessage();
  const tokenStore = useTokenStore();

  const initializeGameData = async () => {
    if (!tokenStore.selectedToken) return;
    try {
      const tokenId = tokenStore.selectedToken.id;
      tokenStore.sendMessage(tokenId, "role_getroleinfo");
      tokenStore.sendMessage(tokenId, "tower_getinfo");
      tokenStore.sendMessage(tokenId, "evotower_getinfo");
      tokenStore.sendMessage(tokenId, "presetteam_getinfo");
      const res = await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_startlevel",
      );
      tokenStore.setBattleVersion(res?.battleData?.version);
    } catch {
      // 初始化失败时保持当前页面，由各功能自行重试
    }
  };

  const connectWebSocket = () => {
    if (!tokenStore.selectedToken) {
      message.warning("请先选择一个Token");
      router.push("/tokens");
      return;
    }

    const tokenId = tokenStore.selectedToken.id;
    tokenStore.createWebSocketConnection(
      tokenId,
      tokenStore.selectedToken.token,
    );

    setTimeout(async () => {
      if (tokenStore.getWebSocketStatus(tokenId) === "connected") {
        await initializeGameData();
      }
    }, 2000);
  };

  const ensureConnection = () => {
    if (!isActive.value || !tokenStore.selectedToken) return;
    const status = tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
    if (status === "connected") {
      initializeGameData();
      return;
    }
    connectWebSocket();
  };

  watch(isActive, ensureConnection, { immediate: true });

  watch(
    () => {
      if (!tokenStore.selectedToken) {
        return { status: "disconnected", lastError: null };
      }
      const conn = tokenStore.wsConnections[tokenStore.selectedToken.id];
      return { status: conn?.status, lastError: conn?.lastError };
    },
    (current) => {
      if (!isActive.value || !current) return;
      if (current.status !== "error" || !current.lastError) return;
      const errorText = String(current.lastError.error || "").toLowerCase();
      if (!errorText.includes("token") || !errorText.includes("expired")) {
        return;
      }
      const importMethod = tokenStore.selectedToken?.importMethod;
      if (
        ["url", "bin", "wxQrcode", "mobile", "wxForceLogout"].includes(
          importMethod,
        )
      ) {
        message.warning("Token已过期，正在尝试自动刷新...");
        return;
      }
      message.error("当前 Token 已过期，请重新导入后再试");
      router.push("/tokens");
    },
    { deep: true },
  );
}
