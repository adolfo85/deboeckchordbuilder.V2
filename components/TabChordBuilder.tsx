import React, { useEffect, useState } from 'react';
import { NoteData, TabChordDiagram } from '../types';
import { detectChordName, getNoteAtPosition, getNoteDisplay } from '../utils/theory';

interface TabChordBuilderProps {
  /** True when the cursor sits on a figure the chord can be attached to. */
  hasTarget: boolean;
  /** Chord already attached to the selected figure, if any. */
  attached?: TabChordDiagram;
  onInsert: (chord: TabChordDiagram) => void;
  onRemove: () => void;
}

const FRETS_SHOWN = 5;
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const GUTTER = 46;
const COL_W = 38;
const ROW_H = 22;
const HEAD_H = 16;

/** Small independent fretboard (max. 5 frets) to build a chord and its American chord symbol for the tab. */
export const TabChordBuilder: React.FC<TabChordBuilderProps> = ({ hasTarget, attached, onInsert, onRemove }) => {
  const [frets, setFrets] = useState<(number | null)[]>([null, null, null, null, null, null]);
  const [baseFret, setBaseFret] = useState(1);
  const [rootString, setRootString] = useState<number | null>(null);
  const [rootMode, setRootMode] = useState(false);
  const [flats, setFlats] = useState(false);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [showDiagram, setShowDiagram] = useState(true);

  // --- Derived chord data ---
  const notes: NoteData[] = [];
  frets.forEach((f, s) => {
    if (f === null) return;
    const n = getNoteAtPosition(s, f);
    notes.push({ stringIndex: s, fretNumber: f, note: n.note, octave: n.octave, absoluteSemitone: n.absolute, isRoot: false, accidental: flats ? 'b' : '#' });
  });
  const effRootString = rootString !== null && notes.some(n => n.stringIndex === rootString) ? rootString : (notes[0]?.stringIndex ?? null);
  const root = notes.find(n => n.stringIndex === effRootString);
  const detected = root ? detectChordName(root, notes, flats) : null;
  const name = nameOverride !== null ? nameOverride : (detected ?? '');

  // Keep the visible window in sync when notes fall outside it
  useEffect(() => {
    // no-op: the user controls the window explicitly with the arrows
  }, []);

  const toggleCell = (s: number, fret: number) => {
    if (rootMode) {
      if (frets[s] === fret) { setRootString(s); setRootMode(false); }
      return;
    }
    setFrets(prev => prev.map((f, i) => (i === s ? (f === fret ? null : fret) : f)));
  };
  const toggleOpen = (s: number) => setFrets(prev => prev.map((f, i) => (i === s ? (f === 0 ? null : 0) : f)));
  const clear = () => { setFrets([null, null, null, null, null, null]); setRootString(null); setNameOverride(null); setRootMode(false); };

  const loadAttached = () => {
    if (!attached) return;
    setFrets([...attached.frets]);
    setBaseFret(attached.baseFret);
    setShowDiagram(attached.showDiagram);
    setNameOverride(attached.name);
    setRootString(null);
  };

  const canInsert = hasTarget && (name.trim() !== '' || notes.length > 0);
  const insert = () => {
    if (!canInsert) return;
    onInsert({ name: name.trim(), frets: [...frets], baseFret, showDiagram: showDiagram && notes.length > 0 });
  };

  const width = GUTTER + FRETS_SHOWN * COL_W + 8;
  const height = HEAD_H + 6 * ROW_H + 4;
  const rowY = (s: number) => HEAD_H + (5 - s) * ROW_H + ROW_H / 2;
  const btn = 'px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors';
  const on = 'bg-indigo-600 border-indigo-400 text-white';
  const off = 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700';

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* Mini fretboard */}
      <div>
        <svg width={width} height={height} className="select-none bg-slate-800 rounded-lg border border-slate-700">
          {/* fret numbers */}
          {Array.from({ length: FRETS_SHOWN }).map((_, c) => (
            <text key={c} x={GUTTER + c * COL_W + COL_W / 2} y={11} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#64748b">{baseFret + c}</text>
          ))}
          {/* fret lines */}
          {Array.from({ length: FRETS_SHOWN + 1 }).map((_, c) => (
            <line key={c} x1={GUTTER + c * COL_W} y1={HEAD_H} x2={GUTTER + c * COL_W} y2={HEAD_H + 6 * ROW_H}
              stroke={c === 0 && baseFret === 1 ? '#e2e8f0' : '#475569'} strokeWidth={c === 0 && baseFret === 1 ? 4 : 2} />
          ))}
          {/* strings + open/not-played toggle */}
          {Array.from({ length: 6 }).map((_, s) => (
            <g key={s}>
              <line x1={GUTTER} y1={rowY(s)} x2={GUTTER + FRETS_SHOWN * COL_W} y2={rowY(s)} stroke="#94a3b8" strokeWidth={1 + (5 - s) * 0.25} opacity={0.7} />
              <text x={9} y={rowY(s) + 4} fontSize={11} fontWeight="bold" fill="#64748b" textAnchor="middle">{STRING_LABELS[s]}</text>
              <g style={{ cursor: 'pointer' }} onClick={() => toggleOpen(s)}>
                <rect x={20} y={rowY(s) - ROW_H / 2} width={GUTTER - 22} height={ROW_H} fill="transparent" />
                {frets[s] === 0
                  ? <circle cx={32} cy={rowY(s)} r={6} fill="none" stroke="#e2e8f0" strokeWidth={2} />
                  : <text x={32} y={rowY(s) + 4} fontSize={12} fontWeight="bold" fill="#475569" textAnchor="middle">×</text>}
              </g>
            </g>
          ))}
          {/* cells */}
          {Array.from({ length: 6 }).map((_, s) => Array.from({ length: FRETS_SHOWN }).map((__, c) => {
            const fret = baseFret + c;
            const active = frets[s] === fret;
            const isRoot = active && effRootString === s;
            const n = active ? notes.find(x => x.stringIndex === s)! : null;
            return (
              <g key={`${s}-${c}`} style={{ cursor: 'pointer' }} onClick={() => toggleCell(s, fret)}>
                <rect x={GUTTER + c * COL_W} y={rowY(s) - ROW_H / 2} width={COL_W} height={ROW_H} fill="transparent" />
                {active && n && (
                  <g>
                    <circle cx={GUTTER + c * COL_W + COL_W / 2} cy={rowY(s)} r={9.5}
                      fill={isRoot ? '#dc2626' : '#475569'} stroke={isRoot ? '#fecaca' : '#94a3b8'} strokeWidth={1.5} />
                    <text x={GUTTER + c * COL_W + COL_W / 2} y={rowY(s) + 3.8} fontSize={10} fontWeight="bold" fill="#fff" textAnchor="middle">
                      {getNoteDisplay(n.note, flats, n.accidental)}
                    </text>
                  </g>
                )}
              </g>
            );
          }))}
        </svg>
        <div className="flex items-center gap-1 mt-2">
          <button onClick={() => setBaseFret(Math.max(1, baseFret - 1))} className={`${btn} ${off}`}>◀</button>
          <span className="text-xs font-bold text-slate-300 w-24 text-center">Trastes {baseFret}–{baseFret + FRETS_SHOWN - 1}</span>
          <button onClick={() => setBaseFret(Math.min(20, baseFret + 1))} className={`${btn} ${off}`}>▶</button>
          <button onClick={() => setFlats(!flats)} title="Alternar sostenidos / bemoles (enarmonía)" className={`${btn} ${off} ml-2`}>{flats ? '♭' : '♯'}</button>
          <button onClick={() => setRootMode(!rootMode)} title="Luego tocá la nota que quieras como fundamental"
            className={`${btn} ${rootMode ? 'bg-amber-600 border-amber-400 text-white animate-pulse' : off}`}>Fundamental</button>
          <button onClick={clear} className={`${btn} ${off} hover:!bg-red-900`}>Limpiar</button>
        </div>
      </div>

      {/* Name + insert */}
      <div className="flex flex-col gap-2 min-w-[220px]">
        <span className="text-[10px] uppercase font-bold text-slate-500">Cifrado americano</span>
        <div className="flex items-center gap-1">
          <input value={name} onChange={e => setNameOverride(e.target.value)} placeholder="p. ej. Cmaj7"
            className="flex-grow bg-slate-800 border border-slate-700 rounded-lg text-lg font-black px-3 py-1.5 w-40 text-white outline-none focus:ring-1 focus:ring-indigo-500" />
          {nameOverride !== null && <button onClick={() => setNameOverride(null)} title="Volver al nombre detectado" className={`${btn} ${off}`}>Auto</button>}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
          <input type="checkbox" checked={showDiagram} onChange={e => setShowDiagram(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0" />
          Mostrar diagrama (si no, solo el cifrado)
        </label>
        <button onClick={insert} disabled={!canInsert}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-40 transition-colors shadow-md">
          Insertar sobre la figura seleccionada
        </button>
        {!hasTarget && <span className="text-[11px] text-amber-400">Seleccioná una figura en la tablatura para anclar el acorde.</span>}
        {attached && (
          <div className="flex gap-1 mt-1">
            <button onClick={loadAttached} className={`${btn} ${off}`}>Editar acorde actual ({attached.name || '—'})</button>
            <button onClick={onRemove} className={`${btn} ${off} hover:!bg-red-900`}>Quitar</button>
          </div>
        )}
      </div>
    </div>
  );
};
