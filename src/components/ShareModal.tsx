import React, { useState } from 'react';
import { X, Copy, Check, Eye, Video, Code2, Layers } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, roomId }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const roomUrl = `${origin}/room/${roomId}`;
  const viewUrl = `${origin}/view/${roomId}`;
  const sourceUrl = `${origin}/source/${roomId}`;
  const embedCode = `<iframe src="${origin}/embed/${roomId}" width="100%" height="100%" allow="autoplay; camera; microphone; fullscreen; picture-in-picture" frameborder="0"></iframe>`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/50">
          <div>
            <h3 className="text-base font-semibold text-white">Ссылки на трансляцию и плеер</h3>
            <p className="text-xs text-neutral-400">ID Комнаты: <span className="font-mono text-rose-400 font-bold">{roomId}</span></p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links List */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* 1. View-Only URL */}
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Ссылка для зрителей (View-Only)
              </span>
              <span className="text-[10px] text-neutral-400">Мгновенный просмотр без микрофона/камеры</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={viewUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-200 focus:outline-none select-all"
              />
              <button
                onClick={() => copyToClipboard(viewUrl, 'view')}
                className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow-sm"
              >
                {copiedKey === 'view' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'view' ? 'Скопировано' : 'Скопировать'}
              </button>
            </div>
          </div>

          {/* 2. Broadcaster / Co-host Room URL */}
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                <Video className="w-4 h-4 text-emerald-400" /> Ссылка для со-ведущих / гостей (Камера + Микрофон)
              </span>
              <span className="text-[10px] text-neutral-400">Позволяет гостям выходить в прямой эфир</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={roomUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-200 focus:outline-none select-all"
              />
              <button
                onClick={() => copyToClipboard(roomUrl, 'room')}
                className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                {copiedKey === 'room' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'room' ? 'Скопировано' : 'Скопировать'}
              </button>
            </div>
          </div>

          {/* 3. OBS Browser Source URL */}
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" /> Ссылка для OBS Studio (Browser Source)
              </span>
              <span className="text-[10px] text-neutral-400">Чистый видеопоток без кнопок интерфейса</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={sourceUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-200 focus:outline-none select-all"
              />
              <button
                onClick={() => copyToClipboard(sourceUrl, 'source')}
                className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                {copiedKey === 'source' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'source' ? 'Скопировано' : 'Скопировать'}
              </button>
            </div>
          </div>

          {/* 4. Iframe Embed Code */}
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-amber-400" /> Код для вставки на сайт (iFrame плеер)
              </span>
              <span className="text-[10px] text-neutral-400">Встроить на любой веб-сайт</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={embedCode}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-200 focus:outline-none select-all"
              />
              <button
                onClick={() => copyToClipboard(embedCode, 'embed')}
                className="px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                {copiedKey === 'embed' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'embed' ? 'Скопировано' : 'Скопировать'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-neutral-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
