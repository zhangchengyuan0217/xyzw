<template>
  <div class="game-player">
    <BackButton class="back-btn" fallback="/admin/dashboard" />

    <div class="iframe-wrapper">
      <iframe :src="gameSrc" class="game-iframe" allow="fullscreen; autoplay" />
    </div>
  </div>
</template>

<script setup>
const gameSrc = `${import.meta.env.BASE_URL}game/index.html`;
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
</style>
