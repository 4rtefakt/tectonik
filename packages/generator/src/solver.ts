import type { Geometry } from "@tectonik/shared";
import { shuffle, type Rng } from "./rng.js";

/**
 * Solveur par retour arrière sur masques de bits (bits 1..5) : propagation des
 * singletons nus et cachés, puis case la plus contrainte d'abord. Sert à
 * compter les solutions (unicité) et à remplir une grille au hasard.
 */
export const fullMask = (n: number) => (1 << (n + 1)) - 2;

export function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 5; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/** Chiffre unique d'un masque qui n'a qu'un bit. */
const only = (mask: number) => 31 - Math.clz32(mask);

interface State {
  v: number[];
  c: number[];
}

function assign(g: Geometry, s: State, i: number, d: number): boolean {
  const b = 1 << d;
  if (!(s.c[i]! & b)) return false;
  s.v[i] = d;
  s.c[i] = 0;
  for (const p of g.peers[i]!) {
    if (s.v[p] === d) return false;
    if (!s.v[p]) {
      s.c[p]! &= ~b;
      if (s.c[p] === 0) return false;
    }
  }
  return true;
}

/** Singletons nus et cachés jusqu'à stabilité ; false si la grille devient impossible. */
function propagate(g: Geometry, s: State): boolean {
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < g.cells; i++) {
      if (s.v[i]) continue;
      const m = s.c[i]!;
      if (m === 0) return false;
      if ((m & (m - 1)) === 0) {
        if (!assign(g, s, i, only(m))) return false;
        changed = true;
      }
    }
    for (const cells of g.regions) {
      let placed = 0;
      for (const i of cells) if (s.v[i]) placed |= 1 << s.v[i]!;
      for (let d = 1; d <= cells.length; d++) {
        if (placed & (1 << d)) continue;
        let at = -1;
        let n = 0;
        for (const i of cells) {
          if (!s.v[i] && s.c[i]! & (1 << d)) {
            at = i;
            if (++n > 1) break;
          }
        }
        if (n === 0) return false;
        if (n === 1) {
          if (!assign(g, s, at, d)) return false;
          placed |= 1 << d;
          changed = true;
        }
      }
    }
  }
  return true;
}

function init(g: Geometry, values: readonly number[]): State | null {
  const s: State = { v: new Array<number>(g.cells).fill(0), c: g.size.map(fullMask) };
  for (let i = 0; i < g.cells; i++) {
    const d = values[i]!;
    if (!d) continue;
    if (d > g.size[i]! || s.v[i] || !assign(g, s, i, d)) return null;
  }
  return s;
}

interface Search {
  limit: number;
  n: number;
  first: number[] | null;
  /** nœuds restants (au-delà, on abandonne : grille trop longue à remplir) */
  budget: number;
  rng?: Rng;
}

function search(g: Geometry, s: State, f: Search): void {
  if (--f.budget < 0) return;
  if (!propagate(g, s)) return;
  let best = -1;
  let bestCount = 9;
  for (let i = 0; i < g.cells; i++) {
    if (s.v[i]) continue;
    const n = popcount(s.c[i]!);
    if (n < bestCount) {
      best = i;
      bestCount = n;
      if (n === 2) break;
    }
  }
  if (best < 0) {
    f.n++;
    if (!f.first) f.first = [...s.v];
    return;
  }
  const digits = digitsOf(s.c[best]!);
  if (f.rng) shuffle(digits, f.rng);
  for (const d of digits) {
    const next: State = { v: [...s.v], c: [...s.c] };
    if (assign(g, next, best, d)) search(g, next, f);
    if (f.n >= f.limit || f.budget < 0) return;
  }
}

/** Nombre de solutions, arrêté à `limit` (2 suffit pour tester l'unicité). */
export function countSolutions(g: Geometry, values: readonly number[], limit = 2): number {
  const s = init(g, values);
  if (!s) return 0;
  const f: Search = { limit, n: 0, first: null, budget: Infinity };
  search(g, s, f);
  return f.n;
}

export function solve(g: Geometry, values: readonly number[]): number[] | null {
  const s = init(g, values);
  if (!s) return null;
  const f: Search = { limit: 1, n: 0, first: null, budget: Infinity };
  search(g, s, f);
  return f.first;
}

/** Grille complète tirée au hasard pour ce découpage ; null s'il n'en a pas (ou trop long à trouver). */
export function randomSolution(g: Geometry, rng: Rng, budget = 20_000): number[] | null {
  const s = init(g, new Array<number>(g.cells).fill(0));
  if (!s) return null;
  const f: Search = { limit: 1, n: 0, first: null, budget, rng };
  search(g, s, f);
  return f.first;
}
