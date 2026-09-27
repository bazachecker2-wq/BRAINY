import React, { useEffect, useRef, useState } from 'react';
import { SignalingClient } from '../services/signaling';
import { WebRTCManager } from '../services/webrtcManager';
import { PeerState } from '../types/webrtc';
import { Volume2, VolumeX, Maximize2, Radio } from 'lucide-react';

interface EmbedViewProps {
  roomId: string;
}

export const EmbedView: React.FC<EmbedViewProps> = ({ roomId }) => {
  const [remotePeers, setRemotePeers] = useState<PeerState[]>([]);
  const [isMuted, setIsMuted] = useState(true); // default muted for autoplay in iframe
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);

  const activePeer = remotePeers.find((p) => p.stream && (p.role === 'publisher' || p.role === 'cohost')) || remotePeers[0];
  const activeStream = activePeer?.stream;

  useEffect(() => {
    let isCancelled = false;
    async function initEmbed() {
      const signaling = new SignalingClient();
      signalingRef.current = signaling;
      await signaling.connect();

      const webrtc = new WebRTCManager(roomId, 'viewer', '', signaling);
      managerRef.current = webrtc;

      webrtc.subscribePeers((peers) => {
        if (!isCancelled) setRemotePeers(peers);
      });

      signaling.send('room:join', {
        roomId,
        peerId: webrtc.peerId,
        displayName: 'EmbedViewer',
        role: 'viewer'
      });
    }

    initEmbed();
    return () => {
      isCancelled = true;
      managerRef.current?.destroy();
      signalingRef.current?.close();
    };
  }, [roomId]);

  useEffect(() => {
    if (videoRef.current && activeStream) {
      videoRef.current.srcObject = activeStream;
      videoRef.current.play().catch(console.error);
    }
  }, [activeStream]);

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  return (
    <div
      ref={containerRef}
      className="group relative w-full h-full bg-black text-white flex items-center justify-center overflow-hidden select-none"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-contain"
      />

      {!activeStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-4 text-center">
          <Radio className="w-8 h-8 text-rose-500 animate-pulse mb-2" />
          <span className="text-xs font-semibold text-neutral-300">Live stream loading...</span>
        </div>
      )}

      {/* Floating mini overlay */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold text-rose-400">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
        <span>LIVE</span>
      </div>

      <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={toggleMute}
          className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white transition border border-white/10"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg bg-black/70 hover:bg-black/90 text-white transition border border-white/10"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
