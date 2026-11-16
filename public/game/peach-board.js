(function () {
  "use strict";

  if (window.__peachBoard) return;
  window.__peachBoard = true;

  var running = false;
  var inflightId = null;
  var failedIds = {};
  var knownIds = "";
  var boarding = null;
  var watchdog = 0;

  function post(data) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(data, window.location.origin);
  }

  function status(text) {
    post({ type: "peach-board-status", text: text, running: running });
  }

  function battleOpen() {
    var now = new Date();
    // 每月前三个周日，日期落在 1–21 日。
    if (now.getDay() !== 0 || now.getDate() > 21) return false;
    var minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= 20 * 60 && minutes <= 20 * 60 + 30;
  }

  function walk(node, visit) {
    if (!node) return;
    visit(node);
    var components = node._components;
    if (components) {
      for (var index = 0; index < components.length; index += 1) visit(components[index]);
    }
    var children = node.children;
    if (!children) return;
    for (var childIndex = 0; childIndex < children.length; childIndex += 1) {
      walk(children[childIndex], visit);
    }
  }

  function isPanel(value) {
    return !!(value && value._carAnimationManager && value._flagName === "c_flag");
  }

  function findPanel() {
    var scene = window.cc && window.cc.director && window.cc.director.getScene && window.cc.director.getScene();
    var found = null;
    walk(scene, function (node) {
      if (!found && isPanel(node)) found = node;
    });
    return found;
  }

  function carIdOf(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.carId === "number") return value.carId;
    if (typeof value.id === "number" && (value.gridType != null || value.airshipSkin != null || value.x != null)) {
      return value.id;
    }
    return null;
  }

  function valuesOf(value) {
    if (Array.isArray(value)) return value;
    if (typeof Map !== "undefined" && value instanceof Map) {
      var listed = [];
      value.forEach(function (item) { listed.push(item); });
      return listed;
    }
    return null;
  }

  function collectCars(panel) {
    var cars = [];
    var seen = [];
    function add(value) {
      var id = carIdOf(value);
      if (id == null || seen.indexOf(id) >= 0) return;
      seen.push(id);
      cars.push({ id: id, value: value });
    }
    function scan(value) {
      if (!value || typeof value !== "object") return;
      add(value);
      var listed = valuesOf(value);
      if (listed) {
        for (var index = 0; index < listed.length; index += 1) add(listed[index]);
        return;
      }
      var keys = [];
      try { keys = Object.keys(value); } catch (error) { return; }
      for (var keyIndex = 0; keyIndex < keys.length && keyIndex < 40; keyIndex += 1) {
        try { add(value[keys[keyIndex]]); } catch (error) {}
      }
    }
    scan(panel);
    var panelKeys = [];
    try { panelKeys = Object.keys(panel); } catch (error) { panelKeys = []; }
    for (var index = 0; index < panelKeys.length; index += 1) {
      try { scan(panel[panelKeys[index]]); } catch (error) {}
    }
    return cars;
  }

  function functionsOf(object) {
    var found = [];
    var current = object;
    var seen = [];
    while (current && seen.indexOf(current) < 0 && current !== Object.prototype) {
      seen.push(current);
      var names = [];
      try { names = Object.getOwnPropertyNames(current); } catch (error) { break; }
      for (var index = 0; index < names.length; index += 1) {
        if (names[index] === "constructor") continue;
        var descriptor;
        try { descriptor = Object.getOwnPropertyDescriptor(current, names[index]); } catch (error) { continue; }
        if (descriptor && typeof descriptor.value === "function") {
          found.push({ name: names[index], fn: descriptor.value });
        }
      }
      current = Object.getPrototypeOf(current);
    }
    return found;
  }

  function sourceOf(fn) {
    try { return Function.prototype.toString.call(fn); } catch (error) { return ""; }
  }

  function findMarch(panel) {
    var functions = functionsOf(panel);
    for (var index = 0; index < functions.length; index += 1) {
      if (/startmarch|StartMarch|payload_startmarch/i.test(sourceOf(functions[index].fn))) return functions[index];
    }
    return null;
  }

  function packetText(data) {
    var bytes = null;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (!bytes || bytes.length < 5 || bytes[0] !== 112 || bytes[1] !== 120) return "";
    var copy = bytes.slice();
    var key =
      (((copy[2] >> 6) & 1) << 7) |
      (((copy[2] >> 4) & 1) << 6) |
      (((copy[2] >> 2) & 1) << 5) |
      ((copy[2] & 1) << 4) |
      (((copy[3] >> 6) & 1) << 3) |
      (((copy[3] >> 4) & 1) << 2) |
      (((copy[3] >> 2) & 1) << 1) |
      (copy[3] & 1);
    var text = "";
    for (var index = 4; index < copy.length; index += 1) {
      var code = copy[index] ^ key;
      text += code >= 32 && code < 127 ? String.fromCharCode(code) : " ";
    }
    return text;
  }

  function clearWatchdog() {
    if (!watchdog) return;
    window.clearTimeout(watchdog);
    watchdog = 0;
  }

  function finish(text) {
    running = false;
    inflightId = null;
    boarding = null;
    clearWatchdog();
    status(text);
  }

  function failCurrent() {
    if (inflightId != null) failedIds[inflightId] = true;
    inflightId = null;
    boarding = null;
    clearWatchdog();
  }

  function startMarch(panel, car) {
    var march = findMarch(panel);
    if (!march) {
      finish("没有找到上船方法");
      return;
    }
    inflightId = car.id;
    try { panel._selectedCarId = car.id; } catch (error) {}
    status("正在上船");
    var called = false;
    try { march.fn.call(panel, car.id); called = true; } catch (error) {}
    if (!called) {
      try { march.fn.call(panel, car.value); called = true; } catch (error) {}
    }
    if (!called) {
      try { march.fn.call(panel); called = true; } catch (error) {}
    }
    if (!called) {
      failCurrent();
      finish("没有找到上船方法");
      return;
    }
    if (boarding) return;
    clearWatchdog();
    watchdog = window.setTimeout(function () {
      if (!running || inflightId !== car.id || boarding) return;
      failCurrent();
      status("这艘船没登上，换下一艘");
      tick();
    }, 1500);
  }

  function tick() {
    if (!running) return;
    if (!battleOpen()) {
      finish("战场未开放");
      return;
    }
    var panel = findPanel();
    if (!panel) {
      status("不在蟠桃园战场");
      return;
    }
    if (boarding) return;
    if (inflightId != null) return;
    var cars = collectCars(panel);
    var signature = cars.map(function (car) { return car.id; }).join(",");
    if (signature !== knownIds) {
      knownIds = signature;
      failedIds = {};
    }
    var next = null;
    for (var index = 0; index < cars.length; index += 1) {
      if (!failedIds[cars[index].id]) {
        next = cars[index];
        break;
      }
    }
    if (!next) {
      status(cars.length ? "等待下一艘船" : "等待船");
      return;
    }
    startMarch(panel, next);
  }

  function noteSend(data) {
    if (!running) return;
    var text = packetText(data);
    if (!/payload_startmarch/i.test(text)) return;
    if (inflightId == null) return;
    var carId = inflightId;
    boarding = { id: carId, at: Date.now() };
    clearWatchdog();
    watchdog = window.setTimeout(function () {
      if (!running || !boarding || boarding.id !== carId) return;
      finish("已上船");
    }, 8000);
    status("正在上船");
  }

  function noteReceive(data) {
    if (!running || !boarding) return;
    var text = packetText(data);
    if (!/EndMarchNotify/i.test(text)) return;
    var elapsed = Date.now() - boarding.at;
    var carId = boarding.id;
    boarding = null;
    if (elapsed < 5000) {
      failedIds[carId] = true;
      inflightId = null;
      status("船已经没了，换下一艘");
      tick();
      return;
    }
    finish("已上船");
  }

  var nativeSend = WebSocket.prototype.send;
  if (!nativeSend.__peachBoardWrapped) {
    WebSocket.prototype.send = function (data) {
      try { noteSend(data); } catch (error) {}
      return nativeSend.apply(this, arguments);
    };
    WebSocket.prototype.send.__peachBoardWrapped = true;
  }

  var nativeAdd = WebSocket.prototype.addEventListener;
  if (nativeAdd && !nativeAdd.__peachBoardWrapped) {
    WebSocket.prototype.addEventListener = function (type, listener, options) {
      if (type === "message" && listener && !listener.__peachBoardWrapped) {
        var wrapped = function (event) {
          try { noteReceive(event.data); if (running && !inflightId && !boarding) tick(); } catch (error) {}
          return listener.apply(this, arguments);
        };
        wrapped.__peachBoardWrapped = true;
        return nativeAdd.call(this, type, wrapped, options);
      }
      return nativeAdd.apply(this, arguments);
    };
    WebSocket.prototype.addEventListener.__peachBoardWrapped = true;
  }

  var messageDescriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage");
  if (messageDescriptor && messageDescriptor.set && !messageDescriptor.set.__peachBoardWrapped) {
    Object.defineProperty(WebSocket.prototype, "onmessage", {
      configurable: true,
      enumerable: messageDescriptor.enumerable,
      get: messageDescriptor.get,
      set: function (listener) {
        var wrapped = listener;
        if (typeof listener === "function" && !listener.__peachBoardWrapped) {
          wrapped = function (event) {
            try {
              noteReceive(event.data);
              if (running && !inflightId && !boarding) tick();
            } catch (error) {}
            return listener.apply(this, arguments);
          };
          wrapped.__peachBoardWrapped = true;
        }
        return messageDescriptor.set.call(this, wrapped);
      },
    });
    messageDescriptor.set.__peachBoardWrapped = true;
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== "peach-board") return;
    running = !!data.enabled;
    inflightId = null;
    boarding = null;
    failedIds = {};
    knownIds = "";
    clearWatchdog();
    if (!running) {
      status("一键上船");
      return;
    }
    tick();
  });

  post({ type: "peach-board-ready" });
})();
