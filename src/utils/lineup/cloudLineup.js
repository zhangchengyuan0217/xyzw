import {
  LEGION_TECH_MAX_LEVEL,
  LEGION_TECH_NAME,
  LEGION_TECH_RESET_TYPE_MAP,
  LEGION_TECH_TYPE_MAP,
  PearlMap,
} from "@/utils/HeroList.js";

const COMMAND_DELAY = 500;

const LEVEL_ORDER_THRESHOLDS = [
  { level: 100, order: 1 },
  { level: 200, order: 2 },
  { level: 300, order: 3 },
  { level: 500, order: 4 },
  { level: 700, order: 5 },
  { level: 900, order: 6 },
  { level: 1100, order: 7 },
  { level: 1300, order: 8 },
  { level: 1500, order: 9 },
  { level: 1800, order: 10 },
  { level: 2100, order: 11 },
  { level: 2400, order: 12 },
  { level: 2800, order: 13 },
  { level: 3200, order: 14 },
  { level: 3600, order: 15 },
  { level: 4000, order: 16 },
  { level: 4500, order: 17 },
  { level: 5000, order: 18 },
  { level: 5500, order: 19 },
];

const UPGRADE_OPTIONS = [50, 10, 5, 1];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const storageKeyFor = (roleId) => `cloud_lineups_${roleId}`;

export const loadCloudLineups = (roleId) => {
  if (!roleId) return [];
  try {
    const raw = localStorage.getItem(storageKeyFor(roleId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const saveCloudLineups = (roleId, lineups) => {
  if (!roleId) return;
  localStorage.setItem(storageKeyFor(roleId), JSON.stringify(lineups));
};

const countQuench = (hero) => {
  let red = 0;
  let orange = 0;
  for (const part of Object.values(hero?.equipment || {})) {
    for (const item of Object.values(part?.quenches || {})) {
      const colorId = Number(item?.colorId);
      if (colorId === 6) red += 1;
      else if (colorId === 5) orange += 1;
    }
  }
  return { red, orange };
};

const teamNode = (preset, teamId) => {
  const root =
    preset?.presetTeamInfo?.presetTeamInfo || preset?.presetTeamInfo || {};
  return root[teamId] || root[String(teamId)] || {};
};

export const buildCloudLineup = ({ role, preset, name }) => {
  const useTeamId = Number(
    preset?.presetTeamInfo?.useTeamId ?? preset?.useTeamId ?? 1,
  );
  const team = teamNode(preset, useTeamId);
  const heroesMap = role?.heroes || {};
  const pearlMap = role?.pearlMap || {};
  const fishByArtifact = {};
  for (const [fishId, book] of Object.entries(role?.artifactBooks || {})) {
    if (book?.artifactId && book.artifactId !== -1) {
      fishByArtifact[book.artifactId] = Number(fishId);
    }
  }

  const heroes = Object.entries(team.teamInfo || {})
    .map(([key, hero]) => {
      const heroId = Number(hero?.heroId || hero?.id || 0);
      if (!heroId) return null;
      const slot = Number(hero?.battleTeamSlot ?? key);
      const owned = heroesMap[String(heroId)] || {};
      const artifactId =
        owned.artifactId && owned.artifactId !== -1
          ? owned.artifactId
          : hero?.artifactId || null;
      const pearlId = hero?.pearlId || owned.pearlId || null;
      const pearl = pearlId ? pearlMap[pearlId] || pearlMap[String(pearlId)] : null;
      const quench = countQuench(owned);
      return {
        slot,
        heroId,
        level: Number(hero?.level || owned.level || 0),
        speed: Number(owned.speed || hero?.speed || 0),
        attachmentUid: owned.attachmentUid || hero?.attachmentUid || null,
        fishId: artifactId ? fishByArtifact[artifactId] || null : null,
        pearlId: pearlId ? Number(pearlId) : null,
        skillId: pearl?.skillId || null,
        skillName: PearlMap[pearl?.skillId]?.name || "",
        redQuench: quench.red,
        orangeQuench: quench.orange,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.slot - b.slot);

  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name,
    roleId: String(role?.roleId || role?.id || ""),
    teamId: useTeamId || 1,
    savedAt: Date.now(),
    weaponId: team?.weapon?.weaponId ?? null,
    petId: Number(role?.pet?.petId || role?.showPet?.petId || 0) || null,
    petUId: role?.pet?.petUId || role?.pet?.petUid || null,
    legionResearch: { ...(role?.legionResearch || {}) },
    heroes,
  };
};

export const lineupSlots = (heroes = []) => {
  const bySlot = new Map(heroes.map((hero) => [Number(hero.slot), hero]));
  const zeroBased = heroes.length === 0 || heroes.some((hero) => hero.slot === 0);
  const order = zeroBased ? [4, 3, 2, 1, 0] : [5, 4, 3, 2, 1];
  const labels = zeroBased
    ? { 0: "前1", 1: "前2", 2: "后1", 3: "后2", 4: "后3" }
    : { 1: "前1", 2: "前2", 3: "后1", 4: "后2", 5: "后3" };
  return order.map((slot) => ({
    slot,
    label: labels[slot] || `位${slot}`,
    hero: bySlot.get(slot) || null,
  }));
};

const getOrder = (level) => {
  let order = 0;
  for (const threshold of LEVEL_ORDER_THRESHOLDS) {
    if (level >= threshold.level) order = threshold.order;
    else break;
  }
  return order;
};

const getNextOrderLevel = (currentLevel) => {
  for (const threshold of LEVEL_ORDER_THRESHOLDS) {
    if (currentLevel < threshold.level) return threshold.level;
  }
  return null;
};

const createReporter = (onProgress) => {
  let completed = 0;
  let total = 6;
  const publish = (label) => {
    if (completed + 1 >= total) total = completed + 2;
    onProgress?.({
      label,
      percent: Math.min(99, Math.round((completed / total) * 100)),
    });
  };
  return {
    async run(label, task) {
      publish(label);
      const result = await task();
      completed += 1;
      publish(label);
      return result;
    },
    done(label) {
      onProgress?.({ label, percent: 100 });
    },
  };
};

const sendCmd = async (tokenStore, tokenId, cmd, params, errors, label) => {
  try {
    const result = await tokenStore.sendMessageWithPromise(
      tokenId,
      cmd,
      params || {},
      12000,
    );
    await delay(COMMAND_DELAY);
    return result;
  } catch (error) {
    errors.push(`${label}：${error?.message || "失败"}`);
    await delay(COMMAND_DELAY);
    return null;
  }
};

const readRole = async (tokenStore, tokenId, errors) => {
  const roleInfo = await sendCmd(
    tokenStore,
    tokenId,
    "role_getroleinfo",
    {},
    errors,
    "读取角色",
  );
  return roleInfo?.role || roleInfo || {};
};

const readTeam = async (tokenStore, tokenId, errors, teamId) => {
  const preset = await sendCmd(
    tokenStore,
    tokenId,
    "presetteam_getinfo",
    {},
    errors,
    "读取阵容",
  );
  const useTeamId = Number(
    preset?.presetTeamInfo?.useTeamId ?? preset?.useTeamId ?? teamId ?? 1,
  );
  const team = teamNode(preset, useTeamId);
  return { useTeamId, teamInfo: team?.teamInfo || {}, weaponId: team?.weapon?.weaponId ?? null };
};

const teamHeroes = (teamInfo) =>
  Object.entries(teamInfo || {})
    .map(([key, hero]) => ({
      slot: Number(hero?.battleTeamSlot ?? key),
      heroId: Number(hero?.heroId || hero?.id || 0),
    }))
    .filter((hero) => hero.heroId);

const syncFormation = async (tokenStore, tokenId, lineup, errors, progress) => {
  const targetHeroes = [...(lineup.heroes || [])];
  let role = await readRole(tokenStore, tokenId, errors);
  let current = await readTeam(tokenStore, tokenId, errors);
  let deployed = teamHeroes(current.teamInfo);

  const refresh = async () => {
    role = await readRole(tokenStore, tokenId, errors);
    current = await readTeam(tokenStore, tokenId, errors, current.useTeamId);
    deployed = teamHeroes(current.teamInfo);
  };

  for (const target of targetHeroes) {
    if (!target.attachmentUid || target.attachmentUid === -1) continue;
    const holderId = Number(
      Object.entries(role.heroes || {}).find(
        ([, hero]) => hero?.attachmentUid === target.attachmentUid,
      )?.[0] || 0,
    );
    if (!holderId || holderId === target.heroId) continue;
    await progress.run(`交换玩具到目标武将`, () =>
      sendCmd(
        tokenStore,
        tokenId,
        "hero_exchange",
        { heroId: holderId, targetHeroId: target.heroId },
        errors,
        "交换玩具",
      ),
    );
  }
  await refresh();

  const targetIds = new Set(targetHeroes.map((hero) => hero.heroId));
  for (const hero of [...deployed]) {
    if (targetIds.has(hero.heroId)) continue;
    await progress.run(`下阵站位 ${hero.slot}`, () =>
      sendCmd(
        tokenStore,
        tokenId,
        "hero_gobackbattle",
        { slot: hero.slot },
        errors,
        "下阵",
      ),
    );
  }
  await refresh();

  for (const target of targetHeroes) {
    const currentHero = deployed.find((hero) => hero.heroId === target.heroId);
    if (!currentHero) {
      await progress.run(`上阵到站位 ${target.slot}`, () =>
        sendCmd(
          tokenStore,
          tokenId,
          "hero_gointobattle",
          { heroId: target.heroId, slot: target.slot },
          errors,
          "上阵",
        ),
      );
    } else if (currentHero.slot !== target.slot) {
      await progress.run(`调整站位 ${currentHero.slot} → ${target.slot}`, async () => {
        await sendCmd(
          tokenStore,
          tokenId,
          "hero_gobackbattle",
          { slot: currentHero.slot },
          errors,
          "调整站位",
        );
        await sendCmd(
          tokenStore,
          tokenId,
          "hero_gointobattle",
          { heroId: target.heroId, slot: target.slot },
          errors,
          "调整站位",
        );
      });
    }
    await refresh();
  }
};

const syncLevels = async (tokenStore, tokenId, lineup, errors, progress) => {
  const role = await readRole(tokenStore, tokenId, errors);
  const heroes = role.heroes || {};
  for (const target of lineup.heroes || []) {
    if (!target.level || target.level <= 0) continue;
    const owned = heroes[String(target.heroId)] || {};
    let level = Number(owned.level || 1);
    let order = Number(owned.order || 0);
    if (level === target.level) continue;

    if (level > target.level) {
      await progress.run(`重生武将 ${target.heroId}`, async () => {
        await sendCmd(
          tokenStore,
          tokenId,
          "hero_gobackbattle",
          { slot: target.slot },
          errors,
          "重生前下阵",
        );
        const result = await sendCmd(
          tokenStore,
          tokenId,
          "hero_rebirth",
          { heroId: target.heroId },
          errors,
          "重生",
        );
        const reborn = result?.role?.heroes?.[String(target.heroId)];
        level = Number(reborn?.level ?? 1);
        order = Number(reborn?.order ?? 0);
        await sendCmd(
          tokenStore,
          tokenId,
          "hero_gointobattle",
          { heroId: target.heroId, slot: target.slot },
          errors,
          "重生后上阵",
        );
      });
    }

    const expectedOrder = getOrder(level);
    if (order < expectedOrder) {
      await progress.run(`武将进阶`, async () => {
        const result = await sendCmd(
          tokenStore,
          tokenId,
          "hero_heroupgradeorder",
          { heroId: target.heroId },
          errors,
          "进阶",
        );
        order = Number(result?.role?.heroes?.[target.heroId]?.order ?? expectedOrder);
      });
    }

    while (level < target.level) {
      const nextOrderLevel = getNextOrderLevel(level);
      const stepLimit = Math.min(
        nextOrderLevel ? nextOrderLevel - level : target.level - level,
        target.level - level,
      );
      const upgradeNum = UPGRADE_OPTIONS.find((num) => num <= stepLimit) || 1;
      await progress.run(`升级到 ${level + upgradeNum}`, async () => {
        const result = await sendCmd(
          tokenStore,
          tokenId,
          "hero_heroupgradelevel",
          { heroId: target.heroId, upgradeNum },
          errors,
          "升级",
        );
        if (result) level += upgradeNum;
        else level = target.level;
      });
      if (!nextOrderLevel || level < nextOrderLevel) continue;
      await progress.run(`武将进阶`, () =>
        sendCmd(
          tokenStore,
          tokenId,
          "hero_heroupgradeorder",
          { heroId: target.heroId },
          errors,
          "进阶",
        ),
      );
    }
  }
};

const syncFishAndPearls = async (tokenStore, tokenId, lineup, errors, progress) => {
  const role = await readRole(tokenStore, tokenId, errors);
  const heroes = role.heroes || {};
  const pearlMap = role.pearlMap || {};
  const fishToArtifact = {};
  for (const [fishId, book] of Object.entries(role.artifactBooks || {})) {
    if (book?.artifactId && book.artifactId !== -1) {
      fishToArtifact[Number(fishId)] = book.artifactId;
    }
  }
  const artifactToHero = {};
  for (const [heroId, hero] of Object.entries(heroes)) {
    if (hero?.artifactId && hero.artifactId !== -1) {
      artifactToHero[hero.artifactId] = Number(heroId);
    }
  }

  for (const target of lineup.heroes || []) {
    if (!target.fishId && !target.pearlId) continue;
    let artifactId = target.fishId ? fishToArtifact[target.fishId] : null;
    if (!artifactId && target.pearlId) {
      const pearl = pearlMap[target.pearlId] || pearlMap[String(target.pearlId)];
      if (pearl?.artifactId && pearl.artifactId !== -1) artifactId = pearl.artifactId;
    }
    if (!artifactId) continue;
    const holderId = artifactToHero[artifactId];
    if (holderId === target.heroId) continue;
    await progress.run(`同步鱼灵`, async () => {
      if (holderId) {
        await sendCmd(
          tokenStore,
          tokenId,
          "artifact_unload",
          { heroId: holderId },
          errors,
          "卸下鱼灵",
        );
      }
      await sendCmd(
        tokenStore,
        tokenId,
        "artifact_load",
        {
          heroId: target.heroId,
          itemId: artifactId,
          pearlId: target.pearlId || 0,
        },
        errors,
        "装备鱼灵",
      );
    });
  }

  const latest = await readRole(tokenStore, tokenId, errors);
  const latestPearls = latest.pearlMap || {};
  const handled = new Set();
  for (const target of lineup.heroes || []) {
    if (!target.pearlId || handled.has(target.pearlId)) continue;
    const currentSkill = latestPearls[target.pearlId]?.skillId || latestPearls[String(target.pearlId)]?.skillId || null;
    if (!target.skillId) {
      if (currentSkill) {
        await progress.run(`卸下鱼珠技能`, () =>
          sendCmd(
            tokenStore,
            tokenId,
            "pearl_unloadskill",
            { pearlId: target.pearlId },
            errors,
            "卸下鱼珠",
          ),
        );
      }
      handled.add(target.pearlId);
      continue;
    }
    if (currentSkill === target.skillId) {
      handled.add(target.pearlId);
      continue;
    }
    const holderPearlId = Object.keys(latestPearls).find((pearlId) => {
      if (Number(pearlId) === Number(target.pearlId)) return false;
      return latestPearls[pearlId]?.skillId === target.skillId;
    });
    await progress.run(`切换鱼珠 ${target.skillName || ""}`.trim(), () =>
      holderPearlId
        ? sendCmd(
            tokenStore,
            tokenId,
            "pearl_exchangeskill",
            { pearlId1: target.pearlId, pearlId2: Number(holderPearlId) },
            errors,
            "交换鱼珠",
          )
        : sendCmd(
            tokenStore,
            tokenId,
            "pearl_replaceskill",
            { pearlId: target.pearlId, skillId: target.skillId },
            errors,
            "替换鱼珠",
          ),
    );
    handled.add(target.pearlId);
    if (holderPearlId) handled.add(Number(holderPearlId));
  }
};

const findOwnedPet = (role, petId) => {
  const bags = [role?.petList, role?.pets, role?.petMap, role?.petBag, role?.petStore];
  for (const bag of bags) {
    if (!bag) continue;
    const items = Array.isArray(bag) ? bag : Object.values(bag);
    const matched = items.find((item) => Number(item?.petId || item?.id) === Number(petId));
    if (matched) return matched;
  }
  if (Number(role?.pet?.petId) === Number(petId)) return role.pet;
  return null;
};

const syncPet = async (tokenStore, tokenId, lineup, errors, progress) => {
  if (!lineup.petId) return;
  const payload = await sendCmd(tokenStore, tokenId, "role_getroleinfo", {}, errors, "读取宠物");
  const role = payload?.role || payload || {};
  const currentPetId = Number(role.pet?.petId || payload?.showPet?.petId || 0);
  if (currentPetId === Number(lineup.petId)) return;
  const owned = findOwnedPet(role, lineup.petId);
  const petUId = owned?.petUId || owned?.petUid || lineup.petUId || "";
  await progress.run("切换宠物", () =>
    sendCmd(
      tokenStore,
      tokenId,
      "pet_use",
      { petId: Number(lineup.petId), petUId },
      errors,
      "切换宠物",
    ),
  );
};

const syncWeapon = async (tokenStore, tokenId, lineup, errors, progress) => {
  if (lineup.weaponId === undefined || lineup.weaponId === null) return;
  const current = await readTeam(tokenStore, tokenId, errors);
  if (current.weaponId === lineup.weaponId) return;
  await progress.run("切换武器", () =>
    sendCmd(
      tokenStore,
      tokenId,
      "lordweapon_changedefaultweapon",
      { weaponId: lineup.weaponId },
      errors,
      "切换武器",
    ),
  );
};

const syncResearch = async (tokenStore, tokenId, lineup, errors, progress) => {
  const targetResearch = lineup.legionResearch || {};
  if (Object.keys(targetResearch).length === 0) return;
  const role = await readRole(tokenStore, tokenId, errors);
  const currentResearch = role.legionResearch || {};
  const typesToReset = new Set();
  const typesToRebuild = new Set();

  for (const type of [1, 2, 3, 4, 5, 6]) {
    const changed = (ids) =>
      ids.some((techId) => {
        const currentLevel = currentResearch[techId] || 0;
        const targetLevel = targetResearch[techId] || 0;
        return currentLevel !== targetLevel && (currentLevel > 0 || targetLevel > 0);
      });
    if (changed(LEGION_TECH_RESET_TYPE_MAP[type] || [])) typesToReset.add(type);
    if (changed(LEGION_TECH_TYPE_MAP[type] || [])) typesToRebuild.add(type);
  }

  for (const type of typesToReset) {
    await progress.run(`重置科技类型 ${type}`, () =>
      sendCmd(
        tokenStore,
        tokenId,
        "legion_resetresearch",
        { advanced: false, type },
        errors,
        "重置科技",
      ),
    );
  }

  for (const type of [...typesToRebuild].sort((a, b) => a - b)) {
    for (const techId of LEGION_TECH_TYPE_MAP[type] || []) {
      const targetLevel = targetResearch[techId] || 0;
      if (targetLevel <= 0) continue;
      const techName = LEGION_TECH_NAME[techId] || `科技${techId}`;
      const maxLevel = LEGION_TECH_MAX_LEVEL[techId];
      if (targetLevel >= maxLevel) {
        await progress.run(`点满 ${techName}`, () =>
          sendCmd(
            tokenStore,
            tokenId,
            "legion_research",
            { isMax: true, researchId: techId },
            errors,
            techName,
          ),
        );
        continue;
      }
      for (let level = 1; level <= targetLevel; level += 1) {
        await progress.run(`${techName} ${level}/${targetLevel}`, () =>
          sendCmd(
            tokenStore,
            tokenId,
            "legion_research",
            { isMax: false, researchId: techId },
            errors,
            techName,
          ),
        );
      }
    }
  }
};

export const applyCloudLineup = async (tokenStore, tokenId, lineup, onProgress) => {
  const errors = [];
  const progress = createReporter(onProgress);
  await progress.run("读取当前阵容", () => readTeam(tokenStore, tokenId, errors));
  await syncFormation(tokenStore, tokenId, lineup, errors, progress);
  await syncLevels(tokenStore, tokenId, lineup, errors, progress);
  await syncFishAndPearls(tokenStore, tokenId, lineup, errors, progress);
  await syncPet(tokenStore, tokenId, lineup, errors, progress);
  await syncWeapon(tokenStore, tokenId, lineup, errors, progress);
  await syncResearch(tokenStore, tokenId, lineup, errors, progress);
  progress.done(errors.length ? "同步结束，有部分步骤失败" : "同步完成");
  return errors;
};
