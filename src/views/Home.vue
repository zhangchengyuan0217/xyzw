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
        :class="{ 'is-pressing': pressing }"
        @pointerdown="spawnRipple"
        @click="handleStart"
      >
        立即开始
      </n-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();
const pressing = ref(false);

const spawnRipple = (event) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const button = event.currentTarget;
  if (!(button instanceof HTMLElement)) return;

  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.6;
  const ripple = document.createElement("span");
  ripple.className = "start-button__ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  button.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), {
    once: true,
  });
  window.setTimeout(() => ripple.remove(), 700);
};

const handleStart = () => {
  if (pressing.value) return;

  const destination = authStore.isAuthenticated
    ? "/admin/dashboard"
    : "/register";
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion) {
    router.push(destination);
    return;
  }

  pressing.value = true;
  window.setTimeout(() => {
    router.push(destination);
  }, 220);
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
  position: relative;
  overflow: hidden;
  margin-top: 32px;
  min-width: 180px;
  height: 52px;
  padding: 0 36px;
  font-size: 18px;
  font-weight: 600;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.16s ease;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.38);
    opacity: 0;
    pointer-events: none;
    z-index: 2;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.24);
  }

  &:active {
    transform: translateY(2px) scale(0.92);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    filter: brightness(0.9);
    transition-duration: 0.08s;
  }

  &:active::after,
  &.is-pressing::after {
    animation: start-flash 0.22s ease forwards;
  }

  &.is-pressing {
    animation: start-press 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  :deep(.n-button__content) {
    position: relative;
    z-index: 1;
  }
}

@keyframes start-press {
  0% {
    transform: translateY(0) scale(1);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  }

  45% {
    transform: translateY(2px) scale(0.92);
    filter: brightness(0.88);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  }

  100% {
    transform: translateY(-2px) scale(1);
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
  }
}

@keyframes start-flash {
  0% {
    opacity: 0;
  }

  35% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
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

<style lang="scss">
.start-button__ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  transform: scale(0);
  animation: start-ripple 0.55s ease-out forwards;
  pointer-events: none;
}

@keyframes start-ripple {
  to {
    transform: scale(1);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .start-button__ripple {
    animation: none;
  }
}
</style>
