
import React, { useState, useEffect } from 'react';
import { NoteData, SavedChord, NoteShape } from '../types';
import { calculateInterval, getNoteDisplay, getGenericChordName } from '../utils/theory';

interface ChordSnapshotProps {
  data: SavedChord;
  generalFingeringMode: boolean;
  onDelete: () => void;
  styleShape: NoteShape;
  styleColor: string;     // Interval Color
  styleRootColor: string; // Fundamental Color
  styleSize: number;
  isSelected: boolean;
  onClick: () => void;
}

export const ChordSnapshot: React.FC<ChordSnapshotProps> = ({
  data, generalFingeringMode, onDelete, styleShape, styleColor, styleRootColor, styleSize, isSelected, onClick
}) => {
  const { name, notes, rootNote, showIntervals, useFlats } = data;
  const [isGenericMode, setIsGenericMode] = useState(generalFingeringMode);

  useEffect(() => { setIsGenericMode(generalFingeringMode); }, [generalFingeringMode]);

  // OPTIMIZED DIMENSIONS FOR 4-PER-ROW LAYOUT
  const width = 160; // Reduced from 180
  const height = 200; // Reduced from 220
  const paddingX = 20;
  const paddingY = 30;

  const stringSpacing = (width - paddingX * 2) / 5;
  const fretSpacing = (height - paddingY * 2) / 5;

  // Slightly larger base radius for text breathing room, but scaled carefully
  const baseRadius = 11 * styleSize;

  const frettedNotes = notes.filter(n => n.fretNumber > 0);
  const minFret = frettedNotes.length > 0 ? Math.min(...frettedNotes.map(n => n.fretNumber)) : 0;
  let startFret = 1;
  if (minFret > 2) startFret = minFret;

  const strings = [0, 1, 2, 3, 4, 5];
  const displayName = isGenericMode ? getGenericChordName(name) : name;

  const renderNoteShape = (cx: number, cy: number, isRoot: boolean) => {
    let fillColor;
    if (isRoot) {
      fillColor = styleRootColor || '#000000';
    } else {
      fillColor = styleColor === 'default' ? '#ffffff' : styleColor;
    }
    const strokeColor = '#000';

    switch (styleShape) {
      case 'square':
        const s = baseRadius * 1.8;
        return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />;
      case 'triangle':
        const r = baseRadius * 1.3;
        const points = `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`;
        return <polygon points={points} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />;
      case 'circle':
      default:
        return <circle cx={cx} cy={cy} r={baseRadius} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />;
    }
  };

  return (
    <div onClick={(e) => { e.stopPropagation(); onClick(); }} className={`flex flex-col items-center relative group select-none transition-all rounded p-2 ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'hover:bg-slate-50'}`}>

      <div onClick={(e) => { e.stopPropagation(); setIsGenericMode(!isGenericMode); }} className="text-center font-bold font-sans text-lg mb-1 text-black z-10 whitespace-nowrap overflow-hidden text-ellipsis max-w-full px-1 cursor-pointer hover:text-indigo-600 transition-colors" title="Clic para alternar nombre">{displayName}</div>

      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-2 -right-2 z-20 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible pointer-events-none">

        {startFret > 1 && !isGenericMode && <text x={paddingX - 15} y={paddingY + fretSpacing / 1.5} fontSize="12" fontWeight="bold" fill="#000" textAnchor="end" fontFamily="sans-serif">{startFret}fr</text>}

        {startFret === 1 && <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#000" strokeWidth="4" strokeLinecap="square" />}

        {Array.from({ length: 6 }).map((_, i) => { const y = paddingY + i * fretSpacing; return <line key={`f-${i}`} x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#000" strokeWidth="1.5" />; })}

        {strings.map((s) => { const x = paddingX + s * stringSpacing; return <line key={`s-${s}`} x1={x} y1={paddingY} x2={x} y2={height - paddingY} stroke="#000" strokeWidth={s < 3 ? "2" : "1.2"} />; })}

        {strings.map((stringIdx) => {
          const x = paddingX + stringIdx * stringSpacing;
          const note = notes.find(n => n.stringIndex === stringIdx);
          if (!note) return null;
          let label = "";
          const shouldDisplayIntervals = isGenericMode || showIntervals;
          if (rootNote && shouldDisplayIntervals) {
            if (rootNote.stringIndex === note.stringIndex && rootNote.fretNumber === note.fretNumber) label = "F";
            else label = calculateInterval(rootNote.absoluteSemitone, note.absoluteSemitone, useFlats, note.accidental).name;
          } else label = getNoteDisplay(note.note, useFlats, note.accidental);

          if (note.fretNumber === 0) return <g key={`o-${stringIdx}`}><circle cx={x} cy={paddingY - 12} r={baseRadius * 0.6} fill="none" stroke="#000" strokeWidth="2" /></g>;

          const relativeFret = note.fretNumber - startFret + 1;
          if (relativeFret >= 1 && relativeFret <= 5) {
            const y = paddingY + (relativeFret * fretSpacing) - (fretSpacing / 2);
            const isRoot = rootNote && rootNote.stringIndex === note.stringIndex && rootNote.fretNumber === note.fretNumber;
            let bgColor;
            if (isRoot) bgColor = styleRootColor || '#000000';
            else bgColor = styleColor === 'default' ? '#ffffff' : styleColor;
            const isDarkBg = bgColor !== '#ffffff' && bgColor !== '#fff';
            const textColor = isDarkBg ? "#fff" : "#000";

            // Optimized vertical centering (y + size*3.5)
            return <g key={`n-${stringIdx}`}>{renderNoteShape(x, y, isRoot)}<text x={x} y={y + (styleSize * 3.5)} textAnchor="middle" fill={textColor} fontSize={10 * styleSize} fontWeight="bold" fontFamily="Arial">{label}</text></g>;
          }
          return null;
        })}
      </svg>
    </div>
  );
};
