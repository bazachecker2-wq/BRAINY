import React, { useState } from 'react';
import { X, Target, Coins } from 'lucide-react';

interface ProposeTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPropose: (text: string, reward: number) => Promise<void>;
  isSubmitting: boolean;
}

export const ProposeTaskModal: React.FC<ProposeTaskModalProps> = ({
  isOpen,
  onClose,
  onPropose,
  isSubmitting,
}) => {
  const [text, setText] = useState('');
  const [reward, setReward] = useState(10);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!text.trim() || reward <= 0) return;
    await onPropose(text, reward);
    setText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/50">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-rose-500" /> Предложить задание
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что должен сделать стример?.."
            className="w-full h-24 p-3 rounded-xl bg-neutral-950 border border-white/10 text-xs text-white focus:outline-none focus:border-rose-500 transition resize-none"
          />
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Награда (LST)</label>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={reward}
                onChange={(e) => setReward(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 pl-8 pr-2 py-1.5 rounded-xl bg-neutral-950 border border-white/10 text-xs text-white focus:outline-none focus:border-rose-500 transition"
              />
              <Coins className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500" />
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !text.trim()}
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50"
          >
            {isSubmitting ? 'Отправка...' : 'БРОСИТЬ ЗАДАНИЕ'}
          </button>
        </div>
      </div>
    </div>
  );
};
