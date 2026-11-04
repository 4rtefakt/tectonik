import { useMemo, type CSSProperties } from "react";
import { geometry, regionColors, type Geometry } from "@tectonik/shared";
import { useT } from "../i18n/index.js";
import { noteDigits } from "../lib/game.js";

interface Props {
  width: number;
  height: number;
  /** découpage en zones ; null tant que la grille est masquée (avant le départ) */
  regions: string | null;
  givens: string;
  values: number[];
  notes: number[];
  selected: number | null;
  conflicts: Set<number> | null;
  onSelect?: (i: number) => void;
  solved?: boolean;
  /** notes plus grosses et plus contrastées (réglage) */
  bigNotes?: boolean;
  /** zones teintées comme dans les magazines (réglage) */
  tints?: boolean;
}

const NOTE_POS = [1, 2, 3, 4, 5];

/** Contours des zones et cadre, en unités de case (une case = 1 × 1). */
function regionPath(g: Geometry): string {
  let d = "";
  for (let i = 0; i < g.cells; i++) {
    const r = Math.floor(i / g.width);
    const c = i % g.width;
    if (c < g.width - 1 && g.region[i] !== g.region[i + 1]) d += `M${c + 1} ${r}V${r + 1}`;
    if (r < g.height - 1 && g.region[i] !== g.region[i + g.width]) d += `M${c} ${r + 1}H${c + 1}`;
  }
  return d;
}

export function TectonicGrid({ width, height, regions, givens, values, notes, selected, conflicts, onSelect, solved, bigNotes, tints = true }: Props) {
  const t = useT();
  const g = useMemo(() => (regions ? geometry({ width, height, regions }) : null), [width, height, regions]);
  const colors = useMemo(() => (g ? regionColors(g) : null), [g]);
  const path = useMemo(() => (g ? regionPath(g) : ""), [g]);
  const hidden = !g;
  const sel = selected ?? -1;
  const selValue = sel >= 0 ? values[sel]! : 0;
  const cls = ["tecto", solved ? "solved" : "", hidden ? "hidden" : "", bigNotes ? "big-notes" : "", tints && !hidden ? "tinted" : "", onSelect ? "interactive" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} style={{ "--w": width, "--h": height } as CSSProperties}>
      <div className="t-cells" role="grid" aria-label={t.gridLabel} aria-readonly={!onSelect || undefined} id="grid" tabIndex={-1}>
        {Array.from({ length: height }, (_, r) => (
          <div className="t-row" role="row" key={r}>
            {Array.from({ length: width }, (_, c) => {
              const i = r * width + c;
              const v = values[i] ?? 0;
              const given = givens[i] !== "0";
              const related = !!g && sel >= 0 && i !== sel && g.peers[sel]!.includes(i);
              const same = selValue > 0 && v === selValue && i !== sel;
              const bad = !!conflicts?.has(i);
              const cellCls = [
                "t-cell",
                colors ? `z${colors[g!.region[i]!]}` : "",
                given ? "given" : v ? "filled" : "",
                i === sel ? "selected" : related ? "related" : "",
                same ? "same" : "",
                bad ? "conflict" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const nd = v ? [] : noteDigits(notes[i] ?? 0);
              return (
                <div
                  key={c}
                  role="gridcell"
                  className={cellCls}
                  aria-selected={i === sel}
                  aria-label={g ? t.cellLabel(r, c, v, given, nd, g.size[i]!) : undefined}
                  onPointerDown={
                    onSelect
                      ? (e) => {
                          e.preventDefault();
                          onSelect(i);
                        }
                      : undefined
                  }
                >
                  {hidden ? null : v ? (
                    <span className="t-digit">{v}</span>
                  ) : nd.length ? (
                    <span className="t-notes" aria-hidden>
                      {NOTE_POS.map((d) => (
                        <span key={d} className={d === selValue ? "hl" : ""}>
                          {nd.includes(d) ? d : ""}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <svg className="t-zones" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden focusable="false">
        {path && <path d={path} />}
        <rect x="0" y="0" width={width} height={height} />
      </svg>
    </div>
  );
}
