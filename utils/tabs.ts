import { NoteValue, TabEvent, TabMeasure, TabScore } from '../types';

export const STRING_COUNT = 6;
export const MAX_FRET = 24;
/** Width (px) of a tab block, both in the editor and in the exported document. */
export const TAB_WIDTH = 700;

/** Durations expressed in 64th-note units. */
export const NOTE_VALUES: { id: NoteValue; name: string; units: number; flags: number }[] = [
  { id: 'w', name: 'Redonda', units: 64, flags: 0 },
  { id: 'h', name: 'Blanca', units: 32, flags: 0 },
  { id: 'q', name: 'Negra', units: 16, flags: 0 },
  { id: 'e', name: 'Corchea', units: 8, flags: 1 },
  { id: 's', name: 'Semicorchea', units: 4, flags: 2 },
  { id: 't', name: 'Fusa', units: 2, flags: 3 },
];

export const TIME_SIG_PRESETS: [number, number][] = [[4, 4], [3, 4], [2, 4], [6, 8], [12, 8], [5, 4], [7, 8]];

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export const unitsOf = (v: NoteValue) => NOTE_VALUES.find(n => n.id === v)!.units;
export const flagsOf = (v: NoteValue) => NOTE_VALUES.find(n => n.id === v)!.flags;
export const eventUnits = (e: { duration: NoteValue; dotted: boolean; tuplet?: { actual: number; normal: number } }) =>
  unitsOf(e.duration) * (e.dotted ? 1.5 : 1) * (e.tuplet ? e.tuplet.normal / e.tuplet.actual : 1);
export const measureCapacity = (sig: { num: number; den: number }) => (sig.num * 64) / sig.den;
export const measureUsed = (m: TabMeasure) => m.events.reduce((acc, e) => acc + eventUnits(e), 0);

export const emptyFrets = (): (number | null)[] => Array.from({ length: STRING_COUNT }, () => null);

export const createEvent = (duration: NoteValue, dotted: boolean, rest: boolean): TabEvent => ({
  id: uid(), duration, dotted, rest, frets: emptyFrets(),
});

export const createMeasure = (timeSig = { num: 4, den: 4 }, tempo = 120, keySig?: string): TabMeasure => ({
  id: uid(), timeSig: { ...timeSig }, tempo, keySig, events: [],
});

export const createEmptyScore = (): TabScore => ({
  title: '',
  measuresPerSystem: 4,
  keySig: 'C',
  staffGap: 50,
  measures: Array.from({ length: 4 }, () => createMeasure()),
});

export const cloneScore = (s: TabScore): TabScore => JSON.parse(JSON.stringify(s));

// --- LAYOUT ---
export const LAYOUT = {
  lineGap: 10,
  topMargin: 34,   // room for tempo / measure numbers above the staff
  staffH: 50,      // 5 gaps * lineGap
  rhythmH: 44,     // room for stems / beams below the staff
  stride: 140,     // vertical distance between systems
  appendW: 30,
  clefW: 26,
  sigW: 24,
};

export interface SlotLayout { cx: number; w: number; }
export interface MeasureLayout {
  index: number;
  k: number; // position within the system
  x: number;
  w: number;
  showTS: boolean;
  showTempo: boolean;
  showKeySig: boolean;
  keySig: string;
  keySigW: number;
  slots: SlotLayout[]; // one per event (+ append slot when editable)
}
export interface SystemLayout { measures: MeasureLayout[]; }

export interface KeySigAccidental {
  step: number; // step on treble staff (step 2 = E4, step 10 = F5)
  acc: '#' | 'b';
}

export interface KeySigDef {
  id: string;
  name: string;
  shortName: string;
  type: '#' | 'b' | 'none';
  count: number;
  accidentals: KeySigAccidental[];
  diatonicAltered: { [step: number]: '#' | 'b' };
}

export const KEY_SIGNATURES: KeySigDef[] = [
  {
    id: 'C',
    name: 'Armadura abierta / Do Mayor - La menor',
    shortName: 'Do M / La m (0)',
    type: 'none',
    count: 0,
    accidentals: [],
    diatonicAltered: {},
  },
  // SHARPS
  {
    id: 'G',
    name: 'Sol Mayor / Mi menor (1♯)',
    shortName: 'Sol M (1♯)',
    type: '#',
    count: 1,
    accidentals: [{ step: 10, acc: '#' }],
    diatonicAltered: { 3: '#' },
  },
  {
    id: 'D',
    name: 'Re Mayor / Si menor (2♯)',
    shortName: 'Re M (2♯)',
    type: '#',
    count: 2,
    accidentals: [{ step: 10, acc: '#' }, { step: 7, acc: '#' }],
    diatonicAltered: { 3: '#', 0: '#' },
  },
  {
    id: 'A',
    name: 'La Mayor / Fa# menor (3♯)',
    shortName: 'La M (3♯)',
    type: '#',
    count: 3,
    accidentals: [{ step: 10, acc: '#' }, { step: 7, acc: '#' }, { step: 11, acc: '#' }],
    diatonicAltered: { 3: '#', 0: '#', 4: '#' },
  },
  {
    id: 'E',
    name: 'Mi Mayor / Do# menor (4♯)',
    shortName: 'Mi M (4♯)',
    type: '#',
    count: 4,
    accidentals: [{ step: 10, acc: '#' }, { step: 7, acc: '#' }, { step: 11, acc: '#' }, { step: 8, acc: '#' }],
    diatonicAltered: { 3: '#', 0: '#', 4: '#', 1: '#' },
  },
  {
    id: 'B',
    name: 'Si Mayor / Sol# menor (5♯)',
    shortName: 'Si M (5♯)',
    type: '#',
    count: 5,
    accidentals: [{ step: 10, acc: '#' }, { step: 7, acc: '#' }, { step: 11, acc: '#' }, { step: 8, acc: '#' }, { step: 5, acc: '#' }],
    diatonicAltered: { 3: '#', 0: '#', 4: '#', 1: '#', 5: '#' },
  },
  {
    id: 'F#',
    name: 'Fa# Mayor / Re# menor (6♯)',
    shortName: 'Fa# M (6♯)',
    type: '#',
    count: 6,
    accidentals: [{ step: 10, acc: '#' }, { step: 7, acc: '#' }, { step: 11, acc: '#' }, { step: 8, acc: '#' }, { step: 5, acc: '#' }, { step: 9, acc: '#' }],
    diatonicAltered: { 3: '#', 0: '#', 4: '#', 1: '#', 5: '#', 2: '#' },
  },
  {
    id: 'C#',
    name: 'Do# Mayor / La# menor (7♯)',
    shortName: 'Do# M (7♯)',
    type: '#',
    count: 7,
    accidentals: [{ step: 10, acc: '#' }, { step: 7, acc: '#' }, { step: 11, acc: '#' }, { step: 8, acc: '#' }, { step: 5, acc: '#' }, { step: 9, acc: '#' }, { step: 6, acc: '#' }],
    diatonicAltered: { 3: '#', 0: '#', 4: '#', 1: '#', 5: '#', 2: '#', 6: '#' },
  },
  // FLATS
  {
    id: 'F',
    name: 'Fa Mayor / Re menor (1♭)',
    shortName: 'Fa M (1♭)',
    type: 'b',
    count: 1,
    accidentals: [{ step: 6, acc: 'b' }],
    diatonicAltered: { 6: 'b' },
  },
  {
    id: 'Bb',
    name: 'Si♭ Mayor / Sol menor (2♭)',
    shortName: 'Si♭ M (2♭)',
    type: 'b',
    count: 2,
    accidentals: [{ step: 6, acc: 'b' }, { step: 9, acc: 'b' }],
    diatonicAltered: { 6: 'b', 2: 'b' },
  },
  {
    id: 'Eb',
    name: 'Mi♭ Mayor / Do menor (3♭)',
    shortName: 'Mi♭ M (3♭)',
    type: 'b',
    count: 3,
    accidentals: [{ step: 6, acc: 'b' }, { step: 9, acc: 'b' }, { step: 5, acc: 'b' }],
    diatonicAltered: { 6: 'b', 2: 'b', 5: 'b' },
  },
  {
    id: 'Ab',
    name: 'La♭ Mayor / Fa menor (4♭)',
    shortName: 'La♭ M (4♭)',
    type: 'b',
    count: 4,
    accidentals: [{ step: 6, acc: 'b' }, { step: 9, acc: 'b' }, { step: 5, acc: 'b' }, { step: 8, acc: 'b' }],
    diatonicAltered: { 6: 'b', 2: 'b', 5: 'b', 1: 'b' },
  },
  {
    id: 'Db',
    name: 'Re♭ Mayor / Si♭ menor (5♭)',
    shortName: 'Re♭ M (5♭)',
    type: 'b',
    count: 5,
    accidentals: [{ step: 6, acc: 'b' }, { step: 9, acc: 'b' }, { step: 5, acc: 'b' }, { step: 8, acc: 'b' }, { step: 4, acc: 'b' }],
    diatonicAltered: { 6: 'b', 2: 'b', 5: 'b', 1: 'b', 4: 'b' },
  },
  {
    id: 'Gb',
    name: 'Sol♭ Mayor / Mi♭ menor (6♭)',
    shortName: 'Sol♭ M (6♭)',
    type: 'b',
    count: 6,
    accidentals: [{ step: 6, acc: 'b' }, { step: 9, acc: 'b' }, { step: 5, acc: 'b' }, { step: 8, acc: 'b' }, { step: 4, acc: 'b' }, { step: 7, acc: 'b' }],
    diatonicAltered: { 6: 'b', 2: 'b', 5: 'b', 1: 'b', 4: 'b', 0: 'b' },
  },
  {
    id: 'Cb',
    name: 'Do♭ Mayor / La♭ menor (7♭)',
    shortName: 'Do♭ M (7♭)',
    type: 'b',
    count: 7,
    accidentals: [{ step: 6, acc: 'b' }, { step: 9, acc: 'b' }, { step: 5, acc: 'b' }, { step: 8, acc: 'b' }, { step: 4, acc: 'b' }, { step: 7, acc: 'b' }, { step: 3, acc: 'b' }],
    diatonicAltered: { 6: 'b', 2: 'b', 5: 'b', 1: 'b', 4: 'b', 0: 'b', 3: 'b' },
  },
];

export const getKeySig = (id = 'C'): KeySigDef =>
  KEY_SIGNATURES.find(k => k.id.toLowerCase() === id.toLowerCase()) || KEY_SIGNATURES[0];

export const layoutScore = (score: TabScore, width: number, editable: boolean): SystemLayout[] => {
  const per = Math.max(1, score.measuresPerSystem);
  const systems: SystemLayout[] = [];

  for (let start = 0; start < score.measures.length; start += per) {
    const chunk = score.measures.slice(start, start + per);
    const isFull = chunk.length === per;

    const infos = chunk.map((m, k) => {
      const index = start + k;
      const prev = index > 0 ? score.measures[index - 1] : null;
      const keySig = m.keySig || score.keySig || 'C';
      const prevKeySig = prev ? (prev.keySig || score.keySig || 'C') : null;
      const keyDef = getKeySig(keySig);
      const showKeySig = (k === 0 && keyDef.count > 0) || (prevKeySig !== null && prevKeySig !== keySig);
      const keySigW = showKeySig ? Math.max(keyDef.count, prevKeySig ? getKeySig(prevKeySig).count : 0) * 8 + 6 : 0;
      const showTS = !prev || prev.timeSig.num !== m.timeSig.num || prev.timeSig.den !== m.timeSig.den;
      const showTempo = !prev || prev.tempo !== m.tempo;
      const lead = (k === 0 ? LAYOUT.clefW : 0) + (score.showStandardNotation ? keySigW : 0) + (showTS ? LAYOUT.sigW : 0) + 10;
      const naturals = m.events.map(e => 26 + Math.sqrt(eventUnits(e)) * 8);
      if (editable) naturals.push(LAYOUT.appendW);
      const sum = naturals.length ? naturals.reduce((a, b) => a + b, 0) : 60;
      return { index, k, showTS, showTempo, showKeySig, keySig, keySigW, lead, naturals, sum };
    });

    const fixed = infos.reduce((a, i) => a + i.lead + 10, 0);
    const sumN = infos.reduce((a, i) => a + i.sum, 0);
    let scale = (width - fixed) / sumN;
    if (!isFull) scale = Math.min(scale, 1.3);
    scale = Math.max(scale, 0.45);

    let x = 0;
    const measures: MeasureLayout[] = infos.map(info => {
      const w = info.lead + 10 + info.sum * scale;
      let cursorX = x + info.lead;
      const slots = info.naturals.map(n => {
        const sw = n * scale;
        const slot = { cx: cursorX + sw / 2, w: sw };
        cursorX += sw;
        return slot;
      });
      const ml: MeasureLayout = {
        index: info.index,
        k: info.k,
        x,
        w,
        showTS: info.showTS,
        showTempo: info.showTempo,
        showKeySig: info.showKeySig,
        keySig: info.keySig,
        keySigW: info.keySigW,
        slots,
      };
      x += w;
      return ml;
    });
    systems.push({ measures });
  }
  return systems;
};

export const CHORD_NAME_H = 22;
export const CHORD_DIAGRAM_H = 72; // name + 5-fret mini diagram
export const DEFAULT_STAFF_GAP = 50; // px between bottom line of standard notation and top line of tablatura

export interface NotationPitch {
  totalStep: number; // 0 = middle C (C4, 1 ledger line below), 2 = E4 (line 1), 10 = F5 (line 5)
  accidental: 'b' | '#' | 'n' | null;
}

const PITCH_CLASSES_SHARP: { step: number; acc: '#' | null }[] = [
  { step: 0, acc: null }, // C
  { step: 0, acc: '#' },  // C#
  { step: 1, acc: null }, // D
  { step: 1, acc: '#' },  // D#
  { step: 2, acc: null }, // E
  { step: 3, acc: null }, // F
  { step: 3, acc: '#' },  // F#
  { step: 4, acc: null }, // G
  { step: 4, acc: '#' },  // G#
  { step: 5, acc: null }, // A
  { step: 5, acc: '#' },  // A#
  { step: 6, acc: null }, // B
];

const PITCH_CLASSES_FLAT: { step: number; acc: 'b' | null }[] = [
  { step: 0, acc: null }, // C
  { step: 1, acc: 'b' },  // Db
  { step: 1, acc: null }, // D
  { step: 2, acc: 'b' },  // Eb
  { step: 2, acc: null }, // E
  { step: 3, acc: null }, // F
  { step: 4, acc: 'b' },  // Gb
  { step: 4, acc: null }, // G
  { step: 5, acc: 'b' },  // Ab
  { step: 5, acc: null }, // A
  { step: 6, acc: 'b' },  // Bb
  { step: 6, acc: null }, // B
];

const STRING_OFFSETS = [40, 45, 50, 55, 59, 64]; // E2, A2, D3, G3, B3, E4

export const fretToNotationPitch = (
  stringIdx: number,
  fret: number,
  keySigId = 'C',
  accidentalOverride?: '#' | 'b' | 'n' | null
): NotationPitch => {
  const acousticMidi = STRING_OFFSETS[stringIdx] + fret;
  const writtenMidi = acousticMidi + 12; // Guitar treble notation sounds an octave lower than written
  const pc = ((writtenMidi % 12) + 12) % 12;
  const oct = Math.floor(writtenMidi / 12) - 1;
  const keyDef = getKeySig(keySigId);

  let useFlat = keyDef.type === 'b';
  if (accidentalOverride === 'b') useFlat = true;
  else if (accidentalOverride === '#') useFlat = false;

  const table = useFlat ? PITCH_CLASSES_FLAT : PITCH_CLASSES_SHARP;
  const { step, acc } = table[pc];
  const totalStep = (oct - 4) * 7 + step;

  let renderAcc: 'b' | '#' | 'n' | null = null;
  if (accidentalOverride === 'n') {
    renderAcc = 'n'; // forced courtesy natural / becuadro
  } else if (accidentalOverride === '#' || accidentalOverride === 'b') {
    renderAcc = accidentalOverride; // forced sharp or flat
  } else {
    // Auto
    const keyAcc = keyDef.diatonicAltered[step] ?? null;
    if (acc === keyAcc) {
      renderAcc = null; // already accounted for by key signature
    } else if (acc === null && keyAcc !== null) {
      renderAcc = 'n'; // note is natural, but key signature has accidental on this step -> needs natural!
    } else {
      renderAcc = acc; // accidental not in key signature
    }
  }

  return { totalStep, accidental: renderAcc };
};

/** Vertical position of each system; systems with chords or standard notation above the staff are taller. */
export const systemMetrics = (score: TabScore): { systems: { top: number; extra: number; hasDiagram: boolean }[]; height: number } => {
  const per = Math.max(1, score.measuresPerSystem);
  const staffGap = score.staffGap ?? DEFAULT_STAFF_GAP;
  const notationExtra = score.showStandardNotation ? staffGap + 32 + 20 : 0;
  const systems: { top: number; extra: number; hasDiagram: boolean }[] = [];
  let top = 0;
  for (let start = 0; start < score.measures.length; start += per) {
    let extra = notationExtra;
    let hasDiagram = false;
    score.measures.slice(start, start + per).forEach(m => m.events.forEach(e => {
      if (e.chord) {
        if (e.chord.showDiagram) hasDiagram = true;
        extra = Math.max(extra, notationExtra + (e.chord.showDiagram ? CHORD_DIAGRAM_H : CHORD_NAME_H));
      }
    }));
    systems.push({ top, extra, hasDiagram });
    top += LAYOUT.stride + extra;
  }
  return { systems, height: Math.max(top, LAYOUT.stride) };
};

export const tabHeight = (score: TabScore): number => systemMetrics(score).height;

/** Beam groups use the beat (a quarter), or the dotted quarter in compound meters (6/8, 12/8...). */
export const beamGroupUnits = (sig: { num: number; den: number }) =>
  sig.den === 8 && sig.num % 3 === 0 ? 24 : 16;

// --- EDITING HELPERS ---
export const makeRest = (duration: NoteValue): TabEvent => createEvent(duration, false, true);

/** Fills `units` of silence starting at `pos` with rests aligned to their own value (keeps beat grouping). */
export const fillRests = (pos: number, units: number): TabEvent[] => {
  const out: TabEvent[] = [];
  let p = pos;
  let rem = units;
  while (rem >= 2 - 0.001) {
    const v = NOTE_VALUES.find(n => {
      if (n.units > rem + 0.01) return false;
      const r = ((p % n.units) + n.units) % n.units;
      return r < 0.01 || n.units - r < 0.01;
    });
    if (!v) break;
    out.push(makeRest(v.id));
    p += v.units;
    rem -= v.units;
  }
  return out;
};

/**
 * Changes an event's rhythm while preserving the measure's timing:
 * shortening leaves the freed time as aligned rests; lengthening absorbs the following rests.
 */
export const resizeEvent = (score: TabScore, mi: number, slot: number, duration: NoteValue, dotted: boolean): TabScore => {
  const m = score.measures[mi];
  const ev = m.events[slot];
  if (!ev || ev.tuplet) return score; // tuplet notes keep the group's rhythm
  const oldU = eventUnits(ev);
  const newU = eventUnits({ duration, dotted });
  const start = m.events.slice(0, slot).reduce((a, e) => a + eventUnits(e), 0);
  const updated: TabEvent = { ...ev, duration, dotted };
  const before = m.events.slice(0, slot);
  let after = m.events.slice(slot + 1);
  let filler: TabEvent[] = [];

  if (newU < oldU - 0.001) {
    filler = fillRests(start + newU, oldU - newU);
  } else if (newU > oldU + 0.001) {
    let need = newU - oldU;
    while (need > 0.001 && after.length && after[0].rest) {
      const ru = eventUnits(after[0]);
      after = after.slice(1);
      if (ru <= need + 0.001) need -= ru;
      else { filler = fillRests(start + newU, ru - need); need = 0; }
    }
  }
  const events = [...before, updated, ...filler, ...after];
  return { ...score, measures: score.measures.map((x, i) => (i === mi ? { ...x, events } : x)) };
};

/** Writes a fret at the cursor (creating the event at the append slot, or turning a rest into a note). */
export const writeFret = (score: TabScore, c: { m: number; slot: number; string: number }, fret: number, duration: NoteValue, dotted: boolean): TabScore => {
  const m = score.measures[c.m];
  let events: TabEvent[];
  if (c.slot >= m.events.length) {
    const ev = createEvent(duration, dotted, false);
    ev.frets[c.string] = fret;
    events = [...m.events, ev];
  } else {
    events = m.events.map((ev, i) => i !== c.slot ? ev : {
      ...ev, rest: false,
      frets: ev.frets.map((f, si) => si === c.string ? fret : (ev.rest ? null : f)),
    });
  }
  return { ...score, measures: score.measures.map((x, i) => (i === c.m ? { ...x, events } : x)) };
};

/** Cursor position of the "next figure" (creates a measure when leaving a full last measure). */
export const advanceFrom = (score: TabScore, c: { m: number; slot: number; string: number }): { score: TabScore; cursor: { m: number; slot: number; string: number } } => {
  const m = score.measures[c.m];
  const full = measureUsed(m) >= measureCapacity(m.timeSig) - 0.001;
  if (c.slot < m.events.length - 1) return { score, cursor: { ...c, slot: c.slot + 1 } };
  if (c.slot === m.events.length - 1 && !full) return { score, cursor: { ...c, slot: m.events.length } };
  if (c.m + 1 < score.measures.length) return { score, cursor: { ...c, m: c.m + 1, slot: 0 } };
  if (full) return {
    score: { ...score, measures: [...score.measures, createMeasure(m.timeSig, m.tempo)] },
    cursor: { ...c, m: c.m + 1, slot: 0 },
  };
  return { score, cursor: c };
};

// --- TUPLETS ---
export const TUPLETS: { key: string; label: string; actual: number; normal: number }[] = [
  { key: '2:3', label: 'Dosillo (2:3)', actual: 2, normal: 3 },
  { key: '3:2', label: 'Tresillo (3:2)', actual: 3, normal: 2 },
  { key: '4:3', label: 'Cuatrillo (4:3)', actual: 4, normal: 3 },
  { key: '5:4', label: 'Quintillo (5:4)', actual: 5, normal: 4 },
  { key: '6:4', label: 'Sextillo (6:4)', actual: 6, normal: 4 },
  { key: '7:4', label: 'Septillo (7:4)', actual: 7, normal: 4 },
  { key: '9:8', label: 'Nonillo (9:8)', actual: 9, normal: 8 },
];

/** Label shown on the bracket: just the count for standard groups, the ratio otherwise. */
export const tupletLabel = (actual: number, normal: number) => {
  let std = 1;
  while (std * 2 < actual) std *= 2;
  return normal === std ? String(actual) : `${actual}:${normal}`;
};

/**
 * Inserts a tuplet group (as rests, ready to be filled with notes) at `slot`.
 * Following rests are absorbed so the measure keeps its length.
 */
export const insertTuplet = (score: TabScore, mi: number, slot: number, duration: NoteValue, actual: number, normal: number): TabScore => {
  const m = score.measures[mi];
  const total = unitsOf(duration) * normal;
  const id = uid();
  const group = Array.from({ length: actual }, () => ({ ...createEvent(duration, false, true), tuplet: { id, actual, normal } }));
  const before = m.events.slice(0, slot);
  let after = m.events.slice(slot);
  const start = before.reduce((a, e) => a + eventUnits(e), 0);
  let need = total;
  let leftover: TabEvent[] = [];
  while (need > 0.001 && after.length && after[0].rest && !after[0].tuplet) {
    const ru = eventUnits(after[0]);
    after = after.slice(1);
    if (ru <= need + 0.001) need -= ru;
    else { leftover = fillRests(start + total, ru - need); need = 0; }
  }
  const events = [...before, ...group, ...leftover, ...after];
  return { ...score, measures: score.measures.map((x, i) => (i === mi ? { ...x, events } : x)) };
};

/** Removes a tuplet group, leaving the same amount of time as regular rests. */
export const removeTuplet = (score: TabScore, mi: number, id: string): TabScore => {
  const m = score.measures[mi];
  const first = m.events.findIndex(e => e.tuplet?.id === id);
  if (first < 0) return score;
  const group = m.events.filter(e => e.tuplet?.id === id);
  const start = m.events.slice(0, first).reduce((a, e) => a + eventUnits(e), 0);
  const total = group.reduce((a, e) => a + eventUnits(e), 0);
  const events = [
    ...m.events.slice(0, first),
    ...fillRests(start, total),
    ...m.events.slice(first + group.length),
  ];
  return { ...score, measures: score.measures.map((x, i) => (i === mi ? { ...x, events } : x)) };
};
