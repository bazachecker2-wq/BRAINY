import React, { useEffect, useRef, useState, useCallback } from 'react';
import Draggable from 'react-draggable';
import { SignalingClient } from '../services/signaling';
import { WebRTCManager, CameraDeviceInfo } from '../services/webrtcManager';
import {
  AIStreamEvent,
  ChatMessage,
  ChatReaction,
  MediaDeviceState,
  PeerState,
  RoomPresenceData,
  UserRole,
  WebRTCStats
} from '../types/webrtc';
import { BountyHUD } from '../components/BountyHUD';
import { VideoPlayer } from '../components/VideoPlayer';
import { StreamOverlayHUD } from '../components/StreamOverlayHUD';
import { MediaControls } from '../components/MediaControls';
import { StatsModal } from '../components/StatsModal';
import { SettingsModal } from '../components/SettingsModal';
import { ShareModal } from '../components/ShareModal';
import { OBSGuideModal } from '../components/OBSGuideModal';
import { RTSPBridgeModal } from '../components/RTSPBridgeModal';
import { StreamChatPanel } from '../components/StreamChatPanel';
import { AIObserverPanel } from '../components/AIObserverPanel';
import { NoCameraStreamPicker } from '../components/NoCameraStreamPicker';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Target, Trophy } from 'lucide-react';
import {
  Copy,
  Check,
  Users,
  ArrowLeft,
  ShieldAlert,
  Sparkles,
  LayoutGrid,
  Maximize2,
  Tv,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  Camera,
  Monitor,
  EyeOff,
  SwitchCamera,
  Film,
  Smile,
  MessageSquare
} from 'lucide-react';

interface RoomViewProps {
  roomId: string;
  role?: UserRole;
  password?: string;
  onLeave: () => void;
  onNavigateToRoom?: (targetRoomId: string, asViewer?: boolean) => void;
}

interface StreamCard {
  id: string;
  stream: MediaStream;
  displayName: string;
  isLocal: boolean;
  isScreenShare: boolean;
  isSecondaryCamera: boolean;
  streamBadge?: string;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  peerId: string;
  handRaised?: boolean;
}

export const RoomView: React.FC<RoomViewProps> = ({
  roomId,
  role = 'publisher',
  password,
  onLeave,
  onNavigateToRoom
}) => {
  const [user] = useAuthState(auth);
  const [currentRole, setCurrentRole] = useState<UserRole>(role);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [coHostInvite, setCoHostInvite] = useState<{ fromPeerId: string; fromDisplayName: string } | null>(null);
  const [manager, setManager] = useState<WebRTCManager | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [secondaryCameraStream, setSecondaryCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<PeerState[]>([]);
  const [statsMap, setStatsMap] = useState<Map<string, WebRTCStats>>(new Map());

  // Focused Stream (Click to enlarge / focus)
  const [focusedStreamId, setFocusedStreamId] = useState<string | null>(null);
  // Presentation / Translucent HUD Mode
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isBroadcastMode, setIsBroadcastMode] = useState(false);

  // Multiple Cameras & Mobile Facing Mode
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);

  // Local Media states
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasSecondaryCamera, setHasSecondaryCamera] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState(0);

  // AI Observer Panel Dock / Drawer state
  const [isAIOpen, setIsAIOpen] = useState(true);
  const [isAIDocked, setIsAIDocked] = useState(true);

  // Settings & Modals
  const [mediaSettings, setMediaSettings] = useState<MediaDeviceState>({
    audioInputId: '',
    videoInputId: '',
    secondaryVideoInputId: '',
    audioOutputId: '',
    facingMode: 'user',
    resolution: '720p',
    fps: 30,
    bitratePreset: 'auto'
  });

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [selectedStatsPeerId, setSelectedStatsPeerId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isOBSGuideOpen, setIsOBSGuideOpen] = useState(false);
  const [isRTSPBridgeOpen, setIsRTSPBridgeOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Chat and AI Events
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<RoomPresenceData | null>(null);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [streamEvents, setStreamEvents] = useState<AIStreamEvent[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Status & Errors
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);
  const activeVideoElementsMap = useRef<Map<string, HTMLVideoElement>>(new Map());
  const roomNameRef = useRef<string | null>(null);

  // Enumerate cameras on mobile/desktop
  useEffect(() => {
    async function loadCameras() {
      const cams = await WebRTCManager.getAvailableCameras();
      setAvailableCameras(cams);
    }
    loadCameras();

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadCameras);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadCameras);
      };
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function initRoom() {
      try {
        setErrorMessage(null);
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

        const webrtc = new WebRTCManager(roomId, role, '', signaling);
        managerRef.current = webrtc;
        setManager(webrtc);

        webrtc.subscribeRoleChanged((newRole) => {
          if (!isCancelled) {
            setCurrentRole(newRole);
          }
        });

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

        webrtc.subscribeStats((peerId, stats) => {
          if (!isCancelled) {
            setStatsMap((prev) => new Map(prev).set(peerId, stats));
          }
        });

        signaling.on('chat:broadcast', (payload) => {
          if (!isCancelled) {
            setChatMessages((prev) => [...prev, payload]);
            if (!isChatOpen && !isAIOpen) {
              setUnreadChatCount((count) => count + 1);
            }
          }
        });

        signaling.on('chat:reaction', (payload: ChatReaction) => {
          if (!isCancelled) {
            setReactions((prev) => [...prev.slice(-20), payload]);
          }
        });

        signaling.on('room:presence', (payload: RoomPresenceData) => {
          if (!isCancelled) {
            setPresence(payload);
          }
        });

        signaling.on('room:joined', (payload: any) => {
          if (!isCancelled) {
            if (payload.chatHistory && Array.isArray(payload.chatHistory)) {
              setChatMessages(payload.chatHistory);
            }
            if (payload.roomName) {
              roomNameRef.current = payload.roomName;
            }
          }
        });

        signaling.on('room:error', (payload) => {
          if (!isCancelled) {
            setErrorMessage(payload.message || 'Ошибка комнаты');
          }
        });

        // Start local webcam & mic
        try {
          const stream = await webrtc.startLocalMedia();
          if (!isCancelled) {
            setLocalStream(stream);
          }
        } catch (mediaErr: any) {
          console.warn('Webcam start error:', mediaErr);
          if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            setErrorMessage('Для прямого доступа к камере браузер требует защищенное соединение HTTPS.');
          }
        }

        signaling.send('room:join', {
          roomId,
          peerId: webrtc.peerId,
          displayName: webrtc.displayName,
          role,
          password
        });

        // Trigger integrations if publisher
        if (role === 'publisher' && user) {
          try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            if (userSnap.exists()) {
              const data = userSnap.data();
              const streamUrl = `${window.location.origin}/view/${roomId}`;
              
              if (data.webhooks?.discord) {
                fetch(data.webhooks.discord, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    content: `🔴 **В ЭФИРЕ!** ${data.displayName} запустил стрим: ${streamUrl}`
                  })
                }).catch(e => console.warn('Discord webhook failed:', e));
              }

              if (data.webhooks?.telegram) {
                // Simplified TG notification (requires a bot, usually handled server-side)
                console.log('Telegram integration triggered for', data.webhooks.telegram);
              }

              // Update room in firestore
              await setDoc(doc(db, 'rooms', roomId), {
                ownerId: user.uid,
                name: roomNameRef.current || `Стрим ${user.displayName}`,
                mode: 'public', // Default for now
                createdAt: serverTimestamp()
              }, { merge: true });

              // Complete 'first_stream' task
              if (!data.completedTasks?.includes('first_stream')) {
                await updateDoc(doc(db, 'users', user.uid), {
                  completedTasks: arrayUnion('first_stream'),
                  balance: increment(50)
                });
              }
            }
          } catch (e) {
            console.warn('Integration/Firestore update failed:', e);
          }
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Room init error:', err);
          setErrorMessage(`Не удалось подключиться к комнате: ${err.message}`);
        }
      }
    }

    initRoom();

    return () => {
      isCancelled = true;
      managerRef.current?.destroy();
      signalingRef.current?.close();
    };
  }, [roomId, role, password]);

  // Controls
  const handleToggleAudio = () => {
    if (managerRef.current) {
      const muted = managerRef.current.toggleAudio();
      setIsAudioMuted(muted);
    }
  };

  const handleToggleVideo = () => {
    if (managerRef.current) {
      const muted = managerRef.current.toggleVideo();
      setIsVideoMuted(muted);
    }
  };

  const handleToggleSecondaryCamera = async () => {
    if (!managerRef.current) return;
    if (hasSecondaryCamera) {
      managerRef.current.stopSecondaryCamera();
      setSecondaryCameraStream(null);
      setHasSecondaryCamera(false);
    } else {
      try {
        // Automatically target the opposite camera on mobile
        const targetFacing = facingMode === 'user' ? 'environment' : 'user';
        const stream = await managerRef.current.startSecondaryCamera(
          mediaSettings.secondaryVideoInputId || targetFacing
        );
        setSecondaryCameraStream(stream);
        setHasSecondaryCamera(true);
      } catch (err: any) {
        setErrorMessage(`Не удалось запустить вторую камеру: ${err.message}. Возможно, устройство не поддерживает одновременный захват двух сенсоров.`);
      }
    }
  };

  const handleSwitchCamera = async () => {
    if (managerRef.current) {
      const newFacing = await managerRef.current.switchFacingMode();
      setFacingMode(newFacing);
      setLocalStream(managerRef.current.localStream);
    }
  };

  const handleSelectCamera = async (deviceId: string) => {
    if (managerRef.current) {
      const success = await managerRef.current.switchCamera(deviceId);
      if (success) {
        setLocalStream(managerRef.current.localStream);
      }
    }
  };

  const handleToggleScreenShare = async () => {
    if (!managerRef.current) return;
    if (isScreenSharing) {
      managerRef.current.stopScreenShare();
      setScreenStream(null);
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await managerRef.current.startScreenShare();
        setScreenStream(stream);
        setIsScreenSharing(true);
        // Automatically focus screen share for seamless presentation
        setFocusedStreamId('local_screen');
      } catch (e) {
        setIsScreenSharing(false);
      }
    }
  };

  const handleToggleRecording = async () => {
    if (!managerRef.current) return;
    if (isRecording) {
      managerRef.current.stopRecording();
      setIsRecording(false);
      setRecordingStartTime(0);
    } else {
      const targetStream = (focusedStreamId && allStreams.find(s => s.id === focusedStreamId)?.stream) || localStream;
      const started = await managerRef.current.startRecording(targetStream || undefined);
      if (started) {
        setIsRecording(true);
        setRecordingStartTime(Date.now());
      }
    }
  };

  const handleStartDemoStream = () => {
    if (managerRef.current) {
      const demoStream = managerRef.current.startSyntheticDemoMedia();
      setLocalStream(demoStream);
      setIsVideoMuted(false);
      setErrorMessage(null);
    }
  };

  const handleRetryCamera = async () => {
    if (managerRef.current) {
      try {
        const stream = await managerRef.current.startLocalMedia();
        setLocalStream(stream);
        setIsVideoMuted(false);
        setErrorMessage(null);
      } catch (err: any) {
        setErrorMessage(`Ошибка запуска камеры: ${err.message}`);
      }
    }
  };

  const handleApplyMediaSettings = async () => {
    if (managerRef.current) {
      managerRef.current.mediaSettings = mediaSettings;
      try {
        const stream = await managerRef.current.startLocalMedia();
        setLocalStream(stream);
        if (mediaSettings.secondaryVideoInputId && hasSecondaryCamera) {
          const secStream = await managerRef.current.startSecondaryCamera(mediaSettings.secondaryVideoInputId);
          setSecondaryCameraStream(secStream);
        }
      } catch (err) {
        console.error('Применение настроек:', err);
      }
    }
  };

  const handleSendMessage = (text: string) => {
    if (managerRef.current) {
      managerRef.current.sendChatMessage(text);
    } else if (signalingRef.current) {
      signalingRef.current.send('chat:message', { text });
    }
  };

  const handleSendReaction = (emoji: string) => {
    if (managerRef.current) {
      managerRef.current.sendReaction(emoji);
    }
  };

  const handleUpdateDisplayName = (newName: string) => {
    if (managerRef.current) {
      managerRef.current.updateDisplayName(newName);
    }
  };

  const copyViewerLink = () => {
    const url = `${window.location.origin}/view/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Helper to extract active frame for AI vision
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

  // Aggregate all parallel video streams (Webcam 1, Webcam 2, Screen, Remotes)
  const allStreams: StreamCard[] = [];

  // 1. Local Primary Webcam
  if (localStream) {
    allStreams.push({
      id: 'local_cam',
      stream: localStream,
      displayName: `${managerRef.current?.displayName || 'Стример'} (${facingMode === 'user' ? 'Селфи' : 'Основная'})`,
      isLocal: true,
      isScreenShare: false,
      isSecondaryCamera: false,
      streamBadge: facingMode === 'user' ? 'КАМЕРА (СЕЛФИ)' : 'КАМЕРА (ОСНОВНАЯ)',
      isAudioMuted,
      isVideoMuted,
      peerId: 'local',
      handRaised: isHandRaised
    });
  }

  // 2. Local Secondary Camera (if enabled)
  if (secondaryCameraStream) {
    allStreams.push({
      id: 'local_cam2',
      stream: secondaryCameraStream,
      displayName: `${managerRef.current?.displayName || 'Стример'} (Камера 2)`,
      isLocal: true,
      isScreenShare: false,
      isSecondaryCamera: true,
      streamBadge: 'КАМЕРА 2',
      isAudioMuted: true,
      isVideoMuted: false,
      peerId: 'local'
    });
  }

  // 3. Local Screen Share (if enabled)
  if (screenStream) {
    allStreams.push({
      id: 'local_screen',
      stream: screenStream,
      displayName: `${managerRef.current?.displayName || 'Стример'} (Экран)`,
      isLocal: true,
      isScreenShare: true,
      isSecondaryCamera: false,
      streamBadge: 'ЭКРАН',
      isAudioMuted: false,
      isVideoMuted: false,
      peerId: 'local'
    });
  }

  // 4. Remote peers streams & extra streams
  remotePeers.forEach((p) => {
    if (p.stream) {
      allStreams.push({
        id: `peer_${p.id}_cam`,
        stream: p.stream,
        displayName: p.displayName,
        isLocal: false,
        isScreenShare: p.screenSharing,
        isSecondaryCamera: false,
        streamBadge: p.screenSharing ? 'ЭКРАН' : 'КАМЕРА',
        isAudioMuted: p.audioMuted,
        isVideoMuted: p.videoMuted,
        peerId: p.id,
        handRaised: p.handRaised
      });
    }

    if (p.extraStreams && p.extraStreams.length > 0) {
      p.extraStreams.forEach((ex, idx) => {
        allStreams.push({
          id: `peer_${p.id}_ex_${ex.id}`,
          stream: ex.stream,
          displayName: `${p.displayName} (${ex.label})`,
          isLocal: false,
          isScreenShare: ex.type === 'screen',
          isSecondaryCamera: ex.type === 'secondary-camera',
          streamBadge: ex.label || `ПОТОК #${idx + 2}`,
          isAudioMuted: p.audioMuted,
          isVideoMuted: false,
          peerId: p.id
        });
      });
    }
  });

  const focusedStream = focusedStreamId ? allStreams.find((s) => s.id === focusedStreamId) : null;
  const primaryStreamForHUD = focusedStream || allStreams[0];

  const getGridClasses = (count: number) => {
    if (isTheaterMode) return 'grid-cols-1 w-full h-full';
    if (count <= 1) return 'grid-cols-1 max-w-5xl mx-auto';
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-7xl mx-auto';
    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 max-w-7xl mx-auto';
  };

  return (
    <div
      ref={containerRef}
      className="min-h-[100dvh] h-screen w-screen bg-black text-neutral-100 flex flex-col overflow-hidden select-none relative font-mono"
    >
      {/* Top Studio Bar (Standard or Translucent Glassmorphic HUD) */}
      <header
        className="h-14 px-3 sm:px-6 border-b border-orange-500/20 bg-black/40 backdrop-blur-md transition-all duration-300 flex items-center justify-between shrink-0 z-30 font-mono rounded-none"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onLeave}
            className="p-2 rounded-none bg-neutral-950/80 hover:bg-neutral-900 text-neutral-400 hover:text-orange-500 border border-orange-500/20 transition"
            title="Выйти из комнаты"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-orange-500 animate-live-dot"></div>
            <span className="font-bold text-xs sm:text-sm text-white uppercase">Эфир:</span>
            <span className="font-mono text-xs sm:text-sm font-bold text-orange-400">[{roomId}]</span>
          </div>

          {/* Quick Viewer Link Copy */}
          <button
            onClick={copyViewerLink}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-none bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 text-xs font-bold uppercase transition"
            title="Скопировать ссылку для зрителей"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'КОПИРОВАНО' : 'ССЫЛКА'}</span>
          </button>

          {/* Live Viewers Count Pill */}
          <button
            onClick={() => {
              setIsChatOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-none bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-xs font-bold uppercase text-orange-400 backdrop-blur-md transition shadow-sm"
            title="Зрители онлайн: нажмите чтобы посмотреть список"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{presence?.viewersCount ?? 0} ЗРИТ.</span>
          </button>

          {/* Hand Raising Button */}
          <button
            onClick={() => {
              const nextState = !isHandRaised;
              setIsHandRaised(nextState);
              if (managerRef.current) {
                managerRef.current.raiseHand(nextState);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-none border text-xs font-bold uppercase transition ${
              isHandRaised
                ? 'bg-orange-500 hover:bg-orange-400 text-black border-orange-600 shadow-md animate-pulse'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 border-orange-500/20'
            }`}
            title={isHandRaised ? 'Опустить руку' : 'Поднять руку, чтобы попросить слово'}
          >
            <span>✋</span>
            <span className="hidden sm:inline">{isHandRaised ? 'РУКА ПОДНЯТА' : 'ПОДНЯТЬ РУКУ'}</span>
          </button>

          {/* Broadcast Mode Toggle */}
          <button
            onClick={() => setIsBroadcastMode(!isBroadcastMode)}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-none border text-xs font-bold uppercase transition ${
              isBroadcastMode
                ? 'bg-orange-500 text-black border-orange-600 shadow-md'
                : 'bg-neutral-950 hover:bg-neutral-900 text-orange-400 border-orange-500/20'
            }`}
            title="Режим трансляции (перемещение окон)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>{isBroadcastMode ? 'ТРАНС: ВКЛ' : 'ТРАНСЛЯЦИЯ'}</span>
          </button>

          {/* Mobile Camera Flip Button */}
          <button
            onClick={handleSwitchCamera}
            className="flex sm:hidden items-center gap-1 px-2.5 py-1 rounded-none bg-neutral-950 border border-orange-500/20 text-orange-400 text-xs font-bold uppercase"
            title="Переключить камеру (Фронтальная / Задняя)"
          >
            <SwitchCamera className="w-3.5 h-3.5" />
            <span>{facingMode === 'user' ? 'СЕЛФИ' : 'ЗАДНЯЯ'}</span>
          </button>

          {/* Presentation Mode / Translucent HUD Toggle */}
          <button
            onClick={() => setIsPresentationMode(!isPresentationMode)}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-none border text-xs font-bold uppercase transition ${
              isPresentationMode
                ? 'bg-orange-500/20 text-orange-400 border-orange-500/30 shadow-sm'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 border-orange-500/20'
            }`}
            title="Переключить режим полупрозрачного HUD"
          >
            <Monitor className="w-3.5 h-3.5 text-orange-400" />
            <span>{isPresentationMode ? 'HUD: ВКЛ' : 'HUD'}</span>
          </button>

          {/* Focused mode reset button */}
          {focusedStream && (
            <button
              onClick={() => setFocusedStreamId(null)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-orange-500/20 text-xs font-bold uppercase transition"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ВСЕ КАМЕРЫ</span>
            </button>
          )}
        </div>

        {/* Right Status Badges & AI Panel Trigger */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {/* Chat Drawer Toggle */}
          <button
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              if (!isChatOpen) setUnreadChatCount(0);
            }}
            className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-none border text-xs font-bold uppercase transition shadow-sm ${
              isChatOpen
                ? 'bg-orange-500 text-black border-orange-600 shadow-md'
                : 'bg-neutral-950 hover:bg-neutral-900 text-neutral-300 border-orange-500/20'
            }`}
            title="Открыть/скрыть чат и список участников"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Чат</span>
            {unreadChatCount > 0 && (
              <span className="w-4 h-4 rounded-none bg-orange-500 text-black text-[10px] flex items-center justify-center font-bold animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsAIOpen(!isAIOpen)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-none border text-xs font-bold uppercase transition shadow-sm ${
              isAIOpen
                ? 'bg-orange-500 text-black border-orange-600 shadow-md'
                : 'bg-neutral-950 hover:bg-neutral-900 text-orange-400 border-orange-500/20'
            }`}
            title="Открыть/скрыть боковую панель ИИ-наблюдателя"
          >
            <Sparkles className={`w-3.5 h-3.5 text-orange-400 ${isAIOpen ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">ИИ-Наблюдатель</span>
            {isAIOpen ? <PanelRightClose className="w-3.5 h-3.5 ml-0.5 opacity-80" /> : <PanelRightOpen className="w-3.5 h-3.5 ml-0.5 opacity-80" />}
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-none bg-neutral-950 border border-orange-500/20 text-neutral-300">
            <Users className="w-3.5 h-3.5 text-orange-400" />
            <span>{remotePeers.length + 1}</span>
          </div>
        </div>
      </header>

      {/* Main Studio Body with Video Stage + Docked AI Observer */}
      <div className="flex-1 flex overflow-hidden relative pb-16 sm:pb-20 font-mono">
        {/* Left / Center Video Stage as Full-Screen Background */}
        <main className="absolute inset-0 w-full h-full z-0 p-2 sm:p-4 overflow-hidden flex flex-col justify-center bg-black pixel-grid">
          {/* Error Warning */}
          {errorMessage && (
            <div className="mb-4 mx-auto max-w-2xl w-full p-3 rounded-none bg-orange-500/10 border border-orange-500/30 text-orange-300 text-xs flex items-center justify-between gap-3 shadow-lg z-30">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-orange-500 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-neutral-400 hover:text-white text-xs underline"
              >
                Закрыть
              </button>
            </div>
          )}

          {/* No Active Video Streams State */}
          {allStreams.length === 0 ? (
            <div className="z-10 relative">
              <NoCameraStreamPicker
                currentRoomId={roomId}
                isBroadcaster={true}
                onRetryCamera={handleRetryCamera}
                onStartScreenShare={handleToggleScreenShare}
                onStartDemoStream={handleStartDemoStream}
                onNavigateToRoom={(targetId, asViewer) => {
                  if (onNavigateToRoom) onNavigateToRoom(targetId, asViewer);
                  else window.location.href = asViewer ? `/view/${targetId}` : `/room/${targetId}`;
                }}
              />
            </div>
          ) : focusedStream ? (
            /* 1. Focused / Maximized Stream Layout */
            <div className="w-full h-full max-h-[86vh] flex flex-col gap-2 max-w-7xl mx-auto z-10">
              {/* Primary Hero Focused Video */}
              <div className="flex-1 min-h-[300px] w-full">
                <VideoPlayer
                  key={focusedStream.id}
                  stream={focusedStream.stream}
                  displayName={focusedStream.displayName}
                  isLocal={focusedStream.isLocal}
                  isAudioMuted={focusedStream.isAudioMuted}
                  isVideoMuted={focusedStream.isVideoMuted}
                  isScreenShare={focusedStream.isScreenShare}
                  isSecondaryCamera={focusedStream.isSecondaryCamera}
                  streamBadge={focusedStream.streamBadge}
                  isFocused={true}
                  isTranslucentHud={isPresentationMode}
                  stats={statsMap.get(focusedStream.peerId)}
                  reactions={reactions}
                  handRaised={focusedStream.handRaised}
                  mirrored={focusedStream.isLocal && !focusedStream.isScreenShare && facingMode === 'user'}
                  onFocus={() => setFocusedStreamId(null)}
                  onOpenStats={() => {
                    setSelectedStatsPeerId(focusedStream.peerId);
                    setIsStatsModalOpen(true);
                  }}
                  videoRefCallback={(el) => {
                    if (el) activeVideoElementsMap.current.set(focusedStream.id, el);
                  }}
                  className="w-full h-full"
                />
              </div>

              {/* Bottom Parallel Stream Strip */}
              {allStreams.length > 1 && (
                <div className="h-20 sm:h-28 flex gap-2.5 overflow-x-auto pb-1 shrink-0">
                  {allStreams.map((s) => (
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
                        isLocal={s.isLocal}
                        isAudioMuted={s.isAudioMuted}
                        isVideoMuted={s.isVideoMuted}
                        isScreenShare={s.isScreenShare}
                        isSecondaryCamera={s.isSecondaryCamera}
                        streamBadge={s.streamBadge}
                        showControls={false}
                        handRaised={s.handRaised}
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
            /* 2. Parallel Multi-Video Grid Layout */
            <div className={`grid gap-3 sm:gap-4 w-full h-full max-h-[86vh] z-10 ${getGridClasses(allStreams.length)}`}>
              {allStreams.map((s) => (
                <VideoPlayer
                  key={s.id}
                  stream={s.stream}
                  displayName={s.displayName}
                  isLocal={s.isLocal}
                  isAudioMuted={s.isAudioMuted}
                  isVideoMuted={s.isVideoMuted}
                  isScreenShare={s.isScreenShare}
                  isSecondaryCamera={s.isSecondaryCamera}
                  streamBadge={s.streamBadge}
                  isTranslucentHud={isPresentationMode}
                  stats={statsMap.get(s.peerId)}
                  reactions={reactions}
                  handRaised={s.handRaised}
                  mirrored={s.isLocal && !s.isScreenShare && facingMode === 'user'}
                  onFocus={() => setFocusedStreamId(s.id)}
                  onOpenStats={() => {
                    setSelectedStatsPeerId(s.peerId);
                    setIsStatsModalOpen(true);
                  }}
                  videoRefCallback={(el) => {
                    if (el) activeVideoElementsMap.current.set(s.id, el);
                  }}
                  className="w-full h-full min-h-[220px]"
                />
              ))}
            </div>
          )}

          {/* Real-time Diagnostic Stream HUD Overlay */}
          {allStreams.length > 0 && primaryStreamForHUD && (
            <StreamOverlayHUD
              stats={statsMap.get(primaryStreamForHUD.peerId)}
              isLocal={primaryStreamForHUD.isLocal}
              displayName={primaryStreamForHUD.displayName}
            />
          )}

          {/* Active Bounty HUD Overlay */}
          <BountyHUD roomId={roomId} />

          {/* Quick Floating Reactions Bar for Streamer */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1 px-3 py-1 bg-black/80 border border-orange-500/20 shadow-xl opacity-90 hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-bold text-orange-400 mr-1 flex items-center gap-1 uppercase">
              <Smile className="w-3.5 h-3.5" /> Реакция:
            </span>
            {['🔥', '❤️', '👏', '🚀', '🎉', '💡', '💯', '🤯'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSendReaction(emoji)}
                className="w-7 h-7 rounded-none hover:bg-orange-500/10 hover:text-orange-500 flex items-center justify-center text-sm transition transform hover:scale-125 active:scale-95"
                title={`Отправить реакцию ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </main>

        {/* Docked AI Observer Side Panel as Overlay */}
        {isAIOpen && isAIDocked && (
          <aside className="absolute top-2 right-2 bottom-4 w-80 sm:w-96 border border-orange-500/30 flex-col p-1.5 bg-black/80 backdrop-blur-md shrink-0 z-20 transition-all duration-300 rounded-none flex">
            <AIObserverPanel
              roomId={roomId}
              getActiveFrameBase64={getActiveFrameBase64}
              streamEvents={streamEvents}
              onAddStreamEvent={(evt) => setStreamEvents((prev) => [evt, ...prev])}
              isDocked={true}
              onToggleDock={() => setIsAIDocked(false)}
              onClose={() => setIsAIOpen(false)}
              isTranslucent={isPresentationMode}
              className="h-full w-full"
            />
          </aside>
        )}
      </div>

      {/* Full Screen Drawer Mode for AI Observer if undocked or on mobile */}
      {isAIOpen && (!isAIDocked || (typeof window !== 'undefined' && window.innerWidth < 1024)) && (
        <Draggable
          disabled={!isBroadcastMode}
          handle=".drag-handle"
          bounds="parent"
        >
          <div className="fixed inset-0 lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:relative z-50 w-full lg:w-[420px] p-0 lg:p-3 animate-in slide-in-from-right duration-300">
            <AIObserverPanel
              roomId={roomId}
              getActiveFrameBase64={getActiveFrameBase64}
              streamEvents={streamEvents}
              onAddStreamEvent={(evt) => setStreamEvents((prev) => [evt, ...prev])}
              isDocked={false}
              onToggleDock={() => setIsAIDocked(true)}
              onClose={() => setIsAIOpen(false)}
              isTranslucent={isPresentationMode}
              className="h-full w-full shadow-2xl"
            />
          </div>
        </Draggable>
      )}

      {/* Chat Drawer for Streamer - Responsive full-screen on mobile */}
      {isChatOpen && (
        <Draggable
          disabled={!isBroadcastMode}
          handle=".drag-handle"
          bounds="parent"
        >
          <div className="fixed inset-0 lg:top-0 lg:right-0 lg:bottom-0 lg:left-auto lg:relative z-50 w-full lg:w-[420px] p-0 lg:p-3 animate-in slide-in-from-right duration-300">
            <StreamChatPanel
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              messages={chatMessages}
              presence={presence}
              onSendMessage={handleSendMessage}
              onSendReaction={handleSendReaction}
              currentPeerId={managerRef.current?.peerId || ''}
              currentDisplayName={managerRef.current?.displayName || 'Ведущий'}
              onUpdateDisplayName={handleUpdateDisplayName}
              role={currentRole}
              roomId={roomId}
              isDocked={false}
              onInviteToCoHost={(peerId) => {
                if (managerRef.current) {
                  managerRef.current.inviteToCoHost(peerId);
                }
              }}
              className="h-full w-full shadow-2xl"
            />
          </div>
        </Draggable>
      )}

      {/* Floating Bottom Media Controls */}
      <MediaControls
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
        isScreenSharing={isScreenSharing}
        hasSecondaryCamera={hasSecondaryCamera}
        isRecording={isRecording}
        recordingStartTime={recordingStartTime}
        facingMode={facingMode}
        availableCameras={availableCameras}
        onToggleAudio={handleToggleAudio}
        onToggleVideo={handleToggleVideo}
        onToggleScreenShare={handleToggleScreenShare}
        onToggleSecondaryCamera={handleToggleSecondaryCamera}
        onToggleRecording={handleToggleRecording}
        onSwitchCamera={handleSwitchCamera}
        onSelectCamera={handleSelectCamera}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenShare={() => setIsShareModalOpen(true)}
        onOpenOBSGuide={() => setIsOBSGuideOpen(true)}
        onOpenRTSPBridge={() => setIsRTSPBridgeOpen(true)}
        onToggleAIAgent={() => setIsAIOpen(!isAIOpen)}
        onToggleChat={() => {
          setIsChatOpen(!isChatOpen);
          if (!isChatOpen) setUnreadChatCount(0);
        }}
        unreadChatCount={unreadChatCount}
        onLeave={onLeave}
      />

      {/* Modals & Drawers */}
      <StatsModal
        isOpen={isStatsModalOpen}
        onClose={() => setIsStatsModalOpen(false)}
        stats={selectedStatsPeerId ? statsMap.get(selectedStatsPeerId) : undefined}
        peerName={selectedStatsPeerId === 'local' ? 'Основной стример' : selectedStatsPeerId || 'Поток'}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={mediaSettings}
        onUpdateSettings={setMediaSettings}
        onApplyMediaRestart={handleApplyMediaSettings}
        roomId={roomId}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
      />

      <OBSGuideModal
        isOpen={isOBSGuideOpen}
        onClose={() => setIsOBSGuideOpen(false)}
        roomId={roomId}
      />

      <RTSPBridgeModal
        isOpen={isRTSPBridgeOpen}
        onClose={() => setIsRTSPBridgeOpen(false)}
        roomId={roomId}
      />

      {/* Cohost Invite Modal Popup */}
      {coHostInvite && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in duration-200">
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
                onClick={async () => {
                  if (managerRef.current) {
                    // Update role on server
                    managerRef.current.changePeerRole(managerRef.current.peerId, 'cohost');
                    // Automatically request media & publish
                    try {
                      const stream = await managerRef.current.startLocalMedia();
                      setLocalStream(stream);
                    } catch (e) {
                      console.warn('Failed to start cohost media:', e);
                    }
                  }
                  setCoHostInvite(null);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white font-bold text-sm transition shadow-lg shadow-rose-600/20"
              >
                Выйти в эфир
              </button>
              <button
                onClick={() => setCoHostInvite(null)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-sm transition border border-white/5"
              >
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
