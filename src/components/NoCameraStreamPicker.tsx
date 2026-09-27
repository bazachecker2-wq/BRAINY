import React, { useEffect, useState } from 'react';
import {
  CameraOff,
  Radio,
  Shuffle,
  Users,
  Clock,
  RefreshCw,
  Monitor,
  ExternalLink,
  Flame,
  Sparkles,
  Play
} from 'lucide-react';

interface StreamerRoomInfo {
  roomId: string;
  name: string;
  category?: string;
  topic?: string;
  participantCount: number;
  publishersCount: number;
  viewersCount: number;
  hasLiveVideo?: boolean;
}

interface NoCameraStreamPickerProps {
  currentRoomId: string;
  isBroadcaster?: boolean;
  onRetryCamera?: () => void;
  onStartScreenShare?: () => void;
  onStartDemoStream?: () => void;
  onNavigateToRoom?: (roomId: string, asViewer?: boolean) => void;
}

export const NoCameraStreamPicker: React.FC<NoCameraStreamPickerProps> = ({
  currentRoomId,
  isBroadcaster = false,
  onRetryCamera,
  onStartScreenShare,
  onStartDemoStream,
  onNavigateToRoom
}) => {
  const [activeRooms, setActiveRooms] = useState<StreamerRoomInfo[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isWaitingMode, setIsWaitingMode] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);

  useEffect(() => {
    fetchActiveRooms();
  }, [currentRoomId]);

  useEffect(() => {
    let interval: any = null;
    if (isWaitingMode) {
      interval = setInterval(() => {
        setWaitingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setWaitingSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isWaitingMode]);

  const fetchActiveRooms = async () => {
    setIsLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        // filter out current room
        const filtered = data.rooms.filter((r: StreamerRoomInfo) => r.roomId !== currentRoomId);
        setActiveRooms(filtered);
      }
    } catch (e) {
      console.warn('Failed to fetch rooms list', e);
    } finally {
      setIsLoadingRooms(false);
    }
  };

  const handleRandomStreamer = async () => {
    try {
      const res = await fetch(`/api/rooms-random?exclude=${currentRoomId}`);
      const data = await res.json();
      if (data.success && data.targetRoomId) {
        if (onNavigateToRoom) {
          onNavigateToRoom(data.targetRoomId, !isBroadcaster);
        } else {
          window.location.href = isBroadcaster ? `/room/${data.targetRoomId}` : `/view/${data.targetRoomId}`;
        }
      }
    } catch (e) {
      if (activeRooms.length > 0) {
        const randomRoom = activeRooms[Math.floor(Math.random() * activeRooms.length)];
        if (onNavigateToRoom) {
          onNavigateToRoom(randomRoom.roomId, !isBroadcaster);
        } else {
          window.location.href = isBroadcaster ? `/room/${randomRoom.roomId}` : `/view/${randomRoom.roomId}`;
        }
      }
    }
  };

  const handleSelectRoom = (roomId: string) => {
    if (onNavigateToRoom) {
      onNavigateToRoom(roomId, !isBroadcaster);
    } else {
      window.location.href = isBroadcaster ? `/room/${roomId}` : `/view/${roomId}`;
    }
  };

  if (isWaitingMode) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto my-auto animate-in fade-in zoom-in-95 duration-300">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping"></div>
            <Radio className="w-10 h-10 text-rose-500 animate-pulse" />
          </div>
          <div className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full bg-neutral-900 border border-white/10 text-[11px] font-mono text-amber-300 shadow">
            {Math.floor(waitingSeconds / 60)}:{(waitingSeconds % 60).toString().padStart(2, '0')}
          </div>
        </div>

        <h2 className="text-2xl font-black text-white tracking-tight">Ожидание подключения стримера</h2>
        <p className="text-sm text-neutral-400 mt-2 max-w-md leading-relaxed">
          Вы находитесь в комнате <span className="font-mono text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded">{currentRoomId}</span>. 
          Как только ведущий включит камеру или экран, трансляция начнется мгновенно с ультра-низкой задержкой.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setIsWaitingMode(false)}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition border border-white/10"
          >
            Показать других стримеров
          </button>

          <button
            onClick={handleRandomStreamer}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold transition shadow-lg shadow-rose-600/20 flex items-center gap-2"
          >
            <Shuffle className="w-4 h-4" />
            <span>Перейти к случайному стримеру</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-center p-4 sm:p-6 max-w-4xl mx-auto w-full overflow-y-auto">
      {/* Alert Header Box */}
      <div className="p-6 rounded-3xl bg-neutral-900/90 border border-white/10 shadow-2xl backdrop-blur-xl relative overflow-hidden mb-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-lg shadow-rose-500/10">
              <CameraOff className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-xs font-bold tracking-wider uppercase">
                  {isBroadcaster ? 'Камера не активна' : 'Нет видеопотока'}
                </span>
                <span className="text-xs text-neutral-500 font-mono">Комната: {currentRoomId}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                {isBroadcaster
                  ? 'Камера не обнаружена или отключена'
                  : 'Стример пока не включил камеру'}
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1 max-w-xl">
                {isBroadcaster
                  ? 'Предоставьте разрешение браузера на камеру, включите демонстрацию экрана или воспользуйтесь тестовым видеосигналом.'
                  : 'Вы можете остаться в комнате и дождаться начала эфира, либо переключиться на других активных стримеров.'}
              </p>
            </div>
          </div>

          {/* Quick Choice Buttons */}
          <div className="flex flex-wrap md:flex-col gap-2.5 w-full md:w-auto shrink-0">
            {!isBroadcaster && (
              <button
                onClick={() => setIsWaitingMode(true)}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold border border-white/10 flex items-center justify-center gap-2 transition"
              >
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Ждать в этой комнате</span>
              </button>
            )}

            <button
              onClick={handleRandomStreamer}
              className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-md shadow-rose-600/20"
            >
              <Shuffle className="w-4 h-4" />
              <span>Случайный стример 🎲</span>
            </button>

            {isBroadcaster && onRetryCamera && (
              <button
                onClick={onRetryCamera}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Повторить запуск камеры</span>
              </button>
            )}

            {isBroadcaster && onStartScreenShare && (
              <button
                onClick={onStartScreenShare}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold border border-white/10 flex items-center justify-center gap-2 transition"
              >
                <Monitor className="w-4 h-4 text-cyan-400" />
                <span>Показать экран</span>
              </button>
            )}

            {onStartDemoStream && (
              <button
                onClick={onStartDemoStream}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold border border-white/10 flex items-center justify-center gap-2 transition"
                title="Запустить встроенный тестовый генератор видеопотока (SMPTE Test Bars)"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                <span>Тестовый видеопоток</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Explore Other Streamers Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500" />
            <h3 className="text-base font-bold text-white">Другие активные трансляции и стримеры</h3>
          </div>
          <button
            onClick={fetchActiveRooms}
            disabled={isLoadingRooms}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-white/5 text-xs flex items-center gap-1.5 transition"
            title="Обновить список комнат"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRooms ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>

        {activeRooms.length === 0 ? (
          <div className="p-8 rounded-2xl bg-neutral-900/40 border border-white/5 text-center">
            <p className="text-xs text-neutral-400">В данный момент нет других комнат. Вы можете создать новую трансляцию или подождать стримера здесь.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3.5">
            {activeRooms.map((room) => (
              <div
                key={room.roomId}
                onClick={() => handleSelectRoom(room.roomId)}
                className="group p-4 rounded-2xl bg-neutral-900/70 hover:bg-neutral-850 border border-white/5 hover:border-rose-500/40 transition duration-200 cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-lg hover:shadow-rose-500/5 relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                      <h4 className="font-bold text-sm text-white group-hover:text-rose-300 transition">
                        {room.name}
                      </h4>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
                      {room.topic || `Трансляция в комнате ${room.roomId}`}
                    </p>
                  </div>

                  {room.category && (
                    <span className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-neutral-300 shrink-0 font-medium">
                      {room.category}
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-neutral-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{room.participantCount || 1} зрителей</span>
                    </span>
                    <span className="font-mono text-neutral-500">/{room.roomId}</span>
                  </div>

                  <span className="flex items-center gap-1 text-rose-400 font-semibold group-hover:translate-x-0.5 transition">
                    <span>Смотреть</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
