<template>
  <div class="legion-war-map-container">
    <div class="legion-war-map-card">
      <div v-if="!isAccessible" class="access-denied-container">
        <n-result
          status="403"
          title="暂未开放"
          description="该功能仅在特定时间开放"
        >
          <template #footer>
            <div class="access-denied-info">
              <p>开放时间：</p>
              <p>1. 每月前四周的周六 19:55 - 21:00</p>
              <p>2. 每月第四周的周日 19:55 - 21:30</p>
              <p>3. 2026年3月年赛特殊开放</p>
            </div>
          </template>
        </n-result>
      </div>
      <template v-else>
        <!-- 头部信息区 -->
        <div class="header-section">
          <div class="header-left">
            <img
              src="/icons/moonPalace.png"
              alt="盐场图标"
              class="header-icon"
            />
            <div class="header-title">
              <h2>盐场实时地图</h2>
              <p>获取盐场位置分布</p>
            </div>
          </div>

          <!-- 数据统计区 -->
          <div class="stats-section">
            <div class="stat-item">
              <span class="stat-label">连接状态:</span>
              <n-tag :type="isConnected ? 'success' : 'error'">
                {{ isConnected ? "已连接" : "未连接" }}
              </n-tag>
            </div>
            <div class="stat-item">
              <span class="stat-label">战场数据:</span>
              <n-tag :type="battlefieldId ? 'success' : 'error'">{{
                battlefieldId ? "已成功获取战场数据" : "未获取到战场数据"
              }}</n-tag>
            </div>
            <div class="stat-item">
              <n-button
                size="small"
                :type="isEntireBattlefield ? 'success' : 'warning'"
                :loading="connecting"
                @click="toggleBattlefieldEntry"
              >
                <template #icon>
                  <n-icon>
                    <LogInOutline />
                  </n-icon>
                </template>
                {{ isEntireBattlefield ? "已进入战场" : "进入战场" }}
              </n-button>
              <n-button
                size="small"
                :disabled="!isConnected && !isEntireBattlefield"
                @click="refreshData"
                style="margin-right: 8px"
              >
                <template #icon>
                  <n-icon>
                    <RefreshOutline />
                  </n-icon>
                </template>
                刷新数据
              </n-button>
              <n-button
                size="small"
                type="primary"
                class="export-btn"
                :loading="exporting"
                @click="exportImage"
                :disabled="!validData"
              >
                <template #icon>
                  <n-icon>
                    <ImageOutline />
                  </n-icon>
                </template>
                导出图片
              </n-button>
            </div>
          </div>
        </div>

        <!-- 主要内容区：地图 + 侧边栏 -->
        <div class="main-content-layout">
          <!-- 地图区域 -->
          <div class="map-container-wrapper">
            <div class="map-container">
              <canvas ref="legionWarMapDom" class="mapCanvas"></canvas>
            </div>

            <div v-if="!validData" class="empty-state-overlay">
              <div class="empty-content">
                <template v-if="connecting">
                  <n-spin size="large" />
                  <p>正在连接战场...</p>
                </template>
                <template v-else-if="isConnected">
                  <n-spin size="large" />
                  <p>正在获取地图数据...</p>
                </template>
                <template v-else>
                  <n-icon size="48" color="#ccc">
                    <MapOutline />
                  </n-icon>
                  <p>暂无地图数据，请手动刷新数据</p>
                </template>
              </div>
            </div>
          </div>

          <!-- 右侧信息栏 -->
          <div
            class="side-info-panel"
            v-if="validData && sortedLegions.length > 0"
          >
            <div class="legion-list">
              <template
                v-for="(group, groupName) in allianceGroups"
                :key="groupName"
              >
                <div v-if="group.length > 0" class="alliance-group">
                  <div class="group-header">
                    <span class="group-name">{{ groupName }}</span>
                    <span class="group-count">({{ group.length }})</span>
                  </div>
                  <div
                    v-for="legion in group"
                    :key="legion.id"
                    class="legion-item"
                    :style="{ borderLeftColor: legion.color }"
                  >
                    <div class="rank-badge">
                      {{ sortedLegions.indexOf(legion) + 1 }}
                    </div>
                    <div class="legion-info">
                      <div class="legion-name" :title="legion.name">
                        <span class="legion-id">[{{ legion.serverId }}]</span>
                        {{ legion.name }}
                      </div>
                      <div class="legion-stats">
                        <span class="stat-red"
                          >红粹: {{ legion.redCount }}</span
                        >
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import {
  ImageOutline,
  LogInOutline,
  MapOutline,
  RefreshOutline,
} from "@vicons/ionicons5";
import { useMessage } from "naive-ui";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useLegionWarStore } from "@/stores/legionWarStore";
import { useTokenStore } from "@/stores/tokenStore";
import { isLegionWarAccessible } from "@/utils/clubBattleUtils";
import { allianceincludes } from "@/utils/clubWarrankUtils";
import { getCurrentTimeByFormat } from "@/utils/DateTimeUtils";
import { formatPower, HexGraph, roadPointList } from "@/utils/legionWar";

const message = useMessage();
useTokenStore();
const legionWarStore = useLegionWarStore();

const isAccessible = ref(isLegionWarAccessible());

// Store 状态
const {
  isConnected,
  connecting,
  validData,
  battlefieldId,
  legionDetails,
  isJoined: isEntireBattlefield,
  lastUpdateTime,
} = storeToRefs(legionWarStore);

// 本地状态
const legionWarMapDom = ref(null);
let ctx = null;
let resizeHandler = null;
let resizeObserver = null;

// alias for compatibility if needed, but we use isEntireBattlefield in template

const exporting = ref(false);

const exportImage = async () => {
  if (!validData.value) {
    message.error("暂无地图数据");
    return;
  }

  exporting.value = true;
  const prevCtx = ctx;
  try {
    const exportWidth = 1800;
    const exportHeight = 1200;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth * scale;
    canvas.height = exportHeight * scale;
    const exportCtx = canvas.getContext("2d");
    exportCtx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx = exportCtx;
    drawCanvasContent(exportWidth, exportHeight);

    const link = document.createElement("a");
    link.download = `盐场地图_${getCurrentTimeByFormat("yyyyMMdd_HHmmss")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败");
  } finally {
    ctx = prevCtx;
    exporting.value = false;
    resizeAndRedraw();
  }
};

// 俱乐部排序
const sortedLegions = computed(() => {
  if (!validData.value || !validData.value.legionInfo) return [];

  // 将对象转换为数组并排序
  // 排序规则：红度 > 战力 > ID
  const list = Object.values(validData.value.legionInfo).map((legion) => {
    // 尝试获取公告信息，如果还没有详情则为空
    const detail = legionDetails.value[legion.id] || {};
    // 根据公告判断联盟
    const alliance = detail.announcement
      ? allianceincludes(detail.announcement)
      : "未知联盟";

    // 优先使用详情中的红淬数据
    const redCount =
      detail.quenchNum !== undefined ? detail.quenchNum : legion.redCount;

    return {
      ...legion,
      announcement: detail.announcement || "",
      alliance,
      redCount,
    };
  });

  return list.sort((a, b) => {
    // 1. 红度降序
    if (b.redCount !== a.redCount) {
      return b.redCount - a.redCount;
    }
    // 2. 战力降序 (如果有)
    if (b.power && a.power && b.power !== a.power) {
      return b.power - a.power;
    }
    // 3. ID 升序
    return Number.parseInt(a.id) - Number.parseInt(b.id);
  });
});

// 监听数据变化以重绘地图
watch(
  validData,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        resizeAndRedraw();
      });
    }
  },
  { deep: true },
);

// 监听联盟详情数据变化以重绘地图（因为颜色依赖于详情中的公告）
watch(
  legionDetails,
  () => {
    nextTick(() => {
      resizeAndRedraw();
    });
  },
  { deep: true },
);

// 监听连接状态变化
watch(isConnected, (newVal) => {
  if (!newVal) {
    // 断开连接后，重新绘制基础地图
    nextTick(() => {
      resizeAndRedraw();
    });
  }
});

// 获取联盟分组的列表
const allianceGroups = computed(() => {
  const groups = {};

  // 初始化分组
  const allianceTypes = [
    "大联盟",
    "梦盟",
    "正义联盟",
    "龙盟",
    "曦盟",
    "未知联盟",
  ];
  allianceTypes.forEach((type) => {
    groups[type] = [];
  });

  // 分配俱乐部到对应分组
  sortedLegions.value.forEach((legion) => {
    const alliance = legion.alliance;
    if (groups[alliance]) {
      groups[alliance].push(legion);
    } else {
      // 如果有其他未定义的类型，归入未知
      groups["未知联盟"].push(legion);
    }
  });

  return groups;
});

// Canvas 相关配置
const dpr = window.devicePixelRatio || 1;
const HEX_GAP = 1.6;
const HONEYCOMB = "#E4E5EA";
const TILE_COLORS = {
  1: "#2EC8D6",
  2: "#3CB878",
  3: "#F5B400",
  4: "#F6A21A",
  5: "#8B5CF6",
  6: "#6D28D9",
};
const TILE_LABELS = {
  1: "小",
  2: "中",
  3: "大",
  5: "城",
  6: "核",
};
const CORE_AROUND = new Set([
  "19_16",
  "19_17",
  "20_16",
  "20_18",
  "21_16",
  "21_17",
]);
let hexSize = 15.5;
let mapOffsetX = 0;
let mapOffsetY = 0;

const allianceColors = {
  大联盟: "#F5A000",
  梦盟: "#2E9E57",
  正义联盟: "#2F80ED",
  龙盟: "#7B4FD6",
  曦盟: "#9B4DCA",
  未知联盟: "#8D96A3",
};

const allianceTitle = (alliance) => (alliance === "龙盟" ? "龍盟" : alliance);

const layoutHex = (col, row, size) => {
  const colStep = size * 1.5 + HEX_GAP;
  const rowStep = Math.sqrt(3) * size + HEX_GAP;
  return {
    x: col * colStep + size,
    y: row * rowStep + (col % 2 === 1 ? rowStep / 2 : 0),
  };
};

const traceHex = (x, y, size) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
};

const roundRect = (x, y, w, h, r) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawText = (x, y, text, color, font) => {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
};

const fitText = (text, maxWidth, font) => {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
};

const measureMapBox = (size) => {
  const vert = (Math.sqrt(3) / 2) * size;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of roadPointList) {
    const [col, row] = item.id.split("_").map(Number);
    if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
    const { x, y } = layoutHex(col, row, size);
    minX = Math.min(minX, x - size);
    maxX = Math.max(maxX, x + size);
    minY = Math.min(minY, y - vert);
    maxY = Math.max(maxY, y + vert);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const fitMap = (width, height) => {
  const sidePad = 156;
  const topPad = 118;
  const bottomPad = 36;
  const maxW = Math.max(width - sidePad * 2, 40);
  const maxH = Math.max(height - topPad - bottomPad, 40);
  let low = 2;
  let high = 48;
  let best = 2;
  for (let i = 0; i < 18; i += 1) {
    const mid = (low + high) / 2;
    const box = measureMapBox(mid);
    if (box.width <= maxW && box.height <= maxH) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  const box = measureMapBox(best);
  return {
    size: best,
    offsetX: (width - box.width) / 2 - box.minX,
    offsetY: topPad + (height - topPad - bottomPad - box.height) / 2 - box.minY,
  };
};

// 绘制地图内容
const drawHoneycomb = (width, height) => {
  const size = hexSize;
  const colStep = size * 1.5 + HEX_GAP;
  const rowStep = Math.sqrt(3) * size + HEX_GAP;
  const minCol = Math.floor((-mapOffsetX - size) / colStep) - 1;
  const maxCol = Math.ceil((width - mapOffsetX + size) / colStep) + 1;
  const minRow = Math.floor((-mapOffsetY - rowStep) / rowStep) - 2;
  const maxRow = Math.ceil((height - mapOffsetY + rowStep) / rowStep) + 2;

  ctx.lineJoin = "round";
  ctx.lineWidth = 1.25;
  for (let col = minCol; col <= maxCol; col += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const { x, y } = layoutHex(col, row, size);
      traceHex(x, y, size);
      ctx.fillStyle = HONEYCOMB;
      ctx.fill();
      ctx.strokeStyle = "#F7F8FA";
      ctx.stroke();
    }
  }
};

const drawBaseIcon = (x, y, size) => {
  const petal = Math.max(2.2, size * 0.22);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#E53935";
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    ctx.beginPath();
    ctx.ellipse(
      Math.cos(angle) * petal * 0.7,
      Math.sin(angle) * petal * 0.7,
      petal * 0.62,
      petal * 0.34,
      angle,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.3, size * 0.09), 0, Math.PI * 2);
  ctx.fillStyle = "#C62828";
  ctx.fill();
  ctx.restore();
};

const drawLegionCard = (x, y, legion) => {
  const detail = legionDetails.value[legion.id] || {};
  const alliance = detail.announcement
    ? allianceincludes(detail.announcement)
    : "未知联盟";
  const headerColor = allianceColors[alliance] || allianceColors["未知联盟"];
  const header = allianceTitle(alliance);
  const server =
    legion.serverId == null
      ? ""
      : `S${String(legion.serverId).replace(/^S/i, "")}`;
  const headerFont = "700 12px 'Microsoft YaHei', sans-serif";
  const titleFont = "600 13px 'Microsoft YaHei', sans-serif";
  const subFont = "500 12px 'Microsoft YaHei', sans-serif";
  const maxInner = 188;
  const title = fitText(
    server ? `${legion.name || ""} ${server}` : legion.name || "",
    maxInner,
    titleFont,
  );
  const red =
    detail.quenchNum !== undefined ? detail.quenchNum : legion.redCount || 0;
  const sub = `${formatPower(legion.power)} | 红粹:${red}`;

  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  ctx.font = subFont;
  const subW = ctx.measureText(sub).width;
  ctx.font = headerFont;
  const headerW = ctx.measureText(header).width;
  const cardW = Math.max(titleW, subW, headerW + 28, 132) + 20;
  const headerH = 24;
  const bodyH = 42;
  const cardH = headerH + bodyH;
  const vert = (Math.sqrt(3) / 2) * hexSize;
  const cardX = x - cardW / 2;
  let cardY = y - vert - cardH - 6;
  if (cardY + mapOffsetY < 40) cardY = y + vert + 8;

  const radius = 7;
  ctx.save();
  ctx.shadowColor = "rgba(20, 24, 40, 0.16)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.fillStyle = headerColor;
  ctx.fill();
  ctx.restore();

  const bodyTop = cardY + headerH;
  ctx.beginPath();
  ctx.moveTo(cardX, bodyTop);
  ctx.lineTo(cardX + cardW, bodyTop);
  ctx.lineTo(cardX + cardW, cardY + cardH - radius);
  ctx.arcTo(cardX + cardW, cardY + cardH, cardX, cardY + cardH, radius);
  ctx.arcTo(cardX, cardY + cardH, cardX, bodyTop, radius);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  drawText(x, cardY + headerH / 2, header, "#ffffff", headerFont);
  drawText(x, cardY + headerH + 14, title, "#2b2b2b", titleFont);
  drawText(x, cardY + headerH + 31, sub, "#8b919a", subFont);
};

const drawUpdateLabel = () => {
  if (!validData.value) return;
  const clock = lastUpdateTime.value || getCurrentTimeByFormat("HH:mm:ss");
  const text = `数据更新时间：${getCurrentTimeByFormat("yyyy-MM-dd")} ${clock}`;
  const font = "13px 'Microsoft YaHei', sans-serif";
  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.font = font;
  const textW = ctx.measureText(text).width;
  roundRect(12, 10, textW + 16, 26, 6);
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.fill();
  ctx.fillStyle = "#8b919a";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 20, 23);
  ctx.restore();
};

const drawCanvasContent = (width, height) => {
  if (!ctx || width <= 0 || height <= 0) return;

  const fitted = fitMap(width, height);
  hexSize = fitted.size;
  mapOffsetX = fitted.offsetX;
  mapOffsetY = fitted.offsetY;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const graph = HexGraph.getInstance();
  graph.removeAllNode();
  graph.addNodeList(
    roadPointList.map((item) => {
      const realTimeNode = validData.value?.buildingData?.[item.id];
      const type = realTimeNode?.type || item.type;
      const belongsLegionId = realTimeNode ? realTimeNode.belongsLegionId : -1;
      return {
        id: item.id,
        type,
        belongsLegionId,
        hP: realTimeNode ? realTimeNode.hP : 0,
        maxHP: realTimeNode ? realTimeNode.maxHP : 0,
        point: realTimeNode ? realTimeNode.point : 0,
        belongsLegionInfo: validData.value?.legionInfo?.[belongsLegionId],
      };
    }),
  );

  ctx.save();
  ctx.translate(mapOffsetX, mapOffsetY);
  drawHoneycomb(width, height);

  const labelFont = `700 ${Math.max(11, Math.round(hexSize * 0.62))}px 'Microsoft YaHei', sans-serif`;
  graph.getAllNodes().forEach((node) => {
    const [col, row] = node.id
      .split("_")
      .map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;
    if (node.type !== 6 && CORE_AROUND.has(node.id)) return;

    const color = TILE_COLORS[node.type];
    if (!color) return;

    const { x, y } = layoutHex(col, row, hexSize);
    traceHex(x, y, hexSize);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    if (node.type === 4) {
      drawBaseIcon(x, y, hexSize);
      return;
    }
    const label = TILE_LABELS[node.type];
    if (label) {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
      ctx.shadowBlur = 2;
      drawText(x, y, label, "#ffffff", labelFont);
      ctx.restore();
    }
  });

  if (validData.value?.legionInfo) {
    Object.values(validData.value.legionInfo)
      .filter((legion) => legion.strongholdId)
      .sort((a, b) => {
        const rowA = Number(a.strongholdId.split("_")[1]) || 0;
        const rowB = Number(b.strongholdId.split("_")[1]) || 0;
        return rowA - rowB;
      })
      .forEach((legion) => {
        const [col, row] = legion.strongholdId
          .split("_")
          .map((part) => Number.parseInt(part, 10));
        if (!Number.isFinite(col) || !Number.isFinite(row)) return;
        const { x, y } = layoutHex(col, row, hexSize);
        drawLegionCard(x, y, legion);
      });
  }
  ctx.restore();
  drawUpdateLabel();
};

const resizeAndRedraw = () => {
  if (!legionWarMapDom.value || !ctx) return;
  const canvas = legionWarMapDom.value;
  const container = canvas.parentElement;
  if (!container) return;

  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  if (w <= 0 || h <= 0) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawCanvasContent(w, h);
};

const toggleBattlefieldEntry = async () => {
  if (isEntireBattlefield.value) {
    legionWarStore.disconnect(true); // 强制断开
  } else {
    try {
      await legionWarStore.connect();
    } catch (error) {
      message.error(error.message);
    }
  }
};

const refreshData = () => {
  try {
    legionWarStore.refreshData();
    message.success("已发送刷新请求");
  } catch (error) {
    message.warning(error.message);
  }
};

const initializeCanvas = async () => {
  await nextTick();
  const canvas = legionWarMapDom.value;
  if (!canvas) return false;

  const context = canvas.getContext("2d");
  if (!context) return false;
  ctx = context;

  if (!resizeHandler) {
    resizeHandler = () => resizeAndRedraw();
    window.addEventListener("resize", resizeHandler);
  }
  if (!resizeObserver && canvas.parentElement) {
    resizeObserver = new ResizeObserver(() => resizeAndRedraw());
    resizeObserver.observe(canvas.parentElement);
  }

  resizeAndRedraw();
  return true;
};

// 生命周期钩子
onMounted(async () => {
  await initializeCanvas();

  try {
    legionWarStore.connect().catch((e) => {
      console.error("Auto connect failed", e);
    });
  } catch (e) {}
});

watch(isAccessible, async (accessible) => {
  if (accessible) {
    await initializeCanvas();
  }
});

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  legionWarStore.disconnect();
});
</script>

<style scoped lang="scss">
.legion-war-map-container {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;

  .legion-war-map-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    background: #fff;
    border-radius: 8px;
    box-shadow:
      0 1px 2px -2px rgba(0, 0, 0, 0.08),
      0 3px 6px 0 rgba(0, 0, 0, 0.06),
      0 5px 12px 4px rgba(0, 0, 0, 0.04);

    .access-denied-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 600px; /* 给个固定高度或者 min-height */
      padding: 40px;
    }

    .access-denied-info {
      margin-top: 16px;
      text-align: left;
      color: #666;

      p {
        margin: 4px 0;
      }
    }

    .header-section {
      flex: none;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #eee;
      flex-wrap: wrap;
      gap: 12px;

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;

        .header-icon {
          width: 40px;
          height: 40px;
        }

        .header-title {
          h2 {
            margin: 0;
            font-size: 18px;
            color: #333;
          }
          p {
            margin: 4px 0 0;
            font-size: 12px;
            color: #999;
          }
        }
      }

      .stats-section {
        display: flex;
        gap: 16px;
        align-items: center;

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;

          .stat-label {
            font-size: 13px;
            color: #666;
          }
        }
      }
    }

    .main-content-layout {
      position: relative;
      display: flex;
      flex: 1;
      width: 100%;
      height: auto;
      min-height: 0;
      overflow: hidden;

      .map-container-wrapper {
        flex: 1;
        height: auto;
        min-width: 0;
        min-height: 0;
        position: relative;
        background-color: #fff;
        overflow: hidden;

        .map-container {
          width: 100%;
          height: 100%;
          min-height: 0;

          .mapCanvas {
            width: 100%;
            height: 100%;
            display: block;
          }
        }

        .empty-state-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: rgba(255, 255, 255, 0.8);
          z-index: 10;

          .empty-content {
            text-align: center;
            color: #999;

            p {
              margin-top: 12px;
            }
          }
        }
      }

      .side-info-panel {
        width: 280px;
        height: 100%;
        flex: none;
        background: #fff;
        border-left: 1px solid #eee;
        display: flex;
        flex-direction: column;
        z-index: 20;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.05);

        .panel-header {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: #f9f9f9;

          h3 {
            margin: 0;
            font-size: 16px;
            color: #333;
          }
        }

        .legion-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;

          .legion-item {
            display: flex;
            align-items: center;
            padding: 2px 4px; /* 进一步减小内边距 */
            margin-bottom: 2px; /* 进一步减小外边距 */
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 4px solid transparent;
            transition: all 0.2s;
            height: 32px; /* 进一步减小固定高度 */

            &:hover {
              background: #f0f0f0;
              transform: translateX(2px);
            }

            .rank-badge {
              width: 18px;
              height: 18px;
              background: #e0e0e0;
              color: #666;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              margin-right: 6px;
              flex-shrink: 0;
            }

            .legion-info {
              flex: 1;
              overflow: hidden;
              display: flex; /* 改为 flex 布局 */
              align-items: center; /* 垂直居中 */
              justify-content: space-between; /* 两端对齐 */

              .legion-name {
                font-size: 13px; /* 缩小字体 */
                color: #333;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 0; /* 移除底部边距 */
                margin-right: 8px; /* 添加右侧间距 */
                flex: 1; /* 占据剩余空间 */

                .legion-id {
                  color: #999;
                  font-size: 11px;
                  margin-right: 4px;
                  font-weight: normal;
                }
              }

              .legion-stats {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                flex-shrink: 0; /* 防止被压缩 */

                .stat-red {
                  color: #d03050;
                  background: rgba(208, 48, 80, 0.1);
                  padding: 1px 4px; /* 减小内边距 */
                  border-radius: 3px;
                }
              }
            }
          }

          .alliance-group {
            margin-bottom: 4px; /* 进一步减小分组间距 */

            .group-header {
              display: flex;
              align-items: center;
              padding: 2px 4px; /* 进一步减小标题内边距 */
              margin-bottom: 2px;

              .group-name {
                font-weight: bold;
                font-size: 13px; /* 缩小字体 */
                color: #333;
                margin-right: 6px;
              }

              .group-count {
                font-size: 11px;
                color: #999;
              }
            }
          }
        }
      }
    }
  }
}

// 响应式调整
@media (max-width: 900px) {
  .legion-war-map-container .legion-war-map-card .main-content-layout {
    flex-direction: column;
  }

  .legion-war-map-container .legion-war-map-card .side-info-panel {
    width: 100%;
    height: 168px;
    border-left: 0;
    border-top: 1px solid #eee;
    box-shadow: none;
  }
}
</style>
