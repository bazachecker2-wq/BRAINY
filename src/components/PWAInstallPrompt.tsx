import React, { useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isInstalled || isDismissed) return null;

  if (isInstallable) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 animate-in slide-in-from-bottom duration-500">
        <div className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-600 flex items-center justify-center shrink-0 shadow-lg">
            <Download className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-white">Установить приложение?</h4>
            <p className="text-xs text-neutral-400 truncate">Смотрите стримы быстрее и удобнее</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                install();
                setIsDismissed(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm"
            >
              Установить
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-2 rounded-xl hover:bg-white/5 text-neutral-500 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isIOS) {
    return (
      <>
        <div className="fixed bottom-20 left-4 right-4 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 animate-in slide-in-from-bottom duration-500">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-600 flex items-center justify-center shrink-0 shadow-lg">
              <Download className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-white">Добавить на экран «Домой»</h4>
              <p className="text-xs text-neutral-400 truncate">Для удобного доступа в один клик</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowIOSGuide(true)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm"
              >
                Как?
              </button>
              <button
                onClick={() => setIsDismissed(true)}
                className="p-2 rounded-xl hover:bg-white/5 text-neutral-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 p-6 shadow-2xl text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-600 flex items-center justify-center shadow-lg">
                <Download className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Инструкция для iOS</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  1. Нажмите кнопку <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white"><Share className="w-3.5 h-3.5" /></span> в нижней панели Safari.
                  <br />
                  2. Выберите пункт <strong>«На экран „Домой“»</strong>.
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-lg shadow-rose-600/20"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
