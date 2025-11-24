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
    case 0: name = "F"; break; // Fundamental
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

/**
 * Advanced Chord Detection Logic
 * Handles 9, 11, 13 extensions and alterations.
 */
export const detectChordName = (root: NoteData, notes: NoteData[], useFlats: boolean = false): string | null => {
  if (notes.length < 1) return null;
  if (notes.length === 1) return getNoteDisplay(root.note, useFlats);

  const intervals = new Set<number>();
  notes.forEach(n => {
    let diff = (n.absoluteSemitone - root.absoluteSemitone) % 12;
    if (diff < 0) diff += 12;
    if (diff !== 0) intervals.add(diff);
  });

  const has = (i: number) => intervals.has(i);

  // Intervals
  const hasb2 = has(1);
  const has2 = has(2);
  const hasb3 = has(3);
  const has3 = has(4);
  const has4 = has(5);
  const hasb5 = has(6);
  const has5 = has(7);
  const hasSharp5 = has(8);
  const has6 = has(9);
  const hasb7 = has(10);
  const has7 = has(11);

  let rootName = getNoteDisplay(root.note, useFlats);
  let quality = "";
  let extension = "";
  let alterations = "";

  // Helper to check if a specific interval should be treated as flat based on note accidental
  const isIntervalFlat = (semitone: number, defaultFlats: boolean) => {
    const note = notes.find(n => {
      let diff = (n.absoluteSemitone - root.absoluteSemitone) % 12;
      if (diff < 0) diff += 12;
      return diff === semitone;
    });
    if (note && note.accidental === 'b') return true;
    if (note && note.accidental === '#') return false;
    return defaultFlats;
  };

  const treatSharp5AsFlat13 = hasSharp5 ? isIntervalFlat(8, useFlats) : false;

  // Quality
  let isMajor = has3;
  let isMinor = hasb3 && !has3;
  if (has3 && hasb3) { isMajor = true; isMinor = false; } // Hendrix #9

  let isDim = hasb3 && hasb5 && !has5;
  let isAug = has3 && hasSharp5 && !has5;
  let isSus4 = !has3 && !hasb3 && has4;
  let isSus2 = !has3 && !hasb3 && has2;
  let isPower = has5 && !has3 && !hasb3 && !has2 && !has4;

  if (isPower) quality = "5";
  else if (isAug) {
    if (treatSharp5AsFlat13 && hasb7) quality = "7"; // Treat as 7(b13) if flats are preferred and it has a b7
    else quality = "aug";
  }
  else if (isDim) {
    if (has6) quality = "dim7";
    else if (hasb7) quality = "m7b5";
    else quality = "dim";
  } else if (isMinor) quality = "m";
  else if (isSus4) quality = "sus4";
  else if (isSus2) quality = "sus2";
  else quality = ""; // Major implied

  // 7th
  if (has7) {
    if (quality === "m") extension = "Maj7";
    else if (quality === "") extension = "Maj7";
    else if (quality === "aug") extension = "Maj7";
    else if (quality === "sus4") extension = "Maj7";
  } else if (hasb7) {
    if (quality === "m") extension = "7";
    else if (quality === "") extension = "7";
    else if (quality === "sus4") { quality = "7sus4"; }
    else if (quality === "aug") { quality = "+7"; }
    // Note: if quality was set to "7" above for aug+flats, extension is already implied as 7.
    else if (quality === "7") { /* do nothing, already set */ }
  } else if (has6 && !isDim) {
    extension = "6";
    if (has2) extension = "6/9";
  }

  // 9th (Replaces 7)
  if (has2 && !isSus2 && !extension.includes("6/9")) {
    if (extension === "7") extension = "9";
    else if (extension === "Maj7") extension = "Maj9";
    else if (extension === "m7") extension = "m9";
    else if (extension === "") extension = "add9";
    else if (extension === "m") extension = "m(add9)";

    if (quality === "7" && extension === "") {
      quality = ""; extension = "9";
    }
  }

  // 11th 
  if (has4 && !isSus4) {
    if (extension === "9" || extension === "7") extension = "11";
    else if (extension === "m9" || extension === "m7") extension = "m11";
    else if (extension === "Maj9" || extension === "Maj7") extension = "Maj11";
    else if (extension === "") extension = "add11";
  }

  // 13th
  if (has6 && !isDim && !extension.includes("6")) {
    if (extension.includes("7") || extension.includes("9") || extension.includes("11")) {
      if (extension.includes("Maj")) extension = "Maj13";
      else if (extension.includes("m")) extension = "m13";
      else extension = "13";
    }
  }

  // Alterations
  if (hasb5 && !isDim && quality !== "m7b5") {
    if (extension.includes("7") || extension.includes("9")) alterations += "#11";
    else alterations += "b5";
  }

  if (hasSharp5 && !isAug) {
    if (hasb7 && !extension.includes("13")) {
      if (treatSharp5AsFlat13) alterations += "(b13)";
      else alterations += "#5";
    }
  }

  if (hasb2) alterations += "b9";

  if (hasb3 && has3 && hasb7) alterations += "#9";

  if (hasSharp5 && quality !== "aug" && quality !== "+7") {
    if (treatSharp5AsFlat13 && quality === "7") {
      if (!alterations.includes("b13")) alterations += "(b13)";
    } else if (extension && !alterations.includes("#5") && !treatSharp5AsFlat13) {
      alterations += "#5";
    }
  }

  if (quality === "m" && extension.startsWith("m")) quality = "";

  return `${rootName}${quality}${extension}${alterations}`;
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