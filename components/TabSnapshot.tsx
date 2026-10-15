import React from 'react';
import { SavedChord } from '../types';
import { TabStaff } from './TabStaff';
import { TAB_WIDTH } from '../utils/tabs';

interface TabSnapshotProps {
  data: SavedChord;
  onDelete: () => void;
  isSelected: boolean;
  onClick: () => void;
}

export const TabSnapshot: React.FC<TabSnapshotProps> = ({ data, onDelete, isSelected, onClick }) => {
  if (!data.tab) return null;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`relative group select-none transition-all rounded p-2 ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'hover:bg-slate-50'}`}
      style={{ width: TAB_WIDTH + 16 }}
    >
      {data.tab.title && (
        <div className="font-bold text-lg mb-1 text-black px-1" style={{ fontFamily: "'Times New Roman', serif" }}>{data.tab.title}</div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute -top-2 -right-2 z-20 bg-red-500 text-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
      <div className="pointer-events-none">
        <TabStaff score={data.tab} width={TAB_WIDTH} />
      </div>
    </div>
  );
};
