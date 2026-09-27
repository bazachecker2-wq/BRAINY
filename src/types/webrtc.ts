export type StreamType = 'camera' | 'screen' | 'secondary-camera' | 'rtsp' | 'mixed';

export type UserRole = 'publisher' | 'viewer' | 'cohost' | 'director';

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'reconnecting' | 'disconnected';

export interface ExtraStreamInfo {
  id: string;
  type: 'camera' | 'screen' | 'secondary-camera' | 'rtsp';
  label: string;
  stream: MediaStream;
}

export interface PeerState {
  id: string;
  displayName: string;
  role: UserRole;
  audioMuted: boolean;
  videoMuted: boolean;
  screenSharing: boolean;
  hasSecondaryCamera?: boolean;
  isSpeaking?: boolean;
  audioLevel?: number; // 0 to 1
  handRaised?: boolean;
  stream?: MediaStream;
  screenStream?: MediaStream;
  secondaryCameraStream?: MediaStream;
  extraStreams?: ExtraStreamInfo[];
  connectionQuality?: ConnectionQuality;
  joinedAt: number;
}

export interface WebRTCStats {
  rtt: number; // ms
  jitter: number; // ms
  packetLoss: number; // percentage (0-100)
  bitrate: number; // kbps
  fps: number;
  resolution: {
    width: number;
    height: number;
  };
  audioCodec?: string;
  videoCodec?: string;
  bytesReceived?: number;
  bytesSent?: number;
  timestamp: number;
}

export interface VideoQualityPreset {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  bitrateBps: number; // bits per second
}

export interface AudioSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  sampleRate: number;
}

export interface MediaDeviceState {
  audioInputId: string;
  videoInputId: string;
  secondaryVideoInputId?: string;
  audioOutputId: string;
  facingMode: 'user' | 'environment';
  resolution: '360p' | '480p' | '720p' | '1080p';
  fps: 24 | 30 | 60;
  bitratePreset: 'auto' | 'low' | 'medium' | 'high';
}

export interface ChatMessage {
  id: string;
  fromPeerId: string;
  senderName: string;
  text: string;
  role?: UserRole;
  isAi?: boolean;
  timestamp: number;
}

export interface ChatReaction {
  id: string;
  emoji: string;
  fromPeerId: string;
  senderName: string;
  timestamp: number;
}

export interface RoomPresencePeer {
  id: string;
  displayName: string;
  role: UserRole;
  joinedAt: number;
  audioMuted: boolean;
  videoMuted: boolean;
  screenSharing?: boolean;
  isSpeaking?: boolean;
  handRaised?: boolean;
}

export interface RoomPresenceData {
  roomId: string;
  totalCount: number;
  publishersCount: number;
  viewersCount: number;
  peers: RoomPresencePeer[];
}

export interface AIStreamEvent {
  id: string;
  timestamp: number;
  text: string;
  thumbnail?: string;
}

export interface SignalingMessage {
  type:
    | 'room:join'
    | 'room:joined'
    | 'room:leave'
    | 'room:closed'
    | 'room:error'
    | 'room:presence'
    | 'room:presence-request'
    | 'room:raise-hand'
    | 'room:lower-hand'
    | 'room:invite-cohost'
    | 'room:role-change'
    | 'peer:joined'
    | 'peer:left'
    | 'peer:offer'
    | 'peer:answer'
    | 'peer:ice'
    | 'peer:state-change'
    | 'peer:state-updated'
    | 'chat:message'
    | 'chat:broadcast'
    | 'chat:reaction';
  payload?: any;
}
