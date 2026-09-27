import React from 'react';
import { RetroAvatar } from './RetroAvatar';

interface StreamerWindowProps {
  room: any;
  onClick: () => void;
}

export const StreamerWindow: React.FC<StreamerWindowProps> = ({ room, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="group cursor-pointer border-4 border-neutral-800 hover:border-orange-500 transition-all overflow-hidden bg-neutral-950 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-300"
    >
      <div className="w-16 h-16 rounded-none bg-neutral-900 border-4 border-orange-500/50 mb-4 overflow-hidden relative">
        <RetroAvatar 
          src="/src/assets/images/pixel_avatar_1_1790466424222.jpg" 
          alt={room.streamerName} 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-orange-500/10 animate-pulse" />
      </div>
      <h4 className="text-sm font-black text-white truncate group-hover:text-orange-400 transition-colors uppercase tracking-tight">{room.name}</h4>
      <p className="text-[10px] text-neutral-400 mt-1 uppercase font-mono">{room.streamerName}</p>
      <div className="mt-4 px-2 py-0.5 bg-black border-2 border-white/10 text-[9px] font-black text-orange-500 uppercase tracking-widest">
        <span className="w-1.5 h-1.5 bg-orange-500 animate-pulse inline-block mr-1"></span>
        {room.participantsCount} ЗРИТЕЛЕЙ
      </div>
    </div>
  );
};
