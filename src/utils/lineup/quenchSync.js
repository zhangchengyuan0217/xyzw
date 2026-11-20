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

// 孔位顺序固定，用来判断这套洗练现在在谁身上。重生换人后装备跟着人走，红橙数量会撞车。
export const quenchParts = (hero) => {
  const parts = {};
  for (const [partId, part] of Object.entries(hero?.equipment || {})) {
    const slots = Object.entries(part?.quenches || {})
      .map(([slot, item]) => ({
        slot: Number(slot),
        colorId: Number(item?.colorId || 0),
        attrId: Number(item?.attrId || 0),
        attrNum: Number(item?.attrNum || 0),
      }))
      .filter((item) => item.colorId > 0)
      .sort((a, b) => a.slot - b.slot);
    if (slots.length) parts[partId] = slots;
  }
  return parts;
};

export const quenchKey = (parts) =>
  Object.keys(parts || {})
    .sort((a, b) => Number(a) - Number(b))
    .map((partId) => {
      const holes = parts[partId]
        .map((item) =>
          [item.slot, item.colorId, item.attrId, item.attrNum].join("."),
        )
        .join(",");
      return `${partId}:${holes}`;
    })
    .join("|");

const countsMatch = (counts, target) =>
  counts.red === Number(target.redQuench || 0) &&
  counts.orange === Number(target.orangeQuench || 0);

/**
 * Find who currently wears the quench saved on this hero.
 * An exact hole pattern wins. Older saves only have red/orange totals, so a
 * unique total or the hero now standing in that slot is used.
 * @param {object} target Saved hero.
 * @param {object} heroes Live role.heroes map.
 * @param {number} [slotHeroId] Hero currently standing in the saved slot.
 * @returns {number | null} Donor hero id, or null when no exchange is needed.
 */
export const findQuenchDonor = (target, heroes, slotHeroId) => {
  const savedKey = quenchKey(
    target?.quenches && Object.keys(target.quenches).length
      ? target.quenches
      : {},
  );
  const savedCount =
    Number(target?.redQuench || 0) + Number(target?.orangeQuench || 0);
  if (!savedKey && savedCount === 0) return null;
  const owned = Object.entries(heroes || {}).map(([id, hero]) => ({
    heroId: Number(id),
    key: quenchKey(quenchParts(hero)),
    counts: countQuench(hero),
  }));
  const self = owned.find((hero) => hero.heroId === Number(target.heroId));
  const others = owned.filter((hero) => hero.heroId !== Number(target.heroId));
  if (savedKey) {
    if (self?.key === savedKey) return null;
    const matches = others.filter((hero) => hero.key === savedKey);
    if (matches.length === 1) return matches[0].heroId;
    return (
      matches.find((hero) => hero.heroId === Number(slotHeroId))?.heroId ||
      null
    );
  }
  if (self && countsMatch(self.counts, target)) return null;
  const matches = others.filter(
    (hero) =>
      countsMatch(hero.counts, target) &&
      hero.counts.red + hero.counts.orange > 0,
  );
  if (matches.length === 1) return matches[0].heroId;
  return (
    matches.find((hero) => hero.heroId === Number(slotHeroId))?.heroId || null
  );
};

/**
 * Bench anyone who is not already on the saved slot, then deploy into empty slots.
 * @param {Array<object>} deployed Live team heroes.
 * @param {Array<object>} targets Saved heroes.
 * @returns {{bench: number[], deploy: Array<object>}} Moves in apply order.
 */
export const planFormationMoves = (deployed, targets) => {
  const desired = new Map(
    (targets || []).map((hero) => [Number(hero.heroId), Number(hero.slot)]),
  );
  const bench = [];
  for (const hero of deployed || []) {
    if (desired.get(hero.heroId) !== hero.slot) bench.push(hero.slot);
  }
  const deploy = (targets || [])
    .filter((hero) => {
      const current = (deployed || []).find(
        (item) => item.heroId === Number(hero.heroId),
      );
      return !current || current.slot !== Number(hero.slot);
    })
    .map((hero) => ({
      heroId: Number(hero.heroId),
      slot: Number(hero.slot),
    }));
  return { bench, deploy };
};

export { countQuench };
