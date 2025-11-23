
import React from 'react';
import { NoteData } from '../types';
import { getNoteAtPosition, getScaleNotes, getNoteDisplay } from '../utils/theory';

interface ScaleFretboardProps {
  rootNote: NoteData | null;
  scaleType: string;
  useFlats: boolean;
}

export const ScaleFretboard: React.FC<ScaleFretboardProps> = ({ rootNote, scaleType, useFlats }) => {
  // Reduced to 12 frets to fit perfectly in the container without scrolling
  const FRETS = 12;
  // High E (top visually) to Low E (bottom visually)
  const STRINGS = [5, 4, 3, 2, 1, 0]; 

  const validNoteClasses = rootNote ? getScaleNotes(rootNote.absoluteSemitone, scaleType) : [];
  const rootClass = rootNote ? rootNote.absoluteSemitone % 12 : -1;

  if (!rootNote) {
    return (
        <div className="w-full h-[300px] flex flex-col items-center justify-center bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 gap-2">
            <p className="font-bold text-lg">Visualizador de Escalas</p>
            <p className="text-sm italic opacity-70">Selecciona una fundamental en el diapasón principal</p>
        </div>
    );
  }

  const inlays = [3, 5, 7, 9, 12];

  return (
    <div className="w-full bg-[#1a1a1a] rounded-xl p-1 border-4 border-[#2a1f17] shadow-2xl">
      {/* Container set to w-full to fit available space without scroll */}
      <div className="relative w-full h-[300px] bg-[#2a1f17] shadow-inner select-none rounded-md overflow-hidden">
        
        {/* Wood Texture & Gradient */}
        <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')] pointer-events-none z-0"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/30 pointer-events-none z-0"></div>

        {/* Nut (Left side) */}
        <div className="absolute left-0 top-0 bottom-0 w-4 sm:w-6 bg-[#e8e1d5] border-r-4 border-gray-400 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.3)]"></div>

        {/* Frets */}
        <div className="absolute left-4 sm:left-6 right-0 top-0 bottom-0 flex">
           {Array.from({ length: FRETS }).map((_, i) => (
             <div key={`sfret-${i}`} className="flex-1 border-r-[3px] border-[#8b8b8b] relative group">
                 {/* Fret wire metallic highlight */}
                 <div className="absolute right-[-2px] top-0 bottom-0 w-[1px] bg-[#d1d1d1] z-10 opacity-80"></div>
                 
                 {/* Fret Number */}
                 <div className="absolute bottom-2 right-0 left-0 text-center">
                    <span className="text-[10px] sm:text-[12px] text-[#e8e1d5]/60 font-bold font-mono bg-black/30 px-1.5 py-0.5 rounded-full">
                        {i+1}
                    </span>
                 </div>

                 {/* Inlays */}
                 {inlays.includes(i + 1) && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full flex justify-center items-center gap-12">
                        {(i + 1) === 12 ? (
                            <>
                                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#e8e1d5] opacity-90 shadow-lg mx-1"></div>
                                <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#e8e1d5] opacity-90 shadow-lg mx-1"></div>
                            </>
                        ) : (
                            <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#e8e1d5] opacity-90 shadow-lg"></div>
                        )}
                    </div>
                 )}
             </div>
           ))}
        </div>

        {/* Strings & Notes */}
        <div className="absolute left-4 sm:left-6 right-0 top-0 bottom-0 flex flex-col justify-between py-6">
            {STRINGS.map((stringIdx) => {
                const isWound = stringIdx < 3;
                const thickness = 5 - (stringIdx * 0.7); // Thicker strings for realism
                const color = isWound ? "bg-[#b88d65]" : "bg-[#c0c0c0]";
                const shadow = isWound ? "shadow-[0_2px_2px_rgba(0,0,0,0.8)]" : "shadow-[0_1px_1px_rgba(0,0,0,0.6)]";

                return (
                    <div key={`sstr-${stringIdx}`} className="relative w-full flex items-center h-10">
                        
                        {/* String Line */}
                        <div 
                            className={`w-full ${color} ${shadow} z-10`} 
                            style={{ height: `${thickness}px` }}
                        ></div>

                        {/* Notes on the string */}
                        <div className="absolute inset-0 flex w-full h-full">
                            {/* Open String Area */}
                            {/* Note: We position open strings slightly to the left over the nut */}
                            
                            {Array.from({ length: FRETS }).map((_, fretIndex) => {
                                const fretNum = fretIndex + 1;
                                const { note, absolute } = getNoteAtPosition(stringIdx, fretNum);
                                const noteClass = absolute % 12;
                                const isValid = validNoteClasses.includes(noteClass);
                                const isRoot = noteClass === rootClass;

                                if (!isValid) return <div key={`sfn-${stringIdx}-${fretNum}`} className="flex-1"></div>;

                                return (
                                    <div key={`sfn-${stringIdx}-${fretNum}`} className="flex-1 flex items-center justify-center relative z-30">
                                        <div 
                                            className={`
                                                flex items-center justify-center rounded-full text-sm sm:text-base font-bold shadow-xl transition-transform hover:scale-110 cursor-help
                                                /* Match sizes exactly with Fretboard.tsx */
                                                w-9 h-9 sm:w-11 sm:h-11
                                                ${isRoot 
                                                    ? 'bg-red-600 text-white border-2 border-red-800 shadow-[0_0_10px_rgba(220,38,38,0.5)]' 
                                                    : 'bg-black text-white border-2 border-gray-600'}
                                            `}
                                            title={isRoot ? "Fundamental" : ""}
                                        >
                                            {getNoteDisplay(note, useFlats)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
            
            {/* Open Strings Overlay (Fixed position at Nut) */}
            <div className="absolute left-[-24px] sm:left-[-30px] top-0 bottom-0 flex flex-col justify-between py-6 z-40">
               {STRINGS.map((stringIdx) => {
                   const { note, absolute } = getNoteAtPosition(stringIdx, 0);
                   const noteClass = absolute % 12;
                   const isValid = validNoteClasses.includes(noteClass);
                   const isRoot = noteClass === rootClass;
                   
                   if (!isValid) return <div key={`os-${stringIdx}`} className="h-10 w-10 flex items-center justify-center"></div>;

                   return (
                       <div key={`os-${stringIdx}`} className="h-10 w-10 flex items-center justify-center">
                            <div className={`
                                flex items-center justify-center rounded-full text-xs font-bold shadow-md bg-white border border-slate-300 text-slate-900
                                w-6 h-6 sm:w-7 sm:h-7
                            `}>
                                {getNoteDisplay(note, useFlats)}
                            </div>
                       </div>
                   )
               })}
            </div>

        </div>

      </div>
    </div>
  );
};
