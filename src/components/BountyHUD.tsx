import React from 'react';
import { Target, Coins } from 'lucide-react';
import { useBounties } from '../hooks/useBounties';

export const BountyHUD: React.FC<{ roomId: string }> = ({ roomId }) => {
  const bounties = useBounties(roomId);
  const activeBounty = bounties[0]; // Show the top bounty

  if (!activeBounty) return null;

  return (
    <div className="absolute top-32 left-3 z-30 flex items-center gap-2 px-3 py-1.5 rounded-none bg-black/40 backdrop-blur-md border border-rose-500/30 text-white shadow-lg pointer-events-none animate-in slide-in-from-left duration-500">
      <Target className="w-4 h-4 text-rose-500" />
      <div className="flex flex-col">
        <span className="text-[10px] font-black uppercase tracking-widest text-rose-300">Челендж:</span>
        <span className="text-xs font-medium">{activeBounty.text}</span>
      </div>
      <div className="flex items-center gap-1 bg-neutral-900/50 px-1.5 py-0.5 rounded border border-white/10">
        <Coins className="w-3 h-3 text-amber-500" />
        <span className="text-[10px] font-bold">{activeBounty.reward} LST</span>
      </div>
    </div>
  );
};
