import { countQuench, quenchParts } from "./quenchSync.js";

const heroIdOf = (value) => {
  if (value == null || value === false) return 0;
  if (typeof value === "number" || typeof value === "string")
    return Number(value) || 0;
  return Number(value.heroId || value.id || 0);
};

const isFormationSlot = (slot) =>
  Number.isInteger(slot) && slot >= 0 && slot <= 5;

/**
 * The preset team snapshot keeps the heroes from the last time that slot was
 * written. The role battle team is who is actually deployed right now.
 * @param {object} role Fresh role_getroleinfo role.
 * @returns {Array<{slot: number, heroId: number}>} Live formation.
 */
export const liveDeployedHeroes = (role) => {
  const battleTeam = role?.battleTeam;
  if (battleTeam && typeof battleTeam === "object" && !Array.isArray(battleTeam)) {
    const deployed = Object.keys(battleTeam)
      .map((key) => Number(key))
      .filter(isFormationSlot)
      .sort((a, b) => a - b)
      .map((slot) => ({
        slot,
        heroId: heroIdOf(battleTeam[slot] ?? battleTeam[String(slot)]),
      }))
      .filter((hero) => hero.heroId > 0);
    if (deployed.length) return deployed;
  }
  return Object.entries(role?.heroes || {})
    .map(([id, hero]) => ({
      slot: Number(hero?.battleTeamSlot),
      heroId: Number(hero?.heroId || id || 0),
    }))
    .filter((hero) => isFormationSlot(hero.slot) && hero.heroId > 0)
    .sort((a, b) => a.slot - b.slot);
};

const positiveId = (value) => {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/**
 * Stats that belong to the hero right now. Preset copies of level, pearl and
 * quench are ignored.
 * @param {object} options
 * @param {object} options.role Fresh role.
 * @param {{slot: number, heroId: number}} options.deployed Live slot.
 * @param {object} options.pearlMap Role pearl map.
 * @param {object} options.fishByArtifact artifactId to fish id.
 * @param {object} options.pearlNames skillId to display name.
 * @returns {object} Hero record for a cloud lineup.
 */
export const liveHeroRecord = ({
  role,
  deployed,
  pearlMap,
  fishByArtifact,
  pearlNames,
}) => {
  const owned =
    role?.heroes?.[String(deployed.heroId)] ||
    role?.heroes?.[deployed.heroId] ||
    {};
  const artifactId = positiveId(owned.artifactId);
  const pearlId = positiveId(owned.pearlId);
  const pearl = pearlId
    ? pearlMap?.[pearlId] || pearlMap?.[String(pearlId)]
    : null;
  const quench = countQuench(owned);
  return {
    slot: deployed.slot,
    heroId: deployed.heroId,
    level: Number(owned.level || 0),
    speed: Number(owned.speed || 0),
    attachmentUid: positiveId(owned.attachmentUid),
    fishId: artifactId ? fishByArtifact[artifactId] || null : null,
    pearlId,
    skillId: pearl?.skillId || null,
    skillName: pearlNames?.[pearl?.skillId]?.name || "",
    redQuench: quench.red,
    orangeQuench: quench.orange,
    quenches: quenchParts(owned),
  };
};
