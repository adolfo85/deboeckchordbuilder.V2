import React, { useState, useEffect } from 'react';
import { NoteData, SavedChord, NoteShape } from '../types';
import { calculateInterval, getNoteDisplay, getGenericChordName, getScaleNotes, getNoteAtPosition } from '../utils/theory';

interface ChordSnapshotProps {
  data: SavedChord;
  generalFingeringMode: boolean;
  onDelete: () => void;
  styleShape: NoteShape;
  styleColor: string;     // Interval Color
  styleRootColor: string; // Fundamental Color
  styleSize: number;
  styleFontFamily?: string;
  styleFontSize?: number;
  isSelected: boolean;
  onClick: () => void;
}

export const ChordSnapshot: React.FC<ChordSnapshotProps> = ({
  data, generalFingeringMode, onDelete, styleShape, styleColor, styleRootColor, styleSize, styleFontFamily, styleFontSize, isSelected, onClick
}) => {
  const { name, notes, rootNote, showIntervals, useFlats } = data;
  const [isGenericMode, setIsGenericMode] = useState(generalFingeringMode);

  useEffect(() => { setIsGenericMode(generalFingeringMode); }, [generalFingeringMode]);

  // Common variables
  const strings = [0, 1, 2, 3, 4, 5];
  const displayName = isGenericMode ? getGenericChordName(name) : name;

  const getFontFamily = (font: string | undefined) => {
    if (font === 'Opus') return "'Opus Plain Chord Std', 'Times New Roman', serif";
    if (font === 'Serif') return "serif";
    if (font === 'Mono') return "monospace";
    return "sans-serif";
  }

  const fontFamily = getFontFamily(styleFontFamily);
  const textScale = styleFontSize || 1;

  const renderNoteShape = (cx: number, cy: number, isRoot: boolean) => {
    let fillColor;
    if (isRoot) {
      fillColor = styleRootColor || '#000000';
    } else {
      fillColor = styleColor === 'default' ? '#ffffff' : styleColor;
    }
    const strokeColor = '#000';

    switch (styleShape) {
      case 'square': {
        const s = (11 * styleSize) * 1.8;
        return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />;
      }
      case 'triangle': {
        const r = (11 * styleSize) * 1.3;
        const points = `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`;
        return <polygon points={points} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />;
      }
      case 'circle':
      default:
        return <circle cx={cx} cy={cy} r={11 * styleSize} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />;
    }
  };

  // SCALE RENDERING LOGIC
  if (data.type === 'scale' && data.scaleRoot && data.scaleType && data.fretRange) {
    const { scaleRoot, scaleType, fretRange } = data;
    const startFret = fretRange.start;
    const endFret = fretRange.end;

    // Width calculation: roughly 3x normal chord width
    const scaleWidth = 600;
    const scaleHeight = 200;
    const scalePaddingX = 30;
    const scalePaddingY = 30;

    const effectiveFretCount = Math.max(5, endFret - Math.max(1, startFret) + 1); // Ensure at least some width
    const scaleFretSpacing = (scaleWidth - scalePaddingX * 2) / effectiveFretCount;
    const scaleStringSpacing = (scaleHeight - scalePaddingY * 2) / 5;

    const validNoteClasses = getScaleNotes(scaleRoot.absoluteSemitone, scaleType);
    const rootClass = scaleRoot.absoluteSemitone % 12;

    return (
      <div onClick={(e) => { e.stopPropagation(); onClick(); }} className={`flex flex-col items-center relative group select-none transition-all rounded p-2 ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'hover:bg-slate-50'}`} style={{ width: scaleWidth + 20 }}>
        <div className="text-center font-bold text-lg mb-1 text-black z-10 whitespace-nowrap overflow-hidden text-ellipsis max-w-full px-1" style={{ fontFamily }}>{displayName}</div>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-2 -right-2 z-20 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>

        <svg width={scaleWidth} height={scaleHeight} viewBox={`0 0 ${scaleWidth} ${scaleHeight}`} className="overflow-visible pointer-events-none">
          {/* Nut if startFret is 0 or 1 */}
          {startFret <= 1 && <line x1={scalePaddingX} y1={scalePaddingY} x2={scalePaddingX} y2={scaleHeight - scalePaddingY} stroke="#000" strokeWidth="4" strokeLinecap="square" />}

          {/* Frets */}
          {Array.from({ length: effectiveFretCount + 1 }).map((_, i) => {
            const x = scalePaddingX + i * scaleFretSpacing;
            // Don't draw first line if it's the nut (already drawn thicker)
            if (i === 0 && startFret <= 1) return null;
            return <line key={`sf-${i}`} x1={x} y1={scalePaddingY} x2={x} y2={scaleHeight - scalePaddingY} stroke="#000" strokeWidth="1.5" />;
          })}

          {/* Strings */}
          {strings.map((s) => {
            const y = scalePaddingY + (5 - s) * scaleStringSpacing; // 5-s to flip (High E top)
            return <line key={`ss-${s}`} x1={scalePaddingX} y1={y} x2={scaleWidth - scalePaddingX} y2={y} stroke="#000" strokeWidth={s < 3 ? "2" : "1.2"} />;
          })}

          {/* Fret Numbers */}
          {Array.from({ length: effectiveFretCount }).map((_, i) => {
            const fretNum = Math.max(1, startFret) + i;
            const x = scalePaddingX + i * scaleFretSpacing + (scaleFretSpacing / 2);
            if ([3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(fretNum)) {
              return <text key={`fn-${fretNum}`} x={x} y={scaleHeight - scalePaddingY + 20} fontSize={10 * textScale} fontWeight="bold" fill="#666" textAnchor="middle" fontFamily={fontFamily}>{fretNum}</text>;
            }
            return null;
          })}

          {/* Notes */}
          {strings.map(stringIdx => {
            const y = scalePaddingY + (5 - stringIdx) * scaleStringSpacing;
            const notesToRender: React.ReactElement[] = [];

            // Check Open String
            if (startFret === 0) {
              const { note, absolute } = getNoteAtPosition(stringIdx, 0);
              const noteClass = absolute % 12;
              if (validNoteClasses.includes(noteClass)) {
                const isRoot = noteClass === rootClass;
                const label = getNoteDisplay(note, useFlats);
                // Draw to the left of nut
                const cx = scalePaddingX - 15;
                notesToRender.push(
                  <g key={`os-${stringIdx}`}>{renderNoteShape(cx, y, isRoot)}<text x={cx} y={y + (styleSize * 3.5)} textAnchor="middle" fill={isRoot ? '#fff' : '#000'} fontSize={10 * styleSize * textScale} fontWeight="bold" fontFamily={fontFamily}>{label}</text></g>
                );
              }
            }

            // Check Frets
            Array.from({ length: effectiveFretCount }).forEach((_, i) => {
              const fretNum = Math.max(1, startFret) + i;
              const { note, absolute } = getNoteAtPosition(stringIdx, fretNum);
              const noteClass = absolute % 12;

              if (validNoteClasses.includes(noteClass)) {
                const isRoot = noteClass === rootClass;
                const label = getNoteDisplay(note, useFlats);
                const cx = scalePaddingX + i * scaleFretSpacing + (scaleFretSpacing / 2);

                let bgColor;
                if (isRoot) bgColor = styleRootColor || '#000000';
                else bgColor = styleColor === 'default' ? '#ffffff' : styleColor;
                const isDarkBg = bgColor !== '#ffffff' && bgColor !== '#fff';
                const textColor = isDarkBg ? "#fff" : "#000";

                notesToRender.push(
                  <g key={`n-${stringIdx}-${fretNum}`}>{renderNoteShape(cx, y, isRoot)}<text x={cx} y={y + (styleSize * 3.5)} textAnchor="middle" fill={textColor} fontSize={10 * styleSize * textScale} fontWeight="bold" fontFamily={fontFamily}>{label}</text></g>
                );
              }
            });

            return <React.Fragment key={`str-${stringIdx}`}>{notesToRender}</React.Fragment>;
          })}
        </svg>
      </div>
    );
  }

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

  return (
    <div onClick={(e) => { e.stopPropagation(); onClick(); }} className={`flex flex-col items-center relative group select-none transition-all rounded p-2 ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'hover:bg-slate-50'}`}>

      <div onClick={(e) => { e.stopPropagation(); setIsGenericMode(!isGenericMode); }} className="text-center font-bold text-lg mb-1 text-black z-10 whitespace-nowrap overflow-hidden text-ellipsis max-w-full px-1 cursor-pointer hover:text-indigo-600 transition-colors" style={{ fontFamily }} title="Clic para alternar nombre">{displayName}</div>

      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-2 -right-2 z-20 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>

      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible pointer-events-none">

        {startFret > 1 && !isGenericMode && <text x={paddingX - 15} y={paddingY + fretSpacing / 1.5} fontSize={12 * textScale} fontWeight="bold" fill="#000" textAnchor="end" fontFamily={fontFamily}>{startFret}fr</text>}

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
            return <g key={`n-${stringIdx}`}>{renderNoteShape(x, y, isRoot)}<text x={x} y={y + (styleSize * 3.5)} textAnchor="middle" fill={textColor} fontSize={10 * styleSize * textScale} fontWeight="bold" fontFamily={fontFamily}>{label}</text></g>;
          }
          return null;
        })}
      </svg>
    </div>
  );
};
