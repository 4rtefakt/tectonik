import { beforeEach, describe, expect, it } from "vitest";
import { geometry } from "@tectonik/shared";
import { initialState, reduce, type GameAction, type GameState, type Puzzle } from "../src/lib/game.js";
import { getBigNotes, getProgress, getTints, setBigNotes, setProgress, setTints } from "../src/lib/storage.js";

// 5 × 7, sept zones de cinq cases ; première ligne : zone « 0 », solution 5 4 3 1 2.
const LAYOUT = { width: 5, height: 7, regions: "00000111112222345233455534665344666" };
const SOLUTION = "54312125434312152535134124525423413";
const GIVENS = "0".repeat(35);
const P: Puzzle = { g: geometry(LAYOUT), givens: GIVENS, solution: SOLUTION };

function play(actions: GameAction[], s: GameState = initialState(P, null), p: Puzzle = P): GameState {
  return actions.reduce((st, a) => reduce(p, st, a), s);
}
const at = (i: number, d: number, check = true): GameAction[] => [{ type: "select", i }, { type: "input", d, check }];

describe("règles à la saisie", () => {
  it("une zone de n cases n'accepte que 1..n", () => {
    const small = { width: 3, height: 3, regions: "001021334" };
    const p: Puzzle = { g: geometry(small), givens: "0".repeat(9), solution: null };
    const s = play([...at(4, 2), ...at(2, 3), ...at(2, 2)], initialState(p, null), p);
    expect(s.values[4]).toBe(0); // zone d'une case
    expect(s.values[2]).toBe(2); // zone de deux cases : 3 refusé, 2 accepté
  });

  it("le chiffre posé s'efface des notes de sa zone et des cases qui le touchent", () => {
    const note = (i: number): GameAction[] => [{ type: "select", i }, { type: "input", d: 3, note: true, check: false }];
    // case 6 = ligne 1, colonne 1 : la case 8 est dans sa zone, la 10 la touche en diagonale, la 4 ni l'un ni l'autre
    const s = play([...note(4), ...note(8), ...note(10), ...at(6, 3, false)]);
    expect([s.notes[8], s.notes[10], s.notes[4]]).toEqual([0, 0, 1 << 3]);
  });
});

describe("vérification automatique", () => {
  it("chiffre faux sans conflit : +30 s ; conflit : +10 s, même s'il est aussi faux", () => {
    let s = play(at(0, 1));
    expect([s.mistakes, s.wrong]).toEqual([0, 1]);
    s = play(at(6, 1), s); // touche la case 0 en diagonale
    expect([s.mistakes, s.wrong]).toEqual([1, 1]);
    s = play(at(2, 3), s);
    expect([s.mistakes, s.wrong]).toEqual([1, 1]);
  });

  it("une même erreur ne compte qu'une fois", () => {
    const s = play([...at(0, 1), { type: "erase" }, ...at(0, 1)]);
    expect(s.wrong).toBe(1);
  });

  it("activer la vérification compte les chiffres faux déjà posés", () => {
    let s = play([...at(0, 1, false), ...at(2, 3, false)]);
    expect([s.mistakes, s.wrong]).toEqual([0, 0]);
    s = play([{ type: "enableCheck" }], s);
    expect([s.mistakes, s.wrong]).toEqual([0, 1]);
  });

  it("sans solution connue, seuls les conflits comptent", () => {
    const p: Puzzle = { ...P, solution: null };
    const s = play([...at(0, 1), ...at(1, 1)], initialState(p, null), p);
    expect([s.mistakes, s.wrong]).toEqual([1, 0]);
  });
});

describe("annuler et rétablir", () => {
  it("rétablit ce qui a été annulé, jusqu'à une nouvelle modification", () => {
    let s = play([...at(2, 4), ...at(1, 3), { type: "undo", check: true }]);
    expect(s.values[1]).toBe(0);
    expect(s.future).toHaveLength(1);
    s = play([{ type: "redo", check: true }], s);
    expect(s.values[1]).toBe(3);
    expect(s.future).toHaveLength(0);
    s = play([{ type: "undo", check: true }, ...at(5, 2)], s);
    expect(s.future).toHaveLength(0);
    expect(play([{ type: "redo", check: true }], s)).toBe(s);
  });

  it("une erreur qui revient en rétablissant est signalée", () => {
    let s = play([...at(0, 1, false), { type: "undo", check: false }, { type: "enableCheck" }]);
    expect(s.wrong).toBe(0);
    s = play([{ type: "redo", check: true }], s);
    expect(s.wrong).toBe(1);
  });
});

describe("stockage local", () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it("garde l'historique d'annulation et de rétablissement", () => {
    const s = play([...at(2, 4), { type: "input", d: 5, note: true, check: true }, ...at(1, 3), { type: "select", i: 7 }, { type: "input", d: 1, note: true, check: true }, { type: "undo", check: true }]);
    const notes = s.history[0]!.notes.map((_, i) => (i === 3 ? 62 : 0));
    setProgress("2026-11-18", { ...s, history: [...s.history, { values: s.values, notes }] });
    const back = getProgress("2026-11-18", 35)!;
    expect(back.history).toEqual([...s.history, { values: s.values, notes }]);
    expect(back.future).toEqual(s.future);
    const resumed = play([{ type: "redo", check: true }], initialState(P, back));
    expect(resumed.notes[7]).toBe(2);
  });

  it("une sauvegarde sans historique se relit ; une sauvegarde d'une autre taille est ignorée", () => {
    localStorage.setItem("tectonik:progress:2026-11-03", JSON.stringify({ values: new Array(35).fill(0), notes: new Array(35).fill(0), mistakes: 2, flagged: [] }));
    const p = getProgress("2026-11-03", 35)!;
    expect([p.mistakes, p.wrong, p.history, p.future]).toEqual([2, 0, [], []]);
    expect(getProgress("2026-11-03", 48)).toBeNull();
  });

  it("zones colorées par défaut", () => {
    expect(getTints()).toBe(true);
    setTints(false);
    expect(getTints()).toBe(false);
  });

  it("grosses notes activées d'office pour Pangolin distrait, tant qu'aucun choix n'est fait", () => {
    expect(getBigNotes("Pangolin distrait")).toBe(true);
    expect(getBigNotes("Pangolin Distrait 12")).toBe(true);
    expect(getBigNotes("Pangolin zen")).toBe(false);
    setBigNotes(false);
    expect(getBigNotes("Pangolin distrait")).toBe(false);
    setBigNotes(true);
    expect(getBigNotes("Pangolin zen")).toBe(true);
  });
});
