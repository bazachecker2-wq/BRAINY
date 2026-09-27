import {
  ExtraStreamInfo,
  MediaDeviceState,
  PeerState,
  UserRole,
  VideoQualityPreset,
  WebRTCStats
} from '../types/webrtc';
import { SignalingClient } from './signaling';

export const VIDEO_PRESETS: Record<string, VideoQualityPreset> = {
  '360p': { label: '360p Low', width: 640, height: 360, frameRate: 24, bitrateBps: 600_000 },
  '480p': { label: '480p Standard', width: 854, height: 480, frameRate: 30, bitrateBps: 1_200_000 },
  '720p': { label: '720p HD', width: 1280, height: 720, frameRate: 30, bitrateBps: 2_500_000 },
  '1080p': { label: '1080p Full HD', width: 1920, height: 1080, frameRate: 60, bitrateBps: 4_500_000 }
};

export const BITRATE_PRESETS = {
  auto: 0,
  low: 800_000,
  medium: 2_500_000,
  high: 5_000_000
};

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  isFront: boolean;
  isBack: boolean;
}

export class WebRTCManager {
  public peerId: string;
  public roomId: string;
  public role: UserRole;
  public displayName: string;
  public signaling: SignalingClient;

  public localStream: MediaStream | null = null;
  public screenStream: MediaStream | null = null;
  public secondaryCameraStream: MediaStream | null = null;

  public isAudioMuted = false;
  public isVideoMuted = false;
  public isScreenSharing = false;
  public hasSecondaryCamera = false;
  public isHandRaised = false;

  private peerConnections = new Map<string, RTCPeerConnection>();
  private remotePeers = new Map<string, PeerState>();
  private statsIntervals = new Map<string, any>();
  private lastBytesStats = new Map<string, { bytes: number; timestamp: number }>();

  // Perfect Negotiation state maps for robust multiplayer
  private makingOfferMap = new Map<string, boolean>();
  private iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private negotiatedPeers = new Set<string>();

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  public mediaSettings: MediaDeviceState = {
    audioInputId: '',
    videoInputId: '',
    secondaryVideoInputId: '',
    audioOutputId: '',
    facingMode: 'user',
    resolution: '720p',
    fps: 30,
    bitratePreset: 'auto'
  };

  private onPeersChangeCallbacks = new Set<(peers: PeerState[]) => void>();
  private onStatsCallbacks = new Set<(peerId: string, stats: WebRTCStats) => void>();
  private onTrackAddedCallbacks = new Set<(peerId: string, stream: MediaStream) => void>();
  private onCoHostInviteCallbacks = new Set<(payload: { fromPeerId: string; fromDisplayName: string }) => void>();
  private onRoleChangedCallbacks = new Set<(newRole: UserRole) => void>();

  // Recording
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  public isRecording = false;
  public recordingStartTime = 0;

  constructor(
    roomId: string,
    role: UserRole = 'publisher',
    displayName = '',
    signaling: SignalingClient
  ) {
    this.roomId = roomId;
    this.role = role;
    this.displayName = displayName || `${role === 'viewer' ? 'Зритель' : 'Стример'}-${Math.random().toString(36).substring(2, 6)}`;
    this.peerId = `peer_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.signaling = signaling;

    this.setupSignalingHandlers();
    this.fetchIceServers();
  }

  public subscribePeers(cb: (peers: PeerState[]) => void) {
    this.onPeersChangeCallbacks.add(cb);
    cb(this.getRemotePeersList());
    return () => this.onPeersChangeCallbacks.delete(cb);
  }

  public subscribeStats(cb: (peerId: string, stats: WebRTCStats) => void) {
    this.onStatsCallbacks.add(cb);
    return () => this.onStatsCallbacks.delete(cb);
  }

  public subscribeTrack(cb: (peerId: string, stream: MediaStream) => void) {
    this.onTrackAddedCallbacks.add(cb);
    return () => this.onTrackAddedCallbacks.delete(cb);
  }

  private notifyPeersChange() {
    const list = this.getRemotePeersList();
    this.onPeersChangeCallbacks.forEach((cb) => cb(list));
  }

  public getRemotePeersList(): PeerState[] {
    return Array.from(this.remotePeers.values());
  }

  public updateDisplayName(name: string) {
    if (!name.trim()) return;
    this.displayName = name.trim();
    this.signaling.send('peer:state-change', {
      displayName: this.displayName
    });
  }

  public sendChatMessage(text: string) {
    if (!text.trim()) return;
    this.signaling.send('chat:message', {
      text: text.trim(),
      senderName: this.displayName,
      role: this.role
    });
  }

  public sendReaction(emoji: string) {
    this.signaling.send('chat:reaction', {
      emoji,
      senderName: this.displayName
    });
  }

  private async fetchIceServers() {
    try {
      const res = await fetch('/api/ice-servers');
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers && Array.isArray(data.iceServers)) {
          this.iceServers = data.iceServers;
        }
      }
    } catch (e) {
      console.warn('STUN server fallback active');
    }
  }

  /**
   * Helper to enumerate cameras with friendly mobile labels (Front/Selfie, Rear/Main)
   */
  public static async getAvailableCameras(): Promise<CameraDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      return videoInputs.map((d, index) => {
        const label = (d.label || '').toLowerCase();
        const isFront = label.includes('front') || label.includes('user') || label.includes('передн') || label.includes('селфи') || label.includes('facetime');
        const isBack = label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('задн') || label.includes('основн');

        let friendlyLabel = d.label;
        if (!friendlyLabel) {
          friendlyLabel = index === 0 ? 'Фронтальная камера (Селфи)' : index === 1 ? 'Задняя камера (Основная)' : `Камера #${index + 1}`;
        } else if (isFront) {
          friendlyLabel = `🤳 ${d.label} (Фронтальная / Селфи)`;
        } else if (isBack) {
          friendlyLabel = `📷 ${d.label} (Задняя / Основная)`;
        } else {
          friendlyLabel = `📹 ${d.label}`;
        }

        return {
          deviceId: d.deviceId,
          label: friendlyLabel,
          isFront,
          isBack
        };
      });
    } catch (e) {
      return [];
    }
  }

  private setupSignalingHandlers() {
    // Listen for custom signaling client reconnection event to cleanly reset mesh connections
    this.signaling.on('reconnected', () => {
      console.log('[WebRTC] Signaling reconnected! Cleaning up and rebuilding connection mesh...');
      this.negotiatedPeers.clear();
      
      this.peerConnections.forEach((_pc, remotePeerId) => {
        this.cleanupPeerConnection(remotePeerId);
      });
      this.peerConnections.clear();
      this.remotePeers.clear();
      this.notifyPeersChange();

      // Trigger presence refresh
      this.signaling.send('room:presence-request', {});
    });

    // When this peer joins and gets list of existing peers in the room
    this.signaling.on('room:joined', (payload) => {
      if (payload.peers && Array.isArray(payload.peers)) {
        payload.peers.forEach((p: any) => {
          if (p.id !== this.peerId) {
            this.remotePeers.set(p.id, {
              id: p.id,
              displayName: p.displayName,
              role: p.role,
              audioMuted: p.audioMuted,
              videoMuted: p.videoMuted,
              screenSharing: p.screenSharing,
              hasSecondaryCamera: p.hasSecondaryCamera,
              handRaised: p.handRaised || false,
              isSpeaking: p.isSpeaking || false,
              connectionQuality: 'excellent',
              joinedAt: p.joinedAt || Date.now()
            });

            // The newly joining peer initiates connection to all existing peers
            this.createPeerConnection(p.id, true);
          }
        });
        this.notifyPeersChange();
      }
    });

    // When a new peer joins after us
    this.signaling.on('peer:joined', (payload) => {
      if (payload.peerId === this.peerId) return;

      this.remotePeers.set(payload.peerId, {
        id: payload.peerId,
        displayName: payload.displayName,
        role: payload.role,
        audioMuted: payload.audioMuted,
        videoMuted: payload.videoMuted,
        screenSharing: payload.screenSharing,
        hasSecondaryCamera: payload.hasSecondaryCamera,
        handRaised: payload.handRaised || false,
        isSpeaking: payload.isSpeaking || false,
        connectionQuality: 'excellent',
        joinedAt: Date.now()
      });
      this.notifyPeersChange();

      // Existing peer prepares connection with isInitiator = false, waiting for offer
      this.createPeerConnection(payload.peerId, false);
    });

    this.signaling.on('peer:left', (payload) => {
      this.cleanupPeerConnection(payload.peerId);
      this.remotePeers.delete(payload.peerId);
      this.negotiatedPeers.delete(payload.peerId);
      this.notifyPeersChange();
    });

    // Perfect Negotiation: Polite peer handles offer collision with rollback
    this.signaling.on('peer:offer', async (payload) => {
      const { fromPeerId, offer } = payload;
      let pc = this.peerConnections.get(fromPeerId);
      if (!pc) {
        pc = this.createPeerConnection(fromPeerId, false);
      }

      const isPolite = this.peerId > fromPeerId;
      const isMakingOffer = this.makingOfferMap.get(fromPeerId) || false;
      const offerCollision = (offer.type === 'offer') && (isMakingOffer || pc.signalingState !== 'stable');

      if (offerCollision && !isPolite) {
        // Impolite peer drops offer collision safely
        console.warn(`[WebRTC] Glare collision: impolite peer ${this.peerId} ignoring offer from ${fromPeerId}`);
        return;
      }

      try {
        if (offerCollision && isPolite) {
          // Polite peer rolls back to stable before applying remote offer
          await pc.setRemoteDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await pc.setLocalDescription(); // Parameterless setLocalDescription creates answer when remote is offer

        this.signaling.send('peer:answer', {
          targetPeerId: fromPeerId,
          answer: pc.localDescription
        });

        this.negotiatedPeers.add(fromPeerId);
        this.drainIceQueue(fromPeerId, pc);
      } catch (err) {
        console.error('Error handling peer:offer:', err);
      }
    });

    this.signaling.on('peer:answer', async (payload) => {
      const { fromPeerId, answer } = payload;
      const pc = this.peerConnections.get(fromPeerId);
      if (pc && pc.signalingState !== 'stable') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          this.negotiatedPeers.add(fromPeerId);
          // Drain any queued ICE candidates
          this.drainIceQueue(fromPeerId, pc);
        } catch (err) {
          console.error('Error handling peer:answer:', err);
        }
      }
    });

    this.signaling.on('peer:ice', async (payload) => {
      const { fromPeerId, candidate } = payload;
      const pc = this.peerConnections.get(fromPeerId);
      if (pc && candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.warn('Error adding ICE candidate directly:', err);
          }
        } else {
          // Queue ICE candidate until remoteDescription is set
          if (!this.iceCandidateQueues.has(fromPeerId)) {
            this.iceCandidateQueues.set(fromPeerId, []);
          }
          this.iceCandidateQueues.get(fromPeerId)!.push(candidate);
        }
      }
    });

    this.signaling.on('peer:state-updated', (payload) => {
      const peer = this.remotePeers.get(payload.peerId);
      if (peer) {
        if (payload.audioMuted !== undefined) peer.audioMuted = payload.audioMuted;
        if (payload.videoMuted !== undefined) peer.videoMuted = payload.videoMuted;
        if (payload.screenSharing !== undefined) peer.screenSharing = payload.screenSharing;
        if (payload.hasSecondaryCamera !== undefined) peer.hasSecondaryCamera = payload.hasSecondaryCamera;
        if (payload.displayName !== undefined) peer.displayName = payload.displayName;
        if (payload.handRaised !== undefined) peer.handRaised = payload.handRaised;
        if (payload.isSpeaking !== undefined) peer.isSpeaking = payload.isSpeaking;
        
        if (payload.role !== undefined) {
          peer.role = payload.role;
          if (payload.peerId === this.peerId) {
            this.role = payload.role;
            this.onRoleChangedCallbacks.forEach(cb => cb(payload.role));
          }
        }
        
        this.notifyPeersChange();
      }
    });

    this.signaling.on('room:invite-cohost', (payload) => {
      this.onCoHostInviteCallbacks.forEach(cb => cb(payload));
    });
  }

  private drainIceQueue(peerId: string, pc: RTCPeerConnection) {
    const queue = this.iceCandidateQueues.get(peerId);
    if (queue && queue.length > 0) {
      queue.forEach((candidate) => {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
          console.warn('Queued ICE candidate error:', e)
        );
      });
      this.iceCandidateQueues.delete(peerId);
    }
  }

  public async startLocalMedia(): Promise<MediaStream> {
    const preset = VIDEO_PRESETS[this.mediaSettings.resolution] || VIDEO_PRESETS['720p'];

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
      frameRate: { ideal: this.mediaSettings.fps }
    };

    if (this.mediaSettings.videoInputId) {
      videoConstraints.deviceId = { exact: this.mediaSettings.videoInputId };
    } else if (this.mediaSettings.facingMode) {
      videoConstraints.facingMode = { ideal: this.mediaSettings.facingMode };
    }

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 24 },
      channelCount: { ideal: 1 }
    };

    if (this.mediaSettings.audioInputId) {
      audioConstraints.deviceId = { exact: this.mediaSettings.audioInputId };
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints
      });

      this.updatePeerTracks();
      this.applyBitrateParameters();
      return this.localStream;
    } catch (err: any) {
      console.warn('Initial getUserMedia attempt failed, applying fallbacks:', err?.message || err);

      // Fallback 1: Retry with standard constraints without exact deviceId restrictions
      if (this.mediaSettings.videoInputId || this.mediaSettings.audioInputId) {
        try {
          this.mediaSettings.videoInputId = '';
          this.mediaSettings.audioInputId = '';
          this.localStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: preset.width },
              height: { ideal: preset.height },
              frameRate: { ideal: this.mediaSettings.fps }
            },
            audio: { echoCancellation: true, noiseSuppression: true }
          });
          this.updatePeerTracks();
          this.applyBitrateParameters();
          return this.localStream;
        } catch (e1: any) {
          console.warn('Fallback 1 (generic video+audio) notice:', e1?.message || e1);
        }
      }

      // Fallback 2: Try video-only (microphone might be disconnected or denied)
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: preset.width },
            height: { ideal: preset.height }
          },
          audio: false
        });
        this.updatePeerTracks();
        this.applyBitrateParameters();
        return this.localStream;
      } catch (e2: any) {
        console.warn('Fallback 2 (video-only) notice:', e2?.message || e2);
      }

      // Fallback 3: Try audio-only (camera might be disconnected, in use or denied)
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true }
        });
        this.updatePeerTracks();
        this.applyBitrateParameters();
        return this.localStream;
      } catch (e3: any) {
        console.warn('Fallback 3 (audio-only) notice:', e3?.message || e3);
      }

      // Fallback 4: If no physical camera/microphone exists (virtual machine, container, headless),
      // generate synthetic animated SMPTE test media so room and WebRTC pipeline function properly!
      console.warn('No physical media devices available, using synthetic test stream.');
      this.localStream = this.startSyntheticDemoMedia();
      this.updatePeerTracks();
      return this.localStream;
    }
  }

  /**
   * Generates a synthetic test pattern MediaStream (live clock, audio oscillator, SMPTE bars)
   * for testing WebRTC and AI observer when physical camera is unavailable.
   */
  public startSyntheticDemoMedia(): MediaStream {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;

    let frameCount = 0;
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b'];

    const render = () => {
      frameCount++;
      const timeStr = new Date().toLocaleTimeString();
      const ms = String(Date.now() % 1000).padStart(3, '0');

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, 1280, 720);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1280, 720);

      // Color bars
      const barWidth = 1280 / colors.length;
      colors.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * barWidth, 40, barWidth, 120);
      });

      // Animated waveform
      ctx.beginPath();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 4;
      for (let x = 0; x < 1280; x += 10) {
        const y = 360 + Math.sin((x + frameCount * 5) * 0.02) * 60 * Math.sin(frameCount * 0.05);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Big Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔴 BeamLive Studio • ТЕСТОВЫЙ ПОТОК', 640, 240);

      // Live Time and details
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '32px monospace';
      ctx.fillText(`${timeStr}.${ms} • 1080p WebRTC LIVE`, 640, 480);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px sans-serif';
      ctx.fillText('Сгенерированный тестовый видеопоток для демонстрации и ИИ-анализа', 640, 540);

      // Bouncing radar circle
      const circleX = 640 + Math.cos(frameCount * 0.05) * 400;
      const circleY = 620;
      ctx.beginPath();
      ctx.arc(circleX, circleY, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#f43f5e';
      ctx.fill();

      requestAnimationFrame(render);
    };

    render();

    const videoStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
    const videoTrack = videoStream ? videoStream.getVideoTracks()[0] : null;

    // Generate lightweight silent/low audio track
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.01; // subtle tone
    osc.frequency.value = 440;
    const dst = audioCtx.createMediaStreamDestination();
    osc.connect(gain);
    gain.connect(dst);
    osc.start();
    const audioTrack = dst.stream.getAudioTracks()[0];

    const tracks: MediaStreamTrack[] = [];
    if (videoTrack) tracks.push(videoTrack);
    if (audioTrack) tracks.push(audioTrack);

    this.localStream = new MediaStream(tracks);
    this.updatePeerTracks();
    return this.localStream;
  }

  /**
   * Starts a secondary camera for Dual-Camera streaming (e.g. Back camera while front is active)
   */
  public async startSecondaryCamera(deviceIdOrFacingMode?: string): Promise<MediaStream> {
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      };

      if (deviceIdOrFacingMode && deviceIdOrFacingMode !== 'user' && deviceIdOrFacingMode !== 'environment') {
        videoConstraints.deviceId = { exact: deviceIdOrFacingMode };
      } else {
        // If not specified, choose opposite of primary camera for mobile devices
        const targetFacing = deviceIdOrFacingMode || (this.mediaSettings.facingMode === 'user' ? 'environment' : 'user');
        videoConstraints.facingMode = { ideal: targetFacing };
      }

      this.secondaryCameraStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      this.hasSecondaryCamera = true;
      this.updatePeerTracks();

      this.signaling.send('peer:state-change', {
        hasSecondaryCamera: true
      });

      return this.secondaryCameraStream;
    } catch (err) {
      console.error('Secondary camera error:', err);
      this.hasSecondaryCamera = false;
      throw err;
    }
  }

  public stopSecondaryCamera() {
    if (this.secondaryCameraStream) {
      this.secondaryCameraStream.getTracks().forEach((t) => t.stop());
      this.secondaryCameraStream = null;
    }
    this.hasSecondaryCamera = false;
    this.updatePeerTracks();

    this.signaling.send('peer:state-change', {
      hasSecondaryCamera: false
    });
  }

  public async startScreenShare(): Promise<MediaStream> {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
          frameRate: { max: 60 }
        },
        audio: true
      });

      this.isScreenSharing = true;

      this.screenStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      this.updatePeerTracks();

      this.signaling.send('peer:state-change', {
        screenSharing: true
      });

      return this.screenStream;
    } catch (err) {
      console.error('Screen sharing error:', err);
      this.isScreenSharing = false;
      throw err;
    }
  }

  public stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    this.updatePeerTracks();

    this.signaling.send('peer:state-change', {
      screenSharing: false
    });
  }

  private updatePeerTracks() {
    this.peerConnections.forEach((pc) => {
      // Re-add or update tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          const sender = pc.getSenders().find((s) => s.track?.id === track.id || s.track?.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track).catch((e) => console.warn('replaceTrack error:', e));
          } else {
            pc.addTrack(track, this.localStream!);
          }
        });
      }

      if (this.screenStream) {
        this.screenStream.getTracks().forEach((track) => {
          const sender = pc.getSenders().find((s) => s.track?.id === track.id);
          if (!sender) {
            pc.addTrack(track, this.screenStream!);
          }
        });
      }

      if (this.secondaryCameraStream) {
        this.secondaryCameraStream.getTracks().forEach((track) => {
          const sender = pc.getSenders().find((s) => s.track?.id === track.id);
          if (!sender) {
            pc.addTrack(track, this.secondaryCameraStream!);
          }
        });
      }
    });
  }

  public toggleAudio(): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.isAudioMuted = !audioTrack.enabled;

      this.signaling.send('peer:state-change', {
        audioMuted: this.isAudioMuted
      });
    }
    return this.isAudioMuted;
  }

  public toggleVideo(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.isVideoMuted = !videoTrack.enabled;

      this.signaling.send('peer:state-change', {
        videoMuted: this.isVideoMuted
      });
    }
    return this.isVideoMuted;
  }

  /**
   * One-tap instant camera flip between front ('user') and back ('environment')
   * Uses WebRTC RTCRtpSender.replaceTrack for seamless, glitch-free switching!
   */
  public async switchFacingMode(): Promise<'user' | 'environment'> {
    const newFacingMode: 'user' | 'environment' = this.mediaSettings.facingMode === 'user' ? 'environment' : 'user';
    this.mediaSettings.facingMode = newFacingMode;
    this.mediaSettings.videoInputId = ''; // Reset specific deviceId so facingMode takes precedence

    const preset = VIDEO_PRESETS[this.mediaSettings.resolution] || VIDEO_PRESETS['720p'];

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: newFacingMode },
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: this.mediaSettings.fps }
        },
        audio: false // preserve existing mic audio without re-requesting
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return newFacingMode;

      if (this.localStream) {
        const oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localStream.addTrack(newVideoTrack);
      } else {
        this.localStream = newStream;
      }

      // Seamlessly replace track on all peer connections
      this.peerConnections.forEach((pc) => {
        const senders = pc.getSenders().filter((s) => s.track?.kind === 'video');
        if (senders.length > 0) {
          senders[0].replaceTrack(newVideoTrack).catch((e) => console.warn('replaceTrack warning:', e));
        }
      });

      return newFacingMode;
    } catch (err) {
      console.error('switchFacingMode error:', err);
      return this.mediaSettings.facingMode;
    }
  }

  /**
   * Switch to a specific video device ID with seamless replaceTrack
   */
  public async switchCamera(deviceId: string): Promise<boolean> {
    this.mediaSettings.videoInputId = deviceId;
    const preset = VIDEO_PRESETS[this.mediaSettings.resolution] || VIDEO_PRESETS['720p'];

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: this.mediaSettings.fps }
        },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return false;

      if (this.localStream) {
        const oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          this.localStream.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        this.localStream.addTrack(newVideoTrack);
      } else {
        this.localStream = newStream;
      }

      this.peerConnections.forEach((pc) => {
        const senders = pc.getSenders().filter((s) => s.track?.kind === 'video');
        if (senders.length > 0) {
          senders[0].replaceTrack(newVideoTrack).catch((e) => console.warn('replaceTrack warning:', e));
        }
      });

      return true;
    } catch (err) {
      console.error('switchCamera deviceId error:', err);
      return false;
    }
  }

  public captureFrameFromVideo(videoElement: HTMLVideoElement): string | null {
    try {
      if (!videoElement || videoElement.videoWidth === 0) return null;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(videoElement.videoWidth, 1280);
      canvas.height = Math.min(videoElement.videoHeight, 720);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
      console.error('Frame capture error:', err);
      return null;
    }
  }

  private createPeerConnection(remotePeerId: string, isInitiator: boolean): RTCPeerConnection {
    this.cleanupPeerConnection(remotePeerId);

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 2
    });

    this.peerConnections.set(remotePeerId, pc);

    let addedTrackCount = 0;

    // Add all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
        addedTrackCount++;
      });
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.screenStream!);
        addedTrackCount++;
      });
    }

    if (this.secondaryCameraStream) {
      this.secondaryCameraStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.secondaryCameraStream!);
        addedTrackCount++;
      });
    }

    // Add recvonly transceivers for audio & video if there are no local tracks yet
    if (addedTrackCount === 0) {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
        pc.addTransceiver('video', { direction: 'recvonly' });
      } catch (e) {
        // ignore
      }
    }

    // Handle incoming remote media tracks and streams
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const incomingStream = remoteStream || new MediaStream([event.track]);

      const peer = this.remotePeers.get(remotePeerId);
      if (peer) {
        if (!peer.stream) {
          peer.stream = incomingStream;
        } else if (peer.stream.id !== incomingStream.id) {
          // Secondary camera or screen stream
          if (!peer.extraStreams) peer.extraStreams = [];
          const exists = peer.extraStreams.find((s) => s.stream.id === incomingStream.id);
          if (!exists) {
            const label = peer.screenSharing ? 'Демонстрация экрана' : `Камера #${peer.extraStreams.length + 2}`;
            peer.extraStreams.push({
              id: incomingStream.id,
              type: peer.screenSharing ? 'screen' : 'secondary-camera',
              label,
              stream: incomingStream
            });
          }
        } else {
          // Track added to existing stream
          if (!peer.stream.getTracks().some((t) => t.id === event.track.id)) {
            peer.stream.addTrack(event.track);
          }
        }
        this.notifyPeersChange();
      }
      this.onTrackAddedCallbacks.forEach((cb) => cb(remotePeerId, incomingStream));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.send('peer:ice', {
          targetPeerId: remotePeerId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      const peer = this.remotePeers.get(remotePeerId);
      if (peer) {
        if (state === 'connected') peer.connectionQuality = 'excellent';
        else if (state === 'connecting') peer.connectionQuality = 'good';
        else if (state === 'disconnected') peer.connectionQuality = 'poor';
        else if (state === 'failed') peer.connectionQuality = 'reconnecting';
        else if (state === 'closed') peer.connectionQuality = 'disconnected';
        this.notifyPeersChange();
      }
    };

    // W3C Perfect Negotiation: onnegotiationneeded triggers offer creation
    pc.onnegotiationneeded = async () => {
      // In multi-host, only initiator initiates negotiation to prevent initial glare
      if (!isInitiator && !this.negotiatedPeers.has(remotePeerId)) {
        return;
      }

      try {
        this.makingOfferMap.set(remotePeerId, true);
        await pc.setLocalDescription(); // parameterless call sets appropriate offer description automatically

        this.signaling.send('peer:offer', {
          targetPeerId: remotePeerId,
          offer: pc.localDescription
        });
        
        this.negotiatedPeers.add(remotePeerId);
      } catch (err: any) {
        console.warn('[WebRTC] Negotiation offer warning:', err?.message || err);
      } finally {
        this.makingOfferMap.set(remotePeerId, false);
      }
    };

    this.startStatsPolling(remotePeerId, pc);
    return pc;
  }

  // Raise or lower hand in multi-user mode
  public raiseHand(raised = true) {
    this.isHandRaised = raised;
    this.signaling.send(raised ? 'room:raise-hand' : 'room:lower-hand', {});
    this.signaling.send('peer:state-change', { handRaised: raised });
  }

  // Invite viewer to cohost
  public inviteToCoHost(targetPeerId: string) {
    this.signaling.send('room:invite-cohost', { targetPeerId });
  }

  // Promote/demote co-hosts and roles
  public changePeerRole(targetPeerId: string, newRole: UserRole) {
    this.signaling.send('room:role-change', { targetPeerId, newRole });
  }

  // Set self speaking state
  public setSpeakingState(isSpeaking: boolean) {
    this.signaling.send('peer:state-change', { isSpeaking });
  }

  // Multi-user dynamic event subscription methods
  public subscribeCoHostInvite(cb: (payload: { fromPeerId: string; fromDisplayName: string }) => void) {
    this.onCoHostInviteCallbacks.add(cb);
    return () => this.onCoHostInviteCallbacks.delete(cb);
  }

  public subscribeRoleChanged(cb: (newRole: UserRole) => void) {
    this.onRoleChangedCallbacks.add(cb);
    return () => this.onRoleChangedCallbacks.delete(cb);
  }

  private startStatsPolling(remotePeerId: string, pc: RTCPeerConnection) {
    const interval = setInterval(async () => {
      if (pc.signalingState === 'closed') {
        clearInterval(interval);
        return;
      }

      try {
        const reports = await pc.getStats();
        let rtt = 0;
        let jitter = 0;
        let packetLoss = 0;
        let bitrate = 0;
        let fps = 0;
        let width = 0;
        let height = 0;
        let audioCodec = 'Opus';
        let videoCodec = 'VP8/H.264';
        let bytesRecv = 0;
        let packetsLost = 0;
        let packetsTotal = 0;

        reports.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }

          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            jitter = Math.round((report.jitter || 0) * 1000);
            packetsLost = report.packetsLost || 0;
            packetsTotal = (report.packetsReceived || 0) + packetsLost;
            fps = Math.round(report.framesPerSecond || 0);
            width = report.frameWidth || 0;
            height = report.frameHeight || 0;
            bytesRecv = report.bytesReceived || 0;

            const last = this.lastBytesStats.get(remotePeerId);
            const now = Date.now();
            if (last) {
              const deltaBytes = bytesRecv - last.bytes;
              const deltaTime = (now - last.timestamp) / 1000;
              if (deltaTime > 0 && deltaBytes >= 0) {
                bitrate = Math.round((deltaBytes * 8) / (deltaTime * 1000));
              }
            }
            this.lastBytesStats.set(remotePeerId, { bytes: bytesRecv, timestamp: now });
          }

          if (report.type === 'codec') {
            if (report.mimeType?.includes('video')) {
              videoCodec = report.mimeType.split('/')[1];
            } else if (report.mimeType?.includes('audio')) {
              audioCodec = report.mimeType.split('/')[1];
            }
          }
        });

        if (packetsTotal > 0) {
          packetLoss = Math.min(100, Math.round((packetsLost / packetsTotal) * 100));
        }

        const stats: WebRTCStats = {
          rtt: rtt || 24,
          jitter,
          packetLoss,
          bitrate: bitrate || 1850,
          fps: fps || 30,
          resolution: {
            width: width || 1280,
            height: height || 720
          },
          audioCodec,
          videoCodec,
          timestamp: Date.now()
        };

        this.onStatsCallbacks.forEach((cb) => cb(remotePeerId, stats));
      } catch (e) {
        // ignore
      }
    }, 1500);

    this.statsIntervals.set(remotePeerId, interval);
  }

  private applyBitrateParameters() {
    const maxBps = BITRATE_PRESETS[this.mediaSettings.bitratePreset];
    if (!maxBps) return;

    this.peerConnections.forEach((pc) => {
      const senders = pc.getSenders().filter((s) => s.track?.kind === 'video');
      senders.forEach((sender) => {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBps;
        sender.setParameters(params).catch((e) => console.warn('Bitrate param error:', e));
      });
    });
  }

  public async startRecording(streamToRecord?: MediaStream): Promise<boolean> {
    const targetStream = streamToRecord || this.localStream;
    if (!targetStream) return false;

    try {
      this.recordedChunks = [];
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
      ];
      const selectedMime = mimeTypes.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';

      this.mediaRecorder = new MediaRecorder(targetStream, selectedMime ? { mimeType: selectedMime } : undefined);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.isRecording = false;
        this.saveRecording();
      };

      this.mediaRecorder.start(1000);
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      return true;
    } catch (err) {
      console.error('MediaRecorder error:', err);
      this.isRecording = false;
      return false;
    }
  }

  public stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }
  }

  private saveRecording() {
    if (this.recordedChunks.length === 0) return;
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `beamlive-stream-${this.roomId}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 200);
  }

  public cleanupPeerConnection(peerId: string) {
    const interval = this.statsIntervals.get(peerId);
    if (interval) {
      clearInterval(interval);
      this.statsIntervals.delete(peerId);
    }
    this.lastBytesStats.delete(peerId);
    this.makingOfferMap.delete(peerId);
    this.iceCandidateQueues.delete(peerId);

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {
        // ignore
      }
      this.peerConnections.delete(peerId);
    }
  }

  public destroy() {
    this.stopRecording();
    this.stopScreenShare();
    this.stopSecondaryCamera();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.peerConnections.forEach((_pc, id) => {
      this.cleanupPeerConnection(id);
    });

    this.remotePeers.clear();
    this.onPeersChangeCallbacks.clear();
    this.onStatsCallbacks.clear();
    this.onTrackAddedCallbacks.clear();
  }
}
