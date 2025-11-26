import React from 'react';
import { NoteData } from '../types';
import { getNoteAtPosition, getScaleNotes, getNoteDisplay } from '../utils/theory';

interface ScaleFretboardProps {
    rootNote: NoteData | null;
    scaleType: string;
    useFlats: boolean;
    startFret?: number;
    endFret?: number;
}

export const ScaleFretboard: React.FC<ScaleFretboardProps> = ({ rootNote, scaleType, useFlats, startFret = 0, endFret = 12 }) => {
    // Reduced to 12 frets to fit perfectly in the container without scrolling
    const FRETS = 12;
    // High E (top visually) to Low E (bottom visually)
    const STRINGS = [5, 4, 3, 2, 1, 0];

    const validNoteClasses = rootNote ? getScaleNotes(rootNote.absoluteSemitone, scaleType) : [];
    const rootClass = rootNote ? rootNote.absoluteSemitone % 12 : -1;

    if (!rootNote) {
        return (
            <div className="w-full h-[300px] flex flex-col items-center justify-center bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-700 text-slate-500 gap-2">
                <p className="font-bold text-lg">Visualizador de Escalas</p>
                <p className="text-sm italic opacity-70">Selecciona una fundamental arriba</p>
            </div>
        );
    }

    const inlays = [3, 5, 7, 9, 12];

    return (
        <div className="w-full bg-transparent rounded-xl p-1">
            {/* Container set to w-full to fit available space without scroll */}
            <div className="relative w-full h-[300px] border-4 border-slate-800 bg-[#1e293b] shadow-[0_20px_50px_rgba(0,0,0,0.5)] select-none rounded-lg overflow-hidden">

                {/* Range Highlight Overlay */}
                <div className="absolute top-0 bottom-0 bg-indigo-500/10 border-x-2 border-indigo-500/30 z-10 pointer-events-none"
                    style={{
                        left: `calc(60px + ${(startFret / FRETS) * 100}%)`,
                        width: `${((endFret - startFret) / FRETS) * 100}%`
                    }}>
                </div>

                {/* Nut Section with Open String Circles */}
                <div className="absolute left-0 top-0 bottom-0 w-16 flex flex-col justify-between py-6 z-30">
                    <div className="absolute right-0 top-0 bottom-0 w-4 bg-[#e5e5e5] border-l-2 border-[#999] shadow-xl"></div>
                    {STRINGS.map((stringIdx) => {
                        const { note, absolute } = getNoteAtPosition(stringIdx, 0);
                        const stringName = getNoteDisplay(note, useFlats);
                        const noteClass = absolute % 12;
                        const isValid = validNoteClasses.includes(noteClass);
                        const isRoot = noteClass === rootClass;

                        return (
                            <div key={`nut-${stringIdx}`} className="h-10 flex items-center justify-end pr-5 relative">
                                {isValid ? (
                                    <div className={`rounded-full flex items-center justify-center font-bold text-sm transition-all w-8 h-8 ${isRoot ? 'bg-red-600 text-white ring-2 ring-red-200 shadow-[0_4px_10px_rgba(0,0,0,0.6)]' : 'bg-white text-slate-700 border-2 border-slate-300 shadow-sm'}`}>
                                        {stringName}
                                    </div>
                                ) : (
                                    <div className="w-8 h-8"></div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Frets */}
                <div className="absolute left-16 right-0 top-0 bottom-0 flex">
                    {Array.from({ length: FRETS }).map((_, i) => (
                        <div key={`sfret-${i}`} className="flex-1 border-r-[2px] border-[#475569] relative flex flex-col justify-between shrink-0 bg-[#1e293b]">

                            {/* Fret Number */}
                            <div className="absolute bottom-2 right-0 left-0 text-center z-20">
                                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full ${i + 1 >= startFret && i + 1 <= endFret ? 'text-indigo-300' : 'text-slate-600'}`}>
                                    {i + 1}
                                </span>
                            </div>

                            {/* Inlays */}
                            {inlays.includes(i + 1) && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    {(i + 1) === 12 ? (
                                        <div className="flex flex-col gap-8">
                                            <div className="w-3 h-3 rounded-full bg-[#e2e8f0] shadow-sm"></div>
                                            <div className="w-3 h-3 rounded-full bg-[#e2e8f0] shadow-sm"></div>
                                        </div>
                                    ) : (
                                        <div className="w-4 h-4 rounded-full bg-[#e2e8f0] shadow-sm"></div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Strings & Notes */}
                <div className="absolute left-16 right-0 top-0 bottom-0 flex flex-col justify-between py-6">
                    {STRINGS.map((stringIdx) => {
                        const thickness = 1 + ((5 - stringIdx) * 0.7); // Match Fretboard.tsx thickness logic (tuning.stringCount - 1 - stringIdx)

                        return (
                            <div key={`sstr-${stringIdx}`} className="relative w-full flex items-center h-10">

                                {/* String Line */}
                                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 pointer-events-none z-0 flex items-center">
                                    <div className="w-full bg-[#94a3b8] shadow-sm" style={{ height: `${thickness}px`, opacity: 0.6 }}></div>
                                </div>

                                {/* Notes on the string */}
                                <div className="absolute inset-0 flex w-full h-full">
                                    {Array.from({ length: FRETS }).map((_, fretIndex) => {
                                        const fretNum = fretIndex + 1;
                                        const { note, absolute } = getNoteAtPosition(stringIdx, fretNum);
                                        const noteClass = absolute % 12;
                                        const isValid = validNoteClasses.includes(noteClass);
                                        const isRoot = noteClass === rootClass;
                                        const isInRange = fretNum >= startFret && fretNum <= endFret;

                                        if (!isValid) return <div key={`sfn-${stringIdx}-${fretNum}`} className="flex-1"></div>;

                                        return (
                                            <div key={`sfn-${stringIdx}-${fretNum}`} className="flex-1 flex items-center justify-center relative z-30">
                                                <div
                                                    className={`
                                                flex items-center justify-center rounded-full font-bold transition-transform hover:scale-110 cursor-help
                                                w-8 h-8 sm:w-9 sm:h-9 text-sm
                                                ${isRoot
                                                            ? 'bg-red-600 text-white ring-2 ring-red-200 shadow-[0_4px_10px_rgba(0,0,0,0.6)]'
                                                            : 'bg-white text-slate-700 border-2 border-slate-300 shadow-sm'}
                                                ${!isInRange ? 'opacity-30 grayscale' : ''}
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
                </div>

            </div>
        </div>
    );
};
