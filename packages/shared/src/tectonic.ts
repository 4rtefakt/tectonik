/**
 * Tectonic (aussi appelé Suguru) : une grille de largeur × hauteur cases
 * découpée en zones de 1 à 5 cases. Une zone de n cases contient les chiffres
 * 1 à n, une fois chacun ; deux cases qui se touchent, même par un coin, n'ont
 * jamais le même chiffre.
 *
 * Cases indexées ligne par ligne (i = largeur × ligne + colonne). Formats texte,
 * un caractère par case :
 *   - zones : un caractère de REGION_ALPHABET par case, même caractère = même
 *     zone (forme canonique : zones numérotées dans l'ordre de lecture) ;
 *   - chiffres : « 0 » pour une case vide, sinon le chiffre.
 */
export const MAX_REGION = 5;
export const MIN_SIDE = 3;
export const MAX_SIDE = 10;
export const REGION_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export interface Layout {
  width: number;
  height: number;
  regions: string;
}

export interface Geometry {
  width: number;
  height: number;
  cells: number;
  /** zone de chaque case (0, 1, 2… dans l'ordre de lecture) */
  region: number[];
  /** cases de chaque zone, dans l'ordre de lecture */
  regions: number[][];
  /** taille de la zone de chaque case, c'est-à-dire le plus grand chiffre permis */
  size: number[];
  /** les 3 à 8 cases qui touchent la case, coins compris */
  neighbors: number[][];
  /** cases qui ne peuvent pas porter le même chiffre : même zone ou voisines */
  peers: number[][];
  /** plus grande zone (= plus grand chiffre de la grille) */
  maxDigit: number;
}

const cache = new Map<string, Geometry>();

/** Géométrie d'une grille (mise en cache : les mêmes grilles reviennent sans cesse). */
export function geometry(layout: Layout): Geometry {
  const key = `${layout.width}x${layout.height}:${layout.regions}`;
  let g = cache.get(key);
  if (!g) {
    g = buildGeometry(layout);
    if (cache.size > 500) cache.clear();
    cache.set(key, g);
  }
  return g;
}

function buildGeometry({ width, height, regions: text }: Layout): Geometry {
  const cells = width * height;
  const ids = new Map<string, number>();
  const region = Array.from(text, (ch) => {
    let id = ids.get(ch);
    if (id === undefined) ids.set(ch, (id = ids.size));
    return id;
  });
  const regions: number[][] = Array.from({ length: ids.size }, () => []);
  region.forEach((r, i) => regions[r]!.push(i));
  const size = region.map((r) => regions[r]!.length);
  const neighbors = Array.from({ length: cells }, (_, i) => {
    const r = Math.floor(i / width);
    const c = i % width;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < height && cc >= 0 && cc < width) out.push(rr * width + cc);
      }
    }
    return out;
  });
  const peers = Array.from({ length: cells }, (_, i) => {
    const set = new Set([...neighbors[i]!, ...regions[region[i]!]!]);
    set.delete(i);
    return [...set].sort((a, b) => a - b);
  });
  return { width, height, cells, region, regions, size, neighbors, peers, maxDigit: Math.max(...size) };
}

/** Zones renumérotées dans l'ordre de lecture (deux découpages identiques donnent le même texte). */
export function canonicalRegions(region: readonly number[]): string {
  const ids = new Map<number, number>();
  return region
    .map((r) => {
      let id = ids.get(r);
      if (id === undefined) ids.set(r, (id = ids.size));
      return REGION_ALPHABET[id]!;
    })
    .join("");
}

/**
 * Découpage valide : dimensions permises, un caractère par case, chaque zone
 * d'un seul tenant (cases reliées par un côté) et de 5 cases au plus.
 */
export function isLayout(l: unknown): l is Layout {
  if (!l || typeof l !== "object") return false;
  const { width, height, regions } = l as Partial<Layout>;
  if (!Number.isInteger(width) || !Number.isInteger(height) || typeof regions !== "string") return false;
  const w = width!;
  const h = height!;
  if (w < MIN_SIDE || w > MAX_SIDE || h < MIN_SIDE || h > MAX_SIDE || regions.length !== w * h) return false;
  for (const ch of regions) if (!REGION_ALPHABET.includes(ch)) return false;
  const seen = new Set<string>();
  const visited = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (visited[start]) continue;
    const ch = regions[start]!;
    if (seen.has(ch)) return false; // même caractère pour deux morceaux séparés
    seen.add(ch);
    let n = 0;
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      n++;
      const r = Math.floor(i / w);
      const c = i % w;
      for (const j of [r > 0 ? i - w : -1, r < h - 1 ? i + w : -1, c > 0 ? i - 1 : -1, c < w - 1 ? i + 1 : -1]) {
        if (j >= 0 && !visited[j] && regions[j] === ch) {
          visited[j] = 1;
          stack.push(j);
        }
      }
    }
    if (n > MAX_REGION) return false;
  }
  return true;
}

/** Chaîne de chiffres de la bonne longueur (0 = vide). */
export function isDigitString(s: unknown, cells: number): s is string {
  return typeof s === "string" && s.length === cells && /^[0-5]+$/.test(s);
}

export function parseDigits(s: string): number[] {
  return Array.from(s, (ch) => ch.charCodeAt(0) - 48);
}

export function digitsToString(values: readonly number[]): string {
  return values.join("");
}

/** Vrai si le chiffre de la case i se retrouve dans sa zone ou dans une case qui la touche. */
export function clashes(g: Geometry, values: readonly number[], i: number, v = values[i]!): boolean {
  if (!v) return false;
  for (const j of g.peers[i]!) if (values[j] === v) return true;
  return false;
}

/** Cases en conflit : chiffre en double dans la zone ou chez une voisine, ou plus grand que la zone. */
export function conflicts(g: Geometry, values: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < g.cells; i++) if (values[i]! > g.size[i]! || clashes(g, values, i)) out.add(i);
  return out;
}

/**
 * Grille pleine et sans conflit. Pour une grille à solution unique dont les
 * chiffres donnés sont conservés, c'est exactement la solution : le client
 * peut donc savoir qu'il a fini sans connaître la solution.
 */
export function isComplete(g: Geometry, values: readonly number[]): boolean {
  if (values.length !== g.cells) return false;
  for (let i = 0; i < g.cells; i++) if (!(values[i]! >= 1 && values[i]! <= g.size[i]!)) return false;
  return conflicts(g, values).size === 0;
}

/** Vrai si `values` garde tous les chiffres donnés de `givens`. */
export function keepsGivens(givens: string, values: string): boolean {
  if (givens.length !== values.length) return false;
  for (let i = 0; i < givens.length; i++) if (givens[i] !== "0" && givens[i] !== values[i]) return false;
  return true;
}

/** Combien de fois chaque chiffre est déjà posé (index 1..5). */
export function digitCounts(values: readonly number[]): number[] {
  const counts = new Array<number>(MAX_REGION + 1).fill(0);
  for (const v of values) if (v >= 1 && v <= MAX_REGION) counts[v]!++;
  return counts;
}

/** Combien de fois chaque chiffre figure dans la solution : une fois par zone assez grande (index 1..5). */
export function digitTotals(g: Geometry): number[] {
  const totals = new Array<number>(MAX_REGION + 1).fill(0);
  for (const cells of g.regions) for (let d = 1; d <= cells.length; d++) totals[d]!++;
  return totals;
}

/**
 * Couleur de chaque zone pour l'affichage (0..3), deux zones qui partagent un
 * côté n'ont jamais la même ; toujours la même coloration pour une grille
 * donnée. Quatre couleurs suffisent toujours (carte plane) ; la recherche est
 * bornée et passe à une cinquième dans le cas, théorique ici, où elle échoue.
 */
export function regionColors(g: Geometry): number[] {
  const n = g.regions.length;
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < g.cells; i++) {
    const r = g.region[i]!;
    const c = i % g.width;
    for (const j of [c < g.width - 1 ? i + 1 : -1, i + g.width < g.cells ? i + g.width : -1]) {
      if (j >= 0 && g.region[j] !== r) {
        adj[r]!.add(g.region[j]!);
        adj[g.region[j]!]!.add(r);
      }
    }
  }
  // les zones les plus entourées d'abord
  const order = Array.from({ length: n }, (_, r) => r).sort((a, b) => adj[b]!.size - adj[a]!.size || a - b);
  for (let k = 4; ; k++) {
    const color = new Array<number>(n).fill(-1);
    let budget = 20_000;
    const place = (idx: number): boolean => {
      if (idx === n) return true;
      if (--budget < 0) return false;
      const r = order[idx]!;
      for (let col = 0; col < k; col++) {
        let ok = true;
        for (const o of adj[r]!) if (color[o] === col) ok = false;
        if (!ok) continue;
        color[r] = col;
        if (place(idx + 1)) return true;
        color[r] = -1;
      }
      return false;
    };
    if (place(0)) return color;
  }
}
