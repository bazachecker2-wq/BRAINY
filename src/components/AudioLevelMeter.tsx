import React from 'react';

interface AudioLevelMeterProps {
  level: number; // 0.0 to 1.0
  isSpeaking?: boolean;
  isMuted?: boolean;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({
  level,
  isSpeaking = false,
  isMuted = false,
  orientation = 'horizontal',
  className = ''
}) => {
  if (isMuted) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden opacity-50">
          <div className="h-full w-0 bg-neutral-600"></div>
        </div>
      </div>
    );
  }

  const percentage = Math.min(100, Math.max(0, Math.round(level * 100)));

  // Color interpolation based on volume
  const getBarColor = (val: number) => {
    if (val > 80) return 'bg-rose-500';
    if (val > 55) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  if (orientation === 'vertical') {
    return (
      <div className={`w-1.5 h-10 bg-neutral-800/80 rounded-full overflow-hidden flex flex-col-reverse p-0.5 border border-white/10 ${className}`}>
        <div
          className={`w-full rounded-full transition-all duration-75 ${getBarColor(percentage)}`}
          style={{ height: `${percentage}%` }}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="h-1.5 flex-1 bg-neutral-800/90 rounded-full overflow-hidden p-0.5 border border-white/5">
        <div
          className={`h-full rounded-full transition-all duration-75 ${getBarColor(percentage)} ${
            isSpeaking ? 'shadow-[0_0_8px_rgba(52,211,153,0.6)]' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
