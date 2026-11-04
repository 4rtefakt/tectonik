import { digitsToString, geometry, type Difficulty, type Layout } from "@tectonik/shared";
import { grade, type Level } from "./grader.js";
import { randomLayout } from "./layout.js";
import { hashSeed, mulberry32, shuffle, type Rng } from "./rng.js";
import { countSolutions, randomSolution } from "./solver.js";

export const LEVELS: Record<Difficulty, Level> = { easy: 1, medium: 2, hard: 3, expert: 4 };

/**
 * Dimensions (largeur × hauteur) selon la difficulté : en hauteur, comme dans
 * les magazines (et sur un téléphone tenu droit), et de plus en plus grandes
 * au fil de la semaine.
 */
export const SHAPES: Record<Difficulty, { width: number; height: number }> = {
  easy: { width: 5, height: 7 },
  medium: { width: 6, height: 8 },
  hard: { width: 7, height: 9 },
  expert: { width: 8, height: 10 },
};

/** Une zone d'une seule case est un 1 offert : une pour 40 cases au plus. */
export const maxSingles = (width: number, height: number) => Math.max(1, Math.floor((width * height) / 40));

export interface Puzzle extends Layout {
  grid: string;
  solution: string;
  difficulty: Difficulty;
  clues: number;
  used: Record<string, number>;
}

/**
 * Une tentative : découpage au hasard, grille complète au hasard pour ce
 * découpage, puis on retire les chiffres un par un tant que la solution reste
 * unique et que la résolution ne dépasse pas le niveau visé. La tentative
 * échoue (null) si le découpage n'a pas de solution ou si la grille finale
 * n'atteint pas ce niveau.
 */
export function attempt(rng: Rng, difficulty: Difficulty, shape = SHAPES[difficulty]): Puzzle | null {
  const target = LEVELS[difficulty];
  const { width, height } = shape;
  const regions = randomLayout(width, height, rng, { maxSingles: maxSingles(width, height) });
  if (!regions) return null;
  const g = geometry({ width, height, regions });
  const solution = randomSolution(g, rng);
  if (!solution) return null;
  const grid = [...solution];
  let clues = g.cells;
  for (const i of shuffle(
    Array.from({ length: g.cells }, (_, k) => k),
    rng,
  )) {
    const d = grid[i]!;
    grid[i] = 0;
    if (countSolutions(g, grid, 2) !== 1 || grade(g, grid, target).level === null) {
      grid[i] = d;
      continue;
    }
    clues--;
  }
  const r = grade(g, grid);
  if (r.level !== target) return null;
  return { width, height, regions, grid: digitsToString(grid), solution: digitsToString(solution), difficulty, clues, used: r.used };
}

/** Grille du jour, reproductible : même graine et même jour donnent la même grille. */
export function puzzleForDay(seed: string, day: string, difficulty: Difficulty): Puzzle & { attempts: number } {
  const rng = mulberry32(hashSeed(`${seed}:${day}`));
  for (let attempts = 1; ; attempts++) {
    const p = attempt(rng, difficulty);
    if (p) return { ...p, attempts };
  }
}
