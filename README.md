# BeamLive — Real-Time WebRTC Streaming Platform

BeamLive is a high-performance, ultra-low latency (< 1s) real-time video streaming web platform inspired by the UX of VDO.Ninja, built with TypeScript, React, Express, WebSockets, and WebRTC.

## 🚀 Key Features

- **Zero-Friction UX**: Open `/room/:roomId`, allow camera & microphone, and start streaming immediately.
- **Instant View-Only Mode**: Audiences open `/view/:roomId` for pure low-latency video without needing mic or camera access.
- **WebRTC Direct P2P & Multi-Viewer SFU**: Direct peer mesh and relay support with automatic SDP/ICE negotiation.
- **Live Telemetry & Diagnostics**: Real-time RTT (latency), jitter, packet loss %, framerate, and bitrate calculated straight from `RTCPeerConnection.getStats()`.
- **OBS Studio / vMix Integration**:
  - Direct OBS Browser Source `/source/:roomId` with transparent overlay support.
  - RTMP / WHIP Ingest via MediaMTX gateway.
- **RTSP IP Camera Bridge**: Convert security & IP camera streams (`rtsp://...`) directly into WebRTC feeds with SSRF protection.
- **Screen Sharing & Recording**: Capture screen, window, or tab, and record live streams directly to WebM/MP4 with browser downloads.
- **Embeddable Player**: Lightweight `/embed/:roomId` iframe player for embedding streams on external sites.

## 🛠 Quick Start

### 1. Local Development
```bash
# 1. Install dependencies
npm install

# 2. Run the full-stack server
npm run dev
```

Visit `http://localhost:3000` in your browser.

### 2. Production Docker Deployment
```bash
docker compose up -d
```

This spins up:
- WebRTC Application & Signaling Server (Port 3000)
- PostgreSQL (Port 5432)
- Redis (Port 6379)
- MediaMTX Media Gateway (Ports 1935, 8554, 8889)
- CoTURN STUN/TURN (Port 3478)

## 📡 API Endpoints

- `POST /api/rooms` — Create or configure a room
- `GET /api/rooms/:id` — Inspect active participants & room metadata
- `GET /api/rooms/:id/stats` — Real-time room telemetry
- `POST /api/rtsp/probe` — SSRF-safe RTSP stream validator
- `GET /api/ice-servers` — STUN/TURN traversal configurations
- `WS /ws/signaling` — Real-time WebRTC SDP offer/answer & ICE exchange
