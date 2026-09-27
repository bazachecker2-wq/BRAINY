import React, { useState, useEffect } from 'react';
import {
  Radio,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  Terminal,
  HelpCircle,
  Laptop,
  Zap,
  Info
} from 'lucide-react';

interface RTMPStreamCredentialsProps {
  roomId: string;
  className?: string;
  onCredentialsCopied?: (type: 'url' | 'key' | 'full' | 'both') => void;
}

export const RTMPStreamCredentials: React.FC<RTMPStreamCredentialsProps> = ({
  roomId,
  className = '',
  onCredentialsCopied
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<boolean>(false);
  const [streamKey, setStreamKey] = useState<string>('');
  const [customHost, setCustomHost] = useState<string>('');
  const [isEditingHost, setIsEditingHost] = useState<boolean>(false);
  const [activeSoftwareTab, setActiveSoftwareTab] = useState<'obs' | 'streamlabs' | 'ffmpeg'>('obs');
  const [confirmRegenerate, setConfirmRegenerate] = useState<boolean>(false);

  // Initialize or load unique stream key for this room
  useEffect(() => {
    const storageKey = `beamlive_rtmp_key_${roomId}`;
    let savedKey = localStorage.getItem(storageKey);
    
    if (!savedKey) {
      // Generate a cryptographically unique 16-character stream key for this room
      const randomSegment = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      savedKey = `live_${roomId}_${randomSegment}`;
      localStorage.setItem(storageKey, savedKey);
    }
    setStreamKey(savedKey);
  }, [roomId]);

  // Compute server URL based on hostname
  const defaultHostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const effectiveHostname = customHost.trim() || defaultHostname;
  // Default MediaMTX RTMP ingest port is 1935
  const serverUrl = `rtmp://${effectiveHostname}:1935/live`;
  const fullRtmpUrl = `${serverUrl}/${streamKey}`;

  const copyToClipboard = (text: string, fieldName: string) => {
    if (!navigator.clipboard) {
      // Fallback for non-secure contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } else {
      navigator.clipboard.writeText(text);
    }

    setCopiedField(fieldName);
    if (onCredentialsCopied) {
      onCredentialsCopied(fieldName as any);
    }
    setTimeout(() => {
      setCopiedField((curr) => (curr === fieldName ? null : curr));
    }, 2500);
  };

  const handleRegenerateKey = () => {
    const randomSegment = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const newKey = `live_${roomId}_${randomSegment}`;
    const storageKey = `beamlive_rtmp_key_${roomId}`;
    localStorage.setItem(storageKey, newKey);
    setStreamKey(newKey);
    setConfirmRegenerate(false);
    setCopiedField('regenerated');
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleCopyBoth = () => {
    const both = `Server: ${serverUrl}\nStream Key: ${streamKey}`;
    copyToClipboard(both, 'both');
  };

  // Masked stream key representation
  const maskedKey = '•'.repeat(Math.min(streamKey.length || 24, 28));

  return (
    <div className={`space-y-5 text-neutral-200 ${className}`}>
      {/* Banner / Status Indicator */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-neutral-900 to-indigo-950/40 border border-white/10 shadow-lg flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-600/20 border border-rose-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <Radio className="w-5 h-5 text-rose-400 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-white tracking-tight">RTMP Инжест для OBS & Софта</h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                Шлюз MediaMTX :1935 готов
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Используйте эти реквизиты для прямой передачи видеопотока из OBS Studio, vMix или Streamlabs в комнату WebRTC.
            </p>
          </div>
        </div>
      </div>

      {/* Credentials Card */}
      <div className="p-5 rounded-2xl bg-neutral-950/70 border border-white/10 space-y-4 shadow-xl">
        {/* Field 1: RTMP Server URL */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <span>URL Сервера (Server URL / Ingest)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 font-mono">RTMP</span>
            </label>
            <button
              type="button"
              onClick={() => setIsEditingHost(!isEditingHost)}
              className="text-[11px] text-rose-400 hover:text-rose-300 transition flex items-center gap-1"
            >
              {isEditingHost ? 'Готово' : 'Изменить хост'}
            </button>
          </div>

          {isEditingHost && (
            <div className="p-2.5 rounded-xl bg-neutral-900 border border-white/10 mb-2 space-y-1 animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-[11px] text-neutral-400">
                <span>Пользовательский IP или домен сервера:</span>
                <button
                  type="button"
                  onClick={() => setCustomHost('')}
                  className="text-neutral-500 hover:text-neutral-300 underline"
                >
                  Сбросить на {defaultHostname}
                </button>
              </div>
              <input
                type="text"
                value={customHost}
                onChange={(e) => setCustomHost(e.target.value)}
                placeholder={defaultHostname}
                className="w-full px-3 py-1.5 rounded-lg bg-neutral-950 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-rose-500 transition"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                readOnly
                value={serverUrl}
                aria-label="RTMP Server URL"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-200 select-all focus:outline-none focus:border-rose-500 transition pr-8"
              />
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(serverUrl, 'url')}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
                copiedField === 'url'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100 hover:text-white border border-white/10'
              }`}
            >
              {copiedField === 'url' ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              <span>{copiedField === 'url' ? 'Скопировано!' : 'Копировать'}</span>
            </button>
          </div>
        </div>

        {/* Field 2: Unique RTMP Stream Key */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <span>Ключ потока (Stream Key)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono">Уникальный</span>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-[11px] text-neutral-400 hover:text-white transition flex items-center gap-1"
                title={showKey ? 'Скрыть ключ' : 'Показать ключ'}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showKey ? 'Скрыть' : 'Показать'}</span>
              </button>

              <span className="text-neutral-600">|</span>

              {confirmRegenerate ? (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-amber-400 font-medium">Сменить?</span>
                  <button
                    type="button"
                    onClick={handleRegenerateKey}
                    className="text-[11px] text-rose-400 hover:text-rose-300 font-bold px-1.5 py-0.5 rounded bg-rose-500/10"
                  >
                    Да
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRegenerate(false)}
                    className="text-[11px] text-neutral-400 hover:text-white px-1.5 py-0.5 rounded bg-neutral-800"
                  >
                    Нет
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRegenerate(true)}
                  className="text-[11px] text-neutral-400 hover:text-rose-400 transition flex items-center gap-1"
                  title="Сгенерировать новый уникальный ключ"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Обновить ключ</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                readOnly
                value={streamKey}
                aria-label="RTMP Stream Key"
                className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-xs font-mono text-rose-200 tracking-wider select-all focus:outline-none focus:border-rose-500 transition"
              />
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(streamKey, 'key')}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 ${
                copiedField === 'key'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
              }`}
            >
              {copiedField === 'key' ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              <span>{copiedField === 'key' ? 'Скопировано!' : 'Копировать'}</span>
            </button>
          </div>

          {copiedField === 'regenerated' && (
            <p className="text-[11px] text-emerald-400 flex items-center gap-1 mt-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Создан новый уникальный ключ потока! Не забудьте обновить его в OBS.</span>
            </p>
          )}
        </div>

        {/* Quick Actions Row */}
        <div className="pt-2 flex flex-wrap items-center gap-2 border-t border-white/5">
          <button
            type="button"
            onClick={handleCopyBoth}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              copiedField === 'both'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-white/5 hover:bg-white/10 text-neutral-200 border border-white/10'
            }`}
          >
            {copiedField === 'both' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Скопировать Сервер + Ключ вместе</span>
          </button>

          <button
            type="button"
            onClick={() => copyToClipboard(fullRtmpUrl, 'full')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
              copiedField === 'full'
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10'
            }`}
            title="Единый полный RTMP URL для VLC, FFmpeg или vMix"
          >
            {copiedField === 'full' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Полный rtmp:// URL</span>
          </button>
        </div>
      </div>

      {/* Guide Tabs for OBS Studio, Streamlabs, FFmpeg */}
      <div className="p-4 rounded-2xl bg-neutral-950/40 border border-white/5 space-y-3">
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
          <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
            <Laptop className="w-4 h-4 text-indigo-400" />
            Инструкция по подключению
          </span>
          <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-white/5 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveSoftwareTab('obs')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                activeSoftwareTab === 'obs'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              OBS Studio
            </button>
            <button
              type="button"
              onClick={() => setActiveSoftwareTab('streamlabs')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                activeSoftwareTab === 'streamlabs'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Streamlabs / vMix
            </button>
            <button
              type="button"
              onClick={() => setActiveSoftwareTab('ffmpeg')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                activeSoftwareTab === 'ffmpeg'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              FFmpeg CLI
            </button>
          </div>
        </div>

        {/* Tab 1: OBS Studio */}
        {activeSoftwareTab === 'obs' && (
          <div className="space-y-2.5 text-xs text-neutral-300 animate-in fade-in duration-150">
            <ol className="space-y-1.5 list-decimal list-inside text-neutral-300">
              <li>
                В OBS Studio откройте <strong className="text-white">Настройки (Settings) → Трансляция (Stream)</strong>.
              </li>
              <li>
                В поле <strong className="text-white">Сервис (Service)</strong> выберите <span className="font-mono text-rose-300">Настраиваемый... (Custom...)</span>.
              </li>
              <li>
                Вставьте <strong className="text-white">URL Сервера</strong> в поле <span className="font-mono text-neutral-400">Сервер (Server)</span>.
              </li>
              <li>
                Вставьте <strong className="text-white">Ключ потока</strong> в поле <span className="font-mono text-neutral-400">Ключ потока (Stream Key)</span>.
              </li>
              <li>
                Нажмите <strong className="text-emerald-400">«Применить»</strong> и затем <strong className="text-white">«Начать трансляцию»</strong>.
              </li>
            </ol>

            <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 space-y-1 text-[11px] text-neutral-400">
              <span className="font-bold text-neutral-200 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Рекомендуемые параметры кодирования (минимальная задержка):
              </span>
              <p>
                Кодировщик: <span className="font-mono text-neutral-300">x264</span> или <span className="font-mono text-neutral-300">NVIDIA NVENC H.264</span> • Управление битрейтом: <span className="font-mono text-neutral-300">CBR</span> • Интервал ключевых кадров: <span className="font-mono text-rose-300">1 сек</span> (или 2 сек) • Профиль: <span className="font-mono text-neutral-300">baseline/main</span> • Тюнинг: <span className="font-mono text-neutral-300">zerolatency</span>.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Streamlabs / vMix */}
        {activeSoftwareTab === 'streamlabs' && (
          <div className="space-y-2 text-xs text-neutral-300 animate-in fade-in duration-150">
            <p>
              В <strong className="text-white">Streamlabs Desktop, vMix или Wirecast</strong> добавьте новый выход <span className="font-mono text-rose-300">Custom RTMP Server</span>.
            </p>
            <ul className="space-y-1 text-neutral-300 list-disc list-inside">
              <li>URL: <span className="font-mono text-neutral-200">{serverUrl}</span></li>
              <li>Stream Key: <span className="font-mono text-rose-300">{showKey ? streamKey : maskedKey}</span></li>
              <li>Порт: <span className="font-mono text-neutral-300">1935</span> (по умолчанию для RTMP)</li>
            </ul>
          </div>
        )}

        {/* Tab 3: FFmpeg */}
        {activeSoftwareTab === 'ffmpeg' && (
          <div className="space-y-2 text-xs text-neutral-300 animate-in fade-in duration-150">
            <p className="text-neutral-400">
              Команда для вещания видеофайла или захвата экрана через консоль FFmpeg:
            </p>
            <div className="relative">
              <pre className="p-3 rounded-xl bg-neutral-900 border border-white/10 text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                {`ffmpeg -re -i input.mp4 -c:v libx264 -preset veryfast -b:v 2500k -g 60 -c:a aac -b:a 128k -f flv "${fullRtmpUrl}"`}
              </pre>
              <button
                type="button"
                onClick={() => copyToClipboard(`ffmpeg -re -i input.mp4 -c:v libx264 -preset veryfast -b:v 2500k -g 60 -c:a aac -b:a 128k -f flv "${fullRtmpUrl}"`, 'ffmpeg_cmd')}
                className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] font-semibold text-white transition flex items-center gap-1"
              >
                {copiedField === 'ffmpeg_cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedField === 'ffmpeg_cmd' ? 'Скопировано' : 'Копировать команду'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Security Tip */}
      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-200/90">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-amber-300">Внимание:</strong> Ключ потока является приватным паролем для трансляции в вашу комнату. Не показывайте его в кадре и никому не передавайте. При необходимости вы можете в любой момент нажать «Обновить ключ».
        </p>
      </div>
    </div>
  );
};
