import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  VideoOff,
  Activity,
  Tv,
  Monitor,
  Camera,
  Sparkles,
  Focus,
  Camera as SnapshotIcon,
  FlipHorizontal,
  Scan,
  Maximize,
  Minimize,
  Eye,
  EyeOff
} from 'lucide-react';
import { ConnectionQuality, WebRTCStats, ChatReaction } from '../types/webrtc';
import { AudioLevelMeter } from './AudioLevelMeter';
import { AudioMeter } from '../services/audioMeter';
import { LiveReactionsOverlay } from './LiveReactionsOverlay';

interface VideoPlayerProps {
  stream?: MediaStream | null;
  displayName: string;
  isLocal?: boolean;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isScreenShare?: boolean;
  isSecondaryCamera?: boolean;
  streamBadge?: string;
  connectionQuality?: ConnectionQuality;
  stats?: WebRTCStats;
  onOpenStats?: () => void;
  onFocus?: () => void;
  className?: string;
  isHighlighted?: boolean;
  isFocused?: boolean;
  mirrored?: boolean;
  showControls?: boolean;
  isTranslucentHud?: boolean;
  reactions?: ChatReaction[];
  handRaised?: boolean;
  videoRefCallback?: (el: HTMLVideoElement | null) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  stream,
  displayName,
  isLocal = false,
  isAudioMuted = false,
  isVideoMuted = false,
  isScreenShare = false,
  isSecondaryCamera = false,
  streamBadge,
  connectionQuality = 'excellent',
  stats,
  onOpenStats,
  onFocus,
  className = '',
  isHighlighted = false,
  isFocused = false,
  mirrored = false,
  showControls = true,
  isTranslucentHud = false,
  reactions = [],
  handRaised = false,
  videoRefCallback
}) => {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMirroredState, setIsMirroredState] = useState(mirrored);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  // Default to contain (fit full screen) for screen sharing so code and window bounds are never cropped
  const [objectFitContain, setObjectFitContain] = useState(Boolean(isScreenShare));
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [isPiPActive, setIsPiPActive] = useState(false);
  const audioMeterRef = useRef<AudioMeter | null>(null);

  useEffect(() => {
    setIsMirroredState(mirrored);
  }, [mirrored]);

  useEffect(() => {
    if (isScreenShare) {
      setObjectFitContain(true);
    }
  }, [isScreenShare]);

  useEffect(() => {
    const video = internalVideoRef.current;
    if (!video) return;

    let isSubscribed = true;

    const handleLoadedMetadata = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('resize', handleLoadedMetadata);
    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    if (stream) {
      video.srcObject = stream;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== 'AbortError' && isSubscribed) {
            console.warn('Воспроизведение видео:', err);
          }
        });
      }
    } else {
      video.srcObject = null;
    }

    return () => {
      isSubscribed = false;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('resize', handleLoadedMetadata);
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
      if (video) {
        try {
          video.pause();
        } catch (e) {
          // ignore
        }
        video.srcObject = null;
      }
    };
  }, [stream]);

  useEffect(() => {
    if (videoRefCallback) {
      videoRefCallback(internalVideoRef.current);
    }
  }, [videoRefCallback]);

  // Audio meter initialization on the stream
  useEffect(() => {
    if (stream && !isAudioMuted) {
      audioMeterRef.current = new AudioMeter((level, speaking) => {
        setAudioLevel(level);
        setIsSpeaking(speaking);
      });
      audioMeterRef.current.attachStream(stream);
    } else {
      audioMeterRef.current?.detach();
      setAudioLevel(0);
      setIsSpeaking(false);
    }

    return () => {
      audioMeterRef.current?.destroy();
      audioMeterRef.current = null;
    };
  }, [stream, isAudioMuted]);

  const toggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen()
          .then(() => setIsFullscreen(true))
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('Fullscreen notice:', err);
            }
          });
      } else {
        document.exitFullscreen()
          .then(() => setIsFullscreen(false))
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('Exit fullscreen notice:', err);
            }
          });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Fullscreen notice:', err);
      }
    }
  };

  const togglePiP = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!internalVideoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await internalVideoRef.current.requestPictureInPicture();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Картинка в картинке:', err);
      }
    }
  };

  const takeSnapshot = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!internalVideoRef.current) return;
    try {
      const video = internalVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (isMirroredState && !isScreenShare) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `beamlive-stream-${Date.now()}.jpg`;
        a.click();
        setSnapshotSuccess(true);
        setTimeout(() => setSnapshotSuccess(false), 2000);
      }
    } catch (err) {
      console.warn('Snapshot error:', err);
    }
  };

  const handleContainerClick = () => {
    if (onFocus) {
      onFocus();
    }
  };

  const getQualityBadge = (quality: ConnectionQuality) => {
    switch (quality) {
      case 'excellent':
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-400"><span className="w-1.5 h-1.5 rounded-none bg-orange-400"></span>EXCELLENT</span>;
      case 'good':
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white"><span className="w-1.5 h-1.5 rounded-none bg-white"></span>GOOD</span>;
      case 'poor':
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600"><span className="w-1.5 h-1.5 rounded-none bg-orange-600"></span>POOR</span>;
      case 'reconnecting':
        return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-500 animate-pulse"><span className="w-1.5 h-1.5 rounded-none bg-orange-500"></span>RECONN</span>;
      default:
        return null;
    }
  };

  const hudGlassClasses = isTranslucentHud
    ? 'bg-black/60 border-orange-500/30 hover:border-orange-500/60 transition-all duration-300 shadow-xl'
    : 'bg-black border border-orange-500/30 shadow-md';

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`group relative bg-black rounded-none overflow-hidden border transition-all duration-300 flex items-center justify-center cursor-pointer ${
        isFocused
          ? 'border-orange-500 ring-1 ring-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.15)]'
          : isSpeaking
          ? 'border-white ring-1 ring-white/20'
          : handRaised
          ? 'border-orange-500 ring-1 ring-orange-500/30 animate-pulse'
          : isHighlighted
          ? 'border-orange-500/60 ring-1 ring-orange-500/30'
          : 'border-white/10 hover:border-orange-500/30'
      } ${className} font-mono`}
    >
      {/* Technical HUD Corner viewfinders */}
      <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-orange-500 pointer-events-none z-10" />
      <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-orange-500 pointer-events-none z-10" />
      <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-orange-500 pointer-events-none z-10" />
      <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-orange-500 pointer-events-none z-10" />

      {/* Video Element */}
      <video
        ref={internalVideoRef}
        autoPlay
        playsInline
        muted={isLocal} // Always mute local to prevent audio feedback
        className={`w-full h-full select-none transition-all duration-200 ${
          objectFitContain ? 'object-contain bg-black' : 'object-cover'
        } ${
          isMirroredState && !isScreenShare ? 'scale-x-[-1]' : ''
        } ${isVideoMuted ? 'opacity-0' : 'opacity-100'}`}
      />

      {/* Floating Live Reaction Emojis Overlay */}
      {reactions && reactions.length > 0 && (
        <LiveReactionsOverlay reactions={reactions} />
      )}

      {/* Video Off Fallback Avatar */}
      {isVideoMuted && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-4 font-mono">
          <div className="w-16 h-16 rounded-none bg-neutral-950 border border-white/10 flex items-center justify-center text-xl font-bold text-neutral-300">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="mt-3 flex items-center gap-2 text-neutral-400 text-xs font-medium uppercase tracking-wider">
            <VideoOff className="w-3.5 h-3.5 text-neutral-500" />
            Камера выключена
          </div>
        </div>
      )}

      {/* Top Overlay HUD (Translucent Modal Box) */}
      <div className={`absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10 transition-opacity duration-300 font-mono ${hudVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="flex items-center gap-2">
          {/* Hand Raised Indicator */}
          {handRaised && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-none bg-orange-500 text-black border border-orange-600 text-[10px] font-bold tracking-wider uppercase shadow-md">
              <span>✋ ASK WORD</span>
            </div>
          )}

          {/* Live Indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none border shadow-sm ${hudGlassClasses}`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-none h-2 w-2 bg-orange-500"></span>
            </span>
            <span className="text-[10px] font-bold tracking-wider uppercase text-orange-400">
              LIVE
            </span>
          </div>

          {/* Resolution Badge */}
          {videoDimensions && !isVideoMuted && (
            <div className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-none border text-[10px] text-neutral-300 ${hudGlassClasses}`}>
              <span className="font-bold text-orange-400">
                {videoDimensions.height >= 1080 ? '1080p' : videoDimensions.height >= 720 ? '720p' : `${videoDimensions.height}p`}
              </span>
              <span className="text-neutral-500">•</span>
              <span>{videoDimensions.width}×{videoDimensions.height}</span>
            </div>
          )}

          {/* Badge for Screen or Extra Camera */}
          {isScreenShare && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-none bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-semibold backdrop-blur-md">
              <Monitor className="w-3 h-3" />
              <span>SCREEN</span>
              <span className="text-[9px] text-orange-300 opacity-80 font-normal">
                {objectFitContain ? '(FIT)' : '(FILL)'}
              </span>
            </div>
          )}

          {isSecondaryCamera && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-none bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-semibold backdrop-blur-md">
              <Camera className="w-3 h-3" />
              <span>{streamBadge || 'CAM 2'}</span>
            </div>
          )}

          {/* Stats quick pill */}
          {stats && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenStats) onOpenStats();
              }}
              className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-none border text-neutral-300 text-[11px] transition ${hudGlassClasses}`}
              title="Статистика сети WebRTC"
            >
              <Activity className="w-3 h-3 text-orange-400" />
              <span>{stats.rtt}MS</span>
              <span className="text-neutral-500">•</span>
              <span>{(stats.bitrate / 1000).toFixed(1)}MB</span>
              <span className="text-neutral-500">•</span>
              <span>{stats.fps}FPS</span>
            </button>
          )}
        </div>

        {/* Quality Indicator */}
        <div className={`hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-none border ${hudGlassClasses}`}>
          {getQualityBadge(connectionQuality)}
        </div>
      </div>

      {/* Bottom Overlay Info & Controls (Translucent Floating Pill Bar) */}
      <div className={`absolute bottom-3 left-3 right-3 flex items-center justify-between z-10 transition-opacity duration-300 font-mono ${hudVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        {/* Name Tag & Audio Status */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-none border max-w-[65%] ${hudGlassClasses}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {isAudioMuted ? (
              <MicOff className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            ) : (
              <Mic className={`w-3.5 h-3.5 shrink-0 ${isSpeaking ? 'text-orange-400' : 'text-neutral-400'}`} />
            )}
            <span className="text-xs font-bold text-neutral-100 truncate">
              {displayName} {isLocal && <span className="text-orange-500 font-normal">[YOU]</span>}
            </span>
          </div>

          {/* Audio level meter */}
          {!isAudioMuted && (
            <AudioLevelMeter
              level={audioLevel}
              isSpeaking={isSpeaking}
              className="w-12 ml-1"
            />
          )}
        </div>

        {/* Action Controls (Fit/Cover, Fullscreen, PiP, Snapshot, Mirror) */}
        {showControls && (
          <div className="flex items-center gap-1.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
            {/* Aspect Ratio Fit/Cover Toggle (Entire Screen vs Fill) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setObjectFitContain(!objectFitContain);
              }}
              className={`p-2 rounded-none border backdrop-blur-md transition shadow-md ${
                objectFitContain
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                  : 'bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border-white/10'
              }`}
              title={objectFitContain ? 'Fit' : 'Fill'}
            >
              <Scan className="w-4 h-4" />
            </button>

            {/* Mirror Toggle (for webcam) */}
            {!isScreenShare && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMirroredState(!isMirroredState);
                }}
                className={`p-2 rounded-none border backdrop-blur-md transition shadow-md ${
                  isMirroredState
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                    : 'bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border-white/10'
                }`}
                title="Mirror"
              >
                <FlipHorizontal className="w-4 h-4" />
              </button>
            )}

            {/* Snapshot */}
            <button
              onClick={takeSnapshot}
              className={`p-2 rounded-none border backdrop-blur-md transition shadow-md ${
                snapshotSuccess
                  ? 'bg-orange-500 text-black border-orange-600'
                  : 'bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border-white/10'
              }`}
              title="Snapshot"
            >
              <SnapshotIcon className="w-4 h-4" />
            </button>

            {onFocus && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFocus();
                }}
                className={`p-2 rounded-none border backdrop-blur-md transition shadow-md ${
                  isFocused
                    ? 'bg-orange-500 text-black border-orange-600'
                    : 'bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border-white/10'
                }`}
                title="Focus"
              >
                <Focus className="w-4 h-4" />
              </button>
            )}

            {onOpenStats && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStats();
                }}
                className="p-2 rounded-none bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border border-white/10 backdrop-blur-md transition shadow-md"
                title="Stats"
              >
                <Activity className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={togglePiP}
              className="p-2 rounded-none bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border border-white/10 backdrop-blur-md transition shadow-md"
              title="PiP"
            >
              <Tv className="w-4 h-4" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-none bg-black hover:bg-neutral-900 text-neutral-300 hover:text-white border border-white/10 backdrop-blur-md transition shadow-md"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
