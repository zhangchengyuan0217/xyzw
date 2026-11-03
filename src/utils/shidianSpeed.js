export const SHIDIAN_SPEED_STORAGE_KEY = "shidianBattleSpeed";
export const SHIDIAN_SPEED_RATE = 2;

export function readShidianSpeedEnabled(storage = window.localStorage) {
  return storage.getItem(SHIDIAN_SPEED_STORAGE_KEY) === "1";
}

export function writeShidianSpeedEnabled(
  enabled,
  storage = window.localStorage,
) {
  storage.setItem(SHIDIAN_SPEED_STORAGE_KEY, enabled ? "1" : "0");
}

export function isShidianSpeedReadyMessage(data) {
  return !!data && data.type === "shidian-speed-ready";
}

export function postShidianSpeed(targetWindow, enabled) {
  if (!targetWindow) return;
  targetWindow.postMessage(
    { type: "shidian-speed", enabled: !!enabled, rate: SHIDIAN_SPEED_RATE },
    window.location.origin,
  );
}
