import React, { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Share2,
  Settings,
  PhoneOff,
  Circle,
  Radio,
  VideoIcon,
  MessageSquare,
  SwitchCamera,
  Sparkles,
  Camera,
  Layers,
  ChevronUp
} from 'lucide-react';
import { CameraDeviceInfo } from '../services/webrtcManager';

interface MediaControlsProps {
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isScreenSharing: boolean;
  hasSecondaryCamera?: boolean;
  isRecording: boolean;
  recordingStartTime?: number;
  facingMode?: 'user' | 'environment';
  availableCameras?: CameraDeviceInfo[];
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleScreenShare: () => void;
  onToggleSecondaryCamera?: () => void;
  onToggleRecording: () => void;
  onSwitchCamera?: () => void;
  onSelectCamera?: (deviceId: string) => void;
  onOpenSettings: () => void;
  onOpenShare: () => void;
  onOpenOBSGuide: () => void;
  onOpenRTSPBridge: () => void;
  onToggleAIAgent?: () => void;
  onToggleChat?: () => void;
  unreadChatCount?: number;
  onLeave: () => void;
  isMobile?: boolean;
}

export const MediaControls: React.FC<MediaControlsProps> = ({
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  hasSecondaryCamera = false,
  isRecording,
  recordingStartTime = 0,
  facingMode = 'user',
  availableCameras = [],
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleSecondaryCamera,
  onToggleRecording,
  onSwitchCamera,
  onSelectCamera,
  onOpenSettings,
  onOpenShare,
  onOpenOBSGuide,
  onOpenRTSPBridge,
  onToggleAIAgent,
  onToggleChat,
  unreadChatCount = 0,
  onLeave
}) => {
  const [recordDuration, setRecordDuration] = useState('00:00');
  const [isCameraMenuOpen, setIsCameraMenuOpen] = useState(false);

  useEffect(() => {
    let interval: any;
    if (isRecording && recordingStartTime > 0) {
      interval = setInterval(() => {
        const diff = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(diff / 60).toString().padStart(2, '0');
        const secs = (diff % 60).toString().padStart(2, '0');
        setRecordDuration(`${mins}:${secs}`);
      }, 1000);
    } else {
      setRecordDuration('00:00');
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingStartTime]);

  const handleCameraFlip = () => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch (e) {
        // ignore
      }
    }
    onSwitchCamera?.();
  };

  return (
    <div className="fixed bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-auto max-w-[98vw] px-1 font-mono">
      {/* Mobile Camera Device Quick Switcher Popover */}
      {isCameraMenuOpen && availableCameras.length > 0 && (
        <div className="mb-2 p-2 rounded-none bg-black/95 border border-white/10 backdrop-blur-xl shadow-2xl flex flex-col gap-1 max-w-xs animate-in slide-in-from-bottom duration-150">
          <div className="px-2 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
            <span>SELECT CAMERA</span>
            <button
              onClick={() => setIsCameraMenuOpen(false)}
              className="text-neutral-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
          {availableCameras.map((cam) => (
            <button
              key={cam.deviceId}
              onClick={() => {
                onSelectCamera?.(cam.deviceId);
                setIsCameraMenuOpen(false);
              }}
              className="px-2.5 py-1.5 rounded-none text-left text-xs text-neutral-200 hover:bg-orange-500/10 hover:text-orange-400 transition flex items-center justify-between"
            >
              <span className="truncate pr-2">{cam.label}</span>
              {cam.isFront && <span className="text-[9px] px-1 py-0.5 border border-orange-500/20 text-orange-400 shrink-0">FRONT</span>}
              {cam.isBack && <span className="text-[9px] px-1 py-0.5 border border-white/20 text-neutral-300 shrink-0">REAR</span>}
            </button>
          ))}
        </div>
      )}

      {/* Main Controls Dock */}
      <div className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-4 sm:py-2.5 rounded-none bg-black/90 border border-white/20 backdrop-blur-2xl shadow-2xl">
        {/* Microphone Toggle */}
        <button
          onClick={onToggleAudio}
          className={`p-2.5 sm:p-3 rounded-none flex items-center justify-center transition-all ${
            isAudioMuted
              ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30'
              : 'bg-neutral-900 text-neutral-100 hover:bg-neutral-800 border border-white/10'
          }`}
          title={isAudioMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {isAudioMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Camera Toggle */}
        <button
          onClick={onToggleVideo}
          className={`p-2.5 sm:p-3 rounded-none flex items-center justify-center transition-all ${
            isVideoMuted
              ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30'
              : 'bg-neutral-900 text-neutral-100 hover:bg-neutral-800 border border-white/10'
          }`}
          title={isVideoMuted ? 'Включить основную камеру' : 'Выключить камеру'}
        >
          {isVideoMuted ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Flip Front / Rear Camera with Active Facing Badge */}
        {onSwitchCamera && (
          <div className="relative flex items-center">
            <button
              onClick={handleCameraFlip}
              className="p-2.5 sm:p-3 rounded-none bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10 transition flex items-center gap-1.5 shadow-sm active:scale-95"
              title={`Переключить камеру (сейчас: ${facingMode === 'user' ? 'Фронтальная / Селфи' : 'Задняя / Основная'})`}
            >
              <SwitchCamera className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                {facingMode === 'user' ? 'SELF' : 'REAR'}
              </span>
            </button>

            {availableCameras.length > 1 && (
              <button
                onClick={() => setIsCameraMenuOpen(!isCameraMenuOpen)}
                className="hidden sm:flex -ml-2 p-1 bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition"
                title="Список доступных камер"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Secondary Camera (Multi-Camera / Dual-Cam Stream) */}
        {onToggleSecondaryCamera && (
          <button
            onClick={onToggleSecondaryCamera}
            className={`px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-none flex items-center gap-1.5 transition-all text-[11px] font-bold uppercase ${
              hasSecondaryCamera
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500'
                : 'bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10'
            }`}
            title={hasSecondaryCamera ? 'Отключить вторую камеру' : 'Включить 2-ю камеру'}
          >
            <Layers className="w-4 h-4 text-orange-400" />
            <span className="hidden md:inline">{hasSecondaryCamera ? '2 CAM (ON)' : '+ CAM 2'}</span>
          </button>
        )}

        {/* Screen Share */}
        <button
          onClick={onToggleScreenShare}
          className={`p-2.5 sm:p-3 rounded-none flex items-center justify-center transition-all ${
            isScreenSharing
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500'
              : 'bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10'
          }`}
          title={isScreenSharing ? 'Остановить показ экрана' : 'Поделиться экраном'}
        >
          <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Record Button */}
        <button
          onClick={onToggleRecording}
          className={`px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-none flex items-center gap-1.5 sm:gap-2 transition-all ${
            isRecording
              ? 'bg-orange-600 text-black font-mono animate-pulse border border-orange-500 font-bold'
              : 'bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10'
          }`}
          title={isRecording ? 'Остановить и скачать запись' : 'Начать запись стрима'}
        >
          <Circle className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRecording ? 'fill-black text-black' : 'text-orange-500 fill-orange-500'}`} />
          <span className="text-[11px] font-bold uppercase hidden sm:inline">
            {isRecording ? recordDuration : 'REC'}
          </span>
        </button>

        <div className="w-px h-5 sm:h-6 bg-white/10 mx-0.5 sm:mx-1"></div>

        {/* Live AI Agent / Observer Gemini button */}
        {onToggleAIAgent && (
          <button
            onClick={onToggleAIAgent}
            className="px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-none bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 transition flex items-center gap-1.5 text-[11px] font-bold uppercase"
            title="Gemini AI Observer"
          >
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="hidden sm:inline">AI OBSERVER</span>
          </button>
        )}

        {/* Share & Links */}
        <button
          onClick={onOpenShare}
          className="p-2.5 sm:p-3 rounded-none bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 transition flex items-center justify-center"
          title="Поделиться"
        >
          <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Live Chat */}
        {onToggleChat && (
          <button
            onClick={onToggleChat}
            className="relative p-2.5 sm:p-3 rounded-none bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10 transition flex items-center justify-center"
            title="Чат"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-black text-[10px] font-bold flex items-center justify-center">
                {unreadChatCount}
              </span>
            )}
          </button>
        )}

        {/* OBS / Ingest Tool (Desktop) */}
        <button
          onClick={onOpenOBSGuide}
          className="hidden md:flex p-2.5 sm:p-3 rounded-none bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10 transition items-center justify-center"
          title="OBS"
        >
          <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
        </button>

        {/* RTSP Bridge (Desktop) */}
        <button
          onClick={onOpenRTSPBridge}
          className="hidden md:flex p-2.5 sm:p-3 rounded-none bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10 transition items-center justify-center"
          title="RTSP Bridge"
        >
          <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-2.5 sm:p-3 rounded-none bg-neutral-900 text-neutral-300 hover:text-white hover:bg-neutral-800 border border-white/10 transition flex items-center justify-center"
          title="Настройки"
        >
          <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Leave */}
        <button
          onClick={onLeave}
          className="p-2.5 sm:p-3 rounded-none bg-orange-600 hover:bg-orange-500 text-black border border-orange-500 transition flex items-center justify-center shadow-lg"
          title="Выйти"
        >
          <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
};
