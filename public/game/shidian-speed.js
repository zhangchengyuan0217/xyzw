(function () {
  "use strict";

  if (window.__shidianSpeedHook) return;
  window.__shidianSpeedHook = true;

  var SPEED = 2;
  var enabled = false;
  var activeBattle = null;
  var rememberedScale = 1;
  var modulesReady = false;

  function notifyParent() {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(
      { type: "shidian-speed-ready" },
      window.location.origin,
    );
  }

  function battleData(battle) {
    return battle && battle.options && battle.options.battleData;
  }

  function rememberScale(battle) {
    var scale = battle && battle.timeScale;
    if (typeof scale === "number" && scale > 0 && scale !== SPEED) {
      rememberedScale = scale;
    }
  }

  function applyScale(battle, scale) {
    if (!battle) return;
    try {
      battle.timeScale = scale;
    } catch (error) {
      // The battle object can reject writes while it is being destroyed.
    }
    try {
      if (battle.timeManager) battle.timeManager.timeScale = scale;
    } catch (error) {
      // Some battle builds expose time scale only on the battle itself.
    }
  }

  function publishSpeed(battle, scale) {
    var data = battleData(battle);
    if (!data || typeof window.__require !== "function") return;
    try {
      var manager = window.__require("manager-factory");
      if (manager && typeof manager.BATTLE_SPEED === "function") {
        manager.BATTLE_SPEED({ battleData: data }, scale);
      }
    } catch (error) {
      // The battle manager is not ready yet.
    }
  }

  function descriptor(object, key) {
    while (object) {
      var found = Object.getOwnPropertyDescriptor(object, key);
      if (found) return found;
      object = Object.getPrototypeOf(object);
    }
    return null;
  }

  function lockBattle(battle) {
    if (!battle || battle.__shidianLocked) return;
    var existing = descriptor(battle, "timeScale");
    var stored = typeof battle.timeScale === "number" ? battle.timeScale : 1;
    var writing = false;
    try {
      Object.defineProperty(battle, "timeScale", {
        configurable: true,
        enumerable: true,
        get: function () {
          return enabled ? SPEED : stored;
        },
        set: function (value) {
          if (!enabled && typeof value === "number" && isFinite(value)) stored = value;
          if (writing || !existing || !existing.set) return;
          writing = true;
          try {
            existing.set.call(battle, enabled ? SPEED : value);
          } finally {
            writing = false;
          }
        },
      });
      battle.__shidianLocked = true;
      battle.timeScale = enabled ? SPEED : stored;
    } catch (error) {
      applyScale(battle, enabled ? SPEED : stored);
    }
  }

  function forceBattle(battle) {
    if (!battle) return;
    rememberScale(battle);
    lockBattle(battle);
    if (enabled) applyScale(battle, SPEED);
  }

  function restoreBattle(battle) {
    if (!battle) return;
    var scale = rememberedScale > 0 ? rememberedScale : 1;
    applyScale(battle, scale);
    publishSpeed(battle, scale);
  }

  function bindPanelSpeed(panel) {
    if (!panel || panel.__shidianSpeedBound) return;
    panel.__shidianSpeedBound = true;
    var baseSpeed =
      typeof panel.DEFAULT_TIMESCALE === "number" ? panel.DEFAULT_TIMESCALE : 1;
    Object.defineProperty(panel, "DEFAULT_TIMESCALE", {
      configurable: true,
      enumerable: true,
      get: function () {
        return enabled ? SPEED : baseSpeed;
      },
      set: function (value) {
        if (typeof value !== "number" || !isFinite(value)) return;
        if (enabled && value === SPEED) return;
        baseSpeed = value;
      },
    });
  }

  function nightmarePanel() {
    if (typeof window.__require !== "function") return null;
    try {
      var manager = window.__require("UIManager");
      var panelModule = window.__require("NightmareBattlePanel");
      if (!manager || !panelModule || typeof manager.GET_PROXY !== "function") return null;
      return manager.GET_PROXY(panelModule.NightmareBattlePanel) || null;
    } catch (error) {
      return null;
    }
  }

  function battleFromPanel(panel) {
    if (!panel || typeof window.__require !== "function" || !panel.getComponent) return null;
    try {
      var lord = window.__require("UICompLordSkill");
      var component = panel.getComponent(lord.UICompSingleLordSkill);
      return component && component.battle ? component.battle : null;
    } catch (error) {
      return null;
    }
  }

  function patchPanel(Panel) {
    var proto = Panel && Panel.prototype;
    if (!proto || proto.__shidianPatched || typeof proto.onShow !== "function") return;
    var originalShow = proto.onShow;
    var originalEnd = proto.battleEnd;
    proto.onShow = function () {
      bindPanelSpeed(this);
      return originalShow.apply(this, arguments);
    };
    if (typeof originalEnd === "function") {
      proto.battleEnd = function () {
        var battle = activeBattle;
        activeBattle = null;
        var result = originalEnd.apply(this, arguments);
        if (!enabled) restoreBattle(battle);
        return result;
      };
    }
    proto.__shidianPatched = true;
  }

  function patchFactory(mod) {
    if (!mod || typeof mod.CREATE_BATTLE !== "function" || mod.CREATE_BATTLE.__shidian) {
      return;
    }
    var originalCreate = mod.CREATE_BATTLE;
    function createBattle(data, scale, container) {
      var panel = nightmarePanel();
      var nightmare = !!(panel && data && data === panel.battleUIData);
      if (enabled && nightmare) scale = SPEED;
      var battle = originalCreate.call(this, data, scale, container);
      if (nightmare && battle) {
        activeBattle = battle;
        rememberedScale = 1;
        if (enabled) {
          forceBattle(battle);
          publishSpeed(battle, SPEED);
        }
      }
      return battle;
    }
    createBattle.__shidian = true;
    mod.CREATE_BATTLE = createBattle;
  }

  function consider(exports) {
    if (!exports || typeof exports !== "object") return;
    if (exports.NightmareBattlePanel) patchPanel(exports.NightmareBattlePanel);
    if (exports.CREATE_BATTLE) patchFactory(exports);
  }

  function wrapRequire(requireFn) {
    if (!requireFn || requireFn.__shidianWrapped) return requireFn;
    function wrapped() {
      var result = requireFn.apply(this, arguments);
      try {
        consider(result);
      } catch (error) {
        // A module can fail while the game is still booting.
      }
      return result;
    }
    wrapped.__shidianWrapped = true;
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
    if (!window.__require.__shidianWrapped) {
      window.__require = wrapRequire(window.__require);
    }
    if (modulesReady || !gameReady()) return;
    modulesReady = true;
    ["manager-factory", "NightmareBattlePanel", "UIManager", "UICompLordSkill"].forEach(
      function (name) {
        try {
          consider(window.__require(name));
        } catch (error) {
          // Leave the module for the game to load and patch through the wrapped require.
        }
      },
    );
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== "shidian-speed") return;
    var next = !!data.enabled;
    if (!next && enabled) restoreBattle(activeBattle);
    enabled = next;
    if (enabled) forceBattle(activeBattle);
    attachRequire();
  });

  window.setInterval(function () {
    attachRequire();
    var battle = battleFromPanel(nightmarePanel()) || activeBattle;
    if (!enabled) return;
    if (battle) {
      activeBattle = battle;
      forceBattle(battle);
    }
  }, 200);

  notifyParent();
})();
