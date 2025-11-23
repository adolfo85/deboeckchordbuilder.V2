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
}