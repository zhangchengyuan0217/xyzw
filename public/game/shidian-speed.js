(function () {
  "use strict";

  var SPEED = 2;
  var enabled = false;
  var patched = false;

  function notifyParent() {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(
      { type: "shidian-speed-ready" },
      window.location.origin,
    );
  }

  function currentSpeed(baseSpeed) {
    return enabled ? SPEED : baseSpeed;
  }

  function bindPanelSpeed(panel) {
    if (!panel || panel.__shidianSpeedBound) return;
    panel.__shidianSpeedBound = true;
    var baseSpeed =
      typeof panel.DEFAULT_TIMESCALE === "number" ? panel.DEFAULT_TIMESCALE : 1;
    panel.__shidianBaseSpeed = baseSpeed;
    Object.defineProperty(panel, "DEFAULT_TIMESCALE", {
      configurable: true,
      enumerable: true,
      get: function () {
        return currentSpeed(baseSpeed);
      },
      set: function (value) {
        if (typeof value !== "number" || !isFinite(value)) return;
        if (enabled && value === SPEED && baseSpeed !== SPEED) return;
        baseSpeed = value;
        panel.__shidianBaseSpeed = value;
      },
    });
  }

  function liveBattle(panel) {
    var modules = window.__require;
    if (!panel || typeof modules !== "function" || !panel.getComponent) {
      return null;
    }
    try {
      var lord = modules("UICompLordSkill");
      var component = panel.getComponent(lord.UICompSingleLordSkill);
      return component && component.battle ? component.battle : null;
    } catch (error) {
      return null;
    }
  }

  function syncLiveBattle() {
    var modules = window.__require;
    if (typeof modules !== "function") return;
    try {
      var manager = modules("UIManager");
      var panelModule = modules("NightmareBattlePanel");
      var panel = manager.GET_PROXY(panelModule.NightmareBattlePanel);
      if (!panel) return;
      bindPanelSpeed(panel);
      var battle = liveBattle(panel);
      if (!battle || typeof battle.timeScale !== "number") return;
      if (!enabled && !panel.__shidianSpeedApplied) return;
      var baseSpeed = panel.__shidianBaseSpeed;
      if (typeof baseSpeed !== "number") baseSpeed = battle.timeScale;
      battle.timeScale = currentSpeed(baseSpeed);
      panel.__shidianSpeedApplied = enabled;
    } catch (error) {
      // The battle module is still loading.
    }
  }

  function install() {
    if (patched || typeof window.__require !== "function") return false;
    var panelModule;
    try {
      panelModule = window.__require("NightmareBattlePanel");
    } catch (error) {
      return false;
    }
    var Panel = panelModule && panelModule.NightmareBattlePanel;
    var proto = Panel && Panel.prototype;
    if (!proto || typeof proto.onShow !== "function" || proto.__shidianSpeedPatched) {
      return false;
    }
    var originalOnShow = proto.onShow;
    proto.onShow = function () {
      bindPanelSpeed(this);
      return originalOnShow.apply(this, arguments);
    };
    proto.__shidianSpeedPatched = true;
    patched = true;
    syncLiveBattle();
    return true;
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== "shidian-speed") return;
    enabled = !!data.enabled;
    if (install()) syncLiveBattle();
  });

  notifyParent();
  var timer = window.setInterval(function () {
    if (!install()) return;
    window.clearInterval(timer);
    notifyParent();
  }, 1000);
})();
