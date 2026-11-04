import type { Geometry } from "@tectonik/shared";
import { digitsOf, fullMask, popcount } from "./solver.js";

/**
 * Résolution « à la main » : on applique toujours la technique la plus simple
 * qui fait avancer la grille, et la difficulté est celle de la plus dure dont
 * on a eu besoin. Une grille que ces techniques ne suffisent pas à finir est
 * jugée trop dure (niveau null) : elle demanderait des essais en cascade.
 *
 *   1 facile     singletons : une case qui n'a plus qu'un chiffre possible,
 *                un chiffre qui n'a plus qu'une place dans sa zone
 *   2 moyen      chiffre « pointé » : toutes ses places dans la zone touchent
 *                une même case, qui ne peut donc pas le porter
 *   3 difficile  paires et triplets, nus et cachés
 *   4 expert     une hypothèse : un chiffre qui, posé, mène à une impasse par
 *                les techniques précédentes est exclu
 *
 * Les « paires nues » valent pour deux cases qui se voient (même zone ou
 * voisines) : leurs deux chiffres sont exclus des cases qui voient les deux.
 */
export type Level = 1 | 2 | 3 | 4;

const bit = (d: number) => 1 << d;

class Board {
  v: number[];
  c: number[];
  /** une case vide sans candidat, ou un chiffre sans place dans sa zone */
  broken = false;
  constructor(
    readonly g: Geometry,
    values: readonly number[],
    candidates?: readonly number[],
  ) {
    this.v = [...values];
    if (candidates) {
      this.c = [...candidates];
      return;
    }
    this.c = g.size.map(fullMask);
    for (let i = 0; i < g.cells; i++) {
      if (this.v[i]) {
        this.c[i] = 0;
        continue;
      }
      for (const p of g.peers[i]!) if (this.v[p]) this.c[i]! &= ~bit(this.v[p]!);
    }
  }
  clone(): Board {
    return new Board(this.g, this.v, this.c);
  }
  place(i: number, d: number) {
    this.v[i] = d;
    this.c[i] = 0;
    for (const p of this.g.peers[i]!) {
      if (this.v[p] === d) this.broken = true;
      this.c[p]! &= ~bit(d);
    }
  }
  /** Retire `mask` des candidats de i ; vrai si quelque chose a changé. */
  drop(i: number, mask: number): boolean {
    if (this.v[i] || !(this.c[i]! & mask)) return false;
    this.c[i]! &= ~mask;
    return true;
  }
  full(): boolean {
    return this.v.every((x) => x !== 0);
  }
  /** Contradiction visible : case vide sans candidat ou chiffre sans place dans sa zone. */
  stuck(): boolean {
    if (this.broken) return true;
    for (let i = 0; i < this.g.cells; i++) if (!this.v[i] && this.c[i] === 0) return true;
    for (const cells of this.g.regions) {
      let have = 0;
      for (const i of cells) have |= this.v[i] ? bit(this.v[i]!) : this.c[i]!;
      if ((have & fullMask(cells.length)) !== fullMask(cells.length)) return true;
    }
    return false;
  }
  /** Chiffres pas encore posés dans la zone. */
  missing(cells: readonly number[]): number[] {
    let placed = 0;
    for (const i of cells) if (this.v[i]) placed |= bit(this.v[i]!);
    return digitsOf(fullMask(cells.length) & ~placed);
  }
}

function* combos<T>(items: readonly T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]!);
    yield* combos(items, k, i + 1, acc);
    acc.pop();
  }
}

function nakedSingle(b: Board): boolean {
  for (let i = 0; i < b.g.cells; i++) {
    if (!b.v[i] && popcount(b.c[i]!) === 1) {
      b.place(i, digitsOf(b.c[i]!)[0]!);
      return true;
    }
  }
  return false;
}

function hiddenSingle(b: Board): boolean {
  for (const cells of b.g.regions) {
    for (const d of b.missing(cells)) {
      const at = cells.filter((i) => b.c[i]! & bit(d));
      if (at.length === 1) {
        b.place(at[0]!, d);
        return true;
      }
    }
  }
  return false;
}

/** Toutes les places d'un chiffre dans sa zone touchent une même case : elle ne peut pas le porter. */
function pointing(b: Board): boolean {
  const { g } = b;
  for (const cells of g.regions) {
    for (const d of b.missing(cells)) {
      const at = cells.filter((i) => b.c[i]! & bit(d));
      if (at.length < 2) continue;
      let common = g.neighbors[at[0]!]!.filter((j) => !b.v[j] && b.c[j]! & bit(d));
      for (const i of at.slice(1)) common = common.filter((j) => g.neighbors[i]!.includes(j));
      let changed = false;
      for (const j of common) if (!at.includes(j)) changed = b.drop(j, bit(d)) || changed;
      if (changed) return true;
    }
  }
  return false;
}

const sees = (g: Geometry, a: number, b: number) => g.peers[a]!.includes(b);

/** k cases qui se voient toutes deux à deux et ne peuvent porter que k chiffres : les autres cases qui les voient toutes perdent ces chiffres. */
function nakedSubset(k: 2 | 3) {
  return (b: Board): boolean => {
    const { g } = b;
    const open = (i: number) => !b.v[i] && popcount(b.c[i]!) >= 2 && popcount(b.c[i]!) <= k;
    for (let a = 0; a < g.cells; a++) {
      if (!open(a)) continue;
      const later = g.peers[a]!.filter((x) => x > a && open(x));
      for (const rest of combos(later, k - 1)) {
        if (k === 3 && !sees(g, rest[0]!, rest[1]!)) continue;
        const set = [a, ...rest];
        let union = 0;
        for (const i of set) union |= b.c[i]!;
        if (popcount(union) !== k) continue;
        let changed = false;
        for (const j of g.peers[a]!) {
          if (set.includes(j) || !set.every((i) => i === a || sees(g, i, j))) continue;
          changed = b.drop(j, union) || changed;
        }
        if (changed) return true;
      }
    }
    return false;
  };
}

/** k chiffres qui n'ont, dans leur zone, que les mêmes k places : ces cases ne portent rien d'autre. */
function hiddenSubset(k: 2 | 3) {
  return (b: Board): boolean => {
    for (const cells of b.g.regions) {
      const digits = b.missing(cells).filter((d) => {
        const n = cells.filter((i) => b.c[i]! & bit(d)).length;
        return n >= 2 && n <= k;
      });
      if (digits.length < k) continue;
      for (const set of combos(digits, k)) {
        const at = new Set(set.flatMap((d) => cells.filter((i) => b.c[i]! & bit(d))));
        if (at.size !== k) continue;
        let keep = 0;
        for (const d of set) keep |= bit(d);
        let changed = false;
        for (const i of at) changed = b.drop(i, 0x3e & ~keep) || changed;
        if (changed) return true;
      }
    }
    return false;
  };
}

type Step = [name: string, level: Level, fn: (b: Board) => boolean];

const BASIC: Step[] = [
  ["hiddenSingle", 1, hiddenSingle],
  ["nakedSingle", 1, nakedSingle],
  ["pointing", 2, pointing],
  ["nakedPair", 3, nakedSubset(2)],
  ["hiddenPair", 3, hiddenSubset(2)],
  ["nakedTriple", 3, nakedSubset(3)],
  ["hiddenTriple", 3, hiddenSubset(3)],
];

/** Applique les techniques jusqu'au niveau donné tant qu'elles avancent ; vrai si la grille se bloque sur une contradiction. */
function leadsToContradiction(b: Board, maxLevel: Level): boolean {
  for (;;) {
    if (b.stuck()) return true;
    if (b.full()) return false;
    if (!BASIC.some(([, lv, fn]) => lv <= maxLevel && fn(b))) return false;
  }
}

/** Hypothèse : poser d en i mène à une impasse par les techniques 1 à 3, donc d est exclu de i. */
function contradiction(b: Board): boolean {
  const cells = Array.from({ length: b.g.cells }, (_, i) => i)
    .filter((i) => !b.v[i])
    .sort((x, y) => popcount(b.c[x]!) - popcount(b.c[y]!) || x - y);
  for (const i of cells) {
    for (const d of digitsOf(b.c[i]!)) {
      const trial = b.clone();
      trial.place(i, d);
      if (leadsToContradiction(trial, 3)) {
        b.drop(i, bit(d));
        return true;
      }
    }
  }
  return false;
}

const STEPS: Step[] = [...BASIC, ["contradiction", 4, contradiction]];

export interface Grade {
  level: Level | null;
  /** nombre d'utilisations de chaque technique */
  used: Record<string, number>;
  /** grille atteinte (pleine si level n'est pas null) */
  values: number[];
}

/** Arrête dès que la grille dépasse `maxLevel` (pour aller vite pendant la génération). */
export function grade(g: Geometry, values: readonly number[], maxLevel: Level = 4): Grade {
  const b = new Board(g, values);
  const used: Record<string, number> = {};
  let level = 0;
  for (;;) {
    if (b.stuck()) return { level: null, used, values: b.v };
    if (b.full()) return { level: Math.max(level, 1) as Level, used, values: b.v };
    const step = STEPS.find(([, lv, fn]) => lv <= maxLevel && fn(b));
    if (!step) return { level: null, used, values: b.v };
    used[step[0]] = (used[step[0]] ?? 0) + 1;
    level = Math.max(level, step[1]);
  }
}
