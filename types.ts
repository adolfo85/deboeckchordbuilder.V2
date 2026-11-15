export enum NoteName {
  C = 'C',
  CSharp = 'C#',
  D = 'D',
  DSharp = 'D#',
  E = 'E',
  F = 'F',
  FSharp = 'F#',
  G = 'G',
  GSharp = 'G#',
  A = 'A',
  ASharp = 'A#',
  B = 'B'
}

export interface FretPosition {
  stringIndex: number;
  fretNumber: number;
}

export interface NoteData extends FretPosition {
  note: NoteName;
  octave: number;
  absoluteSemitone: number;
  isRoot: boolean;
  accidental?: 'b' | '#';
}

export interface IntervalInfo {
  name: string;
  semitones: number;
  quality: string;
}

export type NoteShape = 'circle' | 'square' | 'triangle';

export interface ChordStyle {
  noteShape: NoteShape;
  noteColor: string; // Color for intervals
  rootColor: string; // Color for fundamental
  noteSize: number; // Scale multiplier
  fontFamily?: string;
  fontSize?: number;
}

// --- TABLATURE ---
/** w = redonda, h = blanca, q = negra, e = corchea, s = semicorchea, t = fusa */
export type NoteValue = 'w' | 'h' | 'q' | 'e' | 's' | 't';

export interface TabChordDiagram {
  /** American chord symbol, e.g. "Cmaj7" or "Bb7(b13)". */
  name: string;
  /** Per string (0 = low E): fret, 0 = open, null = not played. */
  frets: (number | null)[];
  /** First fret shown in the diagram (>= 1). */
  baseFret: number;
  showDiagram: boolean;
}

export type BendType = 'half' | 'full' | '1.5' | '2';
export type HarmonicType = 'natural' | 'pinch';

export interface TabEvent {
  id: string;
  duration: NoteValue;
  dotted: boolean;
  rest: boolean;
  /** One entry per string; index 0 = lowest string (low E). null = string not played. */
  frets: (number | null)[];
  /** Per string: tied to the same fret on the same string in the next event. */
  ties?: boolean[];
  /** Per string: hammer-on / pull-off to the next event on the same string. */
  hammerPull?: boolean[];
  /** Per string: slide / glissando into the next event on the same string. */
  slides?: boolean[];
  /** Per string: bend amount. */
  bends?: (BendType | null)[];
  /** Per string: vibrato. */
  vibrato?: boolean[];
  /** Per string: natural (<12>) or pinch/artificial harmonic. */
  harmonics?: (HarmonicType | null)[];
  /** Per string: ghost note (soft, parenthesized). */
  ghost?: boolean[];
  /** Event-level palm mute (P.M.). */
  palmMute?: boolean;
  /** Event-level let ring. */
  letRing?: boolean;
  /** Event-level accent (>). */
  accent?: boolean;
  /** Event-level staccato (.). */
  staccato?: boolean;
  /** Per string: accidental override: '#' force sharp, 'b' force flat, 'n' force courtesy natural, null auto */
  accidentals?: ('#' | 'b' | 'n' | null)[];
  /** Irregular group: `actual` notes in the time of `normal` notes of the same written value. */
  tuplet?: { id: string; actual: number; normal: number };
  /** Chord symbol (and optional mini diagram) shown above the staff at this event. */
  chord?: TabChordDiagram;
}

export interface TabMeasure {
  id: string;
  timeSig: { num: number; den: number };
  tempo: number;
  keySig?: string;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  repeatCount?: number;
  ending?: '1.' | '2.' | null;
  section?: string;
  events: TabEvent[];
}

export interface TabScore {
  title: string;
  subtitle?: string;
  tuningId?: string;
  measuresPerSystem: number;
  showStandardNotation?: boolean;
  staffGap?: number;
  keySig?: string;
  playbackArticulation?: 'legato' | 'ring' | 'staccato';
  measures: TabMeasure[];
}

export interface TabCursor {
  m: number;
  /** Index of the event; equals events.length for the empty "append" slot. */
  slot: number;
  string: number;
}

export interface SavedChord extends Partial<ChordStyle> {
  id: string;
  name: string;
  notes: NoteData[];
  rootNote: NoteData | null;
  date: number;
  showIntervals: boolean;
  useFlats: boolean;
  instrument: string;
  tuningId: string;
  x: number;
  y: number;
  type?: 'chord' | 'scale' | 'tab';
  scaleRoot?: NoteData;
  scaleType?: string;
  fretRange?: { start: number; end: number };
  tab?: TabScore;
}

export interface TuningDefinition {
  id: string;
  name: string;
  offsets: number[];
  stringCount: number;
}

export interface GraphicObject {
  id: string;
  type: 'square' | 'circle' | 'arrow' | 'text'; // Text added
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  filled: boolean;
  opacity: number;
  // Text specific properties
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}