<template>
  <div class="cloud-lineup">
    <header class="page-head">
      <h2>云端阵容</h2>
      <button
        type="button"
        class="save-current"
        :disabled="saving || syncingId !== ''"
        @click="saveCurrent"
      >
        {{ saving ? "保存中" : "保存当前" }}
      </button>
    </header>

    <div v-if="syncingId" class="progress-panel">
      <div class="progress-label">{{ progress.label }}</div>
      <n-progress
        type="line"
        :percentage="progress.percent"
        :height="10"
        :show-indicator="false"
        :border-radius="999"
        color="#5b6ee1"
        rail-color="#e6e9f5"
      />
      <div class="progress-percent">{{ progress.percent }}%</div>
    </div>

    <div v-if="lineups.length === 0" class="empty">
      还没有阵容。连接账号后点「保存当前」，会把正在用的这套武将存下来。
    </div>

    <article v-for="(lineup, index) in lineups" :key="lineup.id" class="lineup-card">
      <div class="card-top">
        <span class="index-badge">#{{ index + 1 }}</span>
        <h3>{{ lineup.name }}</h3>
        <button type="button" class="rename" :disabled="busy" @click="rename(lineup)">
          修改名称
        </button>
      </div>

      <div class="formation">
        <button
          type="button"
          class="pet"
          :title="petName(lineup.petId)"
          @click="editPet(lineup)"
        >
          <img v-if="petIcon(lineup.petId)" :src="petIcon(lineup.petId)" :alt="petName(lineup.petId)" />
          <span v-else>无</span>
        </button>
        <div class="heroes">
          <div
            v-for="cell in lineupSlots(lineup.heroes)"
            :key="cell.slot"
            class="hero"
          >
            <div class="avatar-wrap">
              <span class="slot-label">{{ cell.label }}</span>
              <img
                v-if="cell.hero && heroAvatar(cell.hero.heroId)"
                :src="heroAvatar(cell.hero.heroId)"
                :alt="heroName(cell.hero.heroId)"
              />
              <div v-else class="avatar-empty">{{ cell.hero ? heroName(cell.hero.heroId).slice(0, 1) : "" }}</div>
              <span v-if="cell.hero" class="level">{{ cell.hero.level || 0 }}</span>
            </div>
            <div class="hero-name">{{ cell.hero ? heroName(cell.hero.heroId) : "空位" }}</div>
            <div v-if="cell.hero" class="hero-meta">速:{{ cell.hero.speed || 0 }}</div>
            <div v-if="cell.hero" class="hero-meta">
              鱼珠:{{ cell.hero.skillName || "无" }}
            </div>
            <div v-if="cell.hero" class="quench">
              <span class="red">{{ cell.hero.redQuench || 0 }}红</span>
              <span class="orange">{{ cell.hero.orangeQuench || 0 }}橙</span>
            </div>
            <div v-if="cell.hero" class="dots">
              <i
                v-for="dot in quenchDots(cell.hero)"
                :key="dot.id"
                :class="dot.color"
              />
            </div>
          </div>
        </div>
        <span class="team-tag">第{{ lineup.teamId }}阵容</span>
      </div>

      <div class="card-actions">
        <button type="button" :disabled="busy" @click="remove(lineup)">删除</button>
        <button type="button" :disabled="busy" @click="editPet(lineup)">修改宠物</button>
        <button
          type="button"
          class="sync"
          :disabled="busy"
          @click="sync(lineup)"
        >
          {{ syncingId === lineup.id ? "同步中" : "同步" }}
        </button>
      </div>
    </article>

    <n-modal
      v-model:show="petVisible"
      preset="card"
      title="修改宠物"
      style="width: 520px; max-width: 92vw"
    >
      <div class="pet-grid">
        <button
          v-for="item in petOptions"
          :key="item.id"
          type="button"
          class="pet-option"
          :class="{ active: editingPetId === item.id }"
          @click="choosePet(item.id)"
        >
          <img :src="item.icon" :alt="item.name" />
          <span :style="{ color: item.color }">{{ item.name }}</span>
        </button>
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { NInput, NModal, NProgress, useDialog, useMessage } from "naive-ui";
import { computed, h, onMounted, ref, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { HERO_DICT } from "@/utils/HeroList.js";
import { getPetQuality, PET_DICT } from "@/utils/PetList.js";
import {
  applyCloudLineup,
  buildCloudLineup,
  lineupSlots,
  loadCloudLineups,
  saveCloudLineups,
} from "@/utils/lineup/cloudLineup.js";

const tokenStore = useTokenStore();
const message = useMessage();
const dialog = useDialog();

const lineups = ref([]);
const roleId = ref("");
const saving = ref(false);
const syncingId = ref("");
const progress = ref({ label: "准备同步", percent: 0 });
const petVisible = ref(false);
const editingLineupId = ref("");
const editingPetId = ref(null);

const busy = computed(() => saving.value || syncingId.value !== "");
const petOptions = computed(() =>
  Object.entries(PET_DICT).map(([id, pet]) => ({
    id: Number(id),
    name: pet.name,
    icon: pet.icon,
    color: getPetQuality(id).color,
  })),
);

const heroName = (heroId) => HERO_DICT[Number(heroId)]?.name || `武将${heroId}`;
const heroAvatar = (heroId) => {
  const avatar = HERO_DICT[Number(heroId)]?.avatar;
  if (!avatar) return "";
  return import.meta.env.BASE_URL + avatar.replace(/^\//, "");
};
const petName = (petId) => PET_DICT[Number(petId)]?.name || "未设置宠物";
const petIcon = (petId) => PET_DICT[Number(petId)]?.icon || "";
const quenchDots = (hero) => {
  const dots = [];
  for (let i = 0; i < Math.min(hero.redQuench || 0, 4); i += 1) {
    dots.push({ id: `r${i}`, color: "red" });
  }
  for (let i = 0; i < Math.min(hero.orangeQuench || 0, 4); i += 1) {
    if (dots.length >= 4) break;
    dots.push({ id: `o${i}`, color: "orange" });
  }
  return dots;
};

const persist = () => {
  if (!roleId.value) return;
  saveCloudLineups(roleId.value, lineups.value);
};

const loadForRole = (nextRoleId) => {
  roleId.value = nextRoleId ? String(nextRoleId) : "";
  lineups.value = loadCloudLineups(roleId.value);
};

const ensureConnected = () => {
  const token = tokenStore.selectedToken;
  if (!token) {
    message.warning("请先选择Token");
    return null;
  }
  if (tokenStore.getWebSocketStatus(token.id) !== "connected") {
    message.error("WebSocket未连接");
    return null;
  }
  return token;
};

const readCurrent = async (tokenId) => {
  const preset = await tokenStore.sendMessageWithPromise(tokenId, "presetteam_getinfo", {}, 10000);
  const roleInfo = await tokenStore.sendMessageWithPromise(tokenId, "role_getroleinfo", {}, 10000);
  const raw = roleInfo?.role || roleInfo || {};
  const role = {
    ...raw,
    pet: raw.pet || roleInfo?.showPet || null,
    showPet: roleInfo?.showPet || raw.showPet || null,
  };
  return { preset, role };
};

const saveCurrent = async () => {
  const token = ensureConnected();
  if (!token || saving.value) return;
  saving.value = true;
  try {
    const { preset, role } = await readCurrent(token.id);
    const nextRoleId = String(role.roleId || role.id || token.id);
    if (nextRoleId !== roleId.value) loadForRole(nextRoleId);
    const lineup = buildCloudLineup({
      role,
      preset,
      name: `阵容${lineups.value.length + 1}`,
    });
    lineup.roleId = roleId.value;
    lineups.value = [lineup, ...lineups.value];
    persist();
    message.success("已保存当前阵容，可以再改名称");
    rename(lineup);
  } catch (error) {
    message.error(`保存失败：${error?.message || "未知错误"}`);
  } finally {
    saving.value = false;
  }
};

const rename = (lineup) => {
  const name = ref(lineup.name);
  dialog.create({
    title: "修改名称",
    content: () =>
      h(NInput, {
        value: name.value,
        placeholder: "阵容名称",
        onUpdateValue: (value) => {
          name.value = value;
        },
      }),
    positiveText: "保存",
    negativeText: "取消",
    onPositiveClick: () => {
      const next = name.value.trim();
      if (!next) {
        message.warning("名称不能为空");
        return false;
      }
      lineup.name = next;
      lineups.value = [...lineups.value];
      persist();
    },
  });
};

const remove = (lineup) => {
  dialog.warning({
    title: "删除阵容",
    content: `删除「${lineup.name}」？游戏里的当前阵容不会变。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: () => {
      lineups.value = lineups.value.filter((item) => item.id !== lineup.id);
      persist();
    },
  });
};

const editPet = (lineup) => {
  editingLineupId.value = lineup.id;
  editingPetId.value = lineup.petId ?? null;
  petVisible.value = true;
};

const choosePet = (petId) => {
  const lineup = lineups.value.find((item) => item.id === editingLineupId.value);
  if (!lineup) return;
  lineup.petId = petId;
  lineup.petUId = null;
  lineups.value = [...lineups.value];
  persist();
  petVisible.value = false;
  message.success("已改到这份阵容，点同步后才会写进游戏");
};

const sync = async (lineup) => {
  const token = ensureConnected();
  if (!token || syncingId.value) return;
  syncingId.value = lineup.id;
  progress.value = { label: "准备同步", percent: 0 };
  try {
    const errors = await applyCloudLineup(tokenStore, token.id, lineup, (next) => {
      progress.value = next;
    });
    if (errors.length) {
      message.warning(`同步结束，${errors.length} 步失败：${errors.slice(0, 3).join("；")}`);
    } else {
      message.success(`「${lineup.name}」已同步到当前阵容`);
    }
  } catch (error) {
    message.error(`同步失败：${error?.message || "未知错误"}`);
  } finally {
    syncingId.value = "";
  }
};

onMounted(async () => {
  const token = tokenStore.selectedToken;
  if (!token) return;
  const cachedRoleId = tokenStore.gameData?.roleInfo?.role?.roleId || tokenStore.gameData?.roleInfo?.roleId;
  if (cachedRoleId) loadForRole(cachedRoleId);
  if (tokenStore.getWebSocketStatus(token.id) !== "connected") return;
  try {
    const { role } = await readCurrent(token.id);
    loadForRole(role.roleId || role.id || cachedRoleId || token.id);
  } catch {
    if (!roleId.value) loadForRole(token.id);
  }
});

watch(
  () => tokenStore.selectedToken?.id,
  () => {
    lineups.value = [];
    roleId.value = "";
    const token = tokenStore.selectedToken;
    if (!token) return;
    if (tokenStore.getWebSocketStatus(token.id) === "connected") {
      readCurrent(token.id)
        .then(({ role }) => loadForRole(role.roleId || role.id || token.id))
        .catch(() => loadForRole(token.id));
    }
  },
);
</script>

<style scoped lang="scss">
.cloud-lineup {
  max-width: 520px;
  margin: 0 auto;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  h2 {
    margin: 0;
    font-size: 18px;
  }
}

.save-current,
.rename,
.pet,
.card-actions button,
.pet-option {
  border: 0;
  cursor: pointer;
}

.save-current,
.rename {
  border-radius: 8px;
  background: #6d5bd0;
  color: #fff;
  font-size: 13px;
}

.save-current {
  padding: 8px 12px;
}

.rename {
  margin-left: auto;
  padding: 6px 10px;
}

.save-current:disabled,
.card-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.progress-panel {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--bg-primary);
}

.progress-label,
.progress-percent {
  color: var(--text-secondary);
  font-size: 13px;
}

.progress-label {
  margin-bottom: 8px;
}

.progress-percent {
  margin-top: 6px;
  text-align: right;
}

.empty {
  padding: 28px 16px;
  border-radius: 16px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  line-height: 1.6;
}

.lineup-card {
  margin-bottom: 14px;
  padding: 14px 12px 10px;
  border-radius: 18px;
  background: var(--bg-primary);
  box-shadow: var(--shadow-light);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 18px;
  }
}

.index-badge {
  padding: 2px 6px;
  border-radius: 6px;
  background: #5b6ee1;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.formation {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 8px;
  align-items: start;
}

.pet {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  padding: 4px;
  border-radius: 12px;
  background: #f3efe4;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.heroes {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
}

.hero {
  min-width: 0;
  text-align: center;
}

.avatar-wrap {
  position: relative;
  height: 58px;
  overflow: hidden;
  border: 2px solid #e2b15a;
  border-radius: 10px;
  background: #2b241c;

  img,
  .avatar-empty {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.avatar-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
}

.slot-label,
.level {
  position: absolute;
  z-index: 1;
  color: #fff;
  font-size: 10px;
  line-height: 1;
}

.slot-label {
  top: 3px;
  left: 3px;
  padding: 1px 3px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.45);
}

.level {
  right: 3px;
  bottom: 3px;
  left: 3px;
  font-weight: 700;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.hero-name {
  margin-top: 4px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-meta,
.quench {
  font-size: 10px;
  line-height: 1.35;
  color: var(--text-secondary);
}

.quench .red {
  color: #e23b3b;
}

.quench .orange {
  margin-left: 2px;
  color: #f08a24;
}

.dots {
  display: flex;
  justify-content: center;
  gap: 3px;
  min-height: 8px;
  margin-top: 2px;

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .red {
    background: #e23b3b;
  }

  .orange {
    background: #f0b429;
  }
}

.team-tag {
  justify-self: end;
  padding: 2px 6px;
  border: 1px solid #7aa2ff;
  border-radius: 6px;
  color: #5b6ee1;
  font-size: 11px;
  white-space: nowrap;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  margin-top: 10px;
  padding-top: 8px;

  button {
    background: transparent;
    color: #6b6258;
    font-size: 14px;
  }

  .sync {
    color: #333;
    font-weight: 700;
  }
}

.pet-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  max-height: 60vh;
  overflow: auto;
}

.pet-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: inherit;

  img {
    width: 48px;
    height: 48px;
    object-fit: contain;
  }

  span {
    font-size: 12px;
  }

  &.active {
    border-color: #6d5bd0;
    background: #f3f0ff;
  }
}
</style>
