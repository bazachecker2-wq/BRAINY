import React, { useEffect, useState } from 'react';
import { ChatReaction } from '../types/webrtc';

interface FloatingReactionItem {
  id: string;
  emoji: string;
  senderName: string;
  xPercent: number; // 20% - 90% across the video
  durationMs: number;
}

interface LiveReactionsOverlayProps {
  reactions: ChatReaction[];
  className?: string;
}

export const LiveReactionsOverlay: React.FC<LiveReactionsOverlayProps> = ({
  reactions,
  className = ''
}) => {
  const [activeItems, setActiveItems] = useState<FloatingReactionItem[]>([]);

  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];

    const newItem: FloatingReactionItem = {
      id: `${latest.id}_${Math.random()}`,
      emoji: latest.emoji,
      senderName: latest.senderName,
      xPercent: 65 + Math.random() * 28, // Float mainly up the right-hand side of video
      durationMs: 2500 + Math.random() * 1000
    };

    setActiveItems((prev) => [...prev.slice(-25), newItem]);

    const timer = setTimeout(() => {
      setActiveItems((prev) => prev.filter((item) => item.id !== newItem.id));
    }, newItem.durationMs);

    return () => clearTimeout(timer);
  }, [reactions]);

  if (activeItems.length === 0) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden z-20 ${className}`}
      aria-hidden="true"
    >
      {activeItems.map((item) => (
        <div
          key={item.id}
          className="absolute bottom-12 flex flex-col items-center animate-reaction-float select-none"
          style={{
            left: `${item.xPercent}%`,
            animationDuration: `${item.durationMs}ms`
          }}
        >
          <span className="text-3xl sm:text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] transform transition-transform hover:scale-125">
            {item.emoji}
          </span>
          {item.senderName && (
            <span className="text-[10px] font-bold text-white bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/20 whitespace-nowrap shadow-sm mt-0.5 opacity-80">
              {item.senderName}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
