import React, { useEffect, useRef, useState } from 'react';
import {
  Camera, Trash2, Plus, Eraser, ChevronDown, ChevronUp, Music, Clock,
  LayoutGrid, Guitar, X, Layers, Play, Pause, Square, PanelLeft, PanelLeftClose
} from 'lucide-react';
import { NoteValue, TabCursor, TabEvent, TabMeasure, TabScore, TabChordDiagram } from '../types';
import { TabStaff } from './TabStaff';
import { TabChordBuilder } from './TabChordBuilder';
import {
  NOTE_VALUES, TIME_SIG_PRESETS, TAB_WIDTH, MAX_FRET, STRING_COUNT,
  createEvent, createMeasure, createEmptyScore, emptyFrets, measureCapacity, measureUsed,
  resizeEvent, writeFret, advanceFrom, TUPLETS, insertTuplet, removeTuplet,
  KEY_SIGNATURES, getKeySig, DEFAULT_STAFF_GAP, fretToNotationPitch
} from '../utils/tabs';
import { startTabPlayback, TabPlaybackController, PlaybackArticulation } from '../utils/tabAudio';

interface TabEditorProps {
  score: TabScore;
  onChange: (s: TabScore) => void;
  onCapture: () => void;
}

const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

const NoteIcon: React.FC<{ v: NoteValue }> = ({ v }) => {
  const hollow = v === 'w' || v === 'h';
  const flags = NOTE_VALUES.find(n => n.id === v)!.flags;
  return (
    <svg width="22" height="28" viewBox="0 0 22 28">
      <ellipse cx="9" cy="21" rx="5" ry="3.6" transform="rotate(-20 9 21)" fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.6" />
      {v !== 'w' && <line x1="13.5" y1="20" x2="13.5" y2="4" stroke="currentColor" strokeWidth="1.6" />}
      {flags > 0 && Array.from({ length: flags }).map((_, i) => (
        <path key={i} d={`M 13.5 ${4 + i * 4.5} Q 18 ${6 + i * 4.5} 17 ${11 + i * 4.5}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ))}
    </svg>
  );
};

const mutateMeasure = (s: TabScore, mi: number, fn: (m: TabMeasure) => TabMeasure): TabScore => ({
  ...s, measures: s.measures.map((m, i) => (i === mi ? fn(m) : m)),
});

const fmtQuarters = (units: number) => {
  const q = units / 16;
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

export const TabEditor: React.FC<TabEditorProps> = ({ score, onChange, onCapture }) => {
  const [cursor, setCursorState] = useState<TabCursor>({ m: 0, slot: 0, string: 5 });
  const [duration, setDuration] = useState<NoteValue>('q');
  const [dotted, setDotted] = useState(false);
  const [tempoText, setTempoText] = useState('120');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [tupletKey, setTupletKey] = useState('3:2');
  const [onlyThis, setOnlyThis] = useState(false);

  // Lateral sidebar state & accordion sections
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sections, setSections] = useState<Record<string, boolean>>({
    figures: true,
    accidentals: true,
    articulations: true,
    chords: true,
    timeSig: false,
    layout: false,
    measures: false,
  });

  const toggleSection = (k: string) => setSections(prev => ({ ...prev, [k]: !prev[k] }));
  const expandAll = () => setSections({ figures: true, accidentals: true, articulations: true, chords: true, timeSig: true, layout: true, measures: true });
  const collapseAll = () => setSections({ figures: false, accidentals: false, articulations: false, chords: false, timeSig: false, layout: false, measures: false });

  // Playback state
  const [playbackCursor, setPlaybackCursor] = useState<{ m: number; slot: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [articulation, setArticulation] = useState<PlaybackArticulation>(
    score.playbackArticulation || 'legato'
  );
  const playbackRef = useRef<TabPlaybackController | null>(null);

  // A typed 1 or 2 may still become a two-digit fret (10-24), so the advance waits briefly.
  const pending = useRef<{ key: string; fret: number; timer: number } | null>(null);
  const latest = useRef<{ score: TabScore; cur: TabCursor; auto: boolean }>(null as any);

  // Keep the cursor inside the score
  const safeM = Math.min(cursor.m, score.measures.length - 1);
  const curMeasure = score.measures[safeM];
  const safeSlot = Math.min(cursor.slot, curMeasure.events.length);
  const cur: TabCursor = { m: safeM, slot: safeSlot, string: cursor.string };
  const curEvent: TabEvent | undefined = curMeasure.events[cur.slot];
  const curFret = curEvent && !curEvent.rest ? curEvent.frets[cur.string] : null;
  const curAccidental = curEvent?.accidentals?.[cur.string] ?? null;
  const activeKeySigId = curMeasure.keySig || score.keySig || 'C';
  const curKeyDef = getKeySig(activeKeySigId);

  const handleInsertChord = (chord: TabChordDiagram) => {
    if (curEvent) {
      patchEvent({ chord });
    } else {
      const ev = createEvent(duration, dotted, true);
      ev.chord = chord;
      onChange(mutateMeasure(score, cur.m, m => ({ ...m, events: [...m.events, ev] })));
    }
  };

  const handleRemoveChord = () => {
    if (!curEvent) return;
    patchEvent({ chord: undefined });
  };

  useEffect(() => { setTempoText(String(curMeasure.tempo)); }, [curMeasure.tempo, safeM]);

  latest.current = { score, cur, auto: autoAdvance };

  const keyOf = (c: TabCursor) => `${c.m}:${c.slot}:${c.string}`;
  const cancelPending = () => {
    if (pending.current) { window.clearTimeout(pending.current.timer); pending.current = null; }
  };

  const setCursor = (c: TabCursor, sc: TabScore = score) => {
    cancelPending();
    setCursorState(c);
    const ev = sc.measures[c.m]?.events[c.slot];
    if (ev) { setDuration(ev.duration); setDotted(ev.dotted); }
  };

  /** Commits a (score, cursor) pair produced by the pure helpers. */
  const commit = (r: { score: TabScore; cursor: TabCursor }, base: TabScore = score) => {
    if (r.score !== base) onChange(r.score);
    setCursor(r.cursor, r.score);
  };

  // ---- Editing operations ----
  const typeDigit = (d: number) => {
    let sc = score;
    let c = cur;
    const p = pending.current;
    if (p) {
      cancelPending();
      if (p.key === keyOf(c)) {
        if (p.fret * 10 + d <= MAX_FRET) {
          // Second digit of a two-digit fret
          sc = writeFret(sc, c, p.fret * 10 + d, duration, dotted);
          commit(autoAdvance ? advanceFrom(sc, c) : { score: sc, cursor: c }, score);
          return;
        }
        // Cannot combine: the previous note is final, move on and write this one at the next figure
        if (autoAdvance) { const a = advanceFrom(sc, c); sc = a.score; c = a.cursor; }
      }
    }

    sc = writeFret(sc, c, d, duration, dotted);
    const mayExtend = d === 1 || d === 2;
    if (!autoAdvance || mayExtend) {
      if (sc !== score) onChange(sc);
      setCursorState(c);
      const key = keyOf(c);
      pending.current = {
        key, fret: d,
        timer: window.setTimeout(() => {
          const L = latest.current;
          pending.current = null;
          if (L.auto && keyOf(L.cur) === key) commit(advanceFrom(L.score, L.cur), L.score);
        }, autoAdvance ? 600 : 1200),
      };
    } else {
      commit(advanceFrom(sc, c), score);
    }
  };

  const moveRight = () => {
    commit(advanceFrom(score, cur));
  };

  const moveLeft = () => {
    if (cur.slot > 0) { setCursor({ ...cur, slot: cur.slot - 1 }); return; }
    if (cur.m > 0) {
      const prev = score.measures[cur.m - 1];
      setCursor({ m: cur.m - 1, slot: Math.max(0, prev.events.length - 1), string: cur.string });
    }
  };

  const deleteAtCursor = (whole: boolean) => {
    if (!curEvent) { moveLeft(); return; }
    cancelPending();
    const frets = (whole || curEvent.rest) ? emptyFrets() : curEvent.frets.map((f, i) => i === cur.string ? null : f);
    const empty = whole || curEvent.rest || frets.every(f => f === null);
    onChange(mutateMeasure(score, cur.m, m => ({
      ...m,
      events: m.events.flatMap((ev, i) => {
        if (i !== cur.slot) return [ev];
        if (!empty) return [{ ...ev, frets }];
        // Emptied note keeps its time as a rest; deleting a rest removes it
        return ev.rest ? (ev.tuplet ? [ev] : []) : [{ ...ev, rest: true, frets: emptyFrets() }];
      }),
    })));
  };

  const patchEvent = (patch: Partial<TabEvent>) => {
    if (!curEvent) return;
    onChange(mutateMeasure(score, cur.m, m => ({
      ...m, events: m.events.map((ev, i) => i === cur.slot ? { ...ev, ...patch } : ev),
    })));
  };

  const chooseDuration = (d: NoteValue) => {
    setDuration(d);
    if (curEvent) { cancelPending(); onChange(resizeEvent(score, cur.m, cur.slot, d, dotted)); }
  };
  const toggleDot = () => {
    const nd = !dotted;
    setDotted(nd);
    if (curEvent) { cancelPending(); onChange(resizeEvent(score, cur.m, cur.slot, duration, nd)); }
  };
  const toggleRest = () => {
    if (curEvent) {
      patchEvent(curEvent.rest ? { rest: false } : { rest: true, frets: emptyFrets() });
    } else {
      const ev = createEvent(duration, dotted, true);
      onChange(mutateMeasure(score, cur.m, m => ({ ...m, events: [...m.events, ev] })));
    }
  };

  /** Tie the note on the cursor's string to the same fret in the next event. */
  const toggleTie = () => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const ties = (curEvent.ties ?? emptyFrets().map(() => false)).slice();
    ties[cur.string] = !ties[cur.string];
    patchEvent({ ties });
  };

  /** Hammer-on / pull-off articulation toggle for the cursor's string. */
  const toggleHammerPull = () => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const hp = (curEvent.hammerPull ?? emptyFrets().map(() => false)).slice();
    hp[cur.string] = !hp[cur.string];
    patchEvent({ hammerPull: hp });
  };

  /** Slide / glissando articulation toggle for the cursor's string. */
  const toggleSlide = () => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const sl = (curEvent.slides ?? emptyFrets().map(() => false)).slice();
    sl[cur.string] = !sl[cur.string];
    patchEvent({ slides: sl });
  };

  /** Set accidental override on the current string: '#' | 'b' | 'n' | null */
  const setAccidental = (val: '#' | 'b' | 'n' | null) => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const accs = (curEvent.accidentals ?? emptyFrets().map(() => null)).slice();
    accs[cur.string] = val;
    patchEvent({ accidentals: accs });
  };

  /** Cycle accidental on current note: Auto (null) -> ♯ -> ♭ -> ♮ -> Auto */
  const cycleAccidental = () => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const curVal = curEvent.accidentals?.[cur.string] ?? null;
    const nextVal: '#' | 'b' | 'n' | null =
      curVal === null ? '#' :
      curVal === '#' ? 'b' :
      curVal === 'b' ? 'n' : null;
    setAccidental(nextVal);
  };

  /** Toggle courtesy natural ♮ */
  const toggleNatural = () => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    const curVal = curEvent.accidentals?.[cur.string] ?? null;
    setAccidental(curVal === 'n' ? null : 'n');
  };

  const tuplet = TUPLETS.find(t => t.key === tupletKey) ?? TUPLETS[1];
  const addTuplet = () => {
    cancelPending();
    const slot = cur.slot;
    onChange(insertTuplet(score, cur.m, slot, duration, tuplet.actual, tuplet.normal));
    setCursorState({ ...cur, slot });
  };
  const dropTuplet = () => {
    if (!curEvent?.tuplet) return;
    cancelPending();
    const first = curMeasure.events.findIndex(e => e.tuplet?.id === curEvent.tuplet!.id);
    onChange(removeTuplet(score, cur.m, curEvent.tuplet.id));
    setCursorState({ ...cur, slot: Math.max(0, first) });
  };

  /** Applies a change to the cursor's measure and to the following measures that shared the old value. */
  const propagate = (matches: (m: TabMeasure) => boolean, apply: (m: TabMeasure) => TabMeasure) => {
    let go = !onlyThis;
    onChange({
      ...score,
      measures: score.measures.map((m, i) => {
        if (i < cur.m) return m;
        if (i === cur.m) return apply(m);
        if (go && matches(m)) return apply(m);
        go = false;
        return m;
      }),
    });
  };
  const changeSig = (num: number, den: number) => {
    const old = curMeasure.timeSig;
    propagate(m => m.timeSig.num === old.num && m.timeSig.den === old.den, m => ({ ...m, timeSig: { num, den } }));
  };
  const applyTempo = (t: number) => {
    const old = curMeasure.tempo;
    if (t === old) return;
    propagate(m => m.tempo === old, m => ({ ...m, tempo: t }));
  };
  const commitTempo = () => {
    const t = Math.round(Number(tempoText));
    if (!isFinite(t) || t < 20 || t > 400) { setTempoText(String(curMeasure.tempo)); return; }
    applyTempo(t);
  };
  const changeKeySig = (keyId: string) => {
    if (onlyThis) {
      onChange(mutateMeasure(score, cur.m, m => ({ ...m, keySig: keyId })));
    } else {
      onChange({
        ...score,
        keySig: keyId,
        measures: score.measures.map(m => ({ ...m, keySig: undefined })),
      });
    }
  };

  const addMeasureEnd = () => {
    const last = score.measures[score.measures.length - 1];
    onChange({ ...score, measures: [...score.measures, createMeasure(last.timeSig, last.tempo)] });
  };
  const insertMeasureAfter = () => {
    const ms = [...score.measures];
    ms.splice(cur.m + 1, 0, createMeasure(curMeasure.timeSig, curMeasure.tempo));
    onChange({ ...score, measures: ms });
    setCursorState({ m: cur.m + 1, slot: 0, string: cur.string });
  };
  const deleteMeasure = () => {
    if (score.measures.length <= 1) { onChange({ ...score, measures: [createMeasure(curMeasure.timeSig, curMeasure.tempo)] }); return; }
    onChange({ ...score, measures: score.measures.filter((_, i) => i !== cur.m) });
    setCursorState({ m: Math.max(0, cur.m - 1), slot: 0, string: cur.string });
  };
  const clearAll = () => {
    if (!window.confirm('¿Borrar toda la tablatura?')) return;
    handleStop();
    onChange({ ...createEmptyScore(), measuresPerSystem: score.measuresPerSystem, title: score.title });
    setCursorState({ m: 0, slot: 0, string: 5 });
  };

  // ---- Playback handlers ----
  const handlePlayToggle = () => {
    if (isPlaying && !isPaused && playbackRef.current) {
      playbackRef.current.pause();
      setIsPaused(true);
      return;
    }
    if (isPlaying && isPaused && playbackRef.current) {
      playbackRef.current.resume();
      setIsPaused(false);
      return;
    }

    // Start playing from beginning or cursor position
    const startFrom = curEvent ? { m: cur.m, slot: cur.slot } : { m: 0, slot: 0 };
    const ctrl = startTabPlayback(
      score,
      startFrom,
      pos => setPlaybackCursor(pos),
      () => {
        setIsPlaying(false);
        setIsPaused(false);
        setPlaybackCursor(null);
        playbackRef.current = null;
      },
      { articulation }
    );
    playbackRef.current = ctrl;
    setIsPlaying(true);
    setIsPaused(false);
  };

  const handleArticulationChange = (newArt: PlaybackArticulation) => {
    setArticulation(newArt);
    onChange({ ...score, playbackArticulation: newArt });
  };

  const handleStop = () => {
    if (playbackRef.current) {
      playbackRef.current.stop();
      playbackRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setPlaybackCursor(null);
  };

  useEffect(() => {
    return () => {
      if (playbackRef.current) playbackRef.current.stop();
    };
  }, []);

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typeDigit(parseInt(e.key, 10)); return; }
      switch (e.key) {
        case 'ArrowRight': case ' ': case 'Enter': e.preventDefault(); moveRight(); break;
        case 'ArrowLeft': e.preventDefault(); moveLeft(); break;
        case 'ArrowUp': e.preventDefault(); setCursorState({ ...cur, string: Math.min(STRING_COUNT - 1, cur.string + 1) }); break;
        case 'ArrowDown': e.preventDefault(); setCursorState({ ...cur, string: Math.max(0, cur.string - 1) }); break;
        case 'Delete': e.preventDefault(); deleteAtCursor(e.shiftKey); break;
        case 'Backspace': e.preventDefault(); deleteAtCursor(e.shiftKey); break;
        case 'r': case 'R': e.preventDefault(); toggleRest(); break;
        case '.': e.preventDefault(); toggleDot(); break;
        case 'l': case 'L': e.preventDefault(); toggleTie(); break;
        case 'h': case 'H': e.preventDefault(); toggleHammerPull(); break;
        case 's': case 'S': e.preventDefault(); toggleSlide(); break;
        case 'e': case 'E': e.preventDefault(); cycleAccidental(); break;
        case 'b': case 'B': e.preventDefault(); toggleNatural(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const used = measureUsed(curMeasure);
  const cap = measureCapacity(curMeasure.timeSig);
  const over = used > cap + 0.001;
  const btn = 'px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors';
  const on = 'bg-indigo-600 border-indigo-400 text-white';
  const off = 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700';

  return (
    <div className="flex-grow flex flex-col overflow-hidden bg-slate-950">
      {/* TOP BAR: Playback controls + Sidebar toggle + Capture */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0 z-40 shadow-md">
        {/* Left: Sidebar toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all ${
              sidebarOpen
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral con herramientas'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
            <span>Panel lateral</span>
          </button>
          <span className="text-xs text-slate-400 hidden md:inline">
            Compás {safeM + 1} · {curMeasure.timeSig.num}/{curMeasure.timeSig.den} · {curMeasure.tempo} BPM
          </span>
        </div>

        {/* Center: PLAYBACK CONTROLS */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={handlePlayToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isPlaying && !isPaused
                ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse shadow-lg shadow-amber-900/50'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
            }`}
            title={isPlaying && !isPaused ? 'Pausar reproducción' : 'Reproducir partitura / tablatura'}
          >
            {isPlaying && !isPaused ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            <span>{isPlaying && !isPaused ? 'Pausa' : isPaused ? 'Reanudar' : 'Reproducir'}</span>
          </button>
          <button
            onClick={handleStop}
            disabled={!isPlaying && !isPaused}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-white border border-slate-700 disabled:opacity-40 transition-colors"
            title="Detener reproducción"
          >
            <Square size={13} fill="currentColor" />
          </button>

          {/* Articulation Selector */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Sonido:</span>
            <select
              value={articulation}
              onChange={e => handleArticulationChange(e.target.value as PlaybackArticulation)}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-indigo-500 hover:border-slate-600 transition-colors cursor-pointer"
              title="Articulación: Legato sostiene cada nota su duración completa (por defecto)"
            >
              <option value="legato">Legato (Duración completa)</option>
              <option value="ring">Resonante (Let Ring / Anillo)</option>
              <option value="staccato">Staccato (Corta / 50%)</option>
            </select>
          </div>

          {playbackCursor && (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono pl-2 border-l border-slate-800 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>C.{playbackCursor.m + 1} : fig.{playbackCursor.slot + 1}</span>
            </div>
          )}
        </div>

        {/* Right: Toggle Partitura + Capture Tab */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange({ ...score, showStandardNotation: !score.showStandardNotation })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              score.showStandardNotation
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-md ring-2 ring-indigo-500/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Mostrar u ocultar la partitura tradicional (Clave de Sol) sobre la tablatura"
          >
            <Music size={13} />
            <span>Partitura: {score.showStandardNotation ? 'ON' : 'OFF'}</span>
          </button>
          <button
            onClick={onCapture}
            disabled={score.measures.every(m => m.events.length === 0)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all disabled:opacity-50 hover:scale-105 active:scale-95 shadow-md shadow-indigo-900/40"
          >
            <Camera size={16} /> Capturar Tablatura
          </button>
        </div>
      </div>

      {/* MAIN WORKSPACE: SIDEBAR + PAPER */}
      <div className="flex-grow flex overflow-hidden relative">
        {/* LATERAL SIDEBAR */}
        <div
          className={`shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 z-30 shadow-2xl ${
            sidebarOpen ? 'w-[370px] min-w-[370px]' : 'w-0 min-w-0 overflow-hidden border-none p-0'
          }`}
        >
          {sidebarOpen && (
            <div className="flex-grow overflow-y-auto p-3.5 space-y-3">
              {/* Sidebar Header with quick expand/collapse */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Herramientas y Menús
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={expandAll} className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold">
                    Expandir
                  </button>
                  <span className="text-slate-600 text-xs">·</span>
                  <button onClick={collapseAll} className="text-[10px] text-slate-400 hover:text-slate-300 font-bold">
                    Colapsar
                  </button>
                </div>
              </div>

              {/* SECTION 1: Figuras y Ritmo */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('figures')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Music size={14} className="text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Figuras y Ritmo</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 font-mono">
                      {NOTE_VALUES.find(n => n.id === duration)?.name}{dotted ? ' (punt.)' : ''}
                    </span>
                    {sections.figures ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.figures && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-900/40">
                    <div className="grid grid-cols-6 gap-1">
                      {NOTE_VALUES.map(n => (
                        <button
                          key={n.id}
                          title={n.name}
                          onClick={() => chooseDuration(n.id)}
                          className={`flex flex-col items-center px-1.5 py-1.5 rounded-lg border transition-colors ${duration === n.id ? on : off}`}
                        >
                          <NoteIcon v={n.id} />
                          <span className="text-[8.5px] font-bold leading-none mt-1 truncate">{n.name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                      <button onClick={toggleDot} title="Puntillo (.)" className={`${btn} ${dotted ? on : off}`}>
                        Puntillo (.)
                      </button>
                      <button onClick={toggleRest} title="Silencio (R)" className={`${btn} ${curEvent?.rest ? on : off}`}>
                        Silencio (R)
                      </button>
                      <button
                        onClick={() => { cancelPending(); setAutoAdvance(!autoAdvance); }}
                        title="Al escribir una nota, pasar a la figura siguiente. Desactivalo para armar acordes en una misma columna."
                        className={`${btn} ${autoAdvance ? on : off}`}
                      >
                        Avance auto: {autoAdvance ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: Alteraciones y Enarmonía (♯, ♭, ♮ Becuadro de cortesía) */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('accidentals')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-black text-indigo-400 text-sm">♯♭♮</span>
                    <span className="text-xs font-bold text-slate-200">Alteraciones y Enarmonía</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {curAccidental ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 font-bold">
                        {curAccidental === '#' ? '♯ Sost.' : curAccidental === 'b' ? '♭ Bemol' : '♮ Becuadro'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        Auto
                      </span>
                    )}
                    {sections.accidentals ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.accidentals && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-900/40">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Nota en cuerda:</span>
                      {curFret !== null ? (
                        <span className="font-bold text-amber-300 font-mono">
                          cda. {STRING_NAMES[cur.string]} · traste {curFret}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Sin nota en cuerda</span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <button
                        onClick={() => setAccidental(null)}
                        disabled={curFret === null}
                        title="Alteración automática según la tonalidad"
                        className={`${btn} ${curAccidental === null ? on : off} disabled:opacity-40 py-2 flex flex-col items-center`}
                      >
                        <span className="font-bold text-xs">Auto</span>
                        <span className="text-[8.5px] mt-0.5">Armadura</span>
                      </button>
                      <button
                        onClick={() => setAccidental('#')}
                        disabled={curFret === null}
                        title="Forzar sostenido ♯ para enarmonía"
                        className={`${btn} ${curAccidental === '#' ? on : off} disabled:opacity-40 py-2 flex flex-col items-center`}
                      >
                        <span className="font-bold text-sm leading-none font-serif">♯</span>
                        <span className="text-[8.5px] mt-0.5">Sostenido</span>
                      </button>
                      <button
                        onClick={() => setAccidental('b')}
                        disabled={curFret === null}
                        title="Forzar bemol ♭ para enarmonía"
                        className={`${btn} ${curAccidental === 'b' ? on : off} disabled:opacity-40 py-2 flex flex-col items-center`}
                      >
                        <span className="font-bold text-sm leading-none font-serif">♭</span>
                        <span className="text-[8.5px] mt-0.5">Bemol</span>
                      </button>
                      <button
                        onClick={() => setAccidental('n')}
                        disabled={curFret === null}
                        title="Becuadro o becuadro de cortesía ♮ (B)"
                        className={`${btn} ${curAccidental === 'n' ? on : off} disabled:opacity-40 py-2 flex flex-col items-center`}
                      >
                        <span className="font-bold text-sm leading-none font-serif">♮</span>
                        <span className="text-[8.5px] mt-0.5">Becuadro</span>
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                      <p><span className="text-indigo-300 font-bold">Atajo rápido:</span> pulsa <kbd className="px-1 bg-slate-800 rounded font-bold text-white">E</kbd> para alternar entre Auto, ♯, ♭ y ♮. Pulsa <kbd className="px-1 bg-slate-800 rounded font-bold text-white">B</kbd> para becuadro directo.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: Ligaduras y Articulaciones (Hammer/Pull, Slides, Tuplets) */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('articulations')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-black leading-none text-indigo-400 text-sm">⌒</span>
                    <span className="text-xs font-bold text-slate-200">Ligaduras y Articulaciones</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(curEvent?.ties?.[cur.string] || curEvent?.hammerPull?.[cur.string] || curEvent?.slides?.[cur.string]) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 font-bold">
                        Activa
                      </span>
                    )}
                    {sections.articulations ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.articulations && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-900/40">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Articulaciones para cuerda actual:</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        onClick={toggleTie}
                        title="Ligadura de prolongación con la misma nota (L)"
                        className={`${btn} ${curEvent?.ties?.[cur.string] ? on : off} flex flex-col items-center py-2`}
                      >
                        <span className="font-serif font-black text-sm leading-none">⌒</span>
                        <span className="text-[9px] mt-0.5">Ligadura (L)</span>
                      </button>
                      <button
                        onClick={toggleHammerPull}
                        title="Hammer-on / Pull-off con la nota siguiente (H)"
                        className={`${btn} ${curEvent?.hammerPull?.[cur.string] ? on : off} flex flex-col items-center py-2`}
                      >
                        <span className="font-bold text-xs leading-none">H / P</span>
                        <span className="text-[9px] mt-0.5">Hammer/Pull (H)</span>
                      </button>
                      <button
                        onClick={toggleSlide}
                        title="Slide / Glissando / Arrastre hacia la nota siguiente (S)"
                        className={`${btn} ${curEvent?.slides?.[cur.string] ? on : off} flex flex-col items-center py-2`}
                      >
                        <span className="font-bold text-xs leading-none">/ SL</span>
                        <span className="text-[9px] mt-0.5">Arrastre (S)</span>
                      </button>
                    </div>

                    {/* Tuplets */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Grupos Irregulares:</span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={tupletKey}
                          onChange={e => { setTupletKey(e.target.value); e.currentTarget.blur(); }}
                          className="bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1.5 text-white outline-none flex-grow"
                        >
                          {TUPLETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <button onClick={addTuplet} className={`${btn} ${off}`}>
                          Insertar
                        </button>
                        {curEvent?.tuplet && (
                          <button onClick={dropTuplet} className={`${btn} ${off} hover:!bg-red-900`}>
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sonido y Articulación de Reproducción */}
                    <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Sonido de partitura:</span>
                        <span className="text-[10px] text-emerald-400 font-bold font-mono">
                          {articulation === 'legato' ? 'Legato (100%)' : articulation === 'ring' ? 'Resonante' : 'Staccato (50%)'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <button
                          onClick={() => handleArticulationChange('legato')}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-colors ${articulation === 'legato' ? on : off}`}
                          title="Legato: Las notas duran su figura completa sin cortarse"
                        >
                          Legato
                        </button>
                        <button
                          onClick={() => handleArticulationChange('ring')}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-colors ${articulation === 'ring' ? on : off}`}
                          title="Resonante: Las cuerdas resuenan libremente como una guitarra acústica"
                        >
                          Resonante
                        </button>
                        <button
                          onClick={() => handleArticulationChange('staccato')}
                          className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-colors ${articulation === 'staccato' ? on : off}`}
                          title="Staccato: Notas cortas y picadas al 50%"
                        >
                          Staccato
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 4: Acordes y Cifrado Americano (Mini Diapasón) */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('chords')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Guitar size={14} className="text-yellow-400" />
                    <span className="text-xs font-bold text-slate-200">Acordes y Cifrado</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-950/80 text-yellow-300 font-bold">
                      {curEvent?.chord ? curEvent.chord.name : 'Diapasón'}
                    </span>
                    {sections.chords ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.chords && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-900/40">
                    <TabChordBuilder
                      hasTarget={true}
                      attached={curEvent?.chord}
                      onInsert={handleInsertChord}
                      onRemove={handleRemoveChord}
                    />
                  </div>
                )}
              </div>

              {/* SECTION 5: Métrica, Armadura y Tempo */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('timeSig')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Métrica, Armadura y Tempo</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 font-mono">
                      {curKeyDef.shortName} · {curMeasure.timeSig.num}/{curMeasure.timeSig.den}
                    </span>
                    {sections.timeSig ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.timeSig && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2.5 bg-slate-900/40">
                    {/* Tonalidad y Armadura */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Armadura de Clave / Tonalidad:</span>
                        <span className="text-[10px] text-amber-300 font-bold">
                          {curKeyDef.count === 0 ? 'Abierta' : `${curKeyDef.count}${curKeyDef.type === '#' ? '♯' : '♭'}`}
                        </span>
                      </div>
                      <select
                        value={activeKeySigId}
                        onChange={e => { changeKeySig(e.target.value); e.currentTarget.blur(); }}
                        className="bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1.5 text-white outline-none"
                      >
                        <option value="C">Armadura abierta / Do Mayor - La menor (0)</option>
                        <optgroup label="── Sostenidos (♯) ──">
                          <option value="G">Sol Mayor / Mi menor (1♯ - Fa♯)</option>
                          <option value="D">Re Mayor / Si menor (2♯ - Fa♯, Do♯)</option>
                          <option value="A">La Mayor / Fa# menor (3♯ - Fa♯, Do♯, Sol♯)</option>
                          <option value="E">Mi Mayor / Do# menor (4♯ - Fa♯, Do♯, Sol♯, Re♯)</option>
                          <option value="B">Si Mayor / Sol# menor (5♯ - Fa♯, Do♯, Sol♯, Re♯, La♯)</option>
                          <option value="F#">Fa# Mayor / Re# menor (6♯ - Fa♯, Do♯, Sol♯, Re♯, La♯, Mi♯)</option>
                          <option value="C#">Do# Mayor / La# menor (7♯ - todos sostenidos)</option>
                        </optgroup>
                        <optgroup label="── Bemoles (♭) ──">
                          <option value="F">Fa Mayor / Re menor (1♭ - Si♭)</option>
                          <option value="Bb">Si♭ Mayor / Sol menor (2♭ - Si♭, Mi♭)</option>
                          <option value="Eb">Mi♭ Mayor / Do menor (3♭ - Si♭, Mi♭, La♭)</option>
                          <option value="Ab">La♭ Mayor / Fa menor (4♭ - Si♭, Mi♭, La♭, Re♭)</option>
                          <option value="Db">Re♭ Mayor / Si♭ menor (5♭ - Si♭, Mi♭, La♭, Re♭, Sol♭)</option>
                          <option value="Gb">Sol♭ Mayor / Mi♭ menor (6♭ - Si♭, Mi♭, La♭, Re♭, Sol♭, Do♭)</option>
                          <option value="Cb">Do♭ Mayor / La♭ menor (7♭ - todos bemoles)</option>
                        </optgroup>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Compás:</span>
                      <select
                        value={curMeasure.timeSig.num}
                        onChange={e => { changeSig(Number(e.target.value), curMeasure.timeSig.den); e.currentTarget.blur(); }}
                        className="bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1 text-white"
                      >
                        {Array.from({ length: 15 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <span className="text-slate-500 font-bold">/</span>
                      <select
                        value={curMeasure.timeSig.den}
                        onChange={e => { changeSig(curMeasure.timeSig.num, Number(e.target.value)); e.currentTarget.blur(); }}
                        className="bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1 text-white"
                      >
                        {[2, 4, 8, 16].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {TIME_SIG_PRESETS.map(([n, d]) => (
                        <button
                          key={`${n}/${d}`}
                          onClick={() => changeSig(n, d)}
                          className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${curMeasure.timeSig.num === n && curMeasure.timeSig.den === d ? on : off}`}
                        >
                          {n}/{d}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Tempo (♩ =):</span>
                      <input
                        type="number"
                        min={20}
                        max={400}
                        value={tempoText}
                        onChange={e => {
                          setTempoText(e.target.value);
                          const t = Math.round(Number(e.target.value));
                          if (isFinite(t) && t >= 20 && t <= 400 && e.target.value.length >= 2) applyTempo(t);
                        }}
                        onBlur={commitTempo}
                        onKeyDown={e => { if (e.key === 'Enter') { commitTempo(); (e.currentTarget as HTMLInputElement).blur(); } }}
                        className="w-16 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold px-2 py-1 text-center text-white"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                        <input type="checkbox" checked={onlyThis} onChange={e => { setOnlyThis(e.target.checked); e.currentTarget.blur(); }} className="rounded bg-slate-800 border-slate-700 text-indigo-600" />
                        <span>solo este compás</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 6: Maquetación de Sistemas */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('layout')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <LayoutGrid size={14} className="text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Maquetación de Sistemas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300">
                      {score.measuresPerSystem}/sist.
                    </span>
                    {sections.layout ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.layout && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2 bg-slate-900/40">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Compases por sistema:</span>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5, 6].map(n => (
                        <button
                          key={n}
                          onClick={() => onChange({ ...score, measuresPerSystem: n })}
                          className={`w-9 h-8 rounded-lg text-xs font-bold border transition-colors ${score.measuresPerSystem === n ? on : off}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Partitura tradicional:</span>
                      <button
                        onClick={() => onChange({ ...score, showStandardNotation: !score.showStandardNotation })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${score.showStandardNotation ? on : off}`}
                      >
                        {score.showStandardNotation ? 'Visible' : 'Oculta'}
                      </button>
                    </div>

                    {/* Separación Partitura - Tablatura */}
                    {score.showStandardNotation && (
                      <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Separación Partitura - Tab:</span>
                          <span className="text-xs font-bold text-indigo-300 font-mono">
                            {score.staffGap ?? DEFAULT_STAFF_GAP} px
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={25}
                            max={110}
                            step={2}
                            value={score.staffGap ?? DEFAULT_STAFF_GAP}
                            onChange={e => onChange({ ...score, staffGap: Number(e.target.value) })}
                            className="w-full accent-indigo-500 cursor-pointer"
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { label: '35px', val: 35 },
                            { label: '50px', val: 50 },
                            { label: '65px', val: 65 },
                            { label: '85px', val: 85 },
                          ].map(p => (
                            <button
                              key={p.val}
                              onClick={() => onChange({ ...score, staffGap: p.val })}
                              className={`py-1 text-[10px] rounded font-bold border transition-colors ${
                                (score.staffGap ?? DEFAULT_STAFF_GAP) === p.val ? on : off
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 7: Gestión de Compases */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button
                  onClick={() => toggleSection('measures')}
                  className="w-full px-3 py-2.5 flex items-center justify-between bg-slate-950 hover:bg-slate-800/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-indigo-400" />
                    <span className="text-xs font-bold text-slate-200">Gestión de Compases</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/80 text-indigo-300 font-mono">
                      {score.measures.length}
                    </span>
                    {sections.measures ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                  </div>
                </button>
                {sections.measures && (
                  <div className="p-3 border-t border-slate-800/80 flex flex-col gap-2 bg-slate-900/40">
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={insertMeasureAfter} className={`${btn} ${off} flex items-center justify-center gap-1`}>
                        <Plus size={13} /> Insertar aquí
                      </button>
                      <button onClick={addMeasureEnd} className={`${btn} ${off} flex items-center justify-center gap-1`}>
                        <Plus size={13} /> Al final
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={deleteMeasure} className={`${btn} ${off} hover:!bg-red-900 flex items-center justify-center gap-1`}>
                        <Trash2 size={13} /> Eliminar compás
                      </button>
                      <button onClick={clearAll} className={`${btn} ${off} hover:!bg-red-900 flex items-center justify-center gap-1`}>
                        <Eraser size={13} /> Limpiar todo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PAPER CANVAS */}
        <div className="flex-grow overflow-auto bg-slate-800 p-6 flex justify-center items-start">
          <div className="bg-white text-black rounded shadow-2xl p-6 h-fit" style={{ width: TAB_WIDTH + 48 }}>
            <input
              value={score.title}
              onChange={e => onChange({ ...score, title: e.target.value })}
              placeholder="Título de la tablatura (opcional)"
              className="w-full text-xl font-bold outline-none bg-transparent placeholder-slate-300 mb-4"
              style={{ fontFamily: "'Times New Roman', serif" }}
            />
            <TabStaff
              score={score}
              width={TAB_WIDTH}
              editable
              cursor={cur}
              onCursorChange={setCursor}
              playbackCursor={playbackCursor}
              onStaffGapChange={gap => onChange({ ...score, staffGap: gap })}
            />
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-400 shrink-0">
        <span className="font-bold text-slate-300">
          Compás {safeM + 1} · cuerda {STRING_NAMES[cur.string]} ·{' '}
          <span className={over ? 'text-red-400' : used < cap - 0.001 ? 'text-amber-400' : 'text-emerald-400'}>
            {fmtQuarters(used)} / {fmtQuarters(cap)} negras
          </span>
        </span>
        <span><kbd className="px-1 bg-slate-800 rounded">0-9</kbd> traste (10-24)</span>
        <span><kbd className="px-1 bg-slate-800 rounded">↑ ↓</kbd> cuerda</span>
        <span><kbd className="px-1 bg-slate-800 rounded">← →</kbd>/<kbd className="px-1 bg-slate-800 rounded">Espacio</kbd> mover</span>
        <span><kbd className="px-1 bg-slate-800 rounded">E</kbd> enarmonía (♯/♭/♮)</span>
        <span><kbd className="px-1 bg-slate-800 rounded">B</kbd> becuadro</span>
        <span><kbd className="px-1 bg-slate-800 rounded">H</kbd> hammer/pull</span>
        <span><kbd className="px-1 bg-slate-800 rounded">S</kbd> slide</span>
        <span><kbd className="px-1 bg-slate-800 rounded">L</kbd> ligadura</span>
        <span><kbd className="px-1 bg-slate-800 rounded">R</kbd> silencio</span>
        <span><kbd className="px-1 bg-slate-800 rounded">.</kbd> puntillo</span>
        <span><kbd className="px-1 bg-slate-800 rounded">Supr</kbd> borrar</span>
      </div>
    </div>
  );
};
