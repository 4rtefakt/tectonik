const KEY_SECRET = "tectonik:secret";
const KEY_CHECK = "tectonik:check";
const KEY_BIG_NOTES = "tectonik:bigNotes";
const KEY_TINTS = "tectonik:tints";
const progressKey = (day: string) => `tectonik:progress:${day}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* mode privé */
  }
}

/** Secret du profil anonyme (envoyé en `Authorization: Bearer`). */
export function getSecret(): string | null {
  return safeGet(KEY_SECRET);
}
export function setSecret(secret: string) {
  safeSet(KEY_SECRET, secret);
}

/** Vérification automatique des conflits et des chiffres faux (désactivée par défaut). */
export function getCheck(): boolean {
  return safeGet(KEY_CHECK) === "1";
}
export function setCheck(on: boolean) {
  safeSet(KEY_CHECK, on ? "1" : "0");
}

/** Pseudos pour qui les grosses notes sont activées tant qu'aucun choix n'est fait. */
const BIG_NOTES_BY_DEFAULT = ["pangolin distrait"];

/** Notes plus grosses et plus contrastées dans la grille. */
export function getBigNotes(pseudo: string): boolean {
  const v = safeGet(KEY_BIG_NOTES);
  if (v !== null) return v === "1";
  const p = pseudo.trim().toLocaleLowerCase("fr");
  return BIG_NOTES_BY_DEFAULT.some((name) => p === name || p.startsWith(`${name} `));
}
export function setBigNotes(on: boolean) {
  safeSet(KEY_BIG_NOTES, on ? "1" : "0");
}

/** Zones colorées comme dans les magazines (activé par défaut). */
export function getTints(): boolean {
  return safeGet(KEY_TINTS) !== "0";
}
export function setTints(on: boolean) {
  safeSet(KEY_TINTS, on ? "1" : "0");
}

/** Un état de la grille, pour annuler et rétablir. */
export interface Snapshot {
  values: number[];
  notes: number[];
}

/** Partie en cours sur cet appareil : chiffres, notes (masques de bits), erreurs signalées et historique. */
export interface Progress {
  values: number[];
  notes: number[];
  mistakes: number;
  wrong: number;
  /** erreurs déjà comptées, « case:chiffre » (une même erreur ne compte qu'une fois) */
  flagged: string[];
  /** pour annuler et rétablir même en reprenant la partie un autre jour */
  history: Snapshot[];
  future: Snapshot[];
}

/** Historique compact : n chiffres puis n masques de notes en base 36 sur 2 caractères. */
function encode(s: Snapshot): string {
  return s.values.join("") + s.notes.map((n) => n.toString(36).padStart(2, "0")).join("");
}
function decode(raw: unknown, n: number): Snapshot | null {
  if (typeof raw !== "string" || raw.length !== 3 * n || !/^[0-5]*[0-9a-z]*$/.test(raw)) return null;
  const values = Array.from(raw.slice(0, n), Number);
  const notes = Array.from({ length: n }, (_, i) => parseInt(raw.slice(n + 2 * i, n + 2 * i + 2), 36));
  if (values.some((v) => !(v >= 0 && v <= 5)) || notes.some((m) => Number.isNaN(m))) return null;
  return { values, notes };
}
function decodeAll(raw: unknown, n: number): Snapshot[] {
  if (!Array.isArray(raw)) return [];
  const out = raw.map((r) => decode(r, n));
  // historique abîmé : on le perd plutôt que de restaurer n'importe quoi
  return out.every((s): s is Snapshot => s !== null) ? out : [];
}

/** Partie enregistrée pour ce jour (grille de `cells` cases), ou null. */
export function getProgress(day: string, cells: number): Progress | null {
  try {
    const p = JSON.parse(safeGet(progressKey(day)) ?? "null") as (Omit<Progress, "history" | "future"> & { history?: unknown; future?: unknown }) | null;
    if (!p || !Array.isArray(p.values) || p.values.length !== cells || !Array.isArray(p.notes) || p.notes.length !== cells) return null;
    return {
      values: p.values.map(Number),
      notes: p.notes.map(Number),
      mistakes: Number(p.mistakes) || 0,
      wrong: Number(p.wrong) || 0,
      flagged: Array.isArray(p.flagged) ? p.flagged.map(String) : [],
      history: decodeAll(p.history, cells),
      future: decodeAll(p.future, cells),
    };
  } catch {
    return null;
  }
}

export function setProgress(day: string, p: Progress) {
  safeSet(progressKey(day), JSON.stringify({ ...p, history: p.history.map(encode), future: p.future.map(encode) }));
}
