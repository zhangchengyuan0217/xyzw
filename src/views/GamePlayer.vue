<template>
  <div class="game-player">
    <BackButton class="back-btn" fallback="/admin/dashboard" />
    <button
      class="speed-btn"
      :class="{ 'is-on': shidianSpeedEnabled }"
      type="button"
      :aria-pressed="shidianSpeedEnabled"
      :title="`只加快十殿战斗播放，固定 ${SHIDIAN_SPEED_RATE} 倍`"
      @click="toggleShidianSpeed"
    >
      {{ shidianSpeedEnabled ? `十殿加速 ${SHIDIAN_SPEED_RATE}倍` : "十殿加速" }}
    </button>

    <div class="iframe-wrapper">
      <iframe
        ref="gameFrame"
        :src="gameSrc"
        class="game-iframe"
        allow="fullscreen; autoplay"
        @load="onFrameLoad"
      />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import {
  injectShidianSpeed,
  isShidianSpeedReadyMessage,
  postShidianSpeed,
  readShidianSpeedEnabled,
  SHIDIAN_SPEED_RATE,
  writeShidianSpeedEnabled,
} from "@/utils/shidianSpeed";

const gameSrc = `${import.meta.env.BASE_URL}game/index.html`;
const gameFrame = ref(null);
const shidianSpeedEnabled = ref(readShidianSpeedEnabled());

function sendShidianSpeed(targetWindow = gameFrame.value?.contentWindow) {
  postShidianSpeed(targetWindow, shidianSpeedEnabled.value);
}

function onFrameLoad() {
  const frameWindow = gameFrame.value?.contentWindow;
  injectShidianSpeed(frameWindow, () => sendShidianSpeed(frameWindow));
}

function toggleShidianSpeed() {
  shidianSpeedEnabled.value = !shidianSpeedEnabled.value;
  writeShidianSpeedEnabled(shidianSpeedEnabled.value);
  sendShidianSpeed();
}

function handleSpeedReady(event) {
  if (event.origin !== window.location.origin) return;
  if (!isShidianSpeedReadyMessage(event.data)) return;
  if (event.source !== gameFrame.value?.contentWindow) return;
  sendShidianSpeed(event.source);
}

onMounted(() => window.addEventListener("message", handleSpeedReady));
onUnmounted(() => window.removeEventListener("message", handleSpeedReady));
</script>

<style scoped>
.game-player {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: #000;
}

.iframe-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.game-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.back-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 6px;
  padding: 6px 12px;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.speed-btn {
  position: absolute;
  top: 8px;
  left: 92px;
  z-index: 200;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

.speed-btn.is-on {
  border-color: #fbbf24;
  background: rgba(120, 53, 15, 0.88);
  color: #fde68a;
}

.speed-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.speed-btn.is-on:hover {
  background: rgba(146, 64, 14, 0.95);
}
</style>
