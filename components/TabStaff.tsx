import React from 'react';
import { TabScore, TabCursor, TabEvent, TabChordDiagram } from '../types';
import {
  layoutScore, LAYOUT, flagsOf, eventUnits, measureCapacity, measureUsed, beamGroupUnits, STRING_COUNT, tupletLabel, systemMetrics,
  fretToNotationPitch, DEFAULT_STAFF_GAP, getKeySig
} from '../utils/tabs';

interface TabStaffProps {
  score: TabScore;
  width: number;
  editable?: boolean;
  cursor?: TabCursor | null;
  onCursorChange?: (c: TabCursor) => void;
  playbackCursor?: { m: number; slot: number } | null;
  onStaffGapChange?: (gap: number) => void;
}

const SANS = "'Inter', sans-serif";
const SERIF = "'Times New Roman', serif";

const RestGlyph: React.FC<{ ev: TabEvent; cx: number; cy: number }> = ({ ev, cx, cy }) => {
  const flags = flagsOf(ev.duration);
  let glyph: React.ReactNode;
  if (ev.duration === 'w') glyph = <rect x={cx - 6} y={cy - 6} width={12} height={5} fill="#000" />;
  else if (ev.duration === 'h') glyph = <rect x={cx - 6} y={cy - 1} width={12} height={5} fill="#000" />;
  else if (ev.duration === 'q') glyph = <polyline points={`${cx - 3},${cy - 10} ${cx + 3},${cy - 4} ${cx - 3},${cy + 2} ${cx + 3},${cy + 8}`} fill="none" stroke="#000" strokeWidth={2} strokeLinejoin="round" />;
  else glyph = (
    <g>
      <line x1={cx + 3} y1={cy - 9} x2={cx - 3} y2={cy + 9} stroke="#000" strokeWidth={1.6} />
      {Array.from({ length: flags }).map((_, i) => (
        <circle key={i} cx={cx + 1 - i * 1.5} cy={cy - 7 + i * 5} r={2} fill="#000" />
      ))}
    </g>
  );
  return (
    <g>
      {glyph}
      {ev.dotted && <circle cx={cx + 9} cy={cy} r={1.6} fill="#000" />}
    </g>
  );
};

/** American chord symbol + optional 5-fret mini diagram, anchored above `staffTop`. */
const ChordMark: React.FC<{ chord: TabChordDiagram; cx: number; staffTop: number; hasDiagramInSystem: boolean }> = ({ chord, cx, staffTop, hasDiagramInSystem }) => {
  const gx0 = cx - 15;
  const nameY = hasDiagramInSystem ? staffTop - 58 : staffTop - 12;
  const gridTop = staffTop - 46;
  return (
    <g fontFamily={SANS} fill="#000">
      <text x={cx} y={nameY} fontSize={13} fontWeight="bold" textAnchor="middle">{chord.name}</text>
      {chord.showDiagram && (
        <g>
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`f${i}`} x1={gx0} y1={gridTop + i * 7} x2={gx0 + 30} y2={gridTop + i * 7} stroke="#000" strokeWidth={i === 0 && chord.baseFret <= 1 ? 2.6 : 0.8} />
          ))}
          {Array.from({ length: 6 }).map((_, s) => (
            <line key={`s${s}`} x1={gx0 + s * 6} y1={gridTop} x2={gx0 + s * 6} y2={gridTop + 35} stroke="#000" strokeWidth={0.8} />
          ))}
          {chord.frets.map((f, s) => {
            const x = gx0 + s * 6;
            if (f === null) return <text key={s} x={x} y={gridTop - 3} fontSize={8} fontWeight="bold" textAnchor="middle">×</text>;
            if (f === 0) return <circle key={s} cx={x} cy={gridTop - 5} r={2} fill="none" stroke="#000" strokeWidth={0.9} />;
            const row = f - chord.baseFret;
            if (row < 0 || row > 4) return null;
            return <circle key={s} cx={x} cy={gridTop + row * 7 + 3.5} r={2.6} fill="#000" />;
          })}
          {chord.baseFret > 1 && <text x={gx0 + 34} y={gridTop + 7} fontSize={8} fontWeight="bold">{chord.baseFret}</text>}
        </g>
      )}
    </g>
  );
};

export const TabStaff: React.FC<TabStaffProps> = ({ score, width, editable = false, cursor, onCursorChange, playbackCursor, onStaffGapChange }) => {
  const layout = layoutScore(score, width, editable);
  const { lineGap, staffH, topMargin } = LAYOUT;
  const { systems: metrics, height } = systemMetrics(score);
  const sysStaffTop = (si: number) => metrics[si].top + metrics[si].extra + topMargin;
  const lastIndex = score.measures.length - 1;

  // Event positions (for ties and articulations across measures / systems)
  const pos: Record<string, { si: number; cx: number }> = {};
  layout.forEach((sys, si) => sys.measures.forEach(ml => {
    score.measures[ml.index].events.forEach((_, ei) => { pos[`${ml.index}:${ei}`] = { si, cx: ml.slots[ei].cx }; });
  }));
  const nextOf = (mi: number, ei: number) => {
    const m = score.measures[mi];
    if (ei + 1 < m.events.length) return { mi, ei: ei + 1, ev: m.events[ei + 1] };
    const n = score.measures[mi + 1];
    return n && n.events.length ? { mi: mi + 1, ei: 0, ev: n.events[0] } : null;
  };
  const prevOf = (mi: number, ei: number) => {
    if (ei > 0) return score.measures[mi].events[ei - 1];
    const p = score.measures[mi - 1];
    return p && p.events.length ? p.events[p.events.length - 1] : null;
  };
  const tiedIn = (mi: number, ei: number, s: number, fret: number) => {
    const p = prevOf(mi, ei);
    return !!(p && !p.rest && p.ties?.[s] && p.frets[s] === fret);
  };
  const fretHalfW = (label: string) => label.length * 3.4 + 1.5;

  // Tie curves
  const tieNodes: React.ReactNode[] = [];
  score.measures.forEach((m, mi) => m.events.forEach((ev, ei) => {
    if (ev.rest || !ev.ties) return;
    ev.frets.forEach((fret, s) => {
      if (fret === null || !ev.ties![s]) return;
      const nx = nextOf(mi, ei);
      if (!nx || nx.ev.frets[s] !== fret) return;
      const a = pos[`${mi}:${ei}`];
      const b = pos[`${nx.mi}:${nx.ei}`];
      if (!a || !b) return;
      const yOf = (si: number) => sysStaffTop(si) + (STRING_COUNT - 1 - s) * lineGap - 8;
      const startX = a.cx + fretHalfW(String(fret)) + 1;
      const endX = b.cx - fretHalfW(`(${fret})`) - 1;
      const arc = (x1: number, x2: number, y: number, k: string) => (
        <path key={k} d={`M ${x1} ${y} Q ${(x1 + x2) / 2} ${y - 11} ${x2} ${y}`} fill="none" stroke="#000" strokeWidth={1.3} strokeLinecap="round" />
      );
      if (a.si === b.si) {
        tieNodes.push(arc(startX, endX, yOf(a.si), `t-${mi}-${ei}-${s}`));
      } else {
        const endA = layout[a.si].measures[layout[a.si].measures.length - 1];
        tieNodes.push(arc(startX, endA.x + endA.w - 4, yOf(a.si), `ta-${mi}-${ei}-${s}`));
        tieNodes.push(arc(LAYOUT.clefW + 6, endX, yOf(b.si), `tb-${mi}-${ei}-${s}`));
      }
    });
  }));

  // Articulations: Hammer-on / Pull-off and Slide / Glissando
  const artNodes: React.ReactNode[] = [];
  score.measures.forEach((m, mi) => m.events.forEach((ev, ei) => {
    if (ev.rest) return;
    ev.frets.forEach((fret, s) => {
      if (fret === null) return;
      const nx = nextOf(mi, ei);
      if (!nx || nx.ev.rest || nx.ev.frets[s] === null) return;
      const nextFret = nx.ev.frets[s]!;
      const a = pos[`${mi}:${ei}`];
      const b = pos[`${nx.mi}:${nx.ei}`];
      if (!a || !b) return;

      const yLine = sysStaffTop(a.si) + (STRING_COUNT - 1 - s) * lineGap;
      const startX = a.cx + fretHalfW(String(fret)) + 2;
      const endX = b.cx - fretHalfW(String(nextFret)) - 2;

      // 1. Hammer-on / Pull-off
      if (ev.hammerPull?.[s]) {
        const hpLabel = nextFret > fret ? 'h' : nextFret < fret ? 'p' : 'h';
        const yArc = yLine - 8;
        if (a.si === b.si) {
          const midX = (startX + endX) / 2;
          artNodes.push(
            <g key={`hp-${mi}-${ei}-${s}`}>
              <path d={`M ${startX} ${yArc} Q ${midX} ${yArc - 9} ${endX} ${yArc}`} fill="none" stroke="#000" strokeWidth={1.3} strokeLinecap="round" />
              <text x={midX} y={yArc - 10} fontSize={8.5} fontStyle="italic" fontWeight="bold" textAnchor="middle" fontFamily={SANS} fill="#000">{hpLabel}</text>
            </g>
          );
        } else {
          const endA = layout[a.si].measures[layout[a.si].measures.length - 1];
          artNodes.push(
            <path key={`hpa-${mi}-${ei}-${s}`} d={`M ${startX} ${yArc} Q ${(startX + endA.x + endA.w) / 2} ${yArc - 9} ${endA.x + endA.w - 4} ${yArc}`} fill="none" stroke="#000" strokeWidth={1.3} strokeLinecap="round" />
          );
          const yArcB = sysStaffTop(b.si) + (STRING_COUNT - 1 - s) * lineGap - 8;
          artNodes.push(
            <path key={`hpb-${mi}-${ei}-${s}`} d={`M ${LAYOUT.clefW + 6} ${yArcB} Q ${(LAYOUT.clefW + 6 + endX) / 2} ${yArcB - 9} ${endX} ${yArcB}`} fill="none" stroke="#000" strokeWidth={1.3} strokeLinecap="round" />
          );
        }
      }

      // 2. Slide / Glissando (Arrastre)
      if (ev.slides?.[s]) {
        const dy = nextFret >= fret ? 3.5 : -3.5;
        if (a.si === b.si) {
          artNodes.push(
            <line
              key={`sl-${mi}-${ei}-${s}`}
              x1={startX}
              y1={yLine + dy}
              x2={endX}
              y2={yLine - dy}
              stroke="#000"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        } else {
          const endA = layout[a.si].measures[layout[a.si].measures.length - 1];
          artNodes.push(
            <line key={`sla-${mi}-${ei}-${s}`} x1={startX} y1={yLine + dy} x2={endA.x + endA.w - 4} y2={yLine} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
          );
          const yLineB = sysStaffTop(b.si) + (STRING_COUNT - 1 - s) * lineGap;
          artNodes.push(
            <line key={`slb-${mi}-${ei}-${s}`} x1={LAYOUT.clefW + 6} y1={yLineB} x2={endX} y2={yLineB - dy} stroke="#000" strokeWidth={1.5} strokeLinecap="round" />
          );
        }
      }
    });
  }));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible select-none" style={{ display: 'block' }}>
      {layout.map((sys, si) => {
        const hasNotation = !!score.showStandardNotation;
        const staffGap = score.staffGap ?? DEFAULT_STAFF_GAP;
        const staffTop = sysStaffTop(si);
        const staffBottom = staffTop + staffH;
        const notTop = staffTop - 32 - staffGap;
        const sysEnd = sys.measures[sys.measures.length - 1];
        const x1 = sysEnd.x + sysEnd.w;
        const lineY = (s: number) => staffTop + (STRING_COUNT - 1 - s) * lineGap;
        const sepY = notTop + 32 + staffGap / 2;

        return (
          <g key={`sys-${si}`}>
            {/* Cursor measure highlight */}
            {editable && sys.measures.map(ml => cursor && cursor.m === ml.index && (
              <rect key={`hl-${ml.index}`} x={ml.x} y={(hasNotation ? notTop : staffTop) - 6} width={ml.w} height={(hasNotation ? staffBottom - notTop : staffH) + 12} fill="#eef2ff" />
            ))}

            {/* Standard notation staff lines (5 lines) */}
            {hasNotation && Array.from({ length: 5 }).map((_, i) => (
              <line key={`not-l-${i}`} x1={0} y1={notTop + i * 8} x2={x1} y2={notTop + i * 8} stroke="#000" strokeWidth={1} />
            ))}

            {/* Tablatura staff lines (6 lines) */}
            {Array.from({ length: STRING_COUNT }).map((_, s) => (
              <line key={`l-${s}`} x1={0} y1={lineY(s)} x2={x1} y2={lineY(s)} stroke="#000" strokeWidth={1} />
            ))}

            {/* Left barline connecting staves */}
            <line x1={0.5} y1={hasNotation ? notTop : staffTop} x2={0.5} y2={staffBottom} stroke="#000" strokeWidth={hasNotation ? 2 : 1.5} />

            {/* Interactive Staff Separation Handle between standard notation and tablatura */}
            {editable && hasNotation && onStaffGapChange && (
              <g>
                <line
                  x1={0} y1={sepY} x2={x1} y2={sepY}
                  stroke="#818cf8" strokeWidth={1.2} strokeDasharray="5 4" opacity={0.35}
                />
                <g transform={`translate(${Math.max(64, Math.min(x1 / 2, width - 80))}, ${sepY})`}>
                  <rect
                    x={-46} y={-10} width={92} height={20} rx={10}
                    fill="#0f172a" stroke="#6366f1" strokeWidth={1.2}
                  />
                  <text x={-26} y={3.5} fontSize={9.5} fontWeight="bold" fill="#a5b4fc" fontFamily={SANS} textAnchor="middle" pointerEvents="none">
                    ↕ {Math.round(staffGap)}px
                  </text>
                  {/* Up button (decrease spacing) */}
                  <g
                    cursor="pointer"
                    onClick={(e) => { e.stopPropagation(); onStaffGapChange(Math.max(26, staffGap - 6)); }}
                    title="Reducir separación entre partitura y tablatura"
                  >
                    <rect x={-3} y={-8} width={17} height={16} rx={3} fill="#1e1b4b" className="hover:fill-indigo-600" />
                    <text x={5.5} y={3.5} fontSize={9} fontWeight="bold" fill="#c7d2fe" textAnchor="middle">▲</text>
                  </g>
                  {/* Down button (increase spacing) */}
                  <g
                    cursor="pointer"
                    onClick={(e) => { e.stopPropagation(); onStaffGapChange(Math.min(110, staffGap + 6)); }}
                    title="Aumentar separación entre partitura y tablatura"
                  >
                    <rect x={18} y={-8} width={17} height={16} rx={3} fill="#1e1b4b" className="hover:fill-indigo-600" />
                    <text x={26.5} y={3.5} fontSize={9} fontWeight="bold" fill="#c7d2fe" textAnchor="middle">▼</text>
                  </g>
                </g>
              </g>
            )}

            {sys.measures.map(ml => {
              const m = score.measures[ml.index];
              const isLast = ml.index === lastIndex;
              const xEnd = ml.x + ml.w;
              const clefOffset = ml.k === 0 ? LAYOUT.clefW : 0;
              const used = measureUsed(m);
              const cap = measureCapacity(m.timeSig);
              const isOver = used > cap + 0.001;
              const isUnder = used < cap - 0.001;
              const tsX = ml.x + clefOffset + (hasNotation ? ml.keySigW : 0) + 13;

              // Beam runs
              const starts: number[] = [];
              let acc = 0;
              m.events.forEach(e => { starts.push(acc); acc += eventUnits(e); });
              const groupU = beamGroupUnits(m.timeSig);
              const runs: number[][] = [];
              let cur: number[] = [];
              let curGroup = -1;
              m.events.forEach((e, i) => {
                const f = flagsOf(e.duration);
                const g = Math.floor(starts[i] / groupU + 1e-9);
                if (!e.rest && f > 0) {
                  if (cur.length && g === curGroup) cur.push(i);
                  else { if (cur.length) runs.push(cur); cur = [i]; curGroup = g; }
                } else { if (cur.length) runs.push(cur); cur = []; }
              });
              if (cur.length) runs.push(cur);

              const stemTop = staffBottom + 8;
              const stemEnd = staffBottom + 34;

              return (
                <g key={`m-${ml.index}`}>
                  {/* Measure number at system start */}
                  {ml.k === 0 && (
                    <text x={2} y={(hasNotation ? notTop : staffTop) - 8} fontSize={9} fill="#94a3b8" fontFamily={SANS}>
                      {ml.index + 1}
                    </text>
                  )}

                  {/* Standard Treble Clef in Partitura */}
                  {hasNotation && ml.k === 0 && (
                    <text x={ml.x + 8} y={notTop + 27} fontSize={32} fontFamily="'Segoe UI Symbol', 'Noto Music', 'Bravura', serif" fill="#000">
                      𝄞
                    </text>
                  )}

                  {/* Key signature in Standard Notation */}
                  {hasNotation && ml.showKeySig && (() => {
                    const kDef = getKeySig(ml.keySig);
                    const kStartX = ml.x + (ml.k === 0 ? LAYOUT.clefW : 2);
                    return (
                      <g fontFamily={SERIF} fontWeight="bold" fontSize={13} textAnchor="middle" fill="#000">
                        {kDef.accidentals.map((accItem, accIdx) => {
                          const accX = kStartX + accIdx * 8 + 4;
                          const accY = notTop + 32 - (accItem.step - 2) * 4;
                          return (
                            <text key={`ks-${accIdx}`} x={accX} y={accY + 4.2}>
                              {accItem.acc === '#' ? '♯' : '♭'}
                            </text>
                          );
                        })}
                      </g>
                    );
                  })()}

                  {/* TAB clef */}
                  {ml.k === 0 && ['T', 'A', 'B'].map((ch, i) => (
                    <text key={ch} x={ml.x + 14} y={staffTop + 17 + i * 14} fontSize={13} fontWeight="bold" textAnchor="middle" fontFamily={SANS} fill="#000">{ch}</text>
                  ))}

                  {/* Time signature in Standard Notation */}
                  {hasNotation && ml.showTS && (
                    <g fontFamily={SERIF} fontWeight="bold" fontSize={16} textAnchor="middle" fill="#000">
                      <text x={tsX} y={notTop + 14}>{m.timeSig.num}</text>
                      <text x={tsX} y={notTop + 29}>{m.timeSig.den}</text>
                    </g>
                  )}

                  {/* Time signature in Tablatura */}
                  {ml.showTS && (
                    <g fontFamily={SERIF} fontWeight="bold" fontSize={20} textAnchor="middle" fill="#000">
                      <text x={tsX} y={staffTop + 22}>{m.timeSig.num}</text>
                      <text x={tsX} y={staffTop + 44}>{m.timeSig.den}</text>
                    </g>
                  )}

                  {/* Tempo */}
                  {ml.showTempo && (() => {
                    const tx = ml.x + (ml.k === 0 ? 22 : 4);
                    const ty = (hasNotation ? notTop : staffTop) - 12;
                    return (
                      <g fontFamily={SANS} fill="#000">
                        <ellipse cx={tx + 3} cy={ty} rx={3.4} ry={2.4} fill="#000" transform={`rotate(-20 ${tx + 3} ${ty})`} />
                        <line x1={tx + 6} y1={ty - 1} x2={tx + 6} y2={ty - 12} stroke="#000" strokeWidth={1.2} />
                        <text x={tx + 11} y={ty + 3} fontSize={11} fontWeight="bold">= {m.tempo}</text>
                      </g>
                    );
                  })()}

                  {/* Fill indicator (editor only) */}
                  {editable && (isOver || isUnder) && (
                    <text x={xEnd - 6} y={(hasNotation ? notTop : staffTop) - 8} fontSize={9} textAnchor="end" fontFamily={SANS} fill={isOver ? '#dc2626' : '#d97706'}>
                      {isOver ? 'excede' : 'incompleto'}
                    </text>
                  )}

                  {/* Measure end barline */}
                  {isLast ? (
                    <g>
                      <line x1={xEnd - 5} y1={hasNotation ? notTop : staffTop} x2={xEnd - 5} y2={staffBottom} stroke="#000" strokeWidth={1} />
                      <line x1={xEnd - 1.5} y1={hasNotation ? notTop : staffTop} x2={xEnd - 1.5} y2={staffBottom} stroke="#000" strokeWidth={3} />
                    </g>
                  ) : (
                    <line x1={xEnd} y1={hasNotation ? notTop : staffTop} x2={xEnd} y2={staffBottom} stroke="#000" strokeWidth={1} />
                  )}

                  {/* Events */}
                  {m.events.map((ev, ei) => {
                    const cx = ml.slots[ei].cx;
                    const f = flagsOf(ev.duration);
                    const inRun = runs.some(r => r.includes(ei) && r.length > 1);
                    return (
                      <g key={ev.id}>
                        {/* Standard Notation: Notes, Rests, Ledger Lines, Accidentals, Stems */}
                        {hasNotation && (
                          ev.rest ? (
                            <RestGlyph ev={ev} cx={cx} cy={notTop + 16} />
                          ) : (() => {
                            const keySigId = ml.keySig || score.keySig || 'C';
                            const pitches: { fret: number; stringIdx: number; step: number; accidental: 'b' | '#' | 'n' | null; y: number }[] = [];
                            ev.frets.forEach((fr, s) => {
                              if (fr === null) return;
                              const override = ev.accidentals?.[s] ?? null;
                              const { totalStep, accidental } = fretToNotationPitch(s, fr, keySigId, override);
                              const y = notTop + 32 - (totalStep - 2) * 4;
                              pitches.push({ fret: fr, stringIdx: s, step: totalStep, accidental, y });
                            });
                            if (!pitches.length) return null;

                            const minY = Math.min(...pitches.map(p => p.y));
                            const maxY = Math.max(...pitches.map(p => p.y));
                            const avgStep = pitches.reduce((accP, p) => accP + p.step, 0) / pitches.length;
                            const stemDown = avgStep >= 6;
                            const stemX = stemDown ? cx - 4.2 : cx + 4.2;
                            const stemY1 = stemDown ? minY : maxY;
                            const stemY2 = stemDown ? maxY + 24 : minY - 24;

                            return (
                              <g key={`not-ev-${ev.id}`}>
                                {/* Ledger lines: ONLY drawn when note is on or beyond that line! */}
                                {pitches.map((p, pi) => {
                                  const llines: React.ReactNode[] = [];
                                  if (p.step <= 0) {
                                    // Low notes below staff: line 1 E4 is step 2, space D4 is step 1.
                                    // Step 0 = middle C (1st ledger line below), -2 = A3 (2nd ledger line), etc.
                                    for (let ls = 0; ls >= p.step; ls -= 2) {
                                      const ly = notTop + 32 - (ls - 2) * 4;
                                      llines.push(<line key={`nled-${pi}-${ls}`} x1={cx - 7.5} y1={ly} x2={cx + 7.5} y2={ly} stroke="#000" strokeWidth={1.2} />);
                                    }
                                  } else if (p.step >= 12) {
                                    // High notes above staff: line 5 F5 is step 10, space G5 is step 11.
                                    // Step 12 = A5 (1st ledger line above), 14 = C6 (2nd ledger line), etc.
                                    for (let ls = 12; ls <= p.step; ls += 2) {
                                      const ly = notTop + 32 - (ls - 2) * 4;
                                      llines.push(<line key={`nled-${pi}-${ls}`} x1={cx - 7.5} y1={ly} x2={cx + 7.5} y2={ly} stroke="#000" strokeWidth={1.2} />);
                                    }
                                  }
                                  return <g key={`led-${pi}`}>{llines}</g>;
                                })}

                                {/* Accidentals (supports Sharp, Flat, and Courtesy Natural) */}
                                {pitches.map((p, pi) => p.accidental ? (
                                  <text key={`nacc-${pi}`} x={cx - 10.5} y={p.y + 3.8} fontSize={11} fontFamily={SERIF} fontWeight="bold" textAnchor="middle" fill="#000">
                                    {p.accidental === '#' ? '♯' : p.accidental === 'b' ? '♭' : '♮'}
                                  </text>
                                ) : null)}

                                {/* Noteheads */}
                                {pitches.map((p, pi) => (
                                  <g key={`nhead-${pi}`}>
                                    {ev.duration === 'w' ? (
                                      <ellipse cx={cx} cy={p.y} rx={4.6} ry={3.2} fill="none" stroke="#000" strokeWidth={1.4} transform={`rotate(-20 ${cx} ${p.y})`} />
                                    ) : ev.duration === 'h' ? (
                                      <ellipse cx={cx} cy={p.y} rx={4.4} ry={3} fill="none" stroke="#000" strokeWidth={1.4} transform={`rotate(-20 ${cx} ${p.y})`} />
                                    ) : (
                                      <ellipse cx={cx} cy={p.y} rx={4.4} ry={3} fill="#000" transform={`rotate(-20 ${cx} ${p.y})`} />
                                    )}
                                    {ev.dotted && <circle cx={cx + 7.5} cy={p.y} r={1.6} fill="#000" />}
                                  </g>
                                ))}

                                {/* Stem on standard staff */}
                                {ev.duration !== 'w' && (
                                  <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke="#000" strokeWidth={1.2} />
                                )}
                              </g>
                            );
                          })()
                        )}

                        {/* Fret numbers on Tablatura */}
                        {!ev.rest && ev.frets.map((fret, s) => {
                          if (fret === null) return null;
                          const lbl = tiedIn(ml.index, ei, s, fret) ? `(${fret})` : String(fret);
                          return (
                            <g key={s}>
                              <rect x={cx - fretHalfW(lbl)} y={lineY(s) - 6.5} width={fretHalfW(lbl) * 2} height={13} fill={editable && cursor && cursor.m === ml.index ? '#eef2ff' : '#fff'} />
                              <text x={cx} y={lineY(s) + 4.2} fontSize={12} fontWeight="bold" textAnchor="middle" fontFamily={SANS} fill="#000">{lbl}</text>
                            </g>
                          );
                        })}

                        {/* Rhythm below Tablatura */}
                        {ev.rest ? (
                          <RestGlyph ev={ev} cx={cx} cy={staffBottom + 22} />
                        ) : (
                          <g>
                            {ev.duration === 'w' ? (
                              <ellipse cx={cx} cy={staffBottom + 22} rx={5} ry={3.4} fill="none" stroke="#000" strokeWidth={1.4} />
                            ) : (
                              <line x1={cx} y1={stemTop} x2={cx} y2={stemEnd} stroke="#000" strokeWidth={1.3} />
                            )}
                            {ev.duration === 'h' && <ellipse cx={cx} cy={stemEnd + 2} rx={4} ry={2.8} fill="none" stroke="#000" strokeWidth={1.3} />}
                            {f > 0 && !inRun && Array.from({ length: f }).map((_, i) => (
                              <line key={i} x1={cx} y1={stemEnd - i * 4} x2={cx + 6} y2={stemEnd - i * 4 - 6} stroke="#000" strokeWidth={1.6} />
                            ))}
                            {ev.dotted && <circle cx={cx + 7} cy={ev.duration === 'w' ? staffBottom + 22 : stemEnd - 2} r={1.6} fill="#000" />}
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Chord symbols / diagrams */}
                  {m.events.map((ev, ei) => ev.chord ? (
                    <ChordMark key={`ch-${ev.id}`} chord={ev.chord} cx={ml.slots[ei].cx} staffTop={hasNotation ? notTop - 8 : staffTop} hasDiagramInSystem={metrics[si].hasDiagram} />
                  ) : null)}

                  {/* Tuplet brackets */}
                  {(() => {
                    const nodes: React.ReactNode[] = [];
                    let i = 0;
                    while (i < m.events.length) {
                      const t = m.events[i].tuplet;
                      if (!t) { i++; continue; }
                      let j = i;
                      while (j + 1 < m.events.length && m.events[j + 1].tuplet?.id === t.id) j++;
                      const x1 = ml.slots[i].cx - 5;
                      const x2 = ml.slots[j].cx + 5;
                      const xm = (x1 + x2) / 2;
                      const by = staffBottom + 42;
                      const label = tupletLabel(t.actual, t.normal);
                      const gap = label.length * 4 + 4;
                      nodes.push(
                        <g key={`tp-${i}`} stroke="#000" strokeWidth={1} fill="none">
                          <polyline points={`${x1},${by - 4} ${x1},${by} ${xm - gap},${by}`} />
                          <polyline points={`${xm + gap},${by} ${x2},${by} ${x2},${by - 4}`} />
                          <text x={xm} y={by + 3.5} fontSize={11} fontStyle="italic" fontWeight="bold" textAnchor="middle" fontFamily={SANS} fill="#000" stroke="none">{label}</text>
                        </g>
                      );
                      i = j + 1;
                    }
                    return nodes;
                  })()}

                  {/* Beams */}
                  {runs.filter(r => r.length > 1).map((run, ri) => {
                    const els: React.ReactNode[] = [];
                    for (let level = 1; level <= 3; level++) {
                      const y = stemEnd - (level - 1) * 4;
                      run.forEach((ei, pos) => {
                        const has = flagsOf(m.events[ei].duration) >= level;
                        if (!has) return;
                        const x = ml.slots[ei].cx;
                        const nextEi = run[pos + 1];
                        const prevEi = run[pos - 1];
                        const nextHas = nextEi !== undefined && flagsOf(m.events[nextEi].duration) >= level;
                        const prevHas = prevEi !== undefined && flagsOf(m.events[prevEi].duration) >= level;
                        if (nextHas) {
                          els.push(<line key={`b-${ri}-${level}-${pos}`} x1={x} y1={y} x2={ml.slots[nextEi].cx} y2={y} stroke="#000" strokeWidth={2.6} />);
                        } else if (!prevHas) {
                          // Lone secondary beam: short stub toward the neighbour
                          const dir = nextEi !== undefined ? 1 : -1;
                          els.push(<line key={`s-${ri}-${level}-${pos}`} x1={x} y1={y} x2={x + dir * 6} y2={y} stroke="#000" strokeWidth={2.6} />);
                        }
                      });
                    }
                    return <g key={`run-${ri}`}>{els}</g>;
                  })}

                  {/* Interactive overlay */}
                  {editable && onCursorChange && ml.slots.map((slot, j) => {
                    const isCursorSlot = cursor && cursor.m === ml.index && cursor.slot === j;
                    return (
                      <g key={`ov-${j}`}>
                        {isCursorSlot && (
                          <rect x={slot.cx - slot.w / 2 + 1} y={staffTop - 4} width={Math.max(slot.w - 2, 4)} height={staffH + 8} fill="#4f46e5" opacity={0.08} pointerEvents="none" />
                        )}
                        {Array.from({ length: STRING_COUNT }).map((_, s) => {
                          const active = isCursorSlot && cursor!.string === s;
                          return (
                            <rect
                              key={s}
                              x={slot.cx - slot.w / 2} y={lineY(s) - lineGap / 2}
                              width={slot.w} height={lineGap}
                              fill={active ? 'rgba(79,70,229,0.28)' : 'transparent'}
                              stroke={active ? '#4f46e5' : 'none'} strokeWidth={1.2} rx={2}
                              style={{ cursor: 'pointer' }}
                              onClick={() => onCursorChange({ m: ml.index, slot: j, string: s })}
                            />
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Playback cursor highlight */}
                  {playbackCursor && playbackCursor.m === ml.index && ml.slots[playbackCursor.slot] && (
                    <g pointerEvents="none">
                      <rect
                        x={ml.slots[playbackCursor.slot].cx - 2}
                        y={(hasNotation ? notTop : staffTop) - 4}
                        width={4}
                        height={(hasNotation ? staffH + 58 : staffH) + 38}
                        fill="#f59e0b"
                        rx={2}
                        opacity={0.9}
                      />
                      <polygon
                        points={`${ml.slots[playbackCursor.slot].cx - 6},${(hasNotation ? notTop : staffTop) - 6} ${ml.slots[playbackCursor.slot].cx + 6},${(hasNotation ? notTop : staffTop) - 6} ${ml.slots[playbackCursor.slot].cx},${hasNotation ? notTop : staffTop}`}
                        fill="#f59e0b"
                      />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
      {tieNodes}
      {artNodes}
    </svg>
  );
};
