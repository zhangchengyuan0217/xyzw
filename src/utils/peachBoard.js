export function isPeachBoardReadyMessage(data) {
  return !!data && data.type === "peach-board-ready";
}

export function isPeachBoardStatusMessage(data) {
  return !!data && data.type === "peach-board-status" && typeof data.text === "string";
}

export function postPeachBoard(targetWindow, enabled) {
  if (!targetWindow) return;
  targetWindow.postMessage(
    { type: "peach-board", enabled: !!enabled },
    window.location.origin,
  );
}

export function injectPeachBoard(frameWindow, onReady) {
  const documentRef = frameWindow?.document;
  if (!documentRef) return;
  if (frameWindow.__peachBoard) {
    onReady?.();
    return;
  }
  if (documentRef.getElementById("peach-board-script")) return;

  const script = documentRef.createElement("script");
  script.id = "peach-board-script";
  script.src = `${import.meta.env.BASE_URL}game/peach-board.js`;
  script.charset = "utf-8";
  script.onload = () => onReady?.();
  documentRef.head.appendChild(script);
}
