<template>
  <div class="game-player">
    <div class="overlay-actions">
      <BackButton class="back-btn" fallback="/admin/dashboard" />
      <button
        class="speed-btn"
        :class="{ 'is-on': shidianSpeedEnabled }"
        type="button"
        :aria-pressed="shidianSpeedEnabled"
        :title="`只加快十殿战斗播放，固定 ${SHIDIAN_SPEED_RATE} 倍`"
        @click="toggleShidianSpeed"
      >
        {{
          shidianSpeedEnabled ? `十殿加速 ${SHIDIAN_SPEED_RATE}倍` : "十殿加速"
        }}
      </button>
      <button
        class="capture-btn"
        :class="{ 'is-on': captureRecording }"
        type="button"
        :aria-pressed="captureRecording"
        title="每月前三个周日 20:00 到 20:30 打开记录，进入蟠桃园战场并停留一会儿，再手动点一次上船。这里只记录，不会自动上船。"
        @click="toggleCapture"
      >
        {{ captureRecording ? `记录中 ${capturePending}` : "记录上船" }}
      </button>
      <button
        class="board-btn"
        :class="{ 'is-on': boardRunning }"
        type="button"
        :aria-pressed="boardRunning"
        title="在蟠桃园战场页自动上第一艘船。船上路后如果船没了，会换下一艘。每月前三个周日 20:00 到 20:30 才会出发。"
        @click="toggleBoard"
      >
        {{ boardLabel }}
      </button>
      <button
        class="export-btn"
        type="button"
        title="导出船列表、上船命令和战场推送，把文件发回来"
        @click="exportCapture"
      >
        {{ exportLabel }}
      </button>
    </div>

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
  acceptPeachCaptureEvent,
  downloadPeachCapture,
  injectPeachCapture,
  isPeachCaptureEventMessage,
  isPeachCaptureReadyMessage,
  peachCapturePendingCount,
  postPeachCapture,
  setPeachCaptureRecording,
} from "@/utils/peachBoardCapture";
import {
  injectPeachBoard,
  isPeachBoardReadyMessage,
  isPeachBoardStatusMessage,
  postPeachBoard,
} from "@/utils/peachBoard";
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
const captureRecording = ref(false);
const capturePending = ref(peachCapturePendingCount());
const exportLabel = ref("导出记录");
const boardRunning = ref(false);
const boardLabel = ref("一键上船");

function sendShidianSpeed(targetWindow = gameFrame.value?.contentWindow) {
  postShidianSpeed(targetWindow, shidianSpeedEnabled.value);
}

function sendCapture(targetWindow = gameFrame.value?.contentWindow) {
  postPeachCapture(targetWindow, captureRecording.value);
}

function sendBoard(targetWindow = gameFrame.value?.contentWindow) {
  postPeachBoard(targetWindow, boardRunning.value);
}

function onFrameLoad() {
  const frameWindow = gameFrame.value?.contentWindow;
  injectShidianSpeed(frameWindow, () => sendShidianSpeed(frameWindow));
  injectPeachCapture(frameWindow, () => sendCapture(frameWindow));
  injectPeachBoard(frameWindow, () => sendBoard(frameWindow));
}

function toggleCapture() {
  captureRecording.value = !captureRecording.value;
  setPeachCaptureRecording(captureRecording.value);
  exportLabel.value = captureRecording.value ? "导出记录" : exportLabel.value;
  sendCapture();
}

function toggleBoard() {
  boardRunning.value = !boardRunning.value;
  if (!boardRunning.value) boardLabel.value = "一键上船";
  sendBoard();
}

function exportCapture() {
  const result = downloadPeachCapture();
  capturePending.value = peachCapturePendingCount();
  exportLabel.value = result.ok ? `已导出 ${result.events} 条` : "无记录";
}

function toggleShidianSpeed() {
  shidianSpeedEnabled.value = !shidianSpeedEnabled.value;
  writeShidianSpeedEnabled(shidianSpeedEnabled.value);
  sendShidianSpeed();
}

function handleFrameMessage(event) {
  if (event.origin !== window.location.origin) return;
  if (event.source !== gameFrame.value?.contentWindow) return;
  if (isShidianSpeedReadyMessage(event.data)) sendShidianSpeed(event.source);
  if (isPeachCaptureReadyMessage(event.data)) sendCapture(event.source);
  if (isPeachBoardReadyMessage(event.data)) sendBoard(event.source);
  if (isPeachBoardStatusMessage(event.data)) {
    boardLabel.value = event.data.text;
    boardRunning.value = !!event.data.running;
  }
  if (!isPeachCaptureEventMessage(event.data)) return;
  capturePending.value = acceptPeachCaptureEvent(event.data.event);
}

onMounted(() => window.addEventListener("message", handleFrameMessage));
onUnmounted(() => window.removeEventListener("message", handleFrameMessage));
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

.overlay-actions {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 200;
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: calc(100% - 16px);
  flex-wrap: wrap;
}

.back-btn {
  position: static;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 6px;
  padding: 6px 12px;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.speed-btn,
.capture-btn,
.export-btn,
.board-btn {
  position: static;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

.board-btn.is-on {
  border-color: #38bdf8;
  background: rgba(12, 74, 110, 0.92);
  color: #e0f2fe;
}

.capture-btn,
.export-btn {
  display: none;
}

.capture-btn.is-on {
  border-color: #34d399;
  background: rgba(6, 78, 59, 0.9);
  color: #d1fae5;
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
