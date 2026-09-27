import React, { useState } from 'react';
import { X, Radio, Copy, Check, Terminal, ExternalLink, ShieldCheck } from 'lucide-react';

interface OBSGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

export const OBSGuideModal: React.FC<OBSGuideModalProps> = ({ isOpen, onClose, roomId }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const browserSourceUrl = `${origin}/source/${roomId}`;
  const rtmpServerUrl = `rtmp://${window.location.hostname}:1935/live`;
  const streamKey = (typeof window !== 'undefined' && localStorage.getItem(`beamlive_rtmp_key_${roomId}`)) || `live_${roomId}`;
  const whipUrl = `${origin}/api/whip/${roomId}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-neutral-950/50">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-white">OBS Studio & Ingest Integration</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Method 1: Browser Source (Recommended, 0 Setup) */}
          <div className="p-4 rounded-xl bg-neutral-950/60 border border-indigo-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-300">
                METHOD 1: OBS Browser Source (Recommended)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                Lowest Latency (&lt; 200ms)
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              In OBS Studio, click <span className="text-neutral-200 font-semibold">+ &gt; Browser</span>, set Width to 1920, Height to 1080, and paste this URL:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={browserSourceUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-200 select-all"
              />
              <button
                onClick={() => copyToClipboard(browserSourceUrl, 'obs_src')}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
              >
                {copiedKey === 'obs_src' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'obs_src' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              Tip: Check <span className="text-neutral-300 font-mono">"Control audio via OBS"</span> and <span className="text-neutral-300 font-mono">"Shutdown source when not visible"</span> in OBS.
            </p>
          </div>

          {/* Method 2: RTMP Ingest via MediaMTX */}
          <div className="p-4 rounded-xl bg-neutral-950/60 border border-white/5 space-y-3">
            <span className="text-xs font-bold text-neutral-200">
              METHOD 2: RTMP / MediaMTX Ingest
            </span>
            <div className="space-y-2">
              <div>
                <label className="text-[11px] text-neutral-400">Server URL:</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    type="text"
                    readOnly
                    value={rtmpServerUrl}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-300 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(rtmpServerUrl, 'rtmp_url')}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition shrink-0"
                  >
                    {copiedKey === 'rtmp_url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-neutral-400">Stream Key:</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <input
                    type="text"
                    readOnly
                    value={streamKey}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-300 select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(streamKey, 'rtmp_key')}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition shrink-0"
                  >
                    {copiedKey === 'rtmp_key' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Method 3: WHIP (WebRTC HTTP Ingestion Protocol) */}
          <div className="p-4 rounded-xl bg-neutral-950/60 border border-white/5 space-y-2">
            <span className="text-xs font-bold text-neutral-200">
              METHOD 3: WebRTC WHIP Output in OBS 30+
            </span>
            <p className="text-xs text-neutral-400">
              In OBS Settings &gt; Stream &gt; Service: <span className="text-neutral-200 font-semibold">WHIP</span>
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={whipUrl}
                className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/10 text-xs font-mono text-neutral-300 select-all"
              />
              <button
                onClick={() => copyToClipboard(whipUrl, 'whip_url')}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition shrink-0"
              >
                {copiedKey === 'whip_url' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-neutral-950/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
