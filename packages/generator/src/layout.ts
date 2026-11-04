import { canonicalRegions, MAX_REGION, REGION_ALPHABET } from "@tectonik/shared";
import type { Rng } from "./rng.js";

/**
 * Découpage au hasard en zones de 1 à 5 cases d'un seul tenant. Les zones
 * poussent depuis une case de départ jusqu'à une taille tirée au sort (surtout
 * 4 et 5, comme dans les magazines) ; les miettes de 1 ou 2 cases qui restent
 * sont ensuite fondues dans une voisine quand la place le permet.
 */
const SIZE_WEIGHTS: readonly [size: number, weight: number][] = [
  [5, 0.55],
  [4, 0.28],
  [3, 0.11],
  [2, 0.05],
  [1, 0.01],
];

function drawSize(rng: Rng): number {
  let x = rng();
  for (const [size, w] of SIZE_WEIGHTS) {
    if ((x -= w) < 0) return size;
  }
  return MAX_REGION;
}

function orthogonal(i: number, width: number, height: number): number[] {
  const r = Math.floor(i / width);
  const c = i % width;
  const out: number[] = [];
  if (r > 0) out.push(i - width);
  if (r < height - 1) out.push(i + width);
  if (c > 0) out.push(i - 1);
  if (c < width - 1) out.push(i + 1);
  return out;
}

export interface LayoutOptions {
  /** nombre maximum de zones d'une seule case (toujours un 1 : un indice gratuit) */
  maxSingles?: number;
}

/** Texte des zones (forme canonique), ou null si le découpage tiré a trop de zones d'une case. */
export function randomLayout(width: number, height: number, rng: Rng, opts: LayoutOptions = {}): string | null {
  const cells = width * height;
  const region = new Array<number>(cells).fill(-1);
  const members: number[][] = [];
  const order = Array.from({ length: cells }, (_, i) => i);
  for (let i = cells - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  for (const start of order) {
    if (region[start] !== -1) continue;
    const id = members.length;
    const target = drawSize(rng);
    const mine = [start];
    region[start] = id;
    while (mine.length < target) {
      const frontier = [...new Set(mine.flatMap((i) => orthogonal(i, width, height)))].filter((j) => region[j] === -1);
      if (!frontier.length) break;
      const next = frontier[Math.floor(rng() * frontier.length)]!;
      region[next] = id;
      mine.push(next);
    }
    members.push(mine);
  }

  // fondre les petites zones dans une voisine qui a la place
  for (const small of [1, 2]) {
    for (let id = 0; id < members.length; id++) {
      const mine = members[id]!;
      if (mine.length !== small) continue;
      const around = [...new Set(mine.flatMap((i) => orthogonal(i, width, height)).map((j) => region[j]!))].filter(
        (o) => o !== id && members[o]!.length + mine.length <= MAX_REGION,
      );
      if (!around.length) continue;
      const into = around[Math.floor(rng() * around.length)]!;
      for (const i of mine) region[i] = into;
      members[into]!.push(...mine);
      members[id] = [];
    }
  }

  const kept = members.filter((m) => m.length > 0);
  if (kept.length > REGION_ALPHABET.length) return null;
  if (kept.filter((m) => m.length === 1).length > (opts.maxSingles ?? 1)) return null;
  return canonicalRegions(region);
}
