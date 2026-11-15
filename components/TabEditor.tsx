import React, { useEffect, useRef, useState } from 'react';
import {
  Camera, Trash2, Plus, Eraser, Music, Clock,
  LayoutGrid, Guitar, Layers, Play, Pause, Square, PanelLeft, PanelLeftClose,
  Undo2, Redo2, Copy, ClipboardPaste, Repeat, Download, FileText, Check, X, Volume2
} from 'lucide-react';
import {
  BendType, HarmonicType, NoteValue, TabCursor, TabEvent, TabMeasure, TabScore, TabChordDiagram
} from '../types';
import { TabStaff } from './TabStaff';
import { TabChordBuilder } from './TabChordBuilder';
import {
  NOTE_VALUES, TIME_SIG_PRESETS, TAB_WIDTH, MAX_FRET, STRING_COUNT,
  createEvent, createMeasure, createEmptyScore, emptyFrets, measureCapacity, measureUsed,
  resizeEvent, writeFret, advanceFrom, TUPLETS, insertTuplet, removeTuplet,
  getKeySig, DEFAULT_STAFF_GAP, cloneScore, getTuningStringLabels,
  insertEventAt, duplicateMeasure, clearMeasure, fillMeasureWithRests, exportScoreToAsciiTab
} from '../utils/tabs';
import { TUNINGS } from '../utils/theory';
import { startTabPlayback, TabPlaybackController, PlaybackArticulation } from '../utils/tabAudio';

interface TabEditorProps {
  score: TabScore;
  onChange: (s: TabScore) => void;
  onCapture: () => void;
}

const NoteIcon: React.FC<{ v: NoteValue }> = ({ v }) => {
  const hollow = v === 'w' || v === 'h';
  const flags = NOTE_VALUES.find(n => n.id === v)!.flags;
  return (
    <svg width="18" height="22" viewBox="0 0 22 28">
      <ellipse cx="9" cy="21" rx="5" ry="3.6" transform="rotate(-20 9 21)" fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.8" />
      {v !== 'w' && <line x1="13.5" y1="20" x2="13.5" y2="4" stroke="currentColor" strokeWidth="1.8" />}
      {flags > 0 && Array.from({ length: flags }).map((_, i) => (
        <path key={i} d={`M 13.5 ${4 + i * 4.5} Q 18 ${6 + i * 4.5} 17 ${11 + i * 4.5}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

const BEND_CYCLE: (BendType | null)[] = [null, 'half', 'full', '1.5', '2'];
const BEND_TEXT: Record<BendType, string> = { half: '½', full: 'full', '1.5': '1½', '2': '2' };

export const TabEditor: React.FC<TabEditorProps> = ({ score, onChange, onCapture }) => {
  const [cursor, setCursorState] = useState<TabCursor>({ m: 0, slot: 0, string: 5 });
  const [duration, setDuration] = useState<NoteValue>('q');
  const [dotted, setDotted] = useState(false);
  const [tempoText, setTempoText] = useState('120');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [tupletKey, setTupletKey] = useState('3:2');
  const [onlyThis, setOnlyThis] = useState(false);

  // Sidebar & tabs
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'notation' | 'chords' | 'measure'>('notation');

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<TabScore[]>([]);
  const [redoStack, setRedoStack] = useState<TabScore[]>([]);

  // Clipboard
  const [copiedEvent, setCopiedEvent] = useState<TabEvent | null>(null);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [asciiCopied, setAsciiCopied] = useState(false);

  // Playback state
  const [playbackCursor, setPlaybackCursor] = useState<{ m: number; slot: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [articulation, setArticulation] = useState<PlaybackArticulation>(score.playbackArticulation || 'legato');
  const [speed, setSpeed] = useState<number>(1.0);
  const [metronome, setMetronome] = useState<boolean>(false);
  const [loopMeasure, setLoopMeasure] = useState<boolean>(false);
  const playbackRef = useRef<TabPlaybackController | null>(null);

  // Pending 2-digit fret timer
  const pending = useRef<{ key: string; fret: number; timer: number } | null>(null);
  const latest = useRef<{ score: TabScore; cur: TabCursor; auto: boolean }>({ score, cur: cursor, auto: autoAdvance });

  // Score update wrapper that records undo history
  const updateScore = (next: TabScore, recordHistory = true) => {
    if (next === score) return;
    if (recordHistory) {
      setUndoStack(prev => [...prev.slice(-49), cloneScore(score)]);
      setRedoStack([]);
    }
    onChange(next);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    cancelPending();
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(r => [...r, cloneScore(score)]);
    onChange(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    cancelPending();
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(s => [...s, cloneScore(score)]);
    onChange(next);
  };

  // Safe cursor inside current score
  const safeM = Math.min(cursor.m, score.measures.length - 1);
  const curMeasure = score.measures[safeM];
  const safeSlot = Math.min(cursor.slot, curMeasure.events.length);
  const cur: TabCursor = { m: safeM, slot: safeSlot, string: cursor.string };
  const curEvent: TabEvent | undefined = curMeasure.events[cur.slot];
  const curFret = curEvent && !curEvent.rest ? curEvent.frets[cur.string] : null;
  const curAccidental = curEvent?.accidentals?.[cur.string] ?? null;
  const curBend = curEvent?.bends?.[cur.string] ?? null;
  const curHarmonic = curEvent?.harmonics?.[cur.string] ?? null;
  const activeKeySigId = curMeasure.keySig || score.keySig || 'C';
  const curKeyDef = getKeySig(activeKeySigId);
  const tuningId = score.tuningId || 'standard';
  const stringLabels = getTuningStringLabels(tuningId);

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

  const commit = (r: { score: TabScore; cursor: TabCursor }, base: TabScore = score) => {
    if (r.score !== base) updateScore(r.score);
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
          sc = writeFret(sc, c, p.fret * 10 + d, duration, dotted);
          commit(autoAdvance ? advanceFrom(sc, c) : { score: sc, cursor: c }, score);
          return;
        }
        if (autoAdvance) { const a = advanceFrom(sc, c); sc = a.score; c = a.cursor; }
      }
    }

    sc = writeFret(sc, c, d, duration, dotted);
    const mayExtend = d === 1 || d === 2;
    if (!autoAdvance || mayExtend) {
      if (sc !== score) updateScore(sc);
      setCursorState(c);
      const key = keyOf(c);
      pending.current = {
        key, fret: d,
        timer: window.setTimeout(() => {
          const L = latest.current;
          pending.current = null;
          if (L.auto && keyOf(L.cur) === key) commit(advanceFrom(L.score, L.cur), L.score);
        }, autoAdvance ? 550 : 1100),
      };
    } else {
      commit(advanceFrom(sc, c), score);
    }
  };

  const applyFretDirect = (fret: number) => {
    cancelPending();
    const sc = writeFret(score, cur, fret, duration, dotted);
    commit(autoAdvance ? advanceFrom(sc, cur) : { score: sc, cursor: cur }, score);
  };

  const transposeFret = (delta: number) => {
    if (curFret === null) return;
    const nextFret = Math.max(0, Math.min(MAX_FRET, curFret + delta));
    if (nextFret === curFret) return;
    const sc = writeFret(score, cur, nextFret, duration, dotted);
    updateScore(sc);
  };

  const moveRight = () => commit(advanceFrom(score, cur));
  const moveLeft = () => {
    if (cur.slot > 0) { setCursor({ ...cur, slot: cur.slot - 1 }); return; }
    if (cur.m > 0) {
      const prev = score.measures[cur.m - 1];
      setCursor({ m: cur.m - 1, slot: Math.max(0, prev.events.length - 1), string: cur.string });
    }
  };
  const moveMeasure = (delta: number) => {
    const nm = Math.max(0, Math.min(score.measures.length - 1, cur.m + delta));
    setCursor({ m: nm, slot: 0, string: cur.string });
  };

  const deleteAtCursor = (whole: boolean) => {
    if (!curEvent) { moveLeft(); return; }
    cancelPending();
    const frets = (whole || curEvent.rest) ? emptyFrets() : curEvent.frets.map((f, i) => i === cur.string ? null : f);
    const empty = whole || curEvent.rest || frets.every(f => f === null);
    updateScore(mutateMeasure(score, cur.m, m => ({
      ...m,
      events: m.events.flatMap((ev, i) => {
        if (i !== cur.slot) return [ev];
        if (!empty) return [{ ...ev, frets }];
        return ev.rest ? (ev.tuplet ? [ev] : []) : [{ ...ev, rest: true, frets: emptyFrets() }];
      }),
    })));
  };

  const patchEvent = (patch: Partial<TabEvent>) => {
    if (!curEvent) return;
    updateScore(mutateMeasure(score, cur.m, m => ({
      ...m, events: m.events.map((ev, i) => i === cur.slot ? { ...ev, ...patch } : ev),
    })));
  };

  const chooseDuration = (d: NoteValue) => {
    setDuration(d);
    if (curEvent) { cancelPending(); updateScore(resizeEvent(score, cur.m, cur.slot, d, dotted)); }
  };
  const toggleDot = () => {
    const nd = !dotted;
    setDotted(nd);
    if (curEvent) { cancelPending(); updateScore(resizeEvent(score, cur.m, cur.slot, duration, nd)); }
  };
  const toggleRest = () => {
    if (curEvent) {
      patchEvent(curEvent.rest ? { rest: false } : { rest: true, frets: emptyFrets() });
    } else {
      const ev = createEvent(duration, dotted, true);
      updateScore(mutateMeasure(score, cur.m, m => ({ ...m, events: [...m.events, ev] })));
    }
  };
  const insertSlotHere = () => {
    cancelPending();
    updateScore(insertEventAt(score, cur.m, cur.slot, duration, dotted));
  };

  // Copy / Paste event
  const handleCopyEvent = () => {
    if (!curEvent) return;
    setCopiedEvent(JSON.parse(JSON.stringify(curEvent)));
  };
  const handlePasteEvent = () => {
    if (!copiedEvent) return;
    cancelPending();
    const pasted: TabEvent = { ...JSON.parse(JSON.stringify(copiedEvent)), id: createEvent('q', false, true).id };
    updateScore(mutateMeasure(score, cur.m, m => {
      const events = [...m.events];
      if (cur.slot >= events.length) events.push(pasted);
      else events[cur.slot] = pasted;
      return { ...m, events };
    }));
  };

  // String-level toggles
  const toggleStringBool = (field: 'ties' | 'hammerPull' | 'slides' | 'vibrato' | 'ghost') => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const arr = (curEvent[field] ?? emptyFrets().map(() => false)).slice();
    arr[cur.string] = !arr[cur.string];
    patchEvent({ [field]: arr });
  };

  const setBend = (val: BendType | null) => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const arr = (curEvent.bends ?? emptyFrets().map(() => null)).slice();
    arr[cur.string] = val;
    patchEvent({ bends: arr });
  };
  const cycleBend = () => {
    const idx = BEND_CYCLE.indexOf(curBend);
    setBend(BEND_CYCLE[(idx + 1) % BEND_CYCLE.length]);
  };

  const setHarmonic = (val: HarmonicType | null) => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const arr = (curEvent.harmonics ?? emptyFrets().map(() => null)).slice();
    arr[cur.string] = val;
    patchEvent({ harmonics: arr });
  };
  const cycleHarmonic = () => {
    const next: HarmonicType | null = curHarmonic === null ? 'natural' : curHarmonic === 'natural' ? 'pinch' : null;
    setHarmonic(next);
  };

  const setAccidental = (val: '#' | 'b' | 'n' | null) => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    cancelPending();
    const accs = (curEvent.accidentals ?? emptyFrets().map(() => null)).slice();
    accs[cur.string] = val;
    patchEvent({ accidentals: accs });
  };
  const cycleAccidental = () => {
    if (!curEvent || curEvent.rest || curEvent.frets[cur.string] === null) return;
    const curVal = curEvent.accidentals?.[cur.string] ?? null;
    const nextVal: '#' | 'b' | 'n' | null = curVal === null ? '#' : curVal === '#' ? 'b' : curVal === 'b' ? 'n' : null;
    setAccidental(nextVal);
  };

  // Chords
  const handleInsertChord = (chord: TabChordDiagram) => {
    if (curEvent) patchEvent({ chord });
    else {
      const ev = createEvent(duration, dotted, true);
      ev.chord = chord;
      updateScore(mutateMeasure(score, cur.m, m => ({ ...m, events: [...m.events, ev] })));
    }
  };
  const handleWriteFretsToTab = (frets: (number | null)[]) => {
    cancelPending();
    if (curEvent) {
      patchEvent({ rest: false, frets });
    } else {
      const ev = createEvent(duration, dotted, false);
      ev.frets = frets;
      updateScore(mutateMeasure(score, cur.m, m => ({ ...m, events: [...m.events, ev] })));
    }
  };
  const handleRemoveChord = () => { if (curEvent) patchEvent({ chord: undefined }); };

  // Tuplets
  const tuplet = TUPLETS.find(t => t.key === tupletKey) ?? TUPLETS[1];
  const addTuplet = () => {
    cancelPending();
    updateScore(insertTuplet(score, cur.m, cur.slot, duration, tuplet.actual, tuplet.normal));
    setCursorState({ ...cur });
  };
  const dropTuplet = () => {
    if (!curEvent?.tuplet) return;
    cancelPending();
    const first = curMeasure.events.findIndex(e => e.tuplet?.id === curEvent.tuplet!.id);
    updateScore(removeTuplet(score, cur.m, curEvent.tuplet.id));
    setCursorState({ ...cur, slot: Math.max(0, first) });
  };

  // Measure & Score properties
  const propagate = (matches: (m: TabMeasure) => boolean, apply: (m: TabMeasure) => TabMeasure) => {
    let go = !onlyThis;
    updateScore({
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
    if (onlyThis) updateScore(mutateMeasure(score, cur.m, m => ({ ...m, keySig: keyId })));
    else updateScore({ ...score, keySig: keyId, measures: score.measures.map(m => ({ ...m, keySig: undefined })) });
  };

  const addMeasureEnd = () => {
    const last = score.measures[score.measures.length - 1];
    updateScore({ ...score, measures: [...score.measures, createMeasure(last.timeSig, last.tempo)] });
  };
  const insertMeasureAfter = () => {
    const ms = [...score.measures];
    ms.splice(cur.m + 1, 0, createMeasure(curMeasure.timeSig, curMeasure.tempo));
    updateScore({ ...score, measures: ms });
    setCursorState({ m: cur.m + 1, slot: 0, string: cur.string });
  };
  const deleteMeasure = () => {
    if (score.measures.length <= 1) { updateScore({ ...score, measures: [createMeasure(curMeasure.timeSig, curMeasure.tempo)] }); return; }
    updateScore({ ...score, measures: score.measures.filter((_, i) => i !== cur.m) });
    setCursorState({ m: Math.max(0, cur.m - 1), slot: 0, string: cur.string });
  };
  const clearAll = () => {
    if (!window.confirm('¿Borrar toda la tablatura?')) return;
    handleStop();
    updateScore({ ...createEmptyScore(), measuresPerSystem: score.measuresPerSystem, title: score.title, tuningId: score.tuningId });
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
      {
        articulation,
        speed,
        metronome,
        loopMeasure: loopMeasure ? cur.m : null,
      }
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
    if (playbackRef.current) { playbackRef.current.stop(); playbackRef.current = null; }
    setIsPlaying(false);
    setIsPaused(false);
    setPlaybackCursor(null);
  };

  useEffect(() => () => { if (playbackRef.current) playbackRef.current.stop(); }, []);

  // ---- Export / Import helpers ----
  const asciiPreview = exportOpen ? exportScoreToAsciiTab(score) : '';
  const handleCopyAscii = async () => {
    try {
      await navigator.clipboard.writeText(asciiPreview);
      setAsciiCopied(true);
      setTimeout(() => setAsciiCopied(false), 1800);
    } catch {}
  };
  const handleDownloadAscii = () => {
    const blob = new Blob([asciiPreview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(score.title || 'tablatura').replace(/[^a-z0-9_-]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(score.title || 'tablatura').replace(/[^a-z0-9_-]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && Array.isArray(parsed.measures) && parsed.measures.length > 0) {
          updateScore(parsed);
          setExportOpen(false);
        } else {
          alert('El archivo JSON no tiene un formato de tablatura válido.');
        }
      } catch {
        alert('Error al leer el archivo JSON.');
      }
    };
    reader.readAsText(file);
  };

  // ---- Keyboard Shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); handleRedo(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault(); handleCopyEvent(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault(); handlePasteEvent(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault(); handlePlayToggle(); return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typeDigit(parseInt(e.key, 10)); return; }

      switch (e.key) {
        case 'ArrowRight': case ' ': case 'Enter': e.preventDefault(); moveRight(); break;
        case 'ArrowLeft': e.preventDefault(); moveLeft(); break;
        case 'Tab': e.preventDefault(); moveMeasure(e.shiftKey ? -1 : 1); break;
        case 'ArrowUp': e.preventDefault(); setCursorState({ ...cur, string: Math.min(STRING_COUNT - 1, cur.string + 1) }); break;
        case 'ArrowDown': e.preventDefault(); setCursorState({ ...cur, string: Math.max(0, cur.string - 1) }); break;
        case 'Insert': e.preventDefault(); insertSlotHere(); break;
        case 'Delete': case 'Backspace': e.preventDefault(); deleteAtCursor(e.shiftKey); break;
        case '+': case '=': e.preventDefault(); transposeFret(1); break;
        case '-': e.preventDefault(); transposeFret(-1); break;
        case 'r': case 'R': e.preventDefault(); toggleRest(); break;
        case '.': e.preventDefault(); toggleDot(); break;
        case 'l': case 'L': e.preventDefault(); toggleStringBool('ties'); break;
        case 'h': case 'H': e.preventDefault(); toggleStringBool('hammerPull'); break;
        case 's': case 'S': e.preventDefault(); toggleStringBool('slides'); break;
        case 'b': case 'B': e.preventDefault(); cycleBend(); break;
        case 'v': case 'V': e.preventDefault(); toggleStringBool('vibrato'); break;
        case 'p': case 'P': e.preventDefault(); if (curEvent && !curEvent.rest) patchEvent({ palmMute: !curEvent.palmMute }); break;
        case 'n': case 'N': e.preventDefault(); cycleHarmonic(); break;
        case 'g': case 'G': e.preventDefault(); toggleStringBool('ghost'); break;
        case 'e': case 'E': e.preventDefault(); cycleAccidental(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const used = measureUsed(curMeasure);
  const cap = measureCapacity(curMeasure.timeSig);
  const over = used > cap + 0.001;
  const btn = 'px-2 py-1 rounded-lg text-xs font-bold border transition-colors';
  const on = 'bg-indigo-600 border-indigo-400 text-white';
  const off = 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700';

  return (
    <div className="flex-grow flex flex-col overflow-hidden bg-slate-950">
      {/* TOP BAR */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 z-40 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
              sidebarOpen ? on : off
            }`}
            title={sidebarOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
          >
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
            <span className="hidden sm:inline">Panel</span>
          </button>
          <span className="text-[11px] text-slate-400 hidden lg:inline font-mono">
            C.{safeM + 1} · {curMeasure.timeSig.num}/{curMeasure.timeSig.den} · ♩={curMeasure.tempo}
          </span>
        </div>

        {/* PLAYBACK BAR */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={handlePlayToggle}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
              isPlaying && !isPaused
                ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Reproducir / Pausar (Ctrl+Espacio)"
          >
            {isPlaying && !isPaused ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
            <span>{isPlaying && !isPaused ? 'Pausa' : isPaused ? 'Reanudar' : 'Play'}</span>
          </button>
          <button
            onClick={handleStop}
            disabled={!isPlaying && !isPaused}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-white border border-slate-700 disabled:opacity-40 transition-colors"
            title="Detener"
          >
            <Square size={12} fill="currentColor" />
          </button>

          <button
            onClick={() => setLoopMeasure(!loopMeasure)}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors ${
              loopMeasure ? 'bg-amber-600 border-amber-400 text-white' : off
            }`}
            title="Repetir en bucle el compás actual para practicar"
          >
            <Repeat size={12} />
            <span className="hidden md:inline">Bucle</span>
          </button>

          <button
            onClick={() => setMetronome(!metronome)}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-colors ${
              metronome ? on : off
            }`}
            title="Activar metrónomo durante la reproducción"
          >
            <Volume2 size={12} />
            <span className="hidden md:inline">Metro</span>
          </button>

          <select
            value={speed}
            onChange={e => { setSpeed(Number(e.target.value)); e.currentTarget.blur(); }}
            className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] font-bold outline-none cursor-pointer"
            title="Velocidad de reproducción"
          >
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1.0×</option>
            <option value={1.25}>1.25×</option>
          </select>

          <select
            value={articulation}
            onChange={e => { handleArticulationChange(e.target.value as PlaybackArticulation); e.currentTarget.blur(); }}
            className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] font-bold outline-none cursor-pointer hidden sm:block"
            title="Articulación general"
          >
            <option value="legato">Legato</option>
            <option value="ring">Resonante</option>
            <option value="staccato">Staccato</option>
          </select>

          {playbackCursor && (
            <span className="text-[11px] text-amber-300 font-mono pl-1.5 border-l border-slate-800 font-bold">
              C.{playbackCursor.m + 1}:{playbackCursor.slot + 1}
            </span>
          )}
        </div>

        {/* RIGHT ACTIONS */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onChange({ ...score, showStandardNotation: !score.showStandardNotation })}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              score.showStandardNotation ? on : off
            }`}
            title="Mostrar/ocultar pentagrama tradicional"
          >
            <Music size={13} />
            <span className="hidden sm:inline">Partitura: {score.showStandardNotation ? 'ON' : 'OFF'}</span>
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border ${off}`}
            title="Exportar ASCII Tab o JSON / Importar JSON"
          >
            <Download size={13} />
            <span className="hidden md:inline">ASCII / JSON</span>
          </button>
          <button
            onClick={onCapture}
            disabled={score.measures.every(m => m.events.length === 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition-all disabled:opacity-50 shadow-md"
          >
            <Camera size={14} /> <span className="hidden sm:inline">Capturar</span>
          </button>
        </div>
      </div>

      {/* QUICK NOTATION & TECHNIQUE RIBBON (always accessible!) */}
      <div className="bg-slate-900/80 border-b border-slate-800 px-3 py-1.5 flex flex-wrap items-center gap-1.5 shrink-0 z-30">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
          <button onClick={handleUndo} disabled={undoStack.length === 0} title="Deshacer (Ctrl+Z)" className={`${btn} ${off} disabled:opacity-35 px-1.5`}>
            <Undo2 size={14} />
          </button>
          <button onClick={handleRedo} disabled={redoStack.length === 0} title="Rehacer (Ctrl+Y)" className={`${btn} ${off} disabled:opacity-35 px-1.5`}>
            <Redo2 size={14} />
          </button>
        </div>

        {/* Note durations */}
        <div className="flex items-center gap-1 pr-2 border-r border-slate-800">
          {NOTE_VALUES.map(n => (
            <button
              key={n.id}
              title={n.name}
              onClick={() => chooseDuration(n.id)}
              className={`px-1.5 py-0.5 rounded-lg border transition-colors flex items-center gap-1 ${duration === n.id ? on : off}`}
            >
              <NoteIcon v={n.id} />
            </button>
          ))}
          <button onClick={toggleDot} title="Puntillo (.)" className={`${btn} ${dotted ? on : off}`}>.</button>
          <button onClick={toggleRest} title="Silencio (R)" className={`${btn} ${curEvent?.rest ? on : off}`}>Sil.</button>
        </div>

        {/* Guitar techniques */}
        <div className="flex flex-wrap items-center gap-1 pr-2 border-r border-slate-800">
          <button onClick={() => toggleStringBool('ties')} title="Ligadura (L)" className={`${btn} ${curEvent?.ties?.[cur.string] ? on : off}`}>⌒ L</button>
          <button onClick={() => toggleStringBool('hammerPull')} title="Hammer-on / Pull-off (H)" className={`${btn} ${curEvent?.hammerPull?.[cur.string] ? on : off}`}>H/P</button>
          <button onClick={() => toggleStringBool('slides')} title="Slide / Arrastre (S)" className={`${btn} ${curEvent?.slides?.[cur.string] ? on : off}`}>/ SL</button>
          <button onClick={cycleBend} title="Bend (B) — pulsa para alternar ½, full, 1½, 2" className={`${btn} ${curBend ? on : off}`}>
            {curBend ? `↗ ${BEND_TEXT[curBend]}` : '↗ Bend'}
          </button>
          <button onClick={() => toggleStringBool('vibrato')} title="Vibrato (V)" className={`${btn} ${curEvent?.vibrato?.[cur.string] ? on : off}`}>~ Vib</button>
          <button onClick={cycleHarmonic} title="Armónico Natural <> / Pinch [] (N)" className={`${btn} ${curHarmonic ? on : off}`}>
            {curHarmonic === 'pinch' ? '[P.H.]' : '<Arm>'}
          </button>
          <button onClick={() => toggleStringBool('ghost')} title="Nota fantasma (G)" className={`${btn} ${curEvent?.ghost?.[cur.string] ? on : off}`}>(G)</button>
          <button onClick={() => curEvent && !curEvent.rest && patchEvent({ palmMute: !curEvent.palmMute })} title="Palm Mute (P)" className={`${btn} ${curEvent?.palmMute ? on : off}`}>P.M.</button>
          <button onClick={() => curEvent && !curEvent.rest && patchEvent({ accent: !curEvent.accent })} title="Acento" className={`${btn} ${curEvent?.accent ? on : off}`}>&gt;</button>
          <button onClick={() => curEvent && !curEvent.rest && patchEvent({ staccato: !curEvent.staccato })} title="Staccato" className={`${btn} ${curEvent?.staccato ? on : off}`}>Stacc.</button>
        </div>

        {/* Slot & Clipboard */}
        <div className="flex items-center gap-1">
          <button onClick={insertSlotHere} title="Insertar silencio antes del cursor (Insert)" className={`${btn} ${off}`}>+ Ins</button>
          <button onClick={handleCopyEvent} disabled={!curEvent} title="Copiar columna (Ctrl+C)" className={`${btn} ${off} disabled:opacity-35 px-1.5`}><Copy size={13} /></button>
          <button onClick={handlePasteEvent} disabled={!copiedEvent} title="Pegar columna (Ctrl+V)" className={`${btn} ${off} disabled:opacity-35 px-1.5`}><ClipboardPaste size={13} /></button>
          <button onClick={() => deleteAtCursor(false)} title="Borrar nota (Supr)" className={`${btn} ${off} hover:!bg-red-900 px-1.5`}><Trash2 size={13} /></button>
        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <div className="flex-grow flex overflow-hidden relative">
        {/* 3-TAB LATERAL SIDEBAR */}
        <div
          className={`shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-200 z-30 shadow-2xl ${
            sidebarOpen ? 'w-[340px] min-w-[340px]' : 'w-0 min-w-0 overflow-hidden border-none p-0'
          }`}
        >
          {sidebarOpen && (
            <>
              {/* Sidebar Tabs */}
              <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950 p-1 gap-1 shrink-0">
                <button
                  onClick={() => setSidebarTab('notation')}
                  className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                    sidebarTab === 'notation' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Music size={13} /> Notación
                </button>
                <button
                  onClick={() => setSidebarTab('chords')}
                  className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                    sidebarTab === 'chords' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Guitar size={13} /> Acordes
                </button>
                <button
                  onClick={() => setSidebarTab('measure')}
                  className={`py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors ${
                    sidebarTab === 'measure' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <LayoutGrid size={13} /> Compás
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-3.5 space-y-4">
                {sidebarTab === 'notation' && (
                  <>
                    {/* Quick Fret Pad */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">
                          Teclado de Trastes · Cda {stringLabels[cur.string]}
                        </span>
                        <button
                          onClick={() => { cancelPending(); setAutoAdvance(!autoAdvance); }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${autoAdvance ? on : off}`}
                        >
                          Avance auto: {autoAdvance ? 'ON' : 'OFF'}
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 25 }, (_, f) => (
                          <button
                            key={f}
                            onClick={() => applyFretDirect(f)}
                            className={`py-1 rounded text-[11px] font-bold border transition-colors ${
                              curFret === f ? on : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-indigo-700'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Accidentals */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Alteración / Enarmonía (E)</span>
                        {curFret !== null && <span className="text-[11px] text-amber-300 font-mono font-bold">Traste {curFret}</span>}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {([
                          { v: null, lbl: 'Auto' },
                          { v: '#', lbl: '♯' },
                          { v: 'b', lbl: '♭' },
                          { v: 'n', lbl: '♮' },
                        ] as const).map(item => (
                          <button
                            key={String(item.v)}
                            disabled={curFret === null}
                            onClick={() => setAccidental(item.v)}
                            className={`${btn} ${curAccidental === item.v ? on : off} disabled:opacity-40 py-1.5 text-sm`}
                          >
                            {item.lbl}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Detailed Techniques */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Bend (Cuerda actual)</span>
                      <div className="grid grid-cols-5 gap-1">
                        {BEND_CYCLE.map(b => (
                          <button
                            key={String(b)}
                            disabled={curFret === null}
                            onClick={() => setBend(b)}
                            className={`${btn} ${curBend === b ? on : off} disabled:opacity-40`}
                          >
                            {b ? BEND_TEXT[b] : 'Off'}
                          </button>
                        ))}
                      </div>

                      <span className="text-[10px] uppercase font-bold text-slate-400 block pt-1">Armónico (Cuerda actual)</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button disabled={curFret === null} onClick={() => setHarmonic(null)} className={`${btn} ${curHarmonic === null ? on : off} disabled:opacity-40`}>Normal</button>
                        <button disabled={curFret === null} onClick={() => setHarmonic('natural')} className={`${btn} ${curHarmonic === 'natural' ? on : off} disabled:opacity-40`}>Natural &lt;&gt;</button>
                        <button disabled={curFret === null} onClick={() => setHarmonic('pinch')} className={`${btn} ${curHarmonic === 'pinch' ? on : off} disabled:opacity-40`}>Pinch []</button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1">
                        <button
                          disabled={!curEvent || curEvent.rest}
                          onClick={() => curEvent && patchEvent({ letRing: !curEvent.letRing })}
                          className={`${btn} ${curEvent?.letRing ? on : off} disabled:opacity-40`}
                        >
                          Let Ring
                        </button>
                        <button
                          disabled={!curEvent || curEvent.rest}
                          onClick={() => curEvent && patchEvent({ palmMute: !curEvent.palmMute })}
                          className={`${btn} ${curEvent?.palmMute ? on : off} disabled:opacity-40`}
                        >
                          Palm Mute (P)
                        </button>
                      </div>
                    </div>

                    {/* Tuplets */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Grupos Irregulares (Tuplets)</span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={tupletKey}
                          onChange={e => { setTupletKey(e.target.value); e.currentTarget.blur(); }}
                          className="bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1.5 text-white outline-none flex-grow"
                        >
                          {TUPLETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <button onClick={addTuplet} className={`${btn} ${off}`}>Insertar</button>
                        {curEvent?.tuplet && (
                          <button onClick={dropTuplet} className={`${btn} ${off} hover:!bg-red-900`}>Quitar</button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {sidebarTab === 'chords' && (
                  <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
                    <TabChordBuilder
                      hasTarget={true}
                      attached={curEvent?.chord}
                      tuningId={tuningId}
                      currentEventFrets={curEvent && !curEvent.rest ? curEvent.frets : undefined}
                      onInsert={handleInsertChord}
                      onWriteFretsToTab={handleWriteFretsToTab}
                      onRemove={handleRemoveChord}
                    />
                  </div>
                )}

                {sidebarTab === 'measure' && (
                  <>
                    {/* Tuning & Key Signature */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Afinación</span>
                        <select
                          value={tuningId}
                          onChange={e => { updateScore({ ...score, tuningId: e.target.value }); e.currentTarget.blur(); }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1.5 text-white outline-none"
                        >
                          {Object.values(TUNINGS).map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Armadura de Clave</span>
                        <select
                          value={activeKeySigId}
                          onChange={e => { changeKeySig(e.target.value); e.currentTarget.blur(); }}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1.5 text-white outline-none"
                        >
                          <option value="C">Abierta / Do M - La m (0)</option>
                          <optgroup label="Sostenidos (♯)">
                            <option value="G">Sol M / Mi m (1♯)</option>
                            <option value="D">Re M / Si m (2♯)</option>
                            <option value="A">La M / Fa# m (3♯)</option>
                            <option value="E">Mi M / Do# m (4♯)</option>
                            <option value="B">Si M / Sol# m (5♯)</option>
                            <option value="F#">Fa# M / Re# m (6♯)</option>
                            <option value="C#">Do# M / La# m (7♯)</option>
                          </optgroup>
                          <optgroup label="Bemoles (♭)">
                            <option value="F">Fa M / Re m (1♭)</option>
                            <option value="Bb">Si♭ M / Sol m (2♭)</option>
                            <option value="Eb">Mi♭ M / Do m (3♭)</option>
                            <option value="Ab">La♭ M / Fa m (4♭)</option>
                            <option value="Db">Re♭ M / Si♭ m (5♭)</option>
                            <option value="Gb">Sol♭ M / Mi♭ m (6♭)</option>
                            <option value="Cb">Do♭ M / La♭ m (7♭)</option>
                          </optgroup>
                        </select>
                      </div>

                      {/* Time Signature & Tempo */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Métrica:</span>
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
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${curMeasure.timeSig.num === n && curMeasure.timeSig.den === d ? on : off}`}
                          >
                            {n}/{d}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Tempo:</span>
                        <input
                          type="number" min={20} max={400} value={tempoText}
                          onChange={e => {
                            setTempoText(e.target.value);
                            const t = Math.round(Number(e.target.value));
                            if (isFinite(t) && t >= 20 && t <= 400 && e.target.value.length >= 2) applyTempo(t);
                          }}
                          onBlur={commitTempo}
                          onKeyDown={e => { if (e.key === 'Enter') { commitTempo(); (e.currentTarget as HTMLInputElement).blur(); } }}
                          className="w-16 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold px-2 py-1 text-center text-white"
                        />
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                          <input type="checkbox" checked={onlyThis} onChange={e => { setOnlyThis(e.target.checked); e.currentTarget.blur(); }} />
                          <span>solo este compás</span>
                        </label>
                      </div>
                    </div>

                    {/* Section & Repeats */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Sección y Repeticiones</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={curMeasure.section || ''}
                          onChange={e => updateScore(mutateMeasure(score, cur.m, m => ({ ...m, section: e.target.value || undefined })))}
                          placeholder="Etiqueta (ej. Intro, Solo...)"
                          className="flex-grow bg-slate-800 border border-slate-700 rounded-lg text-xs px-2.5 py-1.5 text-white outline-none"
                        />
                        {['Intro', 'Verso', 'Coro', 'Solo'].map(tag => (
                          <button
                            key={tag}
                            onClick={() => updateScore(mutateMeasure(score, cur.m, m => ({ ...m, section: m.section === tag ? undefined : tag })))}
                            className={`px-1.5 py-1 rounded text-[10px] font-bold border ${curMeasure.section === tag ? on : off}`}
                          >
                            {tag[0]}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          onClick={() => updateScore(mutateMeasure(score, cur.m, m => ({ ...m, repeatStart: !m.repeatStart })))}
                          className={`${btn} ${curMeasure.repeatStart ? on : off}`}
                        >
                          |: Inicio
                        </button>
                        <button
                          onClick={() => updateScore(mutateMeasure(score, cur.m, m => ({ ...m, repeatEnd: !m.repeatEnd })))}
                          className={`${btn} ${curMeasure.repeatEnd ? on : off}`}
                        >
                          :| Fin
                        </button>
                        <button
                          onClick={() => updateScore(mutateMeasure(score, cur.m, m => ({ ...m, ending: m.ending === '1.' ? null : '1.' })))}
                          className={`${btn} ${curMeasure.ending === '1.' ? on : off}`}
                        >
                          Casilla 1.
                        </button>
                        <button
                          onClick={() => updateScore(mutateMeasure(score, cur.m, m => ({ ...m, ending: m.ending === '2.' ? null : '2.' })))}
                          className={`${btn} ${curMeasure.ending === '2.' ? on : off}`}
                        >
                          Casilla 2.
                        </button>
                      </div>
                    </div>

                    {/* Layout */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Compases por sistema</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5, 6].map(n => (
                          <button
                            key={n}
                            onClick={() => updateScore({ ...score, measuresPerSystem: n })}
                            className={`w-9 h-7 rounded-lg text-xs font-bold border ${score.measuresPerSystem === n ? on : off}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      {score.showStandardNotation && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                            <span>Separación Partitura-Tab</span>
                            <span className="text-indigo-300 font-mono">{score.staffGap ?? DEFAULT_STAFF_GAP} px</span>
                          </div>
                          <input
                            type="range" min={25} max={110} step={2}
                            value={score.staffGap ?? DEFAULT_STAFF_GAP}
                            onChange={e => onChange({ ...score, staffGap: Number(e.target.value) })}
                            className="w-full accent-indigo-500 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>

                    {/* Measure Management */}
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Gestión de Compases ({score.measures.length})</span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={insertMeasureAfter} className={`${btn} ${off} flex items-center justify-center gap-1`}><Plus size={12} /> Insertar aquí</button>
                        <button onClick={addMeasureEnd} className={`${btn} ${off} flex items-center justify-center gap-1`}><Plus size={12} /> Al final</button>
                        <button onClick={() => updateScore(duplicateMeasure(score, cur.m))} className={`${btn} ${off}`}>Duplicar compás</button>
                        <button onClick={() => updateScore(fillMeasureWithRests(score, cur.m))} className={`${btn} ${off}`}>Completar silencios</button>
                        <button onClick={() => updateScore(clearMeasure(score, cur.m))} className={`${btn} ${off}`}>Vaciar compás</button>
                        <button onClick={deleteMeasure} className={`${btn} ${off} hover:!bg-red-900`}>Eliminar compás</button>
                      </div>
                      <button onClick={clearAll} className={`w-full ${btn} ${off} hover:!bg-red-900 flex items-center justify-center gap-1 mt-1`}>
                        <Eraser size={12} /> Limpiar toda la tablatura
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* PAPER CANVAS */}
        <div className="flex-grow overflow-auto bg-slate-800 p-6 flex justify-center items-start">
          <div className="bg-white text-black rounded shadow-2xl p-6 h-fit" style={{ width: TAB_WIDTH + 48 }}>
            <input
              value={score.title}
              onChange={e => onChange({ ...score, title: e.target.value })}
              placeholder="Título de la tablatura (opcional)"
              className="w-full text-xl font-bold outline-none bg-transparent placeholder-slate-300"
              style={{ fontFamily: "'Times New Roman', serif" }}
            />
            <input
              value={score.subtitle || ''}
              onChange={e => onChange({ ...score, subtitle: e.target.value })}
              placeholder="Autor / subtítulo / notas (opcional)"
              className="w-full text-xs text-slate-500 outline-none bg-transparent placeholder-slate-300 mb-4"
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
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 shrink-0">
        <span className="font-bold text-slate-300">
          C.{safeM + 1} · Cda {stringLabels[cur.string]} ·{' '}
          <span className={over ? 'text-red-400' : used < cap - 0.001 ? 'text-amber-400' : 'text-emerald-400'}>
            {fmtQuarters(used)} / {fmtQuarters(cap)} negras
          </span>
        </span>
        <span><kbd className="px-1 bg-slate-800 rounded">0-9</kbd> traste</span>
        <span><kbd className="px-1 bg-slate-800 rounded">+/-</kbd> ±1 traste</span>
        <span><kbd className="px-1 bg-slate-800 rounded">Tab</kbd> compás</span>
        <span><kbd className="px-1 bg-slate-800 rounded">B</kbd> bend</span>
        <span><kbd className="px-1 bg-slate-800 rounded">V</kbd> vibrato</span>
        <span><kbd className="px-1 bg-slate-800 rounded">P</kbd> palm mute</span>
        <span><kbd className="px-1 bg-slate-800 rounded">N</kbd> armónico</span>
        <span><kbd className="px-1 bg-slate-800 rounded">G</kbd> ghost</span>
        <span><kbd className="px-1 bg-slate-800 rounded">H/S/L</kbd> artic.</span>
        <span><kbd className="px-1 bg-slate-800 rounded">Ctrl+Z/C/V</kbd> editar</span>
      </div>

      {/* EXPORT / IMPORT MODAL */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setExportOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold">
                <FileText size={18} className="text-indigo-400" />
                <span>Exportar / Importar Tablatura</span>
              </div>
              <button onClick={() => setExportOpen(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>

            <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-emerald-300 font-mono overflow-auto max-h-64 whitespace-pre">
              {asciiPreview}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button onClick={handleCopyAscii} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5">
                  {asciiCopied ? <Check size={14} /> : <Copy size={14} />}
                  {asciiCopied ? '¡Copiado!' : 'Copiar ASCII Tab'}
                </button>
                <button onClick={handleDownloadAscii} className={`${btn} ${off} py-2 flex items-center gap-1.5`}>
                  <Download size={14} /> Descargar .TXT
                </button>
                <button onClick={handleDownloadJson} className={`${btn} ${off} py-2 flex items-center gap-1.5`}>
                  <Download size={14} /> Exportar .JSON
                </button>
              </div>
              <label className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold cursor-pointer">
                Importar .JSON
                <input type="file" accept=".json,application/json" onChange={handleImportJson} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
