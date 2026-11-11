import { bonProtocol, g_utils } from "@/utils/bonProtocol";

export const PEACH_CAPTURE_STORAGE_KEY = "peachBoardCapture";
const MAX_UI_EVENTS = 120;
const MAX_SENDS = 80;
const MAX_PUSH_TIMES = 80;
const MAX_SNAPSHOTS = 8;

const uiEvents = [];
const sends = [];
const receives = new Map();
let recording = false;
let sequence = 0;

function restoreDraft() {
  if (typeof window === "undefined") return;
  const draft = readStore().draft;
  if (!draft || Array.isArray(draft)) return;
  (draft.ui || []).forEach((event) => rememberUi(event, false));
  (draft.sends || []).forEach((event) => sends.push(event));
  (draft.receives || []).forEach((group) => {
    if (group?.cmd) receives.set(group.cmd, group);
  });
  sequence = Math.max(
    sequence,
    ...sends.map((event) => event.id || 0),
    ...[...receives.values()].flatMap((group) => [
      group.first?.id || 0,
      group.last?.id || 0,
    ]),
    ...uiEvents.map((event) => event.id || 0),
  );
}

export function isPeachCaptureReadyMessage(data) {
  return !!data && data.type === "peach-board-capture-ready";
}

export function isPeachCaptureEventMessage(data) {
  return !!data && data.type === "peach-board-capture-event" && !!data.event;
}

export function postPeachCapture(targetWindow, enabled) {
  if (!targetWindow) return;
  targetWindow.postMessage(
    { type: "peach-board-capture", enabled: !!enabled },
    window.location.origin,
  );
}

export function injectPeachCapture(frameWindow, onReady) {
  const documentRef = frameWindow?.document;
  if (!documentRef) return;
  if (frameWindow.__peachBoardCapture) {
    onReady?.();
    return;
  }
  if (documentRef.getElementById("peach-board-capture-script")) return;

  const script = documentRef.createElement("script");
  script.id = "peach-board-capture-script";
  script.src = `${import.meta.env.BASE_URL}game/peach-board-capture.js`;
  script.charset = "utf-8";
  script.onload = () => onReady?.();
  documentRef.head.appendChild(script);
}

export function isPeachCaptureRecording() {
  return recording;
}

export function setPeachCaptureRecording(enabled) {
  recording = !!enabled;
}

function readStore(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(PEACH_CAPTURE_STORAGE_KEY) || "{}");
    return {
      version: 2,
      draft: parsed.draft && !Array.isArray(parsed.draft) ? parsed.draft : null,
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch (error) {
    return { version: 2, draft: null, snapshots: [] };
  }
}

function writeStore(store, storage = window.localStorage) {
  const payload = {
    version: 2,
    draft: store.draft,
    snapshots: store.snapshots.slice(-MAX_SNAPSHOTS),
  };
  storage.setItem(PEACH_CAPTURE_STORAGE_KEY, JSON.stringify(payload));
}

function persistDraft() {
  const store = readStore();
  store.draft = currentDraft();
  try {
    writeStore(store);
  } catch (error) {
    // The browser storage quota can reject a large battlefield packet.
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function sanitize(value, depth = 4, seen = new WeakSet()) {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return { binary: true, byteLength: value.byteLength };
  }
  if (depth < 0) return "[depth]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitize(item, depth - 1, seen));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 40)
      .map(([key, item]) => [key, sanitize(item, depth - 1, seen)]),
  );
}

function decodePacket(base64) {
  const message = g_utils.parse(base64ToBytes(base64));
  let body;
  try {
    body = message.rawData;
  } catch (error) {
    try {
      body = message.body ? bonProtocol.decode(message.body) : undefined;
    } catch (decodeError) {
      body = undefined;
    }
  }
  return sanitize({
    cmd: message.cmd || "",
    ack: message.ack,
    seq: message.seq,
    code: message.code,
    error: message.error,
    body,
  });
}

function isHeartbeat(command) {
  return !command || command === "_sys/ack" || /heart/.test(command);
}

function packetGaps(times) {
  const gaps = [];
  for (let index = 1; index < times.length; index += 1) {
    gaps.push(times[index] - times[index - 1]);
  }
  return gaps;
}

function storePacket(event) {
  let decoded = null;
  if (event.base64) {
    try {
      decoded = decodePacket(event.base64);
    } catch (error) {
      decoded = null;
    }
  }
  if (decoded && isHeartbeat(decoded.cmd)) return null;
  return {
    id: event.id || ++sequence,
    at: event.at,
    kind: event.kind,
    byteLength: event.byteLength,
    skipped: event.skipped || false,
    text: event.text,
    packet: decoded,
    base64: decoded ? undefined : event.base64,
  };
}

function rememberSend(event) {
  const stored = storePacket(event);
  if (!stored) return;
  sends.push(stored);
  if (sends.length > MAX_SENDS) sends.shift();
}

function rememberReceive(event) {
  const stored = storePacket(event);
  if (!stored) return;
  const command = stored.packet?.cmd || "(undecoded)";
  const group = receives.get(command) || {
    cmd: command,
    first: stored,
    last: stored,
    times: [],
  };
  group.last = stored;
  group.times.push(stored.at);
  if (group.times.length > MAX_PUSH_TIMES) group.times.shift();
  receives.set(command, group);
}

function rememberUi(event, assignId = true) {
  uiEvents.push(assignId ? { id: ++sequence, ...event } : event);
  if (uiEvents.length > MAX_UI_EVENTS) uiEvents.shift();
}

export function acceptPeachCaptureEvent(event) {
  if (!recording || !event) return peachCapturePendingCount();
  if (event.kind === "ws-send") rememberSend(event);
  else if (event.kind === "ws-recv") rememberReceive(event);
  else rememberUi(event);
  persistDraft();
  return peachCapturePendingCount();
}

function currentDraft() {
  return {
    ui: uiEvents.slice(),
    sends: sends.slice(),
    receives: [...receives.values()],
  };
}

export function peachCapturePendingCount() {
  return uiEvents.length + sends.length + receives.size;
}

function exportBody(draft) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    doc: "docs/peach-board.md",
    note: "蟠桃园上船记录。请把这个文件发回来。",
    needed: [
      "查询船列表的命令，以及每艘船的编号",
      "上船命令，和参数里的船编号",
      "哪个字段表示自己已经在船上",
      "船已经消失时，服务器返回的结果",
    ],
    sends: draft.sends || [],
    receives: (draft.receives || []).map((group) => ({
      cmd: group.cmd,
      count: group.times?.length || 0,
      gapsMs: packetGaps(group.times || []),
      first: group.first,
      last: group.last,
    })),
    ui: draft.ui || [],
  };
}

export function downloadPeachCapture() {
  const store = readStore();
  const draft = currentDraft();
  const hasRecord = draft.ui.length + draft.sends.length + draft.receives.length > 0;
  if (hasRecord) {
    const snapshot = { savedAt: new Date().toISOString(), ...draft };
    const last = store.snapshots[store.snapshots.length - 1];
    const same = last && JSON.stringify(last) === JSON.stringify(snapshot);
    if (!same) store.snapshots.push(snapshot);
    if (store.snapshots.length > MAX_SNAPSHOTS) {
      store.snapshots.splice(0, store.snapshots.length - MAX_SNAPSHOTS);
    }
  }
  store.draft = draft;
  if (!hasRecord && !store.snapshots.length) return { ok: false, snapshots: 0, events: 0 };

  try {
    writeStore(store);
  } catch (error) {
    // The file download still proceeds when storage is full.
  }

  const file = exportBody(hasRecord ? draft : store.snapshots[store.snapshots.length - 1]);
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `peach-board-capture-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return {
    ok: true,
    snapshots: store.snapshots.length,
    events: file.sends.length + file.receives.length + file.ui.length,
  };
}

restoreDraft();
