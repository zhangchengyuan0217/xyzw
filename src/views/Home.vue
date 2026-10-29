<template>
  <div class="home-page">
    <div class="stage">
      <div class="brand">
        <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo" />
        <span>XYZW 助手</span>
      </div>

      <h1>专业的游戏管理平台</h1>
      <p class="subtitle">让游戏变得更简单，让管理变得更高效</p>

      <n-button
        type="primary"
        size="large"
        class="start-button"
        @click="handleStart"
      >
        立即开始
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const handleStart = () => {
  router.push(authStore.isAuthenticated ? "/admin/dashboard" : "/register");
};

onMounted(() => {
  authStore.initAuth();
});
</script>

<style scoped lang="scss">
.home-page {
  height: 100dvh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.stage {
  width: min(880px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 28px;
  font-size: 18px;
  font-weight: 600;
}

.brand-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 56px);
  font-weight: 700;
  line-height: 1.15;
}

.subtitle {
  margin: 14px 0 0;
  font-size: clamp(15px, 2vw, 20px);
  line-height: 1.5;
  opacity: 0.9;
}

.start-button {
  margin-top: 32px;
  min-width: 180px;
  height: 52px;
  padding: 0 36px;
  font-size: 18px;
  font-weight: 600;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
}

@media (max-width: 640px) {
  .home-page {
    padding: 20px 16px;
  }

  .brand {
    margin-bottom: 20px;
    font-size: 16px;
  }

  .start-button {
    margin-top: 24px;
  }
}

@media (max-height: 640px) {
  .brand {
    margin-bottom: 12px;
  }

  .subtitle {
    margin-top: 8px;
  }

  .start-button {
    margin-top: 16px;
    height: 44px;
  }
}
</style>
