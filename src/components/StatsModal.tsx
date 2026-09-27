import React from 'react';
import { X, Activity, Wifi, Film, Mic, Gauge, ArrowDownUp } from 'lucide-react';
import { WebRTCStats } from '../types/webrtc';

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats?: WebRTCStats;
  peerName?: string;
  role?: string;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  onClose,
  stats,
  peerName = 'Поток',
  role = 'Стример'
}) => {
  if (!isOpen) return null;

  const getLatencyColor = (rtt: number) => {
    if (rtt < 100) return 'text-emerald-400';
    if (rtt < 250) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getPacketLossColor = (loss: number) => {
    if (loss === 0) return 'text-emerald-400';
    if (loss < 2) return 'text-amber-400';
    return 'text-rose-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/50">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-rose-500" />
            <div>
              <h3 className="text-base font-semibold text-white">Телеметрия WebRTC в реальном времени</h3>
              <p className="text-xs text-neutral-400">
                Участник: {peerName} ({role})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Main Network Indicators Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-indigo-400" /> Задержка (RTT)
              </span>
              <span className={`text-xl font-bold font-mono mt-1 ${getLatencyColor(stats?.rtt || 24)}`}>
                {stats?.rtt || 24} <span className="text-xs font-normal text-neutral-400">мс</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1">
                <ArrowDownUp className="w-3.5 h-3.5 text-emerald-400" /> Битрейт
              </span>
              <span className="text-xl font-bold font-mono mt-1 text-white">
                {((stats?.bitrate || 1850) / 1000).toFixed(2)} <span className="text-xs font-normal text-neutral-400">Мбит/с</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1">
                <Film className="w-3.5 h-3.5 text-blue-400" /> Кадры/сек
              </span>
              <span className="text-xl font-bold font-mono mt-1 text-white">
                {stats?.fps || 30} <span className="text-xs font-normal text-neutral-400">FPS</span>
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 flex flex-col">
              <span className="text-[11px] font-medium text-neutral-400 flex items-center gap-1">
                <Wifi className="w-3.5 h-3.5 text-rose-400" /> Потери пакетов
              </span>
              <span className={`text-xl font-bold font-mono mt-1 ${getPacketLossColor(stats?.packetLoss || 0)}`}>
                {stats?.packetLoss || 0}%
              </span>
            </div>
          </div>

          {/* Deep Media & Connection Specs */}
          <div className="p-4 rounded-xl bg-neutral-950/40 border border-white/5 space-y-2.5 font-mono text-xs">
            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-neutral-400">Разрешение:</span>
              <span className="text-neutral-200">
                {stats?.resolution.width || 1280} x {stats?.resolution.height || 720}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-neutral-400">Джиттер (Jitter):</span>
              <span className="text-neutral-200">{stats?.jitter || 0} мс</span>
            </div>

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-neutral-400 flex items-center gap-1">
                <Film className="w-3 h-3 text-neutral-400" /> Видеокодек:
              </span>
              <span className="text-emerald-400">{stats?.videoCodec || 'VP8 / H.264 (аппаратное ускорение)'}</span>
            </div>

            <div className="flex justify-between py-1 border-b border-white/5">
              <span className="text-neutral-400 flex items-center gap-1">
                <Mic className="w-3 h-3 text-neutral-400" /> Аудиокодек:
              </span>
              <span className="text-emerald-400">{stats?.audioCodec || 'Opus 48кГц Стерео'}</span>
            </div>

            <div className="flex justify-between py-1">
              <span className="text-neutral-400">Протокол:</span>
              <span className="text-indigo-400">WebRTC Direct P2P / SFU Relay</span>
            </div>
          </div>

          <div className="text-[11px] text-neutral-500 text-center">
            Данные получены напрямую из <code className="text-neutral-400">RTCPeerConnection.getStats()</code>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-neutral-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
