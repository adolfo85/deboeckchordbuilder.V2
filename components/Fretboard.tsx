import React, { useRef } from 'react';
import { NoteData, TuningDefinition } from '../types';
import { getNoteAtPosition, calculateInterval, getNoteDisplay } from '../utils/theory';

interface FretboardProps {
  tuning: TuningDefinition;
  rootNote: NoteData | null;
  selectedNotes: NoteData[];
  onToggleNote: (stringIndex: number, fret: number) => void;
  onNoteClick: (note: NoteData) => void;
  showFretNumbers: boolean;
  showInlays: boolean;
  noteDisplayMode: 'intervals' | 'notes' | 'finger';
  useFlats: boolean;
  accentColor: string;
  startFret: number;
  fretCount: number;
  showGhostNotes: boolean;
}

export const Fretboard: React.FC<FretboardProps> = ({
  tuning,
  rootNote,
  selectedNotes,
  onToggleNote,
  onNoteClick,
  noteDisplayMode,
  useFlats,
  accentColor,
  startFret,
  fretCount,
  showGhostNotes,
  showFretNumbers,
  showInlays
}) => {

  const scrollRef = useRef<HTMLDivElement>(null);

  const getNoteAt = (stringIdx: number, fret: number) => {
    return selectedNotes.find(n => n.stringIndex === stringIdx && n.fretNumber === fret);
  };

  const INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

  const getNoteClasses = (isRoot: boolean) => {
    if (isRoot) return "bg-red-600 text-white ring-2 ring-red-200 shadow-[0_4px_10px_rgba(0,0,0,0.6)]";

    // Map accentColor to Tailwind classes
    switch (accentColor) {
      case 'blue': return "bg-cyan-600 text-white ring-1 ring-cyan-400";
      case 'gold': return "bg-amber-500 text-white ring-1 ring-amber-300";
      case 'pink': return "bg-pink-500 text-white ring-1 ring-pink-300";
      case 'slate':
      default: return "bg-slate-600 text-white ring-1 ring-slate-400";
    }
  };

  const visualStrings = Array.from({ length: tuning.stringCount }, (_, i) => (tuning.stringCount - 1) - i);

  return (
    <div className="w-full h-full flex flex-col justify-center bg-transparent relative shadow-none">
      <div className="absolute inset-0 bg-transparent"></div>

      <div
        ref={scrollRef}
        className="horizontal-scroll w-full overflow-x-auto overflow-y-visible relative z-10 flex items-center pt-10 pb-16 px-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="relative flex h-[260px] min-w-max select-none mx-auto pl-12 pr-12">

          <div className="flex flex-col justify-between h-full relative z-20 mr-1">
            <div className="absolute right-0 top-0 bottom-0 w-4 bg-[#e5e5e5] border-l-2 border-[#999] shadow-xl"></div>

            {visualStrings.map((stringIdx) => {
              const noteData = getNoteAt(stringIdx, 0);
              const rawNoteInfo = getNoteAtPosition(stringIdx, 0, tuning.id);
              const stringName = getNoteDisplay(rawNoteInfo.note, useFlats);

              let label = stringName;
              let noteClass = "bg-white text-slate-700 border-2 border-slate-300 hover:bg-slate-50 w-9 h-9 shadow-sm";
              let sizeClass = "";

              if (noteData) {
                const isRoot = rootNote && noteData.stringIndex === rootNote.stringIndex && noteData.fretNumber === rootNote.fretNumber;
                sizeClass = isRoot ? "w-11 h-11 text-base z-50" : "w-10 h-10 text-sm z-40";

                if (isRoot) {
                  label = noteDisplayMode === 'intervals' ? "F" : stringName;
                  noteClass = getNoteClasses(true);
                } else if (rootNote) {
                  const interval = calculateInterval(rootNote.absoluteSemitone, noteData.absoluteSemitone, useFlats, noteData.accidental);
                  label = noteDisplayMode === 'intervals' ? interval.name : stringName;
                  noteClass = getNoteClasses(false);
                } else {
                  noteClass = getNoteClasses(false);
                }
              }

              return (
                <div key={`nut-${stringIdx}`} className="h-1/6 flex items-center justify-center w-16 -ml-16 pr-5 relative z-50 cursor-pointer group" onClick={() => onToggleNote(stringIdx, 0)}>
                  <div className="absolute left-2 text-[10px] font-bold text-slate-500 w-4 text-center">{stringName}</div>
                  <div className={`rounded-full flex items-center justify-center font-bold transition-all duration-200 ${noteClass} ${sizeClass}`} onClick={(e) => { if (noteData) { e.stopPropagation(); onNoteClick(noteData); } }}>{noteData ? label : (showGhostNotes ? stringName : '')}</div>
                </div>
              );
            })}
          </div>

          <div className="relative flex h-full border-4 border-slate-800 bg-[#1e293b] shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden">
            {Array.from({ length: fretCount }).map((_, i) => {
              const fretNum = i + 1;
              const width = Math.max(45, 80 - (fretNum * 1.8));
              return (
                <div key={`fret-col-${fretNum}`} className="relative h-full border-r-[2px] border-[#475569] flex flex-col justify-between shrink-0 bg-[#1e293b]" style={{ width: `${width}px` }}>
                  {showFretNumbers && <div className="absolute -bottom-10 left-0 w-full text-center z-50"><span className="text-sm font-bold text-slate-600 font-mono">{fretNum}</span></div>}
                  {showInlays && INLAYS.includes(fretNum) && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {fretNum === 12 || fretNum === 24 ? <div className="flex flex-col gap-8"><div className="w-3 h-3 rounded-full bg-[#e2e8f0] shadow-sm"></div><div className="w-3 h-3 rounded-full bg-[#e2e8f0] shadow-sm"></div></div> : <div className="w-4 h-4 rounded-full bg-[#e2e8f0] shadow-sm"></div>}
                    </div>
                  )}
                  {visualStrings.map((stringIdx) => {
                    const noteData = getNoteAt(stringIdx, fretNum);
                    let displayLabel = "";
                    let noteClass = "";
                    let sizeClass = "";
                    if (noteData) {
                      const isRoot = rootNote && noteData.stringIndex === rootNote.stringIndex && noteData.fretNumber === rootNote.fretNumber;
                      sizeClass = isRoot ? "w-11 h-11 text-base z-50" : "w-10 h-10 text-sm z-40";
                      if (isRoot) {
                        displayLabel = noteDisplayMode === 'intervals' ? "F" : getNoteDisplay(noteData.note, useFlats, noteData.accidental);
                        noteClass = getNoteClasses(true);
                      } else if (rootNote) {
                        const interval = calculateInterval(rootNote.absoluteSemitone, noteData.absoluteSemitone, useFlats, noteData.accidental);
                        displayLabel = noteDisplayMode === 'intervals' ? interval.name : getNoteDisplay(noteData.note, useFlats, noteData.accidental);
                        noteClass = getNoteClasses(false);
                      } else {
                        displayLabel = getNoteDisplay(noteData.note, useFlats, noteData.accidental);
                        noteClass = getNoteClasses(false);
                      }
                    }
                    const thickness = 1 + ((tuning.stringCount - 1 - stringIdx) * 0.7);
                    return (
                      <div key={`s${stringIdx}-f${fretNum}`} className="flex-1 w-full relative cursor-pointer group flex items-center justify-center z-10" onClick={() => onToggleNote(stringIdx, fretNum)}>
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 pointer-events-none z-0 flex items-center"><div className={`w-full bg-[#94a3b8] shadow-sm`} style={{ height: `${thickness}px`, opacity: 0.6 }}></div></div>
                        {noteData && <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center font-bold transition-all duration-150 animate-in zoom-in ${noteClass} ${sizeClass}`} onClick={(e) => { e.stopPropagation(); onNoteClick(noteData); }}>{displayLabel}</div>}
                      </div>
                    );
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  );
};