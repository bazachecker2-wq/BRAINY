import React, { useEffect, useState } from 'react';
import { X, Camera, Mic, Volume2, Sliders, ShieldCheck, Video, Radio, Laptop, ArrowRight } from 'lucide-react';
import { MediaDeviceState } from '../types/webrtc';
import { VIDEO_PRESETS } from '../services/webrtcManager';
import { RTMPStreamCredentials } from './RTMPStreamCredentials';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: MediaDeviceState;
  onUpdateSettings: (settings: MediaDeviceState) => void;
  onApplyMediaRestart: () => void;
  roomId?: string;
  initialTab?: 'devices' | 'rtmp';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onApplyMediaRestart,
  roomId = '',
  initialTab = 'devices'
}) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'rtmp'>(initialTab);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [localSettings, setLocalSettings] = useState<MediaDeviceState>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;

    async function loadDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
        setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
        setSpeakerDevices(devices.filter((d) => d.kind === 'audiooutput'));
      } catch (err) {
        console.error('Ошибка получения списка устройств:', err);
      }
    }

    loadDevices();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onApplyMediaRestart();
    onClose();
  };

  // Derive active room ID from prop or URL
  const effectiveRoomId = roomId || (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || 'room' : 'room');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-rose-500" />
            <h3 className="text-base font-bold text-white tracking-tight">Параметры трансляции</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            aria-label="Закрыть настройки"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-neutral-950/40 p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('devices')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition ${
              activeTab === 'devices'
                ? 'bg-neutral-800 text-white shadow-sm border border-white/10'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-rose-400" />
            <span>Оборудование и Качество</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rtmp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition ${
              activeTab === 'rtmp'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-900/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-white" />
            <span>RTMP & OBS Инжест</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
              activeTab === 'rtmp' ? 'bg-white/20 text-white' : 'bg-rose-500/20 text-rose-300'
            }`}>
              1935
            </span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {activeTab === 'rtmp' ? (
            /* Dedicated RTMP Stream Credentials Component */
            <RTMPStreamCredentials roomId={effectiveRoomId} />
          ) : (
            /* Hardware and Quality Settings */
            <>
              {/* Quick Callout to RTMP Tab */}
              <div 
                onClick={() => setActiveTab('rtmp')}
                className="p-3 rounded-xl bg-gradient-to-r from-rose-950/30 to-neutral-950 border border-rose-500/20 hover:border-rose-500/40 cursor-pointer transition flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-rose-400 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-white group-hover:text-rose-300 transition">Нужен RTMP ключ для OBS Studio?</span>
                    <p className="text-[11px] text-neutral-400">Нажмите здесь, чтобы скопировать сервер и уникальный ключ трансляции.</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
              </div>

              {/* Main Camera Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-rose-400" /> Основная видеокамера
                </label>
                <select
                  value={localSettings.videoInputId}
                  onChange={(e) => setLocalSettings({ ...localSettings, videoInputId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-sm focus:outline-none focus:border-rose-500 transition"
                >
                  <option value="">Камера по умолчанию</option>
                  {videoDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Камера (${d.deviceId.substring(0, 6)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Secondary Camera Selector */}
              {videoDevices.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-indigo-400" /> Вторая камера (для параллельной трансляции)
                  </label>
                  <select
                    value={localSettings.secondaryVideoInputId || ''}
                    onChange={(e) => setLocalSettings({ ...localSettings, secondaryVideoInputId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-sm focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="">Не выбрана</option>
                    {videoDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Камера 2 (${d.deviceId.substring(0, 6)}...)`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Microphone Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-emerald-400" /> Микрофон
                </label>
                <select
                  value={localSettings.audioInputId}
                  onChange={(e) => setLocalSettings({ ...localSettings, audioInputId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-sm focus:outline-none focus:border-rose-500 transition"
                >
                  <option value="">Микрофон по умолчанию</option>
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Микрофон (${d.deviceId.substring(0, 6)}...)`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Speaker / Output */}
              {speakerDevices.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-blue-400" /> Динамики / Наушники
                  </label>
                  <select
                    value={localSettings.audioOutputId}
                    onChange={(e) => setLocalSettings({ ...localSettings, audioOutputId: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-sm focus:outline-none focus:border-rose-500 transition"
                  >
                    <option value="">Устройство по умолчанию</option>
                    {speakerDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Динамик (${d.deviceId.substring(0, 6)}...)`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Video Quality Presets */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Разрешение видео</label>
                  <select
                    value={localSettings.resolution}
                    onChange={(e) => setLocalSettings({ ...localSettings, resolution: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-sm focus:outline-none focus:border-rose-500 transition"
                  >
                    {Object.entries(VIDEO_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>
                        {preset.label} ({preset.width}x{preset.height})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-300">Частота кадров (FPS)</label>
                  <select
                    value={localSettings.fps}
                    onChange={(e) => setLocalSettings({ ...localSettings, fps: parseInt(e.target.value) as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-neutral-200 text-sm focus:outline-none focus:border-rose-500 transition"
                  >
                    <option value={24}>24 FPS (Кинематографичный)</option>
                    <option value={30}>30 FPS (Стандарт)</option>
                    <option value={60}>60 FPS (Плавный / Игры)</option>
                  </select>
                </div>
              </div>

              {/* Bitrate Control */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Ограничение битрейта</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'auto', label: 'Авто' },
                    { id: 'low', label: 'Низкий' },
                    { id: 'medium', label: 'Средний' },
                    { id: 'high', label: 'Высокий' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLocalSettings({ ...localSettings, bitratePreset: p.id as any })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                        localSettings.bitratePreset === p.id
                          ? 'bg-rose-600/20 text-rose-300 border-rose-500'
                          : 'bg-neutral-950 text-neutral-400 border-white/5 hover:border-white/20'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Facing Mode */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-300">Режим ориентации камеры</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, facingMode: 'user' })}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                      localSettings.facingMode === 'user'
                        ? 'bg-rose-600/20 text-rose-300 border-rose-500'
                        : 'bg-neutral-950 text-neutral-400 border-white/5 hover:border-white/20'
                    }`}
                  >
                    Фронтальная (Сэлфи)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocalSettings({ ...localSettings, facingMode: 'environment' })}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                      localSettings.facingMode === 'environment'
                        ? 'bg-rose-600/20 text-rose-300 border-rose-500'
                        : 'bg-neutral-950 text-neutral-400 border-white/5 hover:border-white/20'
                    }`}
                  >
                    Задняя (Окружение)
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-white/5 flex items-start gap-2.5 text-xs text-neutral-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  Подавление эха (AEC), авто-усиление звука (AGC) и шумоподавление (NS) активированы по умолчанию.
                </span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-neutral-950/60 flex items-center justify-between gap-2.5">
          {activeTab === 'rtmp' ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('devices')}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition"
              >
                ← К настройкам устройств
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold transition shadow-lg"
              >
                Готово
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition shadow-lg shadow-rose-600/30"
              >
                Применить настройки
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
