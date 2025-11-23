import React, { useState, useCallback, useRef } from 'react';
import { Fretboard } from './components/Fretboard';
import { ChordSnapshot } from './components/ChordSnapshot';
import { NoteData, SavedChord, ChordStyle, GraphicObject } from './types';
import { getNoteAtPosition, detectChordName, getEnharmonicSuggestion, TUNINGS, playNotes } from './utils/theory';
import { Trash2, Camera, X, Play, Settings2, MousePointer2, Type, Guitar, FileText, Printer, ToggleRight, ToggleLeft, Layers, Circle, Square, Triangle, MousePointerClick, Shapes, Move, RotateCw, Bold, HelpCircle, Info } from 'lucide-react';
import { toPng } from 'html-to-image';

// --- MANUAL COMPONENT ---
const ManualModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col relative text-slate-300">
      
      {/* Modal Header */}
      <div className="flex items-center justify-between p-6 border-b border-slate-700 bg-slate-950/50 rounded-t-2xl">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
                <Info size={24} />
            </div>
            <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Manual de Usuario</h2>
                <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider">DeBoeck ChordBuilder v.2</p>
            </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
          <X size={24} />
        </button>
      </div>

      {/* Modal Content - Scrollable */}
      <div className="flex-grow overflow-y-auto p-8 space-y-12">
        
        {/* SECTION 1: EDITOR */}
        <section>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                <Guitar className="text-indigo-500" /> 1. El Editor (Diapasón)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-3">
                    <p><strong className="text-white">Añadir Notas:</strong> Haz clic en cualquier cuerda/traste para añadir una nota. Haz clic de nuevo para borrarla (si no es la fundamental).</p>
                    <p><strong className="text-white">Fundamental (F):</strong> La nota roja marcada con "F" es la raíz. El sistema calcula los intervalos (3, 5, 7, 9...) basándose en ella.</p>
                    <p><strong className="text-white">Definir Fundamental:</strong> Activa la herramienta <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-[10px]"><MousePointer2 size={10} className="mr-1"/> Definir Fundamental</span>. Luego haz clic en una nota existente para convertirla en raíz, o en una casilla vacía para crear una nueva raíz.</p>
                </div>
                <div className="space-y-3">
                    <p><strong className="text-white">Enarmonía:</strong> Haz clic directamente sobre el círculo de una nota ya colocada para alternar entre Sostenido (#) y Bemol (b).</p>
                    <p><strong className="text-white">Capturar:</strong> El botón "Capturar Diagrama" (debajo del diapasón) toma una "foto" del acorde actual y lo envía a la pestaña <strong>Documento</strong>.</p>
                    <p><strong className="text-white">Audio:</strong> Usa el botón <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 text-[10px]"><Play size={10} className="mr-1"/> Play</span> para escuchar el acorde.</p>
                </div>
            </div>
        </section>

        {/* SECTION 2: DOCUMENT */}
        <section>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                <FileText className="text-indigo-500" /> 2. Documento (Hoja A4)
            </h3>
            <div className="space-y-4 text-sm">
                <p>Aquí se organizan tus diagramas capturados para la impresión o exportación final.</p>
                <ul className="list-disc pl-5 space-y-2 text-slate-400">
                    <li><strong className="text-white">Arrastrar y Soltar:</strong> Puedes cambiar el orden de los acordes arrastrándolos con el ratón.</li>
                    <li><strong className="text-white">Títulos Editables:</strong> Haz clic en "Hoja de Diagramas" o la fecha para escribir tu propio título.</li>
                    <li><strong className="text-white">Nombres de Acorde:</strong> Haz clic sobre el nombre de un acorde (ej. "C7") para alternarlo con su nombre genérico (ej. "Ac. 7") y ocultar el número de traste (ideal para formas movibles).</li>
                </ul>
            </div>
        </section>

        {/* SECTION 3: STYLES */}
        <section>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                <Layers className="text-indigo-500" /> 3. Herramientas de Edición
            </h3>
            <p className="text-sm mb-4">La barra gris intermedia en el modo Documento tiene 3 pestañas:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <h4 className="font-bold text-white mb-2 flex gap-2"><Layers size={16}/> General</h4>
                    <p className="text-xs text-slate-400">Aplica cambios de estilo (Forma, Color Fundamental, Color Intervalos, Tamaño) a <strong>TODOS</strong> los diagramas de la hoja simultáneamente.</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <h4 className="font-bold text-white mb-2 flex gap-2"><MousePointerClick size={16}/> Particular</h4>
                    <p className="text-xs text-slate-400">Haz clic en un diagrama específico para seleccionarlo. Los cambios que hagas aquí solo afectarán a <strong>ESE</strong> diagrama, sobrescribiendo el estilo general.</p>
                </div>
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                    <h4 className="font-bold text-white mb-2 flex gap-2"><Shapes size={16}/> Gráficos</h4>
                    <p className="text-xs text-slate-400">Herramientas de dibujo libre. Añade Cuadrados, Círculos, Flechas o Texto. Los objetos flotan por encima de los acordes.</p>
                </div>
            </div>
        </section>

        {/* SECTION 4: GRAPHICS */}
        <section>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                <Shapes className="text-indigo-500" /> 4. Edición de Gráficos y Texto
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                <div className="space-y-3">
                    <p><strong className="text-white">Selección:</strong> Haz clic en un objeto gráfico para seleccionarlo. Aparecerán manejadores blancos.</p>
                    <p><strong className="text-white">Redimensión:</strong> Arrastra los cuadrados blancos para cambiar Ancho y Alto. </p>
                    <p><strong className="text-white">Flechas:</strong> Al cambiar el "Alto" se estira la flecha; al cambiar el "Ancho" se hace más gruesa. La punta no se deforma.</p>
                </div>
                <div className="space-y-3">
                    <p><strong className="text-white">Rotación:</strong> Usa el deslizador de rotación en la barra de herramientas para girar cualquier objeto 360°.</p>
                    <p><strong className="text-white">Texto:</strong> Al añadir texto, puedes cambiar la fuente (incluyendo <em>Opus Plain Chord Std</em> para cifrados), tamaño y negrita desde la barra de herramientas.</p>
                    <p><strong className="text-white">Capas:</strong> Los gráficos siempre se muestran por encima de los diagramas para permitir anotaciones.</p>
                </div>
            </div>
        </section>

         {/* SECTION 5: EXPORT */}
         <section>
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                <Printer className="text-indigo-500" /> 5. Exportación
            </h3>
            <p className="text-sm text-slate-400">
                Usa el botón <strong>Exportar A4</strong> en la esquina superior derecha. Esto generará una imagen PNG de alta resolución de tu hoja actual, lista para imprimir o compartir.
            </p>
        </section>

      </div>

      {/* Footer */}
      <div className="p-6 border-t border-slate-700 bg-slate-950/50 rounded-b-2xl flex justify-end">
        <button onClick={onClose} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors">
            Cerrar Manual
        </button>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const tuning = TUNINGS['standard'];

  // STATE
  const [showManual, setShowManual] = useState<boolean>(false); 

  // EDITOR STATE
  const [selectedNotes, setSelectedNotes] = useState<NoteData[]>([]);
  const [rootNote, setRootNote] = useState<NoteData | null>(null);
  const [setRootMode, setSetRootMode] = useState<boolean>(false);
  const [noteDisplayMode, setNoteDisplayMode] = useState<'intervals' | 'notes'>('intervals');
  const [useFlats, setUseFlats] = useState<boolean>(false);
  const [fretCount, setFretCount] = useState<number>(16);
  const [showFretNumbers, setShowFretNumbers] = useState<boolean>(true);
  const [showInlays, setShowInlays] = useState<boolean>(true);
  const [accentColor, setAccentColor] = useState<'slate' | 'blue' | 'gold' | 'pink'>('slate');
  
  // DOCUMENT STATE
  const [savedChords, setSavedChords] = useState<SavedChord[]>([]);
  const [docTitle, setDocTitle] = useState("Hoja de Diagramas");
  const [docSubtitle, setDocSubtitle] = useState(new Date().toLocaleDateString());
  const [generalMode, setGeneralMode] = useState(false);
  
  // DOCUMENT TOOLS STATE
  const [docToolMode, setDocToolMode] = useState<'general' | 'particular' | 'graphics'>('general');
  const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
  const [selectedGraphicId, setSelectedGraphicId] = useState<string | null>(null);
  
  // Global Style
  const [globalStyle, setGlobalStyle] = useState<ChordStyle>({
      noteShape: 'circle',
      noteColor: 'default',
      rootColor: '#000000', 
      noteSize: 1
  });
  
  const [graphics, setGraphics] = useState<GraphicObject[]>([]);

  // UI STATE
  const [activeTab, setActiveTab] = useState<'editor' | 'appearance'>('editor');
  const [viewMode, setViewMode] = useState<'editor' | 'document'>('editor');
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string>("");
  const [draggedChordIndex, setDraggedChordIndex] = useState<number | null>(null);

  const fretboardContainerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  // --- EDITOR HANDLERS ---
  
  const handleToggleNote = useCallback((stringIndex: number, fret: number) => {
    const noteInfo = getNoteAtPosition(stringIndex, fret, 'standard');
    const newNote: NoteData = { 
        stringIndex, 
        fretNumber: fret, 
        note: noteInfo.note, 
        absoluteSemitone: noteInfo.absolute, 
        octave: noteInfo.octave, 
        isRoot: false, 
        accidental: useFlats ? 'b' : '#' 
    };

    if (setRootMode) {
        const exists = selectedNotes.find(n => n.stringIndex === stringIndex && n.fretNumber === fret);
        if (exists) {
            setRootNote(exists);
        } else {
            const others = selectedNotes.filter(n => n.stringIndex !== stringIndex);
            setSelectedNotes([...others, newNote]);
            setRootNote(newNote);
        }
        setSetRootMode(false);
        return;
    }

    const exists = selectedNotes.find(n => n.stringIndex === stringIndex && n.fretNumber === fret);
    if (exists) {
        const remaining = selectedNotes.filter(n => n !== exists);
        setSelectedNotes(remaining);
        if (rootNote && exists.stringIndex === rootNote.stringIndex && exists.fretNumber === rootNote.fretNumber) {
            setRootNote(null);
        }
    } else {
        const others = selectedNotes.filter(n => n.stringIndex !== stringIndex);
        const nextNotes = [...others, newNote];
        setSelectedNotes(nextNotes);
        if (nextNotes.length === 1 && !rootNote) {
            setRootNote(newNote);
        }
    }
  }, [selectedNotes, rootNote, setSetRootMode, useFlats]);

  const handleNoteClick = (note: NoteData) => {
      if (setRootMode) {
          setRootNote(note);
          setSetRootMode(false);
          return;
      }
      setSelectedNotes(prev => prev.map(n => {
          if (n.stringIndex === note.stringIndex && n.fretNumber === note.fretNumber) {
              return { ...n, accidental: n.accidental === 'b' ? '#' : 'b' };
          }
          return n;
      }));
  };

  const captureChord = () => {
    if (selectedNotes.length === 0) return;
    const newChord: SavedChord = {
      id: Date.now().toString(),
      name: detectChordName(rootNote!, selectedNotes, useFlats) || "Sin nombre",
      notes: [...selectedNotes],
      rootNote: rootNote ? {...rootNote} : null,
      date: Date.now(),
      showIntervals: noteDisplayMode === 'intervals',
      useFlats, instrument: 'guitar', tuningId: 'standard'
    };
    setSavedChords(prev => [...prev, newChord]);
    setViewMode('document'); 
  };

  // --- DOCUMENT HANDLERS ---
  const updateSelectedChordStyle = (key: keyof ChordStyle, value: any) => {
      if (!selectedChordId) return;
      setSavedChords(prev => prev.map(c => c.id === selectedChordId ? { ...c, [key]: value } : c));
  };

  const addGraphic = (type: 'square' | 'circle' | 'arrow' | 'text') => {
      const width = type === 'arrow' ? 40 : (type === 'text' ? 120 : 60);
      const height = type === 'arrow' ? 100 : (type === 'text' ? 40 : 60);
      
      const newGraphic: GraphicObject = {
          id: Date.now().toString(), type,
          x: 50, y: 50, width, height,
          rotation: 0,
          color: type === 'text' ? '#000000' : '#ef4444', 
          filled: true, 
          opacity: type === 'text' ? 1 : 0.8,
          text: type === 'text' ? 'Texto' : undefined,
          fontSize: 24,
          fontFamily: 'Sans',
          fontWeight: 'normal'
      };
      setGraphics(prev => [...prev, newGraphic]);
      setSelectedGraphicId(newGraphic.id);
  };

  const updateGraphic = (id: string, key: keyof GraphicObject, value: any) => {
      setGraphics(prev => prev.map(g => g.id === id ? { ...g, [key]: value } : g));
  };

  const handleGraphicDragStart = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSelectedGraphicId(id);
      setDocToolMode('graphics');
      const graphic = graphics.find(g => g.id === id);
      if (!graphic) return;
      
      const startX = e.clientX;
      const startY = e.clientY;
      const initX = graphic.x;
      const initY = graphic.y;

      const onMouseMove = (ev: MouseEvent) => {
          updateGraphic(id, 'x', initX + (ev.clientX - startX));
          updateGraphic(id, 'y', initY + (ev.clientY - startY));
      };
      const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
  };

  const handleGraphicResizeStart = (e: React.MouseEvent, id: string, handle: 'w' | 'h' | 'wh') => {
      e.stopPropagation();
      const graphic = graphics.find(g => g.id === id);
      if (!graphic) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = graphic.width;
      const startH = graphic.height;

      const onMouseMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          
          const rad = graphic.rotation * (Math.PI / 180);
          const localDx = dx * Math.cos(rad) + dy * Math.sin(rad);
          const localDy = -dx * Math.sin(rad) + dy * Math.cos(rad);

          if (handle === 'w' || handle === 'wh') {
              updateGraphic(id, 'width', Math.max(20, startW + localDx));
          }
          if (handle === 'h' || handle === 'wh') {
              updateGraphic(id, 'height', Math.max(20, startH + localDy));
          }
      };

      const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
  };

  const detectedChord = rootNote ? detectChordName(rootNote, selectedNotes, useFlats) : null;
  const suggestion = (rootNote && noteDisplayMode === 'notes') ? getEnharmonicSuggestion(rootNote, selectedNotes, useFlats) : null;
  const COLORS = ['#000000', '#ffffff', '#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7'];

  const selectedGraphic = graphics.find(g => g.id === selectedGraphicId);

  const renderArrow = (g: GraphicObject) => {
      const w = g.width;
      const h = g.height;
      let headLen = w * 0.8; 
      if (headLen > h * 0.6) headLen = h * 0.6;
      if (headLen < 10 && h > 20) headLen = 10;
      const shaftWidth = w * 0.4; 
      const shaftLeft = (w - shaftWidth) / 2;
      const shaftRight = (w + shaftWidth) / 2;
      
      return (
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
            <path d={`M ${w/2} 0 L ${w} ${headLen} L ${shaftRight} ${headLen} L ${shaftRight} ${h} L ${shaftLeft} ${h} L ${shaftLeft} ${headLen} L 0 ${headLen} Z`} fill={g.filled ? g.color : 'none'} stroke={g.color} strokeWidth={g.filled ? "0" : "2"} strokeLinejoin="round"/>
        </svg>
      );
  };

  const getFontFamily = (font: string | undefined) => {
      if (font === 'Opus') return "'Opus Plain Chord Std', 'Times New Roman', serif";
      if (font === 'Serif') return "serif";
      if (font === 'Mono') return "monospace";
      return "sans-serif";
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-white overflow-hidden relative font-sans">
      
      {/* SHOW MANUAL MODAL IF STATE IS TRUE */}
      {showManual && <ManualModal onClose={() => setShowManual(false)} />}

      {/* HEADER */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 flex items-center justify-between z-50 shadow-md shrink-0 h-16">
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xl font-black tracking-tight">
                    <span className="text-yellow-400">DeBoeck</span>
                    <span className="text-white">Chord</span>
                    <span className="text-yellow-400">Builder</span>
                </span>
            </div>
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 ml-4">
                <button onClick={() => setViewMode('editor')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 ${viewMode === 'editor' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Guitar size={14} /> Editor</button>
                <button onClick={() => setViewMode('document')} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 ${viewMode === 'document' ? 'bg-white text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}><FileText size={14} /> Documento</button>
            </div>
            <div className="hidden xl:flex items-center gap-4 ml-4 border-l border-slate-700 pl-4">
                <span className="text-[10px] text-slate-400 italic leading-tight max-w-[300px]">
                    Esta app fue diseñada para complementar el material del libro "principios del chord-melody" del prof. A. C. De Boeck
                </span>
            </div>
         </div>
         
         <div className="flex gap-3 items-center">
             <button 
                onClick={() => setShowManual(true)} 
                className="p-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-full transition-colors"
                title="Manual de Usuario"
             >
                <HelpCircle size={20} />
             </button>

             {viewMode === 'document' && (
                 <button onClick={async () => {
                      if (documentRef.current) {
                          const dataUrl = await toPng(documentRef.current, { cacheBust: true, backgroundColor: '#ffffff' });
                          const link = document.createElement('a');
                          link.download = `DeBoeck-Sheet-${Date.now()}.png`;
                          link.href = dataUrl;
                          link.click();
                      }
                 }} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-900 font-bold rounded-lg shadow-lg"><Printer size={18} /> <span className="text-sm">Exportar A4</span></button>
             )}
         </div>
      </div>

      <div className="flex-grow relative overflow-hidden bg-[#0f1014] flex flex-col">
         
         {/* --- EDITOR MODE --- */}
         <div className={`absolute inset-0 flex flex-col transition-transform duration-300 ${viewMode === 'editor' ? 'translate-x-0' : '-translate-x-full'}`}>
             <div className="flex-grow relative flex flex-col items-center justify-center overflow-hidden" ref={fretboardContainerRef}>
                <div className="absolute top-4 z-40">
                    <div className="bg-[#1e293b] border-2 border-slate-600 rounded-xl px-8 py-3 shadow-2xl flex flex-col items-center min-w-[200px]">
                        <span className="text-[10px] uppercase font-bold mb-1 text-slate-400">Acorde</span>
                        <div className="text-3xl font-black text-white tracking-tight">{detectedChord || <span className="text-slate-600">---</span>}</div>
                    </div>
                </div>
                
                <Fretboard tuning={tuning} rootNote={rootNote} selectedNotes={selectedNotes} onToggleNote={handleToggleNote} onNoteClick={handleNoteClick} noteDisplayMode={noteDisplayMode} useFlats={useFlats} accentColor={accentColor} showFretNumbers={showFretNumbers} showInlays={showInlays} startFret={1} fretCount={fretCount} showGhostNotes={false} />
                
                <div className="mt-6 mb-2 flex justify-center z-50">
                    <button onClick={captureChord} disabled={selectedNotes.length === 0} className="flex items-center gap-3 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:scale-95 hover:scale-105">
                        <Camera size={20} /> <span>Capturar Diagrama</span>
                    </button>
                </div>
             </div>

             <div className="bg-slate-900 border-t border-slate-800 flex flex-col z-50 h-[280px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                 <div className="flex items-center bg-slate-950 px-2 overflow-x-auto border-b border-slate-800">
                     <button onClick={() => setActiveTab('editor')} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'editor' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><Type size={16} /> Edición</button>
                     <button onClick={() => setActiveTab('appearance')} className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'appearance' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500'}`}><Settings2 size={16} /> Estilo</button>
                 </div>
                 <div className="flex-grow p-4 overflow-y-auto bg-slate-900 text-slate-300">
                     {activeTab === 'editor' ? (
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-5xl">
                             <div className="space-y-3">
                                 <label className="text-xs font-bold text-slate-500 uppercase">Etiquetas</label>
                                 <div className="flex gap-2">
                                     <button onClick={() => setNoteDisplayMode('intervals')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${noteDisplayMode === 'intervals' ? 'bg-indigo-600' : 'bg-slate-800'}`}>Intervalos</button>
                                     <button onClick={() => setNoteDisplayMode('notes')} className={`px-4 py-2 rounded-lg text-sm font-bold border ${noteDisplayMode === 'notes' ? 'bg-indigo-600' : 'bg-slate-800'}`}>Notas</button>
                                 </div>
                             </div>
                             <div className="space-y-3">
                                 <label className="text-xs font-bold text-slate-500 uppercase">Fundamental</label>
                                 <button onClick={() => setSetRootMode(!setRootMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border ${setRootMode ? 'bg-amber-600 animate-pulse' : 'bg-slate-800'}`}><MousePointer2 size={16} /> Definir Fundamental</button>
                             </div>
                             <div className="space-y-3">
                                 <label className="text-xs font-bold text-slate-500 uppercase">Herramientas</label>
                                 <div className="flex gap-2">
                                     <button onClick={() => playNotes(selectedNotes)} className="p-2 bg-slate-800 hover:bg-green-600 text-slate-300 hover:text-white rounded-lg border border-slate-700"><Play size={20} fill="currentColor" /></button>
                                     <button onClick={() => { setSelectedNotes([]); setRootNote(null); }} className="p-2 bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-white rounded-lg border border-slate-700"><Trash2 size={20} /></button>
                                 </div>
                             </div>
                         </div>
                     ) : (
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl">
                             <div className="space-y-2">
                                 <label className="text-xs font-bold text-slate-500 uppercase">Color</label>
                                 <div className="flex gap-3">
                                    <button onClick={() => setAccentColor('slate')} className="w-8 h-8 rounded-full bg-slate-600"></button>
                                    <button onClick={() => setAccentColor('blue')} className="w-8 h-8 rounded-full bg-cyan-600"></button>
                                    <button onClick={() => setAccentColor('gold')} className="w-8 h-8 rounded-full bg-amber-500"></button>
                                    <button onClick={() => setAccentColor('pink')} className="w-8 h-8 rounded-full bg-pink-500"></button>
                                </div>
                             </div>
                             <div className="space-y-2">
                                 <label className="text-xs font-bold text-slate-500 uppercase">Elementos</label>
                                 <div className="flex flex-col gap-2">
                                    <button onClick={() => setShowFretNumbers(!showFretNumbers)} className="flex justify-between p-2 bg-slate-800 rounded text-sm">Trastes {showFretNumbers ? <ToggleRight /> : <ToggleLeft />}</button>
                                    <button onClick={() => setShowInlays(!showInlays)} className="flex justify-between p-2 bg-slate-800 rounded text-sm">Puntos {showInlays ? <ToggleRight /> : <ToggleLeft />}</button>
                                 </div>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
         </div>

         {/* --- DOCUMENT MODE --- */}
         <div className={`absolute inset-0 flex flex-col bg-slate-900 transition-transform duration-300 ${viewMode === 'document' ? 'translate-x-0' : 'translate-x-full'}`}>
             
             {/* INTERMEDIATE TOOLBAR */}
             <div className="bg-slate-800 border-b border-slate-700 p-2 flex flex-col gap-2 shrink-0 z-20 shadow-lg">
                 <div className="flex gap-1 bg-slate-900 p-1 rounded-lg w-fit">
                     <button onClick={() => { setDocToolMode('general'); setSelectedChordId(null); setSelectedGraphicId(null); }} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${docToolMode === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><Layers size={14} /> General</button>
                     <button onClick={() => { setDocToolMode('particular'); setSelectedGraphicId(null); }} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${docToolMode === 'particular' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><MousePointerClick size={14} /> Particular</button>
                     <button onClick={() => { setDocToolMode('graphics'); setSelectedChordId(null); }} className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 ${docToolMode === 'graphics' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}><Shapes size={14} /> Gráficos</button>
                 </div>

                 <div className="flex items-center gap-4 h-12 px-2 overflow-x-auto text-sm">
                    {/* General & Particular Controls */}
                    {(docToolMode === 'general' || docToolMode === 'particular') && (
                        <>
                            {docToolMode === 'particular' && !selectedChordId && <span className="text-xs text-amber-500 font-bold animate-pulse">Selecciona un acorde abajo</span>}
                            
                            <div className="flex items-center gap-2 border-r border-slate-600 pr-4">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Forma</span>
                                <button onClick={() => docToolMode === 'general' ? setGlobalStyle({...globalStyle, noteShape: 'circle'}) : updateSelectedChordStyle('noteShape', 'circle')} className="p-1 hover:bg-slate-700 rounded"><Circle size={16} /></button>
                                <button onClick={() => docToolMode === 'general' ? setGlobalStyle({...globalStyle, noteShape: 'square'}) : updateSelectedChordStyle('noteShape', 'square')} className="p-1 hover:bg-slate-700 rounded"><Square size={16} /></button>
                                <button onClick={() => docToolMode === 'general' ? setGlobalStyle({...globalStyle, noteShape: 'triangle'}) : updateSelectedChordStyle('noteShape', 'triangle')} className="p-1 hover:bg-slate-700 rounded"><Triangle size={16} /></button>
                            </div>
                            
                            {/* INTERVAL COLOR */}
                            <div className="flex items-center gap-2 border-r border-slate-600 pr-4">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Intervalos</span>
                                <button onClick={() => docToolMode === 'general' ? setGlobalStyle({...globalStyle, noteColor: 'default'}) : updateSelectedChordStyle('noteColor', 'default')} className="w-4 h-4 rounded border border-slate-500 bg-white" title="Default"></button>
                                {COLORS.filter(c=>c!=='#ffffff').map(c => <button key={`int-${c}`} onClick={() => docToolMode === 'general' ? setGlobalStyle({...globalStyle, noteColor: c}) : updateSelectedChordStyle('noteColor', c)} className="w-4 h-4 rounded-full border border-slate-600" style={{ backgroundColor: c }}></button>)}
                            </div>

                            {/* ROOT COLOR */}
                            <div className="flex items-center gap-2 border-r border-slate-600 pr-4">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Fundamental</span>
                                {COLORS.map(c => <button key={`root-${c}`} onClick={() => docToolMode === 'general' ? setGlobalStyle({...globalStyle, rootColor: c}) : updateSelectedChordStyle('rootColor', c)} className="w-4 h-4 rounded-full border border-slate-600" style={{ backgroundColor: c }}></button>)}
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Tamaño</span>
                                <input type="range" min="0.5" max="1.5" step="0.1" value={docToolMode === 'general' ? globalStyle.noteSize : 1} onChange={(e) => docToolMode === 'general' ? setGlobalStyle({...globalStyle, noteSize: parseFloat(e.target.value)}) : updateSelectedChordStyle('noteSize', parseFloat(e.target.value))} className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        </>
                    )}
                    
                    {/* Graphics Controls */}
                    {docToolMode === 'graphics' && (
                        <>
                            <div className="flex items-center gap-2 border-r border-slate-600 pr-4">
                                <button onClick={() => addGraphic('square')} className="flex gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"><Square size={14}/> +Cuadrado</button>
                                <button onClick={() => addGraphic('circle')} className="flex gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"><Circle size={14}/> +Círculo</button>
                                <button onClick={() => addGraphic('arrow')} className="flex gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"><Move size={14}/> +Flecha</button>
                                <button onClick={() => addGraphic('text')} className="flex gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"><Type size={14}/> +Texto</button>
                            </div>
                            {selectedGraphicId ? (
                                <div className="flex items-center gap-3">
                                    {/* Text Editing */}
                                    {selectedGraphic?.type === 'text' && (
                                        <>
                                            <div className="flex flex-col w-24">
                                                <span className="text-[8px] uppercase text-slate-500">Contenido</span>
                                                <input type="text" value={selectedGraphic.text} onChange={(e) => updateGraphic(selectedGraphicId, 'text', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded text-xs px-1 h-5"/>
                                            </div>
                                            <div className="flex flex-col w-16">
                                                <span className="text-[8px] uppercase text-slate-500">Fuente</span>
                                                <select value={selectedGraphic.fontFamily} onChange={(e) => updateGraphic(selectedGraphicId, 'fontFamily', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded text-xs h-5">
                                                    <option value="Opus">Opus</option>
                                                    <option value="Sans">Sans</option>
                                                    <option value="Serif">Serif</option>
                                                    <option value="Mono">Mono</option>
                                                </select>
                                            </div>
                                            <div className="flex flex-col items-center">
                                                <span className="text-[8px] uppercase text-slate-500">Bold</span>
                                                <button onClick={() => updateGraphic(selectedGraphicId, 'fontWeight', selectedGraphic.fontWeight === 'bold' ? 'normal' : 'bold')} className={`p-0.5 rounded ${selectedGraphic.fontWeight === 'bold' ? 'bg-indigo-600' : 'bg-slate-700'}`}><Bold size={12}/></button>
                                            </div>
                                            <div className="flex flex-col items-center w-16">
                                                <span className="text-[8px] uppercase text-slate-500">Tamaño</span>
                                                <input type="range" min="8" max="72" value={selectedGraphic.fontSize} onChange={(e) => updateGraphic(selectedGraphicId, 'fontSize', parseInt(e.target.value))} className="w-full h-1" />
                                            </div>
                                        </>
                                    )}

                                    <div className="flex flex-col items-center">
                                        <span className="text-[8px] uppercase text-slate-500 mb-1">Color</span>
                                        <div className="flex gap-1">
                                            {COLORS.map(c => <button key={c} onClick={() => updateGraphic(selectedGraphicId, 'color', c)} className="w-3 h-3 rounded-full" style={{backgroundColor: c}}></button>)}
                                        </div>
                                    </div>
                                    
                                    {/* Opacity */}
                                    {selectedGraphic?.type !== 'text' && (
                                        <div className="flex flex-col items-center w-16">
                                            <span className="text-[8px] uppercase text-slate-500">Opacidad</span>
                                            <input type="range" min="0.1" max="1" step="0.1" onChange={(e) => updateGraphic(selectedGraphicId, 'opacity', parseFloat(e.target.value))} className="w-full h-1" />
                                        </div>
                                    )}

                                    <div className="flex flex-col items-center w-16">
                                        <span className="text-[8px] uppercase text-slate-500 flex gap-1"><RotateCw size={8}/> Rotación</span>
                                        <input type="range" min="0" max="360" value={selectedGraphic?.rotation || 0} onChange={(e) => updateGraphic(selectedGraphicId, 'rotation', parseInt(e.target.value))} className="w-full h-1" />
                                    </div>

                                    {/* Resize Handles (Allowed for all types including text) */}
                                    <div className="flex items-center gap-2 border-l border-slate-600 pl-2">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] uppercase text-slate-500">Ancho</span>
                                            <input type="number" value={selectedGraphic?.width || 0} onChange={(e) => updateGraphic(selectedGraphicId, 'width', parseInt(e.target.value))} className="w-10 bg-slate-900 border border-slate-600 rounded text-[10px] px-1" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] uppercase text-slate-500">Alto</span>
                                            <input type="number" value={selectedGraphic?.height || 0} onChange={(e) => updateGraphic(selectedGraphicId, 'height', parseInt(e.target.value))} className="w-10 bg-slate-900 border border-slate-600 rounded text-[10px] px-1" />
                                        </div>
                                    </div>

                                    <button onClick={() => setGraphics(prev => prev.filter(g => g.id !== selectedGraphicId))} className="text-red-400 hover:text-red-300 ml-2"><Trash2 size={16}/></button>
                                </div>
                            ) : <span className="text-xs text-slate-500 italic">Clic en objeto para editar</span>}
                        </>
                    )}
                 </div>
             </div>

             {/* CANVAS */}
             <div className="flex-grow overflow-auto bg-slate-800 flex justify-center p-8 relative" onClick={() => { setSelectedChordId(null); setSelectedGraphicId(null); }}>
                 <div ref={documentRef} className="bg-white text-black shadow-2xl relative transition-transform origin-top" style={{ width: '210mm', minHeight: '297mm', padding: '20mm', display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: '10mm' }}>
                     
                     {/* Graphics Layer - Z-INDEX 20 to be on top of Chords */}
                     <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
                        {graphics.map(g => (
                            <div key={g.id} onMouseDown={(e) => handleGraphicDragStart(e, g.id)} onClick={(e) => { e.stopPropagation(); setSelectedGraphicId(g.id); setDocToolMode('graphics'); }}
                                className={`absolute pointer-events-auto cursor-move group 
                                    ${selectedGraphicId === g.id ? 'ring-1 ring-indigo-500 ring-offset-2' : ''} 
                                    ${g.type === 'circle' ? 'rounded-full' : ''}
                                `}
                                style={{ 
                                    left: g.x, top: g.y, width: g.width, height: g.height, 
                                    transform: `rotate(${g.rotation}deg)`,
                                    backgroundColor: (g.type !== 'arrow' && g.type !== 'text' && g.filled) ? g.color : 'transparent', 
                                    border: (g.type !== 'arrow' && g.type !== 'text' && !g.filled) ? `2px solid ${g.color}` : 'none', 
                                    opacity: g.opacity,
                                    // Text Styles
                                    color: g.color,
                                    fontFamily: getFontFamily(g.fontFamily),
                                    fontSize: g.fontSize,
                                    fontWeight: g.fontWeight,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    whiteSpace: 'normal', // Allow wrapping
                                    textAlign: 'center'
                                }}
                            >
                                {g.type === 'circle' && <div className="w-full h-full rounded-full" style={{backgroundColor: g.color}}></div>}
                                {g.type === 'square' && <div className="w-full h-full" style={{backgroundColor: g.color}}></div>}
                                {g.type === 'arrow' && renderArrow(g)}
                                {g.type === 'text' && <span>{g.text}</span>}

                                {/* Resize Handles */}
                                {selectedGraphicId === g.id && (
                                    <>
                                        <div onMouseDown={(e) => handleGraphicResizeStart(e, g.id, 'w')} className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-indigo-500 rounded-full cursor-ew-resize z-20 hover:scale-125"></div>
                                        <div onMouseDown={(e) => handleGraphicResizeStart(e, g.id, 'h')} className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-indigo-500 rounded-full cursor-ns-resize z-20 hover:scale-125"></div>
                                        <div onMouseDown={(e) => handleGraphicResizeStart(e, g.id, 'wh')} className="absolute bottom-[-5px] right-[-5px] w-3 h-3 bg-indigo-500 border border-white cursor-nwse-resize z-20 hover:scale-125"></div>
                                    </>
                                )}
                            </div>
                        ))}
                     </div>

                     <div className="w-full border-b-2 border-black pb-4 mb-8 flex justify-between items-end relative z-10 pointer-events-none">
                         <div className="flex flex-col w-full mr-8 pointer-events-auto">
                            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className="text-3xl font-bold font-serif outline-none bg-transparent placeholder-gray-300 w-full text-black" />
                            <input value={docSubtitle} onChange={(e) => setDocSubtitle(e.target.value)} className="text-sm text-gray-500 mt-1 outline-none bg-transparent w-full" />
                         </div>
                         <div className="text-right whitespace-nowrap"><p className="font-bold text-sm"><span className="text-black">DeBoeck</span><span className="text-indigo-600">ChordBuilder</span></p></div>
                     </div>

                     {savedChords.map((chord, idx) => {
                         const style = { 
                             shape: chord.noteShape || globalStyle.noteShape, 
                             color: chord.noteColor !== undefined ? chord.noteColor : globalStyle.noteColor, 
                             rootColor: chord.rootColor !== undefined ? chord.rootColor : globalStyle.rootColor,
                             size: chord.noteSize || globalStyle.noteSize 
                         };
                         return (
                             <div key={chord.id} draggable onDragStart={(e) => { setDraggedChordIndex(idx); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }} onDrop={(e) => { e.preventDefault(); if (draggedChordIndex === null || draggedChordIndex === idx) return; const updated = [...savedChords]; const [moved] = updated.splice(draggedChordIndex, 1); updated.splice(idx, 0, moved); setSavedChords(updated); setDraggedChordIndex(null); }}
                                className={`relative rounded p-2 transition-all cursor-move z-10`}
                             >
                                 <ChordSnapshot 
                                    data={chord} 
                                    generalFingeringMode={generalMode} 
                                    onDelete={() => setSavedChords(prev => prev.filter(c => c.id !== chord.id))}
                                    styleShape={style.shape} styleColor={style.color} styleRootColor={style.rootColor} styleSize={style.size} isSelected={selectedChordId === chord.id} onClick={() => { setSelectedChordId(chord.id); setDocToolMode('particular'); setSelectedGraphicId(null); }}
                                 />
                             </div>
                         );
                     })}
                 </div>
             </div>
         </div>

      </div>
    </div>
  );
};

export default App;
