import React, { useEffect, useRef, useState } from 'react';
import { SignalingClient } from '../services/signaling';
import { WebRTCManager } from '../services/webrtcManager';
import { PeerState } from '../types/webrtc';

interface SourceViewProps {
  roomId: string;
}

export const SourceView: React.FC<SourceViewProps> = ({ roomId }) => {
  const [remotePeers, setRemotePeers] = useState<PeerState[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const signalingRef = useRef<SignalingClient | null>(null);
  const managerRef = useRef<WebRTCManager | null>(null);

  const activePeer = remotePeers.find((p) => p.stream && (p.role === 'publisher' || p.role === 'cohost')) || remotePeers[0];
  const activeStream = activePeer?.stream;

  useEffect(() => {
    let isCancelled = false;

    async function initSource() {
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
        displayName: 'OBS-Source',
        role: 'viewer'
      });
    }

    initSource();

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

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden flex items-center justify-center select-none m-0 p-0">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
    </div>
  );
};
