(function () {
  "use strict";

  if (window.__peachBoardCapture) return;
  window.__peachBoardCapture = true;

  // Records the peach-board click. It never sends a board command itself.
  var enabled = false;
  var priorityUntil = 0;
  var priorityLeft = 0;
  var lastSampleAt = 0;
  var hookedPanels = 0;
  var managerReady = false;
  var MAX_PANELS = 30;
  var PRIORITY_MS = 8000;
  var PRIORITY_PACKETS = 40;
  var SAMPLE_MS = 2000;
  var SKIP_TYPE =
    /^(Node|Component|Label|Sprite|Button|Widget|Graphics|Mask|Layout|ScrollView|RichText|ProgressBar|EditBox|Canvas|Scene|Camera|Object|Function|Array)$/;

  function post(data) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(data, window.location.origin);
  }

  function notifyReady() {
    post({ type: "peach-board-capture-ready" });
  }

  function markAction() {
    priorityUntil = Date.now() + PRIORITY_MS;
    priorityLeft = PRIORITY_PACKETS;
  }

  function typeName(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value !== "object" && typeof value !== "function") return typeof value;
    return (value.constructor && value.constructor.name) || typeof value;
  }

  function interestingName(name) {
    return /payload|peach|ship|boat|car|pantao|legion|蟠桃/i.test(String(name || ""));
  }

  function summarize(value, depth, seen) {
    if (depth < 0) return "[depth]";
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.length > 240 ? value.slice(0, 240) + "…" : value;
    }
    if (typeof value === "function") {
      return "[fn " + (value.name || typeName(value)) + "]";
    }
    if (typeof ArrayBuffer !== "undefined" && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) {
      return { binary: true, byteLength: value.byteLength };
    }
    if (seen.indexOf(value) >= 0) return "[circular]";
    seen.push(value);
    if (Array.isArray(value)) {
      return value.slice(0, 20).map(function (item) {
        return summarize(item, depth - 1, seen);
      });
    }
    var output = { __type: typeName(value) };
    var keys = [];
    try {
      keys = Object.keys(value);
    } catch (error) {
      return output;
    }
    var preferred = keys.filter(function (key) {
      return /payload|peach|ship|boat|car|legion|role|member|team|state|cmd|id|name|pos|index|slot/i.test(key);
    });
    var picked = (preferred.length ? preferred : keys).slice(0, 16);
    picked.forEach(function (key) {
      try {
        output[key] = summarize(value[key], depth - 1, seen);
      } catch (error) {
        output[key] = "[unreadable]";
      }
    });
    return output;
  }

  function emit(event) {
    if (!enabled) return;
    event.at = Date.now();
    post({ type: "peach-board-capture-event", event: event });
  }

  function worthHooking(key) {
    return /show|hide|enable|disable|click|touch|board|ship|enter|join|select|btn|payload|peach|car|open|close|go/i.test(key);
  }

  function hookMethod(owner, key, label) {
    var descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(owner, key);
    } catch (error) {
      return;
    }
    if (!descriptor || typeof descriptor.value !== "function" || descriptor.value.__peachWrapped) return;
    var original = descriptor.value;
    function wrapped() {
      var record = null;
      if (enabled) {
        record = {
          kind: "call",
          target: label,
          name: key,
          args: summarize(Array.prototype.slice.call(arguments), 3, []),
        };
        if (this && this !== owner) record.self = summarize(this, 2, []);
        markAction();
      }
      var result = original.apply(this, arguments);
      if (record) {
        record.result = summarize(result, 2, []);
        emit(record);
      }
      return result;
    }
    wrapped.__peachWrapped = true;
    try {
      owner[key] = wrapped;
    } catch (error) {
      // A sealed prototype is left unchanged.
    }
  }

  function hookPanel(name, Ctor) {
    if (hookedPanels >= MAX_PANELS) return;
    if (!Ctor || typeof Ctor !== "function" || !Ctor.prototype) return;
    if (Ctor.prototype.__peachHooked) return;
    if (SKIP_TYPE.test(Ctor.name || name || "")) return;
    var hasShow = typeof Ctor.prototype.onShow === "function";
    if (!hasShow && !interestingName(name) && !interestingName(Ctor.name)) return;
    Ctor.prototype.__peachHooked = true;
    hookedPanels += 1;
    var keys = [];
    try {
      keys = Object.getOwnPropertyNames(Ctor.prototype);
    } catch (error) {
      return;
    }
    keys.forEach(function (key) {
      if (key !== "constructor" && worthHooking(key)) hookMethod(Ctor.prototype, key, name || Ctor.name || "Panel");
    });
    emit({
      kind: "panel",
      name: name || Ctor.name || "Panel",
      methods: keys.filter(worthHooking).slice(0, 40),
    });
  }

  function considerValue(value, seen) {
    if (!value || seen.indexOf(value) >= 0) return;
    seen.push(value);
    if (typeof value === "function") {
      hookPanel(value.name, value);
      return;
    }
    if (typeof value !== "object") return;
    if (value.constructor && value.constructor !== Object && value.constructor !== Array) {
      hookPanel(value.constructor.name, value.constructor);
    }
  }

  function harvest(values) {
    var seen = [];
    for (var index = 0; index < values.length; index += 1) considerValue(values[index], seen);
  }

  function shouldRecordManager(key, result) {
    if (/hide|close|show|open/i.test(key)) return true;
    if (!/proxy/i.test(key)) return false;
    var name = result && result.constructor ? result.constructor.name : "";
    if (!shouldRecordManager.seen) shouldRecordManager.seen = {};
    if (!name) return true;
    if (shouldRecordManager.seen[name]) return false;
    shouldRecordManager.seen[name] = true;
    return true;
  }

  var hookedManagers = typeof WeakSet === "function" ? new WeakSet() : null;

  function hookManager(exportsObject, moduleName) {
    if (!exportsObject) return;
    if (hookedManagers) {
      if (hookedManagers.has(exportsObject)) return;
      hookedManagers.add(exportsObject);
    } else if (exportsObject.__peachManager) {
      return;
    } else {
      exportsObject.__peachManager = true;
    }
    Object.keys(exportsObject).forEach(function (key) {
      if (typeof exportsObject[key] !== "function") return;
      if (!/show|hide|open|close|proxy/i.test(key)) return;
      var original = exportsObject[key];
      if (original.__peachWrapped) return;
      function wrapped() {
        var args = Array.prototype.slice.call(arguments);
        if (enabled) harvest(args);
        var result = original.apply(this, arguments);
        if (enabled) {
          harvest([result]);
          if (shouldRecordManager(key, result)) {
            markAction();
            emit({
              kind: "ui",
              target: moduleName,
              name: key,
              args: summarize(args, 2, []),
              result: summarize(result, 2, []),
            });
          }
        }
        return result;
      }
      wrapped.__peachWrapped = true;
      try {
        exportsObject[key] = wrapped;
      } catch (error) {
        // The manager keeps its original function.
      }
    });
  }

  function considerExports(moduleName, exportsObject) {
    if (!exportsObject || typeof exportsObject !== "object") return;
    if (moduleName === "UIManager" || typeof exportsObject.GET_PROXY === "function") {
      hookManager(exportsObject, moduleName || "UIManager");
    }
    Object.keys(exportsObject).forEach(function (key) {
      var value = exportsObject[key];
      if (typeof value === "function" && (interestingName(key) || interestingName(value.name))) {
        hookPanel(key, value);
      }
    });
  }

  function wrapRequire(requireFn) {
    if (!requireFn || requireFn.__peachWrapped) return requireFn;
    function wrapped() {
      var result = requireFn.apply(this, arguments);
      try {
        considerExports(arguments[0], result);
      } catch (error) {
        // A module can fail while the game is still booting.
      }
      return result;
    }
    wrapped.__peachWrapped = true;
    return wrapped;
  }

  function gameReady() {
    return !!(
      window.cc &&
      window.cc.director &&
      typeof window.cc.director.getScene === "function" &&
      window.cc.director.getScene()
    );
  }

  function attachRequire() {
    if (typeof window.__require !== "function") return;
    if (!window.__require.__peachWrapped) window.__require = wrapRequire(window.__require);
  }

  function ensureManager() {
    if (!enabled || managerReady || !gameReady()) return;
    attachRequire();
    try {
      considerExports("UIManager", window.__require("UIManager"));
      managerReady = true;
    } catch (error) {
      managerReady = false;
    }
  }

  function toBytes(data) {
    if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
  }

  function bytesToBase64(bytes) {
    var binary = "";
    var size = 0x8000;
    for (var index = 0; index < bytes.length; index += size) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + size));
    }
    return btoa(binary);
  }

  function shouldRecordSocket(direction) {
    if (!enabled) return false;
    if (direction === "ws-send") return true;
    var now = Date.now();
    if (now < priorityUntil && priorityLeft > 0) {
      priorityLeft -= 1;
      return true;
    }
    if (now - lastSampleAt < SAMPLE_MS) return false;
    lastSampleAt = now;
    return true;
  }

  function recordSocket(direction, data) {
    if (!shouldRecordSocket(direction)) return;
    var bytes = toBytes(data);
    if (bytes) {
      if (bytes.length > 24000) {
        emit({ kind: direction, skipped: true, byteLength: bytes.length });
        return;
      }
      emit({ kind: direction, byteLength: bytes.length, base64: bytesToBase64(bytes) });
      return;
    }
    if (typeof data === "string") {
      emit({ kind: direction, text: data.length > 4000 ? data.slice(0, 4000) : data });
    }
  }

  function watchSocket(socket) {
    if (!socket || socket.__peachWatch) return;
    socket.__peachWatch = true;
    socket.addEventListener("message", function (event) {
      recordSocket("ws-recv", event.data);
    });
  }

  var nativeSend = WebSocket.prototype.send;
  if (!nativeSend.__peachWrapped) {
    WebSocket.prototype.send = function (data) {
      watchSocket(this);
      recordSocket("ws-send", data);
      return nativeSend.apply(this, arguments);
    };
    WebSocket.prototype.send.__peachWrapped = true;
  }

  window.addEventListener(
    "pointerup",
    function () {
      if (!enabled) return;
      markAction();
      emit({ kind: "pointer" });
    },
    true,
  );

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== "peach-board-capture") return;
    enabled = !!data.enabled;
    if (!enabled) return;
    attachRequire();
    ensureManager();
  });

  window.setInterval(function () {
    if (!enabled) return;
    attachRequire();
    ensureManager();
  }, 500);

  notifyReady();
})();
