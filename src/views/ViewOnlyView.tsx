import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SignalingClient } from '../services/signaling';
import { WebRTCManager } from '../services/webrtcManager';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import {
  AIStreamEvent,
  ChatMessage,
  ChatReaction,
  PeerState,
  RoomPresenceData,
  WebRTCStats
} from '../types/webrtc';
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Tv,
  Activity,
  Radio,
  RefreshCw,
  Sparkles,
  LayoutGrid,
  Focus,
  Monitor,
  Camera,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeft,
  Eye,
  EyeOff,
  MessageSquare,
  Users,
  Smile,
  Clapperboard,
  Film
} from 'lucide-react';
import { StatsModal } from '../components/StatsModal';
import { AIObserverPanel } from '../components/AIObserverPanel';
import { StreamChatPanel } from '../components/StreamChatPanel';
import { NoCameraStreamPicker } from '../components/NoCameraStreamPicker';
import { VideoPlayer } from '../components/VideoPlayer';

interface ViewOnlyViewProps {
  roomId: string;
  password?: string;
  onNavigateToRoom?: (targetRoomId: string, asViewer?: boolean) => void;
}

interface ViewerStreamCard {
  id: string;
  stream: MediaStream;
  displayName: string;
  isScreenShare: boolean;
  isSecondaryCamera: boolean;
  streamBadge: string;
  peerId: string;
}

const QUICK_EMOJIS = ['🔥', '❤️', '👏', '🚀', '🎉', '💡', '💯', '🤯'];

export const ViewOnlyView: React.FC<ViewOnlyViewProps> = ({
  roomId,
  password,
  onNavigateToRoom
}) => {
  const [user] = useAuthState(auth);
  const [remotePeers, setRemotePeers] = useState<PeerState[]>([]);
  const [stats, setStats] = useState<WebRTCStats | undefined>();
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coHostInvite, setCoHostInvite] = useState<{ fromPeerId: string; fromDisplayName: string } | null>(null);

  // Video layout & display controls
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  // Chat & Presence State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<RoomPresenceData | null>(null);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [currentDisplayName, setCurrentDisplayName] = useState<string>(() => {
    return `Зритель-${Math.random().toString(36).substring(2, 6)}`;
  });

  // Sidebar Controls
  // Active tab: 'chat' | 'ai'
  const [activeSidebarTab, setActiveSidebarTab] = useState<'chat' | 'ai'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarDocked, setIsSidebarDocked] = useState(true);

  // AI Observer Events
  const [streamEvents, setStreamEvents] = useState<AIStreamEvent[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const activeVideoElementsMap = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    let isCancelled = false;

    async function initViewer() {
      try {
        setConnectionStatus('connecting');
        const signaling = new SignalingClient();
        signalingRef.current = signaling;

        signaling.onStatusChange((status) => {
          if (!isCancelled) setConnectionStatus(status);
        });

        await signaling.connect();

        // Check room mode / password from database before joining
        try {
          const roomSnap = await getDoc(doc(db, 'rooms', roomId));
          if (roomSnap.exists()) {
            const data = roomSnap.data();
            if (data && data.isPrivate) {
              const allowedUsers = data.allowed || data.invitedUsers || [];
              if (!user || !user.uid || !allowedUsers.includes(user.uid)) {
                if (!isCancelled) {
                  setErrorMessage('Доступ ограничен: вас нет в списке разрешенных участников.');
                  setConnectionStatus('error');
                }
                return;
              }
            }
          }
        } catch (dbErr) {
          console.warn('Room access check skipped or failed:', dbErr);
        }

        const webrtc = new WebRTCManager(roomId, 'viewer', currentDisplayName, signaling);
        managerRef.current = webrtc;
        setCurrentDisplayName(webrtc.displayName);

        webrtc.subscribeCoHostInvite((payload) => {
          if (!isCancelled) {
            setCoHostInvite(payload);
          }
        });

        webrtc.subscribePeers((peers) => {
          if (!isCancelled) {
            setRemotePeers(peers);
          }
        });

        webrtc.subscribeStats((_peerId, polledStats) => {
          if (!isCancelled) {
            setStats(polledStats);
          }
        });

        // Chat messages broadcast
        signaling.on('chat:broadcast', (payload: ChatMessage) => {
          if (!isCancelled) {
            setChatMessages((prev) => [...prev, payload]);
            if (!isSidebarOpen || activeSidebarTab !== 'chat') {
              setUnreadChatCount((count) => count + 1);
            }
          }
        });

        // Live reactions broadcast
        signaling.on('chat:reaction', (payload: ChatReaction) => {
          if (!isCancelled) {
            setReactions((prev) => [...prev.slice(-20), payload]);
          }
        });

        // Room presence broadcast
        signaling.on('room:presence', (payload: RoomPresenceData) => {
          if (!isCancelled) {
            setPresence(payload);
          }
        });

        // Initial join response
        signaling.on('room:joined', (payload: any) => {
          if (!isCancelled && payload.chatHistory && Array.isArray(payload.chatHistory)) {
            setChatMessages(payload.chatHistory);
          }
        });

        signaling.send('room:join', {
          roomId,
          peerId: webrtc.peerId,
          displayName: webrtc.displayName,
          role: 'viewer',
          password
        });
      } catch (err) {
        console.error('Ошибка подключения зрителя:', err);
        if (!isCancelled) setConnectionStatus('error');
      }
    }

    initViewer();

    return () => {
      isCancelled = true;
      managerRef.current?.destroy();
      signalingRef.current?.close();
    };
  }, [roomId, password]);

  // Aggregate all parallel video feeds from broadcasters
  const allViewerStreams: ViewerStreamCard[] = [];

  remotePeers.forEach((p) => {
    if (p.stream) {
      allViewerStreams.push({
        id: `peer_${p.id}_cam1`,
        stream: p.stream,
        displayName: `${p.displayName} (Основная камера)`,
        isScreenShare: p.screenSharing,
        isSecondaryCamera: false,
        streamBadge: p.screenSharing ? 'ЭКРАН' : 'КАМЕРА 1',
        peerId: p.id
      });
    }

    if (p.extraStreams && p.extraStreams.length > 0) {
      p.extraStreams.forEach((ex, idx) => {
        allViewerStreams.push({
          id: `peer_${p.id}_ex_${ex.id}`,
          stream: ex.stream,
          displayName: `${p.displayName} (${ex.label})`,
          isScreenShare: ex.type === 'screen',
          isSecondaryCamera: ex.type === 'secondary-camera',
          streamBadge: ex.label || `КАМЕРА #${idx + 2}`,
          peerId: p.id
        });
      });
    }
  });

  const focusedStream = focusedStreamId ? allViewerStreams.find((s) => s.id === focusedStreamId) : null;

  // Frame capture for AI Vision in Viewer mode
  const getActiveFrameBase64 = useCallback((): string | null => {
    if (!managerRef.current) return null;

    let targetVideo: HTMLVideoElement | null = null;
    if (focusedStreamId && activeVideoElementsMap.current.has(focusedStreamId)) {
      targetVideo = activeVideoElementsMap.current.get(focusedStreamId)!;
    } else {
      const firstVideo = activeVideoElementsMap.current.values().next().value;
      targetVideo = firstVideo || null;
    }

    if (targetVideo) {
      return managerRef.current.captureFrameFromVideo(targetVideo);
    }
    return null;
  }, [focusedStreamId]);

  // Chat message send handler
  const handleSendMessage = (text: string) => {
    if (!managerRef.current) return;
    managerRef.current.sendChatMessage(text);
  };

  // Live emoji reaction handler
  const handleSendReaction = (emoji: string) => {
    if (!managerRef.current) return;
    managerRef.current.sendReaction(emoji);
  };

  // Nickname change handler
  const handleUpdateDisplayName = (newName: string) => {
    if (!managerRef.current) return;
    managerRef.current.updateDisplayName(newName);
    setCurrentDisplayName(newName);
  };

  const getGridClasses = (count: number) => {
    if (isTheaterMode) return 'grid-cols-1 w-full h-full';
    if (count <= 1) return 'grid-cols-1 max-w-5xl mx-auto';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-w-7xl mx-auto';
  };

  const currentViewersCount = presence?.viewersCount ?? remotePeers.filter((p) => p.role === 'viewer').length + 1;

  return (
    <div
      ref={containerRef}
      className="group relative h-screen w-screen bg-black text-white flex flex-col justify-between overflow-hidden select-none font-mono"
    >
      {/* Top HUD Overlay Header */}
      <header
        className="h-14 px-3 sm:px-6 border-b border-orange-500/20 bg-black/40 backdrop-blur-md transition-all duration-300 flex items-center justify-between shrink-0 z-30 font-mono rounded-none"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (onNavigateToRoom) onNavigateToRoom('');
              else window.location.href = '/';
            }}
            className="p-2 rounded-none bg-neutral-950/80 hover:bg-neutral-900 text-neutral-400 hover:text-orange-500 border border-orange-500/20 transition"
            title="На главную"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Live Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-orange-500/10 border border-orange-500/20 backdrop-blur-md shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-none h-2 w-2 bg-orange-500"></span>
            </span>
            <span className="text-xs font-bold tracking-wider uppercase text-orange-400">
              ПРЯМОЙ ЭФИР
            </span>
            <span className="font-mono text-neutral-400 text-xs font-bold ml-1">/{roomId}</span>
          </div>

          {/* Live Viewers Count Pill */}
          <button
            onClick={() => {
              setIsSidebarOpen(true);
              setActiveSidebarTab('chat');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-xs font-bold uppercase text-orange-400 backdrop-blur-md transition shadow-sm"
            title="Список зрителей и участников трансляции"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{currentViewersCount} ЗРИТ.</span>
          </button>

          {/* WebRTC Stats Button */}
          {stats && (
            <button
              onClick={() => setIsStatsOpen(true)}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-none bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-xs font-mono text-neutral-200 backdrop-blur-md transition shadow-sm"
              title="Статистика трансляции"
            >
              <Activity className="w-3.5 h-3.5 text-orange-400" />
              <span>{stats.rtt}мс</span>
              <span className="text-neutral-500">•</span>
              <span>{(stats.bitrate / 1000).toFixed(1)}М</span>
              <span className="text-neutral-500">•</span>
              <span>{stats.fps}fps</span>
            </button>
          )}

          {/* Theater Mode Toggle */}
          <button
            onClick={() => setIsTheaterMode(!isTheaterMode)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-none border text-xs font-bold uppercase transition ${
              isTheaterMode
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/35 shadow-sm'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 border-orange-500/20'
            }`}
            title="Режим кинотеатра: разворачивает видео на максимум"
          >
            <Film className="w-3.5 h-3.5 text-orange-400" />
            <span>{isTheaterMode ? 'КИНО: ВКЛ' : 'КИНОТЕАТР'}</span>
          </button>

          {/* Reset focus button */}
          {focusedStream && (
            <button
              onClick={() => setFocusedStreamId(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-neutral-950 hover:bg-neutral-900 border border-orange-500/20 text-xs font-bold uppercase backdrop-blur-md transition shadow-sm"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Все камеры</span>
            </button>
          )}
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2">
          {/* Chat & Viewers Toggle Button */}
          <button
            onClick={() => {
              if (isSidebarOpen && activeSidebarTab === 'chat') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setActiveSidebarTab('chat');
                setUnreadChatCount(0);
              }
            }}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-none border text-xs font-bold uppercase transition shadow-sm ${
              isSidebarOpen && activeSidebarTab === 'chat'
                ? 'bg-orange-500 text-black border-orange-600 shadow-md'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 border-orange-500/20'
            }`}
            title="Открыть чат и список участников"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Чат</span>
            {unreadChatCount > 0 && (
              <span className="w-4 h-4 rounded-none bg-orange-500 text-black text-[10px] flex items-center justify-center font-bold animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Live AI Observer Trigger */}
          <button
            onClick={() => {
              if (isSidebarOpen && activeSidebarTab === 'ai') {
                setIsSidebarOpen(false);
              } else {
                setIsSidebarOpen(true);
                setActiveSidebarTab('ai');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none border text-xs font-bold uppercase transition shadow-sm ${
              isSidebarOpen && activeSidebarTab === 'ai'
                ? 'bg-orange-500 text-black border-orange-600 shadow-md'
                : 'bg-neutral-950 hover:bg-neutral-900 text-orange-400 border-orange-500/20'
            }`}
            title="Открыть/скрыть ИИ-наблюдателя стрима"
          >
            <Sparkles className={`w-3.5 h-3.5 text-orange-400 ${isSidebarOpen && activeSidebarTab === 'ai' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">ИИ-Наблюдатель</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-none bg-neutral-950 border border-orange-500/20 text-xs text-neutral-300 backdrop-blur-md">
            <span className={`w-1.5 h-1.5 rounded-none ${connectionStatus === 'connected' ? 'bg-orange-400' : 'bg-neutral-500 animate-pulse'}`}></span>
            <span className="capitalize text-[10px] font-bold uppercase">{connectionStatus === 'connected' ? 'Онлайн' : 'Подключение...'}</span>
          </div>
        </div>
      </header>

      {/* Main Video Body + Docked Sidebar */}
      <div className="flex-1 flex overflow-hidden relative font-mono">
        <main
          className="absolute inset-0 w-full h-full z-0 p-2 sm:p-4 overflow-hidden flex flex-col justify-center bg-black"
        >
          {errorMessage && (
            <div className="m-3 p-3 bg-orange-500/10 border border-orange-500/20 text-orange-300 rounded-none text-xs font-bold uppercase flex items-center justify-between shadow-sm animate-in fade-in duration-200 z-30">
              <span>{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="ml-2 text-neutral-400 hover:text-white underline"
              >
                Закрыть
              </button>
            </div>
          )}

          {allViewerStreams.length === 0 ? (
            /* No Camera or Waiting for Streamer */
            <div className="z-10 relative">
              <NoCameraStreamPicker
                currentRoomId={roomId}
                isBroadcaster={false}
                onNavigateToRoom={(targetId, asViewer) => {
                  if (onNavigateToRoom) onNavigateToRoom(targetId, asViewer);
                  else window.location.href = asViewer ? `/view/${targetId}` : `/room/${targetId}`;
                }}
              />
            </div>
          ) : focusedStream ? (
            /* 1. Focused Large Video View with Thumbnail Strip */
            <div className={`w-full h-full flex flex-col gap-2 mx-auto z-10 ${isTheaterMode ? 'max-w-none' : 'max-w-7xl max-h-[86vh]'}`}>
              <div className="flex-1 min-h-[300px] w-full relative">
                <VideoPlayer
                  key={focusedStream.id}
                  stream={focusedStream.stream}
                  displayName={focusedStream.displayName}
                  isLocal={false}
                  isAudioMuted={false}
                  isVideoMuted={false}
                  isScreenShare={focusedStream.isScreenShare}
                  isSecondaryCamera={focusedStream.isSecondaryCamera}
                  streamBadge={focusedStream.streamBadge}
                  isFocused={true}
                  isTranslucentHud={isPresentationMode}
                  stats={stats}
                  reactions={reactions}
                  onFocus={() => setFocusedStreamId(null)}
                  onOpenStats={() => setIsStatsOpen(true)}
                  videoRefCallback={(el) => {
                    if (el) activeVideoElementsMap.current.set(focusedStream.id, el);
                  }}
                  className="w-full h-full"
                />
              </div>

              {/* Bottom Thumbnail Strip */}
              {allViewerStreams.length > 1 && !isTheaterMode && (
                <div className="h-20 sm:h-24 flex gap-2.5 overflow-x-auto pb-1 shrink-0">
                  {allViewerStreams.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setFocusedStreamId(s.id)}
                      className={`h-full aspect-video rounded-none overflow-hidden cursor-pointer transition border ${
                        s.id === focusedStream.id
                          ? 'border-orange-500 ring-2 ring-orange-500/30'
                          : 'border-white/10 hover:border-orange-500/20 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <VideoPlayer
                        stream={s.stream}
                        displayName={s.displayName}
                        isLocal={false}
                        isAudioMuted={false}
                        isVideoMuted={false}
                        isScreenShare={s.isScreenShare}
                        isSecondaryCamera={s.isSecondaryCamera}
                        streamBadge={s.streamBadge}
                        showControls={false}
                        videoRefCallback={(el) => {
                          if (el) activeVideoElementsMap.current.set(s.id, el);
                        }}
                        className="w-full h-full pointer-events-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 2. Multi-Stream Parallel Grid View */
            <div className={`grid gap-3 sm:gap-4 w-full h-full z-10 ${isTheaterMode ? 'max-w-none' : 'max-h-[86vh]'} ${getGridClasses(allViewerStreams.length)}`}>
              {allViewerStreams.map((s) => (
                <VideoPlayer
                  key={s.id}
                  stream={s.stream}
                  displayName={s.displayName}
                  isLocal={false}
                  isAudioMuted={false}
                  isVideoMuted={false}
                  isScreenShare={s.isScreenShare}
                  isSecondaryCamera={s.isSecondaryCamera}
                  streamBadge={s.streamBadge}
                  isTranslucentHud={isPresentationMode}
                  stats={stats}
                  reactions={reactions}
                  onFocus={() => setFocusedStreamId(s.id)}
                  onOpenStats={() => setIsStatsOpen(true)}
                  videoRefCallback={(el) => {
                    if (el) activeVideoElementsMap.current.set(s.id, el);
                  }}
                  className="w-full h-full min-h-[220px]"
                />
              ))}
            </div>
          )}

          {/* Quick Floating Reaction Bar at bottom of screen */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 px-3 py-1 bg-black/80 border border-orange-500/25 shadow-2xl transition-all duration-200 opacity-90 hover:opacity-100 scale-95 sm:scale-100 rounded-none">
            <span className="text-[10px] font-bold text-orange-400 mr-1 hidden sm:inline flex items-center gap-1 uppercase">
              <Smile className="w-3.5 h-3.5" />
              Реакция:
            </span>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendReaction(emoji)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-none hover:bg-orange-500/10 hover:text-orange-500 flex items-center justify-center text-base sm:text-lg transition transform hover:scale-130 active:scale-95 animate-in fade-in"
                title={`Отправить реакцию ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </main>

        {/* Docked Sidebar (Chat / Viewers / AI Observer) as Overlays */}
        {isSidebarOpen && isSidebarDocked && (
          <aside className="absolute top-2 right-2 bottom-4 w-80 sm:w-96 border border-orange-500/30 flex-col p-1.5 bg-black/80 backdrop-blur-md shrink-0 z-20 transition-all duration-300 rounded-none flex">
            {activeSidebarTab === 'chat' ? (
              <StreamChatPanel
                isOpen={true}
                isDocked={true}
                onClose={() => setIsSidebarOpen(false)}
                onToggleDock={() => setIsSidebarDocked(false)}
                messages={chatMessages}
                presence={presence}
                onSendMessage={handleSendMessage}
                onSendReaction={handleSendReaction}
                currentPeerId={managerRef.current?.peerId || ''}
                currentDisplayName={currentDisplayName}
                onUpdateDisplayName={handleUpdateDisplayName}
                role="viewer"
                roomId={roomId}
                className="h-full w-full"
              />
            ) : (
              <AIObserverPanel
                roomId={roomId}
                getActiveFrameBase64={getActiveFrameBase64}
                streamEvents={streamEvents}
                onAddStreamEvent={(evt) => setStreamEvents((prev) => [evt, ...prev])}
                isDocked={true}
                onToggleDock={() => setIsSidebarDocked(false)}
                onClose={() => setIsSidebarOpen(false)}
                isTranslucent={isPresentationMode}
                className="h-full w-full"
              />
            )}
          </aside>
        )}
      </div>

      {/* Floating Modal/Drawer Mode if undocked or on mobile */}
      {isSidebarOpen && (!isSidebarDocked || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
        <div className="fixed inset-0 lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:relative z-50 w-full lg:w-[420px] p-0 lg:p-3 animate-in slide-in-from-right duration-300">
          <div className="h-full w-full bg-neutral-950 lg:bg-transparent lg:shadow-2xl">
            {activeSidebarTab === 'chat' ? (
              <StreamChatPanel
                isOpen={true}
                isDocked={false}
                onClose={() => setIsSidebarOpen(false)}
                onToggleDock={() => setIsSidebarDocked(true)}
                messages={chatMessages}
                presence={presence}
                onSendMessage={handleSendMessage}
                onSendReaction={handleSendReaction}
                currentPeerId={managerRef.current?.peerId || ''}
                currentDisplayName={currentDisplayName}
                onUpdateDisplayName={handleUpdateDisplayName}
                role="viewer"
                roomId={roomId}
                className="h-full w-full"
              />
            ) : (
              <AIObserverPanel
                roomId={roomId}
                getActiveFrameBase64={getActiveFrameBase64}
                streamEvents={streamEvents}
                onAddStreamEvent={(evt) => setStreamEvents((prev) => [evt, ...prev])}
                isDocked={false}
                onToggleDock={() => setIsSidebarDocked(true)}
                onClose={() => setIsSidebarOpen(false)}
                isTranslucent={isPresentationMode}
                className="h-full w-full"
              />
            )}
          </div>
        </div>
      )}

      {/* Stats Modal */}
      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        stats={stats}
        peerName={`Стрим: ${roomId}`}
      />

      {/* Cohost Invite Modal Popup */}
      {coHostInvite && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in duration-200 text-left">
            <div className="w-12 h-12 rounded-full bg-rose-600/20 flex items-center justify-center text-rose-400">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Приглашение в прямой эфир!</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Ведущий <strong>{coHostInvite.fromDisplayName}</strong> приглашает вас выйти в совместный эфир в качестве со-ведущего! Ваша камера и микрофон будут подключены к трансляции.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => {
                  setCoHostInvite(null);
                  // Redirect them to room as cohost!
                  window.location.href = `/room/${roomId}?role=cohost`;
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-sm transition shadow-lg shadow-rose-600/20 text-center"
              >
                Выйти в эфир
              </button>
              <button
                onClick={() => setCoHostInvite(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-sm transition border border-white/5 text-center"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
