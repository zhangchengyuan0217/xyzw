import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findQuenchDonor,
  planFormationMoves,
  quenchKey,
  quenchParts,
} from "../src/utils/lineup/quenchSync.js";

const holes = (colorId, attrId) => ({
  equipment: {
    1: {
      quenches: {
        1: { colorId, attrId, attrNum: 10 },
      },
    },
  },
});

test("a reborn hero gets its saved quench back from the hero now in that slot", () => {
  const saved = {
    heroId: 1,
    slot: 0,
    redQuench: 1,
    orangeQuench: 0,
    quenches: quenchParts(holes(6, 11)),
  };
  const donor = findQuenchDonor(
    saved,
    {
      1: { equipment: {} },
      2: holes(6, 11),
      3: holes(6, 99),
    },
    2,
  );
  assert.equal(donor, 2);
  assert.equal(quenchKey(saved.quenches), quenchKey(quenchParts(holes(6, 11))));
});

test("quench that is already on the saved hero is left alone", () => {
  const saved = {
    heroId: 1,
    redQuench: 1,
    orangeQuench: 0,
    quenches: quenchParts(holes(6, 11)),
  };
  assert.equal(
    findQuenchDonor(saved, { 1: holes(6, 11), 2: holes(6, 11) }, 2),
    null,
  );
});

test("an older save uses the switched hero when red and orange totals match", () => {
  const saved = { heroId: 1, slot: 0, redQuench: 4, orangeQuench: 1 };
  const hero = (red, orange) => ({
    equipment: {
      1: {
        quenches: {
          ...Object.fromEntries(
            Array.from({ length: red }, (_, index) => [
              index + 1,
              { colorId: 6, attrId: index + 1, attrNum: 1 },
            ]),
          ),
          ...Object.fromEntries(
            Array.from({ length: orange }, (_, index) => [
              red + index + 1,
              { colorId: 5, attrId: 20 + index, attrNum: 1 },
            ]),
          ),
        },
      },
    },
  });
  assert.equal(
    findQuenchDonor(
      saved,
      { 1: { equipment: {} }, 2: hero(4, 1), 3: hero(4, 1) },
      2,
    ),
    2,
  );
});

test("formation clears the switched hero before putting the saved hero back", () => {
  const plan = planFormationMoves(
    [
      { heroId: 2, slot: 0 },
      { heroId: 3, slot: 1 },
    ],
    [
      { heroId: 1, slot: 0 },
      { heroId: 3, slot: 1 },
    ],
  );
  assert.deepEqual(plan.bench, [0]);
  assert.deepEqual(plan.deploy, [{ heroId: 1, slot: 0 }]);
});
