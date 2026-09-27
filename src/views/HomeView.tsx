import React, { useEffect, useRef, useState } from 'react';
import {
  Video,
  Radio,
  Monitor,
  Eye,
  Camera,
  Mic,
  Shield,
  Zap,
  ArrowRight,
  Sparkles,
  Layers,
  CheckCircle2,
  Lock,
  Bot,
  Target
} from 'lucide-react';
import { StreamerWindow } from '../components/StreamerWindow';
import { AudioLevelMeter } from '../components/AudioLevelMeter';
import { AudioMeter } from '../services/audioMeter';
import { AuthButton } from '../components/AuthButton';
import { UserDashboard } from '../components/UserDashboard';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../lib/firebase';

interface HomeViewProps {
  onStartInstantCamera: () => void;
  onCreateRoom: (options: { name?: string; mode: 'public' | 'unlisted' | 'private'; password?: string; sfuMode: boolean; customId?: string }) => void;
  onJoinRoom: (roomId: string, isViewer: boolean, password?: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onStartInstantCamera,
  onCreateRoom,
  onJoinRoom
}) => {
  const [activeTab, setActiveTab] = useState<'quick' | 'create' | 'join'>('quick');

  // Preview hardware state
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioMeterRef = useRef<AudioMeter | null>(null);

  // Custom create state
  const [roomName, setRoomName] = useState('');
  const [customRoomId, setCustomRoomId] = useState('');
  const [roomMode, setRoomMode] = useState<'public' | 'unlisted' | 'private'>('unlisted');
  const [roomPassword, setRoomPassword] = useState('');
  const [sfuMode, setSfuMode] = useState(true);

  // Join state
  const [joinInput, setJoinInput] = useState('');
  const [joinAsViewer, setJoinAsViewer] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');
  const [user] = useAuthState(auth);

  // Online rooms state
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  // Helper to obtain user media safely with fallbacks
  const acquirePreviewMedia = async (): Promise<MediaStream | null> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return null;
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      } catch {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
          });
        } catch {
          return null;
        }
      }
    }
  };

  // Start local camera preview safely
  const startPreview = async (cancelledCheck?: () => boolean) => {
    try {
      const stream = await acquirePreviewMedia();
      if (!stream) {
        setHasPermission(false);
        return;
      }

      if (cancelledCheck && cancelledCheck()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setPreviewStream(stream);
      setHasPermission(true);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        const playPromise = videoPreviewRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((e) => {
            if (e.name !== 'AbortError') {
              console.warn('Preview video playback:', e);
            }
          });
        }
      }

      audioMeterRef.current = new AudioMeter((lvl, spk) => {
        if (!cancelledCheck || !cancelledCheck()) {
          setAudioLevel(lvl);
          setIsSpeaking(spk);
        }
      });
      audioMeterRef.current.attachStream(stream);
    } catch (err: any) {
      setHasPermission(false);
    }
  };

  const fetchActiveRooms = async () => {
    setIsLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms/active');
      const data = await res.json();
      if (data.success) {
        setActiveRooms(data.rooms);
      }
    } catch (e) {
      console.warn('Failed to fetch active rooms');
    } finally {
      setIsLoadingRooms(false);
    }
  };

  useEffect(() => {
    let isCancelled = false;
    let localStreamRef: MediaStream | null = null;

    fetchActiveRooms();
    const roomsInterval = setInterval(fetchActiveRooms, 10000); // refresh every 10s

    const runInit = async () => {
      try {
        const stream = await acquirePreviewMedia();
        if (!stream) return;

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef = stream;
        setPreviewStream(stream);
        setHasPermission(true);

        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          const p = videoPreviewRef.current.play();
          if (p !== undefined) {
            p.catch((err) => {
              if (err.name !== 'AbortError') {
                console.warn('Video preview notice:', err);
              }
            });
          }
        }

        audioMeterRef.current = new AudioMeter((lvl, spk) => {
          if (!isCancelled) {
            setAudioLevel(lvl);
            setIsSpeaking(spk);
          }
        });
        audioMeterRef.current.attachStream(stream);
      } catch (err: any) {
        if (!isCancelled) {
          setHasPermission(false);
        }
      }
    };

    runInit();

    return () => {
      isCancelled = true;
      clearInterval(roomsInterval);
      if (localStreamRef) {
        localStreamRef.getTracks().forEach((t) => t.stop());
      }
      if (previewStream) {
        previewStream.getTracks().forEach((t) => t.stop());
      }
      if (videoPreviewRef.current) {
        try {
          videoPreviewRef.current.pause();
        } catch (e) {
          // ignore
        }
        videoPreviewRef.current.srcObject = null;
      }
      audioMeterRef.current?.destroy();
    };
  }, []);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateRoom({
      name: roomName || undefined,
      customId: customRoomId || undefined,
      mode: roomMode,
      password: roomPassword || undefined,
      sfuMode
    });
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let cleaned = joinInput.trim();
    if (cleaned.includes('/room/')) {
      cleaned = cleaned.split('/room/')[1].split('?')[0];
    } else if (cleaned.includes('/view/')) {
      cleaned = cleaned.split('/view/')[1].split('?')[0];
    }
    if (cleaned) {
      onJoinRoom(cleaned, joinAsViewer, joinPassword || undefined);
    }
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col justify-between selection:bg-orange-500/30 selection:text-orange-200 font-mono">
      <header className="px-6 py-4 border-b border-neutral-800 bg-black sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-bold text-lg text-white tracking-tighter">BEAMLIVE</span>
          <div className="flex items-center gap-4 text-xs font-bold text-neutral-400 uppercase tracking-widest">
            <AuthButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center font-mono">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero & Action Panel */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-4">
              <div className="text-xs text-orange-500 font-bold tracking-widest uppercase">
                // INSTANT BROADCASTING DECK
              </div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tighter text-white leading-tight uppercase">
                ТРАНСЛЯЦИЯ КАМЕР, ЭКРАНА И RTSP С ЗАДЕРЖКОЙ <span className="text-orange-500 font-extrabold">&lt; 1 СЕКУНДЫ</span>
              </h2>
              <p className="text-neutral-400 text-xs leading-relaxed max-w-xl">
                Параллельная трансляция нескольких камер одновременно. Встроенный автономный ИИ-Агент видит видеопоток в реальном времени, комментирует события и отвечает на вопросы зрителей в чате.
              </p>
            </div>

            {/* Quick Action Navigation Tabs (Button controls) */}
            <div className="flex items-center gap-1 p-1 bg-neutral-950 border border-white/10 max-w-md">
              <button
                onClick={() => setActiveTab('quick')}
                className={`flex-1 py-1.5 px-3 rounded-none text-[11px] font-bold uppercase transition ${
                  activeTab === 'quick'
                    ? 'bg-orange-500 text-black'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                Быстрый старт
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-1.5 px-3 rounded-none text-[11px] font-bold uppercase transition ${
                  activeTab === 'create'
                    ? 'bg-orange-500 text-black'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                Своя комната
              </button>
              <button
                onClick={() => setActiveTab('join')}
                className={`flex-1 py-1.5 px-3 rounded-none text-[11px] font-bold uppercase transition ${
                  activeTab === 'join'
                    ? 'bg-orange-500 text-black'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                Подключиться
              </button>
            </div>

            {/* Tab 1: Instant Stream */}
            {activeTab === 'quick' && (
              <div className="p-6 bg-black border border-white/10 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest">// БЫСТРЫЙ ВЫХОД В ЭФИР</h3>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Мгновенно создает комнату и генерирует уникальную ссылку для ваших зрителей. Камера будет подключена автоматически.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={onStartInstantCamera}
                    className="w-full py-3 px-5 rounded-none bg-orange-500 hover:bg-orange-400 text-black font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition transform active:scale-[0.99] border border-orange-600"
                  >
                    <div className="w-2 h-2 bg-black animate-ping"></div>
                    <span>Запустить трансляцию</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-neutral-400 pt-2 border-t border-white/10">
                  <span>МУЛЬТИКАМ</span>
                  <span>·</span>
                  <span>ИИ-НАБЛЮДАТЕЛЬ</span>
                  <span>·</span>
                  <span>OBS SOURCE</span>
                </div>
              </div>
            )}

            {/* Tab 2: Custom Room */}
            {activeTab === 'create' && (
              <form onSubmit={handleCreateSubmit} className="p-6 bg-black border border-white/10 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest">// КОНФИГУРАЦИЯ СТУДИИ</h3>
                  <p className="text-[11px] text-neutral-400">Настройте приватность, пароль доступа и протокол SFU.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400">Название трансляции</label>
                    <input
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="Например: STUDIO LIVE STREAM"
                      className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-white/10 text-neutral-200 text-xs focus:outline-none focus:border-orange-500 transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-neutral-400">Свой ID комнаты</label>
                      <input
                        type="text"
                        value={customRoomId}
                        onChange={(e) => setCustomRoomId(e.target.value)}
                        placeholder="my-custom-stream"
                        className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-white/10 text-neutral-200 text-xs focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-neutral-400">Приватность</label>
                      <select
                        value={roomMode}
                        onChange={(e) => setRoomMode(e.target.value as any)}
                        className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-white/10 text-neutral-200 text-xs focus:outline-none focus:border-orange-500 transition"
                      >
                        <option value="unlisted">По ссылке</option>
                        <option value="public">Публичная</option>
                        <option value="private">Защищенная</option>
                      </select>
                    </div>
                  </div>

                  {roomMode === 'private' && (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-orange-500 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Пароль комнаты
                      </label>
                      <input
                        type="password"
                        required
                        value={roomPassword}
                        onChange={(e) => setRoomPassword(e.target.value)}
                        placeholder="Код доступа"
                        className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-white/10 text-neutral-200 text-xs focus:outline-none focus:border-orange-500 transition"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between p-2.5 bg-neutral-950 border border-white/5">
                    <span className="text-[10px] uppercase text-neutral-400">Включить режим SFU (много зрителей)</span>
                    <input
                      type="checkbox"
                      checked={sfuMode}
                      onChange={(e) => setSfuMode(e.target.checked)}
                      className="w-4 h-4 accent-orange-500 rounded-none cursor-pointer"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-5 rounded-none bg-orange-500 hover:bg-orange-400 text-black font-bold text-xs uppercase tracking-widest transition"
                >
                  Создать трансляцию
                </button>
              </form>
            )}

            {/* Tab 3: Join Stream */}
            {activeTab === 'join' && (
              <form onSubmit={handleJoinSubmit} className="p-6 bg-black border border-white/10 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest">// ПОДКЛЮЧЕНИЕ К СЕССИИ</h3>
                  <p className="text-[11px] text-neutral-400">Вставьте ID комнаты или ссылку трансляции.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400">Код комнаты или URL</label>
                    <input
                      type="text"
                      required
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value)}
                      placeholder="Код комнаты (например, 7xk29p)"
                      className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-white/10 text-neutral-200 text-xs focus:outline-none focus:border-orange-500 transition"
                    />
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-neutral-950 border border-white/5">
                    <span className="text-[10px] uppercase text-neutral-400">Режим зрителя (только просмотр)</span>
                    <input
                      type="checkbox"
                      checked={joinAsViewer}
                      onChange={(e) => setJoinAsViewer(e.target.checked)}
                      className="w-4 h-4 accent-orange-500 rounded-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400">Пароль (если требуется)</label>
                    <input
                      type="password"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder="Пароль от приватной комнаты"
                      className="mt-1 w-full px-3 py-2 bg-neutral-950 border border-white/10 text-neutral-200 text-xs focus:outline-none focus:border-orange-500 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-5 rounded-none bg-orange-500 hover:bg-orange-400 text-black font-bold text-xs uppercase tracking-widest transition"
                >
                  Войти в комнату
                </button>
              </form>
            )}
          </div>

          {/* Right Live Camera Hardware Preview Card */}
          <div className="lg:col-span-5">
            <div className="relative bg-black border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> [ ТЕСТ ОБОРУДОВАНИЯ ]
                </span>
                <span className="text-[9px] text-orange-400">
                  {hasPermission ? '● READY' : 'WAITING'}
                </span>
              </div>

              {/* Video Preview Box */}
              <div className="relative aspect-video rounded-none bg-neutral-950 overflow-hidden border border-white/10 flex items-center justify-center">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover video-mirror"
                />

                {!hasPermission && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/95 space-y-3">
                    <div className="w-10 h-10 border border-orange-500/30 flex items-center justify-center text-orange-500">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-neutral-200 uppercase">ТРЕБУЕТСЯ ДОСТУП К КАМЕРЕ</p>
                      <p className="text-[10px] text-neutral-400 mt-1 max-w-[200px] mx-auto">Предоставьте доступ к камере и микрофону в вашем браузере.</p>
                    </div>
                    <button
                      onClick={() => startPreview()}
                      className="px-3 py-1.5 rounded-none bg-orange-500 hover:bg-orange-400 text-black text-[10px] font-bold uppercase transition"
                    >
                      Предоставить доступ
                    </button>
                  </div>
                )}

                {/* Audio Level Overlay */}
                {hasPermission && (
                  <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 px-3 py-1.5 bg-black/90 border border-white/10">
                    <Mic className={`w-3.5 h-3.5 ${isSpeaking ? 'text-orange-500' : 'text-neutral-500'}`} />
                    <AudioLevelMeter level={audioLevel} isSpeaking={isSpeaking} className="flex-1" />
                    <span className="text-[9px] font-bold text-neutral-400">
                      {isSpeaking ? 'ACTIVE' : 'MUTED'}
                    </span>
                  </div>
                )}
              </div>

              {/* Live AI Feature Spotlight */}
              <div className="p-3 bg-neutral-950 border border-orange-500/20 space-y-1 text-[11px]">
                <div className="flex items-center gap-1.5 text-orange-400 font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>АВТОНОМНЫЙ ИИ-НАБЛЮДАТЕЛЬ</span>
                </div>
                <p className="text-neutral-400 leading-relaxed text-[10px]">
                  Подключается непосредственно к WebRTC видеопотоку, видит происходящее, генерирует события, отвечает зрителям на любые вопросы о трансляции.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Online Streams Section */}
      <section className="max-w-6xl w-full mx-auto px-4 py-12 border-t border-white/10 font-mono">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Active Streams Column */}
          <div className={`${user ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-6`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-orange-500">// АКТИВНЫЕ ТРАНСЛЯЦИИ</span>
                <span className="text-[9px] px-1.5 py-0.5 border border-orange-500/30 text-orange-400">LIVE</span>
              </div>
              <button 
                onClick={fetchActiveRooms}
                disabled={isLoadingRooms}
                className="p-1.5 border border-white/10 text-neutral-400 hover:text-white transition"
              >
                <Radio className={`w-3.5 h-3.5 ${isLoadingRooms ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {activeRooms.length === 0 ? (
              <div className="p-12 border border-dashed border-white/10 text-center space-y-3">
                <div className="w-12 h-12 mx-auto border border-white/5 flex items-center justify-center text-neutral-600">
                  <Video className="w-6 h-6 opacity-40" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase">НЕТ ПУБЛИЧНЫХ ТРАНСЛЯЦИЙ</h4>
                  <p className="text-[10px] text-neutral-500">Запустите первый стрим в режиме «Публичная комната».</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeRooms.map((room) => (
                  <StreamerWindow 
                    key={room.id}
                    room={room}
                    onClick={() => onJoinRoom(room.id, true)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* User Dashboard Column (if logged in) */}
          {user && (
            <div className="lg:col-span-4 space-y-6">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-orange-500">// НАГРАДЫ И ДОСТИЖЕНИЯ</span>
              </div>
              <div className="h-[600px] border border-white/10">
                <UserDashboard />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-white/10 bg-black text-center text-[11px] text-neutral-500 font-mono">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>BEAMLIVE WEBRTC CORE • MULTI-CAMERA BROADCAST • OBS & RTSP INGEST</span>
          <span className="text-orange-500">[ STUN: stun.l.google.com:19302 ]</span>
        </div>
      </footer>
    </div>
  );
};
