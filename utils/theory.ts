import { NoteName, NoteData, IntervalInfo, TuningDefinition } from '../types';

export const NOTES: NoteName[] = [
  NoteName.C, NoteName.CSharp, NoteName.D, NoteName.DSharp, NoteName.E, NoteName.F,
  NoteName.FSharp, NoteName.G, NoteName.GSharp, NoteName.A, NoteName.ASharp, NoteName.B
];

export const TUNINGS: Record<string, TuningDefinition> = {
  'standard': { id: 'standard', name: 'Guitarra Estándar (E A D G B E)', offsets: [40, 45, 50, 55, 59, 64], stringCount: 6 },
};

const FLATS_MAP: Record<string, string> = {
  [NoteName.CSharp]: "Db",
  [NoteName.DSharp]: "Eb",
  [NoteName.FSharp]: "Gb",
  [NoteName.GSharp]: "Ab",
  [NoteName.ASharp]: "Bb"
};

export const getNoteDisplay = (note: string, useFlats: boolean, specificAccidental?: 'b' | '#'): string => {
  const effectiveFlats = specificAccidental ? specificAccidental === 'b' : useFlats;
  if (effectiveFlats && FLATS_MAP[note]) return FLATS_MAP[note];
  return note;
};

export const getNoteAtPosition = (stringIndex: number, fret: number, tuningId: string = 'standard'): { note: NoteName, absolute: number, octave: number } => {
  const tuning = TUNINGS['standard'];
  const safeIndex = Math.min(stringIndex, tuning.offsets.length - 1);
  const openStringAbsolute = tuning.offsets[safeIndex];
  
  const currentAbsolute = openStringAbsolute + fret;
  const noteIndex = currentAbsolute % 12; 
  return {
    note: NOTES[noteIndex],
    absolute: currentAbsolute,
    octave: Math.floor(currentAbsolute / 12) - 1
  };
};

export const calculateInterval = (rootAbsolute: number, targetAbsolute: number, useFlats: boolean = false, specificAccidental?: 'b' | '#'): IntervalInfo => {
  const diff = targetAbsolute - rootAbsolute;
  let semitones = diff % 12;
  if (semitones < 0) semitones += 12;

  const isCompound = diff > 12; 
  const effectiveFlats = specificAccidental ? specificAccidental === 'b' : useFlats;

  let name = "";
  
  switch (semitones) {
    case 0: name = "F"; break; // Changed from R to F
    case 1: name = "b9"; break; 
    case 2: name = isCompound ? "9" : "2"; break;
    case 3: name = "b3"; break; 
    case 4: name = "3"; break;
    case 5: name = isCompound ? "11" : "4"; break; 
    case 6: name = effectiveFlats ? "b5" : "#11"; break; 
    case 7: name = "5"; break;
    case 8: name = effectiveFlats ? "b13" : "#5"; break; 
    case 9: name = isCompound ? "13" : "6"; break; 
    case 10: name = "b7"; break;
    case 11: name = "7"; break; 
  }
  
  if (semitones === 3 && !effectiveFlats && isCompound) name = "#9"; 

  return { name, semitones, quality: "" };
};

export const getEnharmonicSuggestion = (root: NoteData, notes: NoteData[], useFlats: boolean): string | null => {
  if (notes.length < 2) return null;
  return null; 
};

export const detectChordName = (root: NoteData, notes: NoteData[], useFlats: boolean = false): string | null => {
  if (notes.length < 2) return null;
  
  const semitonesSet = new Set<number>();
  notes.forEach(n => {
    let diff = (n.absoluteSemitone - root.absoluteSemitone) % 12;
    if (diff < 0) diff += 12;
    if (diff !== 0) semitonesSet.add(diff);
  });
  
  const has = (interval: number) => semitonesSet.has(interval);
  const hasMaj3 = has(4);
  const hasMin3 = has(3);
  const hasMin7 = has(10);

  let rootName = getNoteDisplay(root.note, useFlats);
  let quality = "";
  
  if (hasMaj3) {
      quality = hasMin7 ? "7" : "Maj";
  } else if (hasMin3) {
      quality = hasMin7 ? "m7" : "m";
  }
  
  return `${rootName}${quality}`; 
};

export const getGenericChordName = (chordName: string): string => {
  return chordName.replace(/^[A-G][#b]?/, "Ac. ");
};

export const playNotes = (notes: NoteData[]) => {
  if (notes.length === 0) return;
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  const sortedNotes = [...notes].sort((a, b) => a.absoluteSemitone - b.absoluteSemitone);
  sortedNotes.forEach((n, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const freq = 440 * Math.pow(2, (n.absoluteSemitone - 69) / 12); 
    osc.type = 'triangle'; 
    osc.frequency.setValueAtTime(freq, now);
    const startTime = now + (i * 0.05); 
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5); 
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 2);
  });
  setTimeout(() => ctx.close(), 2500);
};

export const getScaleNotes = (rootAbsolute: number, scaleType: string): number[] => [];