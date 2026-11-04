import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, difficultyForDay, FIRST_DAY, geometry, isComplete, isDigitString, isLayout, keepsGivens, parseDigits } from "@tectonik/shared";
import { grade } from "../src/grader.js";
import { attempt, LEVELS, MAX_SHAPE_SIDE, maxSingles, puzzleForDay, SHAPES } from "../src/generate.js";
import { randomLayout } from "../src/layout.js";
import { mulberry32 } from "../src/rng.js";
import { countSolutions, randomSolution, solve } from "../src/solver.js";

const here = dirname(fileURLToPath(import.meta.url));

// Grille 5 × 7 du lundi 2 novembre 2026.
const LAYOUT = { width: 5, height: 7, regions: "00000111112222345233455534665344666" };
const GRID = "50302100004000000000100000000420010";
const SOLUTION = "54312125434312152535134124525423413";

describe("solveur", () => {
  const g = geometry(LAYOUT);

  it("résout et compte les solutions", () => {
    expect(solve(g, parseDigits(GRID))?.join("")).toBe(SOLUTION);
    expect(countSolutions(g, parseDigits(GRID))).toBe(1);
    expect(countSolutions(g, new Array(35).fill(0))).toBe(2);
  });

  it("refuse des chiffres donnés incompatibles", () => {
    const bad = parseDigits(GRID);
    bad[1] = 5; // deux 5 côte à côte
    expect(countSolutions(g, bad)).toBe(0);
  });

  it("note la grille facile aux singletons", () => {
    const r = grade(g, parseDigits(GRID));
    expect(r.level).toBe(1);
    expect(r.values.join("")).toBe(SOLUTION);
  });
});

describe("techniques", () => {
  it("ne se trompent jamais : partout où la résolution aboutit, c'est la solution", () => {
    // grilles uniques à peu d'indices tirées au hasard : la résolution « à la main »
    // va au bout ou s'arrête, mais n'écarte jamais le bon chiffre
    const rng = mulberry32(11);
    const seen = { solved: 0, stopped: 0 };
    while (seen.solved + seen.stopped < 25) {
      const regions = randomLayout(7, 9, rng);
      if (!regions) continue;
      const g = geometry({ width: 7, height: 9, regions });
      const solution = randomSolution(g, rng);
      if (!solution) continue;
      const grid = [...solution];
      for (let i = 0; i < g.cells; i++) {
        if (rng() < 0.85) {
          const d = grid[i]!;
          grid[i] = 0;
          if (countSolutions(g, grid, 2) !== 1) grid[i] = d;
        }
      }
      const r = grade(g, grid);
      r.values.forEach((v, i) => v && expect(v).toBe(solution[i]));
      if (r.level === null) seen.stopped++;
      else seen.solved++;
    }
    expect(seen.solved).toBeGreaterThan(0);
  });
});

describe("découpage", () => {
  it("produit des zones de 1 à 5 cases d'un seul tenant", () => {
    const rng = mulberry32(3);
    let made = 0;
    for (let k = 0; k < 200 && made < 20; k++) {
      const regions = randomLayout(8, 10, rng, { maxSingles: maxSingles(8, 10) });
      if (!regions) continue;
      made++;
      expect(isLayout({ width: 8, height: 10, regions })).toBe(true);
      const g = geometry({ width: 8, height: 10, regions });
      expect(g.regions.filter((r) => r.length === 1).length).toBeLessThanOrEqual(maxSingles(8, 10));
    }
    expect(made).toBe(20);
  });

  it("remplit un découpage au hasard en respectant les règles", () => {
    const rng = mulberry32(5);
    let filled = 0;
    while (filled < 5) {
      const regions = randomLayout(6, 8, rng);
      if (!regions) continue;
      const g = geometry({ width: 6, height: 8, regions });
      const s = randomSolution(g, rng);
      if (!s) continue;
      filled++;
      expect(isComplete(g, s)).toBe(true);
    }
  });
});

describe("générateur", () => {
  it("garde des grilles qui tiennent dans le carré du sudoku (cases au moins aussi grandes)", () => {
    for (const s of Object.values(SHAPES)) expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(MAX_SHAPE_SIDE);
  });

  it("produit des grilles uniques du niveau demandé", () => {
    const rng = mulberry32(7);
    for (const d of ["easy", "medium", "hard"] as const) {
      let p = null;
      while (!p) p = attempt(rng, d);
      const g = geometry(p);
      expect([p.width, p.height]).toEqual([SHAPES[d].width, SHAPES[d].height]);
      expect(countSolutions(g, parseDigits(p.grid))).toBe(1);
      expect(grade(g, parseDigits(p.grid)).level).toBe(LEVELS[d]);
      expect(keepsGivens(p.grid, p.solution)).toBe(true);
    }
  });

  it("est reproductible jour par jour", () => {
    const a = puzzleForDay("t", "2026-11-04", "medium");
    const b = puzzleForDay("t", "2026-11-04", "medium");
    expect([a.regions, a.grid]).toEqual([b.regions, b.grid]);
  });
});

describe("seed SQL", () => {
  const sql = readFileSync(join(here, "../../worker/seed/puzzles.sql"), "utf8");
  const rows = [...sql.matchAll(/\('(\d{4}-\d{2}-\d{2})',(\d+),(\d+),'(\w+)','(\d+)','(\d+)','(\w+)'\)/g)].map((m) => ({
    day: m[1]!,
    width: Number(m[2]),
    height: Number(m[3]),
    regions: m[4]!,
    grid: m[5]!,
    solution: m[6]!,
    difficulty: m[7]! as keyof typeof LEVELS,
  }));

  it("couvre au moins 365 jours consécutifs depuis le premier jour", () => {
    expect(rows.length).toBeGreaterThanOrEqual(365);
    rows.forEach((r, i) => expect(r.day).toBe(addDays(FIRST_DAY, i)));
  });

  it("contient des grilles valides, uniques et du bon niveau", () => {
    for (const r of rows) {
      expect(r.difficulty).toBe(difficultyForDay(r.day));
      expect([r.width, r.height]).toEqual([SHAPES[r.difficulty].width, SHAPES[r.difficulty].height]);
      expect(isLayout(r)).toBe(true);
      const g = geometry(r);
      expect(isDigitString(r.grid, g.cells) && isDigitString(r.solution, g.cells)).toBe(true);
      expect(isComplete(g, parseDigits(r.solution))).toBe(true);
      expect(keepsGivens(r.grid, r.solution)).toBe(true);
      expect(countSolutions(g, parseDigits(r.grid))).toBe(1);
      const res = grade(g, parseDigits(r.grid));
      expect(res.level).toBe(LEVELS[r.difficulty]);
      expect(res.values.join("")).toBe(r.solution);
    }
  }, 120_000);
});
