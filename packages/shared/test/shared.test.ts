import { describe, expect, it } from "vitest";
import {
  addDays,
  allPseudos,
  canonicalRegions,
  conflicts,
  dayKey,
  difficultyForDay,
  digitTotals,
  geometry,
  isComplete,
  isDayKey,
  isDigitString,
  isLayout,
  keepsGivens,
  MAX_PSEUDO_LENGTH,
  normalizeFriendCode,
  parseDigits,
  randomPseudo,
  rankByTime,
  regionColors,
  sanitizePseudo,
  seasonTable,
  weekDays,
  weekday,
  withNumber,
} from "../src/index.js";

// Grille 5 × 7 (lundi 2 novembre 2026) : zones et solution.
const LAYOUT = { width: 5, height: 7, regions: "00000111112222345233455534665344666" };
const SOLVED = "54312125434312152535134124525423413";
const g = geometry(LAYOUT);

describe("tectonic", () => {
  it("découpe la grille en zones et trouve les cases qui se touchent", () => {
    expect(g.regions.map((r) => r.length)).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(g.regions[2]).toEqual([10, 11, 12, 13, 17]);
    expect(g.maxDigit).toBe(5);
    expect(g.neighbors[0]).toEqual([1, 5, 6]); // coin
    expect(g.neighbors[2]).toHaveLength(5); // bord
    expect(g.neighbors[6]).toEqual([0, 1, 2, 5, 7, 10, 11, 12]); // intérieur, diagonales comprises
    // pairs : la zone et les voisines, sans doublon ni la case elle-même
    expect(g.peers[0]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("valide un découpage", () => {
    expect(isLayout(LAYOUT)).toBe(true);
    expect(isLayout({ ...LAYOUT, regions: LAYOUT.regions.slice(1) })).toBe(false);
    expect(isLayout({ width: 3, height: 3, regions: "010111000" })).toBe(false); // deux morceaux « 0 »
    expect(isLayout({ width: 3, height: 3, regions: "000000111" })).toBe(false); // zone de 6 cases
    expect(isLayout({ width: 3, height: 3, regions: "001021334" })).toBe(true);
    expect(isLayout({ width: 11, height: 3, regions: "0".repeat(33) })).toBe(false);
    expect(canonicalRegions([7, 7, 3, 3, 9])).toBe("00112");
  });

  it("reconnaît une grille finie", () => {
    expect(isComplete(g, parseDigits(SOLVED))).toBe(true);
    expect(conflicts(g, parseDigits(SOLVED)).size).toBe(0);
    expect(digitTotals(g).reduce((a, b) => a + b, 0)).toBe(g.cells);
  });

  it("repère les conflits : même zone, cases qui se touchent (coin compris), chiffre trop grand", () => {
    const v = parseDigits(SOLVED);
    [v[0], v[1]] = [v[1]!, v[0]!]; // échange dans la zone : 4 touche le 4 en diagonale
    expect(isComplete(g, v)).toBe(false);
    expect(conflicts(g, v).has(1)).toBe(true);
    const small = geometry({ width: 3, height: 3, regions: "001021334" });
    expect(small.size).toEqual([3, 3, 2, 3, 1, 2, 2, 2, 1]);
    expect(conflicts(small, [0, 0, 0, 0, 2, 0, 0, 0, 0]).has(4)).toBe(true); // zone d'une case : seul 1 est permis
  });

  it("vérifie le format et les chiffres donnés", () => {
    expect(isDigitString(SOLVED, 35)).toBe(true);
    expect(isDigitString(SOLVED, 36)).toBe(false);
    expect(isDigitString("6".repeat(35), 35)).toBe(false);
    const givens = "5" + "0".repeat(34);
    expect(keepsGivens(givens, SOLVED)).toBe(true);
    expect(keepsGivens("4" + "0".repeat(34), SOLVED)).toBe(false);
  });

  it("colore les zones sans que deux zones qui se touchent par un côté partagent une couleur", () => {
    const colors = regionColors(g);
    expect(Math.max(...colors)).toBeLessThan(4);
    for (let i = 0; i < g.cells; i++) {
      if (i % g.width < g.width - 1 && g.region[i] !== g.region[i + 1]) expect(colors[g.region[i]!]).not.toBe(colors[g.region[i + 1]!]);
      if (i + g.width < g.cells && g.region[i] !== g.region[i + g.width]) expect(colors[g.region[i]!]).not.toBe(colors[g.region[i + g.width]!]);
    }
    expect(regionColors(g)).toEqual(colors); // toujours la même
  });
});

describe("jours", () => {
  it("calcule le jour à Paris", () => {
    // 23 h 30 UTC le 30 septembre = 1 h 30 le 1er octobre à Paris (heure d'été)
    expect(dayKey(new Date("2026-09-30T23:30:00Z"))).toBe("2026-10-01");
    expect(dayKey(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(dayKey(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  });

  it("valide les clés", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("2026-2-3")).toBe(false);
  });

  it("fait tourner la difficulté sur la semaine", () => {
    expect(weekday("2026-09-28")).toBe(0); // lundi
    expect(weekday("2026-11-02")).toBe(0); // premier jour : un lundi
    expect(weekDays("2026-10-01")[0]).toBe("2026-09-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekDays("2026-09-28").map(difficultyForDay)).toEqual(["easy", "easy", "medium", "medium", "hard", "hard", "expert"]);
  });
});

describe("codes et pseudos", () => {
  it("normalise un code ami", () => {
    expect(normalizeFriendCode("abc-234")).toBe("ABC234");
    expect(normalizeFriendCode("ABCD10")).toBeNull(); // 1 et 0 exclus
    expect(normalizeFriendCode("ABC23")).toBeNull();
  });

  it("tire des pseudos courts dans les deux langues", () => {
    for (const lang of ["fr", "en"] as const) {
      const all = allPseudos(lang);
      expect(all.length).toBeGreaterThan(150);
      for (let i = 0; i < 200; i++) expect(randomPseudo(lang).length).toBeLessThanOrEqual(MAX_PSEUDO_LENGTH);
    }
    expect(allPseudos("fr")).toContain("Mouette sournoise");
    expect(allPseudos("fr")).toContain("Ragondin cosmique");
    expect(allPseudos("en")).toContain("Cosmic Coypu");
  });

  it("numérote sans dépasser 20 caractères", () => {
    expect(withNumber("Castor zen", 2)).toBe("Castor zen 2");
    expect(withNumber("Sanglier mélancolique".slice(0, 20), 42).length).toBeLessThanOrEqual(MAX_PSEUDO_LENGTH);
  });

  it("nettoie un pseudo saisi", () => {
    expect(sanitizePseudo("  Héron \u0007 zen  ")).toBe("Héron zen");
    expect(sanitizePseudo("   ")).toBeNull();
    expect(sanitizePseudo("x".repeat(21))).toBeNull();
  });
});

describe("saison", () => {
  it("classe les ex æquo au même rang", () => {
    expect(rankByTime([{ timeMs: 5 }, { timeMs: 3 }, { timeMs: 3 }]).map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  it("donne 3, 2 puis 1 point", () => {
    const days = ["2026-09-28", "2026-09-29"];
    const table = seasonTable(days, [
      { player: "a", day: days[0]!, timeMs: 100 },
      { player: "b", day: days[0]!, timeMs: 200 },
      { player: "c", day: days[0]!, timeMs: 300 },
      { player: "c", day: days[1]!, timeMs: 50 },
    ]);
    expect(table.get("a")).toEqual({ total: 3, perDay: [3, null] });
    expect(table.get("b")).toEqual({ total: 2, perDay: [2, null] });
    expect(table.get("c")).toEqual({ total: 4, perDay: [1, 3] });
  });
});
