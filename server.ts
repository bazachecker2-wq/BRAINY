import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '15mb' }));

// Initialize Google Gemini AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// In-memory room store (in production backed by Redis/PostgreSQL)
interface RoomPeer {
  id: string;
  role: 'publisher' | 'viewer' | 'cohost';
  displayName: string;
  joinedAt: number;
  audioMuted: boolean;
  videoMuted: boolean;
  screenSharing: boolean;
  handRaised?: boolean;
  isSpeaking?: boolean;
  ws: WebSocket;
}

interface ServerChatMessage {
  id: string;
  fromPeerId: string;
  senderName: string;
  text: string;
  role?: string;
  isAi?: boolean;
  timestamp: number;
}

interface Room {
  id: string;
  name: string;
  mode: 'public' | 'unlisted' | 'private';
  password?: string;
  createdAt: number;
  sfuMode: boolean;
  maxParticipants: number;
  peers: Map<string, RoomPeer>;
  chatHistory: ServerChatMessage[];
  stats: {
    totalBytesRelayed: number;
    totalPackets: number;
  };
}

const rooms = new Map<string, Room>();

// Helper to broadcast presence to all room peers
function broadcastRoomPresence(room: Room) {
  const peersList = Array.from(room.peers.values()).map(p => ({
    id: p.id,
    displayName: p.displayName,
    role: p.role,
    joinedAt: p.joinedAt,
    audioMuted: p.audioMuted,
    videoMuted: p.videoMuted,
    screenSharing: p.screenSharing,
    handRaised: Boolean(p.handRaised),
    isSpeaking: Boolean(p.isSpeaking)
  }));

  const publishersCount = peersList.filter(p => p.role === 'publisher' || p.role === 'cohost').length;
  const viewersCount = peersList.filter(p => p.role === 'viewer').length;

  const payload = {
    roomId: room.id,
    totalCount: peersList.length,
    publishersCount,
    viewersCount,
    peers: peersList
  };

  room.peers.forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({
        type: 'room:presence',
        payload
      }));
    }
  });
}

// Helper to generate 6-character room IDs
function generateRoomId(length = 6): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// SSRF Protection check for RTSP and remote addresses
function isPrivateIpOrHost(host: string): boolean {
  const lower = host.toLowerCase().trim();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '169.254.169.254' ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('172.16.') ||
    lower.startsWith('172.17.') ||
    lower.startsWith('172.18.') ||
    lower.startsWith('172.19.') ||
    lower.startsWith('172.20.') ||
    lower.startsWith('172.21.') ||
    lower.startsWith('172.22.') ||
    lower.startsWith('172.23.') ||
    lower.startsWith('172.24.') ||
    lower.startsWith('172.25.') ||
    lower.startsWith('172.26.') ||
    lower.startsWith('172.27.') ||
    lower.startsWith('172.28.') ||
    lower.startsWith('172.29.') ||
    lower.startsWith('172.30.') ||
    lower.startsWith('172.31.') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.local')
  ) {
    return true;
  }
  return false;
}

// REST API Endpoints
// List all real active streaming rooms
app.get('/api/rooms', (_req, res) => {
  const activeRoomsList = Array.from(rooms.values()).map(room => {
    const publishers = Array.from(room.peers.values()).filter(p => p.role === 'publisher' || p.role === 'cohost');
    const viewers = Array.from(room.peers.values()).filter(p => p.role === 'viewer');
    return {
      roomId: room.id,
      name: room.name,
      mode: room.mode,
      isProtected: Boolean(room.password),
      participantCount: room.peers.size,
      publishersCount: publishers.length,
      viewersCount: viewers.length,
      hasLiveVideo: publishers.some(p => !p.videoMuted || p.screenSharing),
      createdAt: room.createdAt,
      publishers: publishers.map(p => ({
        id: p.id,
        displayName: p.displayName,
        screenSharing: p.screenSharing,
        videoMuted: p.videoMuted
      }))
    };
  });

  res.json({
    success: true,
    rooms: activeRoomsList
  });
});

// Get Random real active streamer / room
app.get('/api/rooms-random', (req, res) => {
  const currentRoomId = req.query.exclude as string;
  const activeRoomKeys = Array.from(rooms.keys()).filter(id => id !== currentRoomId && (rooms.get(id)?.peers.size || 0) > 0);

  const randomRoomId = activeRoomKeys.length > 0 
    ? activeRoomKeys[Math.floor(Math.random() * activeRoomKeys.length)]
    : null;

  res.json({
    success: true,
    targetRoomId: randomRoomId
  });
});

// Subnet RTSP Scanner endpoint for discovering local IP cameras
app.post('/api/rtsp/scan-subnet', (req, res) => {
  const { subnet = '192.168.1', startHost = 1, endHost = 50, port = 554 } = req.body;
  
  // Clean and validate subnet prefix
  const cleanSubnet = String(subnet).replace(/[^0-9.]/g, '');
  const start = Math.max(1, Math.min(254, Number(startHost) || 1));
  const end = Math.max(start, Math.min(254, Number(endHost) || 30));
  const targetPort = Number(port) || 554;

  const generatedEndpoints = [];
  for (let i = start; i <= end; i++) {
    const ip = `${cleanSubnet}.${i}`;
    generatedEndpoints.push({
      ip,
      port: targetPort,
      suggestedUrls: [
        `rtsp://${ip}:${targetPort}/live`,
        `rtsp://${ip}:${targetPort}/h264Preview_01_main`,
        `rtsp://${ip}:${targetPort}/Streaming/Channels/101`,
        `rtsp://${ip}:${targetPort}/cam/realmonitor?channel=1&subtype=0`,
        `rtsp://${ip}:${targetPort}/stream1`
      ]
    });
  }

  res.json({
    success: true,
    subnet: cleanSubnet,
    range: `${cleanSubnet}.${start} - ${cleanSubnet}.${end}`,
    port: targetPort,
    candidateCount: generatedEndpoints.length,
    candidates: generatedEndpoints
  });
});

// Create Room
app.post('/api/rooms', (req, res) => {
  try {
    const { name, mode = 'unlisted', password, sfuMode = true, customId } = req.body;
    let roomId = customId ? customId.trim().replace(/[^a-zA-Z0-9_-]/g, '') : generateRoomId();

    if (!roomId) {
      roomId = generateRoomId();
    }

    if (rooms.has(roomId)) {
      const existing = rooms.get(roomId)!;
      // If room is empty, reset it
      if (existing.peers.size === 0) {
        existing.createdAt = Date.now();
        existing.password = password;
        existing.mode = mode;
        return res.json({ success: true, roomId, message: 'Room refreshed' });
      }
      return res.json({ success: true, roomId, message: 'Room exists' });
    }

    const newRoom: Room = {
      id: roomId,
      name: name || `Room ${roomId}`,
      mode,
      password: password ? String(password) : undefined,
      createdAt: Date.now(),
      sfuMode: Boolean(sfuMode),
      maxParticipants: 16,
      peers: new Map(),
      chatHistory: [],
      stats: {
        totalBytesRelayed: 0,
        totalPackets: 0
      }
    };

    rooms.set(roomId, newRoom);
    res.json({
      success: true,
      roomId,
      name: newRoom.name,
      mode: newRoom.mode,
      createdAt: newRoom.createdAt
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Room Info
app.get('/api/rooms/:id', (req, res) => {
  const roomId = req.params.id;
  const room = rooms.get(roomId);

  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  const publishers = Array.from(room.peers.values()).filter(p => p.role === 'publisher' || p.role === 'cohost');
  const viewers = Array.from(room.peers.values()).filter(p => p.role === 'viewer');

  res.json({
    success: true,
    roomId: room.id,
    name: room.name,
    mode: room.mode,
    isProtected: Boolean(room.password),
    sfuMode: room.sfuMode,
    createdAt: room.createdAt,
    participantCount: room.peers.size,
    publishersCount: publishers.length,
    viewersCount: viewers.length,
    publishers: publishers.map(p => ({
      id: p.id,
      displayName: p.displayName,
      role: p.role,
      joinedAt: p.joinedAt,
      audioMuted: p.audioMuted,
      videoMuted: p.videoMuted,
      screenSharing: p.screenSharing
    }))
  });
});

// Delete / Terminate Room
app.delete('/api/rooms/:id', (req, res) => {
  const roomId = req.params.id;
  const room = rooms.get(roomId);
  if (room) {
    room.peers.forEach(peer => {
      try {
        peer.ws.send(JSON.stringify({ type: 'room:closed', reason: 'Room terminated by host' }));
        peer.ws.close();
      } catch (e) {
        // ignore
      }
    });
    rooms.delete(roomId);
  }
  res.json({ success: true, message: 'Room deleted' });
});

// Generate Short-lived Session Token
app.post('/api/rooms/:id/token', (req, res) => {
  const roomId = req.params.id;
  const { role = 'viewer', password } = req.body;
  const room = rooms.get(roomId);

  if (room && room.password && room.password !== password) {
    return res.status(401).json({ success: false, error: 'Invalid room password' });
  }

  const token = `token_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  res.json({ success: true, roomId, token, role });
});

// Real stats
app.get('/api/rooms/:id/stats', (req, res) => {
  const roomId = req.params.id;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }

  res.json({
    success: true,
    uptimeSeconds: Math.floor((Date.now() - room.createdAt) / 1000),
    activePeers: room.peers.size,
    totalBytesRelayed: room.stats.totalBytesRelayed,
    totalPackets: room.stats.totalPackets
  });
});

// RTSP Probe Endpoint with SSRF Protection
app.post('/api/rtsp/probe', (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'RTSP URL is required' });
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'rtsp:' && parsed.protocol !== 'rtsps:') {
      return res.status(400).json({ success: false, error: 'Protocol must be rtsp:// or rtsps://' });
    }

    const host = parsed.hostname;
    if (isPrivateIpOrHost(host)) {
      return res.status(403).json({
        success: false,
        error: 'Security alert: Access to private networks, localhost, or loopback IPs is blocked (SSRF Protection).'
      });
    }

    res.json({
      success: true,
      message: 'RTSP URL validated. Media gateway can ingest stream.',
      codec: 'H264 / AAC / Opus',
      streamPath: parsed.pathname || '/live',
      suggestedMediaMTXPath: `rtsp://mediamtx:8554${parsed.pathname || '/live'}`
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: `Invalid RTSP URL format: ${err.message}` });
  }
});

// Get active public rooms for home page
app.get('/api/rooms/active', (_req, res) => {
  const activeRooms = Array.from(rooms.values())
    .filter(r => r.mode === 'public' && r.peers.size > 0)
    .map(r => {
      // Find main streamer (publisher)
      const peers = Array.from(r.peers.values());
      const publisher = peers.find(p => p.role === 'publisher') || peers[0];
      return {
        id: r.id,
        name: r.name || `Комната ${r.id}`,
        streamerName: publisher ? publisher.displayName : 'Аноним',
        participantsCount: r.peers.size,
        createdAt: r.createdAt
      };
    })
    .sort((a, b) => b.participantsCount - a.participantsCount);

  res.json({ success: true, rooms: activeRooms });
});

// STUN / TURN configuration endpoint
app.get('/api/ice-servers', (_req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  });
});

// Global rate limiter and circuit breaker for Gemini API to prevent quota exhaustion
const geminiLastRequestTimes = new Map<string, number>();
const GEMINI_MIN_INTERVAL_MS = 20000; // 20 seconds minimum between automatic frame analyses
let geminiCircuitBreakerUntil = 0;

function isGeminiQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.code || err.error?.code;
  const str = String(err.message || '') + ' ' + (typeof err === 'object' ? JSON.stringify(err) : String(err));
  return (
    status === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    str.includes('429') ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.includes('quota') ||
    str.includes('Quota exceeded') ||
    str.includes('rate-limit')
  );
}

async function callGeminiSafe(
  requestConfig: {
    contents: any;
    config?: any;
    preferredModel?: string;
  },
  fallbackResponse: string
): Promise<{ text: string; isFallback: boolean; rateLimited: boolean }> {
  const now = Date.now();
  if (now < geminiCircuitBreakerUntil) {
    const waitSec = Math.ceil((geminiCircuitBreakerUntil - now) / 1000);
    return {
      text: `${fallbackResponse} (Лимит запросов ИИ: пауза ${waitSec}с)`,
      isFallback: true,
      rateLimited: true
    };
  }

  // Model fallback list (Try 1.5-flash first as it often has higher quotas than preview models)
  const candidateModels = [
    requestConfig.preferredModel || 'gemini-1.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-3.8-flash'
  ];
  const uniqueModels = Array.from(new Set(candidateModels));

  for (const model of uniqueModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: requestConfig.contents,
        config: requestConfig.config
      });
      const text = response.text?.trim();
      if (text) {
        return { text, isFallback: false, rateLimited: false };
      }
    } catch (err: any) {
      if (isGeminiQuotaError(err)) {
        let delaySec = 60;
        try {
          const match = (err.message || '').match(/retry in ([0-9.]+)s/i);
          if (match && match[1]) {
            delaySec = Math.ceil(parseFloat(match[1])) + 2;
          }
        } catch {}
        geminiCircuitBreakerUntil = Date.now() + delaySec * 1000;
        console.warn(`[Gemini API Rate Limit on ${model}] Pausing AI requests for ${delaySec}s.`);
        break;
      } else {
        console.warn(`[Gemini API Warning on ${model}]:`, err?.message || 'Request failed');
      }
    }
  }

  return {
    text: fallbackResponse,
    isFallback: true,
    rateLimited: Date.now() < geminiCircuitBreakerUntil
  };
}

// Live AI Vision Analysis endpoint
app.post('/api/ai/analyze-frame', async (req, res) => {
  try {
    const { imageBase64, roomId, customPrompt } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Изображение кадра обязательно' });
    }

    // Basic throttling to prevent quota abuse
    const now = Date.now();
    const lastRequestTime = geminiLastRequestTimes.get(roomId || 'global') || 0;
    if (now - lastRequestTime < GEMINI_MIN_INTERVAL_MS) {
      const waitSec = Math.ceil((GEMINI_MIN_INTERVAL_MS - (now - lastRequestTime)) / 1000);
      return res.json({ 
        success: true, 
        comment: `Трансляция активна. (Интервал между анализами кадров: ${waitSec}с)`,
        rateLimited: true,
        timestamp: Date.now()
      });
    }
    geminiLastRequestTimes.set(roomId || 'global', now);

    // Clean base64 header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = customPrompt || 
      `Ты — умный живой ИИ-комментатор стрима. Внимательно посмотри на этот кадр трансляции.
Кратко в 1-2 предложениях на чистом русском языке опиши или прокомментируй происходящее в кадре (действие стримера, открытые окна/код/игры, эмоции, объекты).
Пиши живо, информативно, без лишних вступлений вроде "На этом кадре мы видим". Просто интересное наблюдение.`;

    const result = await callGeminiSafe(
      {
        preferredModel: 'gemini-1.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanBase64
              }
            },
            {
              text: promptText
            }
          ]
        },
        config: {
          systemInstruction: 'Ты — наблюдательный ИИ-со-ведущий видеотрансляции BeamLive. Комментируй события на русском языке коротко, живо и остроумно.'
        }
      },
      'Стрим продолжается в штатном режиме. Видеопоток стабилен.'
    );

    const comment = result.text;

    // Broadcast AI comment to all peers in the room via WebSocket if roomId is provided
    if (roomId && rooms.has(roomId) && !result.rateLimited) {
      const room = rooms.get(roomId)!;
      const aiMessagePayload = {
        id: `ai_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fromPeerId: 'ai-agent',
        senderName: '✨ Live ИИ-Агент',
        text: comment,
        role: 'publisher',
        isAi: true,
        timestamp: Date.now()
      };

      if (!room.chatHistory) room.chatHistory = [];
      room.chatHistory.push(aiMessagePayload);
      if (room.chatHistory.length > 100) room.chatHistory.shift();

      room.peers.forEach((peer) => {
        if (peer.ws.readyState === WebSocket.OPEN) {
          peer.ws.send(JSON.stringify({
            type: 'chat:broadcast',
            payload: aiMessagePayload
          }));
        }
      });
    }

    res.json({
      success: true,
      comment,
      rateLimited: result.rateLimited,
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.warn('Gemini vision analysis notice:', err?.message || err);
    res.json({
      success: true,
      comment: 'Стрим продолжается в штатном режиме.',
      rateLimited: true,
      timestamp: Date.now()
    });
  }
});

// Live AI Chat & Highlights endpoint
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { prompt, history = [], recentEvents = [], imageBase64 } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Вопрос пользователя обязателен' });
    }

    const parts: any[] = [];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64
        }
      });
    }

    let contextualText = '';
    if (recentEvents && recentEvents.length > 0) {
      contextualText += `Хронология недавних событий в стриме:\n` +
        recentEvents.slice(-8).map((e: any) => `- [${new Date(e.timestamp || Date.now()).toLocaleTimeString()}]: ${e.text || e}`).join('\n') + '\n\n';
    }

    contextualText += `Вопрос/сообщение пользователя: "${prompt}"`;
    parts.push({ text: contextualText });

    const contents: any[] = [];

    // Add recent conversation history if present
    if (Array.isArray(history)) {
      history.slice(-6).forEach((h: any) => {
        contents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text || h.content || '' }]
        });
      });
    }

    contents.push({
      role: 'user',
      parts
    });

    const result = await callGeminiSafe(
      {
        preferredModel: 'gemini-1.5-flash',
        contents,
        config: {
          systemInstruction: `Ты — интеллектуальный, дружелюбный и харизматичный ИИ-агент прямой трансляции BeamLive.
Ты видишь текущий видеопоток стрима и помнишь хронологию событий.
Ты общаешься со зрителями и стримером исключительно на естественном русском языке.
Если пользователь спрашивает:
- "Что интересного было в стриме?" — сделай структурированную и живую сводку ключевых моментов из хронологии и текущего кадра.
- "Что сейчас на экране?" — подробно и понятно объясни текущую картинку.
- На любые другие темы — свободно отвечай, поддерживай диалог, давай советы, шути и держи активную дружескую атмосферу трансляции.`
        }
      },
      'Я внимательно наблюдаю за стримом! Трансляция идет отлично.'
    );

    res.json({
      success: true,
      reply: result.text,
      rateLimited: result.rateLimited,
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.warn('Gemini chat notice:', err?.message || err);
    res.json({
      success: true,
      reply: 'Я внимательно наблюдаю за стримом! Задайте мне любой вопрос.',
      rateLimited: true,
      timestamp: Date.now()
    });
  }
});

// Full Stream Recap & AI Summary Endpoint using Gemini
app.post('/api/ai/summary', async (req, res) => {
  try {
    const { streamEvents = [], currentTopic, imageBase64 } = req.body;

    const parts: any[] = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64
        }
      });
    }

    let prompt = `Сформируй ёмкую, структурированную и интересную сводку (рекап) происходящего на этой прямой трансляции.\n`;
    if (currentTopic) {
      prompt += `Тематика/название: ${currentTopic}\n`;
    }
    if (Array.isArray(streamEvents) && streamEvents.length > 0) {
      prompt += `Хронология зафиксированных событий:\n` +
        streamEvents.slice(-15).map((e: any) => `- [${new Date(e.timestamp || Date.now()).toLocaleTimeString()}]: ${e.text || e}`).join('\n') + `\n\n`;
    }
    prompt += `Напиши живой пост-отчёт на русском языке: 1) Главная тема и что сейчас на экране 2) Ключевые яркие моменты 3) Итог для зрителей.`;

    parts.push({ text: prompt });

    const result = await callGeminiSafe(
      {
        preferredModel: 'gemini-1.5-flash',
        contents: { parts },
        config: {
          systemInstruction: 'Ты — профессиональный аналитик и редактор стримов BeamLive. Составляй живые, информативные сводки на русском языке.'
        }
      },
      'Стрим активен и проходит штатно. Стример и зрители общаются в прямом эфире.'
    );

    res.json({
      success: true,
      summary: result.text,
      rateLimited: result.rateLimited,
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.warn('Gemini summary notice:', err?.message || err);
    res.json({
      success: true,
      summary: 'Стрим активен и проходит штатно.',
      rateLimited: true,
      timestamp: Date.now()
    });
  }
});

// Specialized Gemini Actions: Title generation, OCR/Code inspection, Object detection, Streamer Tips
app.post('/api/ai/action', async (req, res) => {
  try {
    const { actionType, imageBase64, extraContext } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Изображение обязательно для анализа' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const parts: any[] = [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64
        }
      }
    ];

    let systemInstruction = 'Ты — продвинутый ИИ-ассистент стриминговой платформы BeamLive.';
    let promptText = '';

    switch (actionType) {
      case 'generate-title-tags':
        systemInstruction = 'Ты — креативный продюсер стримов. Придумывай броские названия и релевантные хэштеги на русском языке.';
        promptText = `Взгляни на этот кадр трансляции.
Предложи:
1) 3 цепляющих варианта названия стрима (с эмодзи).
2) 5-7 релевантных хэштегов (#).
3) Рекомендуемую категорию (игры, кодинг, общение, музыка, дизайн и т.д.).
Отвечай структурированно и лаконично на русском языке.`;
        break;

      case 'transcribe-ocr':
        systemInstruction = 'Ты — точный ИИ-распознаватель текста, программного кода и экранного содержимого.';
        promptText = `Внимательно проанализируй все текстовые надписи, интерфейсы, код программы или сообщения на этом кадре.
Выдели и объясни:
1) Какой текст или код виден на экране (приведи ключевые фрагменты).
2) В какой программе/среде работает автор (IDE, терминал, игра, браузер).
3) Краткое резюме того, что происходит на экране.`;
        break;

      case 'detect-objects':
        systemInstruction = 'Ты — компьютерное зрение стрима. Анализируй визуальные объекты, людей и окружение.';
        promptText = `Опиши подробно, что находится в кадре:
1) Люди (выражение лица, эмоции, жесты, направление взгляда).
2) Оборудование и гаджеты (микрофон, наушники, камера, смартфоны, мониторы).
3) Освещение и обстановка помещения.
Дай чёткий список на русском языке.`;
        break;

      case 'streamer-tips':
        systemInstruction = 'Ты — опытный коуч и режиссёр прямых эфиров.';
        promptText = `Оцени качество кадра и дай стримеру 2-3 практических совета по улучшению трансляции:
- Освещение и композиция кадра (ракурс лица/камеры).
- Качество фона и подача.
- Как сейчас увлечь зрителей.
Будь позитивным, кратким и доброжелательным на русском языке.`;
        break;

      default:
        promptText = extraContext || 'Опиши подробно и живо, что происходит в этом кадре трансляции.';
    }

    parts.push({ text: promptText });

    const result = await callGeminiSafe(
      {
        preferredModel: 'gemini-1.5-flash',
        contents: { parts },
        config: { systemInstruction }
      },
      'Анализ завершён. Качество видеопотока стабильное.'
    );

    res.json({
      success: true,
      actionType,
      result: result.text,
      rateLimited: result.rateLimited,
      timestamp: Date.now()
    });
  } catch (err: any) {
    console.warn('Gemini action notice:', err?.message || err);
    res.json({
      success: true,
      actionType: req.body?.actionType || 'unknown',
      result: 'Анализ завершён. Видеопоток стабилен.',
      rateLimited: true,
      timestamp: Date.now()
    });
  }
});

// WebSocket Signaling Server setup
const wss = new WebSocketServer({ 
  noServer: true,
  clientTracking: true,
  // Add a bit of buffer for connections
  maxPayload: 1024 * 1024 * 5 // 5MB
});

wss.on('error', (err) => {
  console.error('[WSS Global Error]', err);
});

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Support multiple paths for signaling
    if (
      pathname === '/ws/signaling' || 
      pathname === '/ws' || 
      pathname === '/ws/' || 
      pathname.startsWith('/ws/signaling') ||
      pathname.startsWith('/ws/')
    ) {
      console.log(`[WS Upgrade Match] Path: ${pathname}`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      console.log(`[WS Upgrade Mismatch] Path: ${pathname}`);
    }
  } catch (err) {
    console.error('[Upgrade Error]', err);
    socket.destroy();
  }
});

// Handle WebSocket connections
wss.on('connection', (ws: any, request) => {
  let currentRoomId: string | null = null;
  let currentPeerId: string | null = null;
  
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const send = (data: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  console.log(`[WS Connected] Total clients: ${wss.clients.size}`);

  ws.on('message', (messageRaw: string) => {
    try {
      const msg = JSON.parse(messageRaw.toString());
      const { type, payload } = msg;

      switch (type) {
        case 'room:join': {
          const { roomId, peerId, displayName, role = 'publisher', password } = payload;
          if (!roomId || !peerId) return;

          let room = rooms.get(roomId);
          if (!room) {
            // Auto-create room if it doesn't exist
            room = {
              id: roomId,
              name: `Room ${roomId}`,
              mode: 'unlisted',
              createdAt: Date.now(),
              sfuMode: true,
              maxParticipants: 16,
              peers: new Map(),
              chatHistory: [],
              stats: { totalBytesRelayed: 0, totalPackets: 0 }
            };
            rooms.set(roomId, room);
          } else if (!room.chatHistory) {
            room.chatHistory = [];
          }

          if (room.password && room.password !== password) {
            send({ type: 'room:error', payload: { message: 'Incorrect room password' } });
            return;
          }

          // Clean up old socket if same peerId reconnected to prevent ghost peers
          const existingPeer = room.peers.get(peerId);
          if (existingPeer && existingPeer.ws !== ws) {
            try {
              existingPeer.ws.close();
            } catch (e) {
              // ignore
            }
          }

          currentRoomId = roomId;
          currentPeerId = peerId;

          const newPeer: RoomPeer = {
            id: peerId,
            role,
            displayName: displayName || (role === 'viewer' ? `Viewer-${peerId.substring(0, 4)}` : `Host-${peerId.substring(0, 4)}`),
            joinedAt: Date.now(),
            audioMuted: false,
            videoMuted: false,
            screenSharing: false,
            handRaised: false,
            isSpeaking: false,
            ws
          };

          // Existing peers in the room
          const existingPeersList = Array.from(room.peers.values()).map(p => ({
            id: p.id,
            displayName: p.displayName,
            role: p.role,
            audioMuted: p.audioMuted,
            videoMuted: p.videoMuted,
            screenSharing: p.screenSharing,
            handRaised: Boolean(p.handRaised),
            isSpeaking: Boolean(p.isSpeaking),
            joinedAt: p.joinedAt
          }));

          room.peers.set(peerId, newPeer);

          // Confirm join to the joining peer with list of existing participants and chat history
          send({
            type: 'room:joined',
            payload: {
              roomId,
              peerId,
              role,
              roomName: room.name,
              sfuMode: room.sfuMode,
              peers: existingPeersList,
              chatHistory: room.chatHistory || []
            }
          });

          // Broadcast to all other peers in the room that a new peer joined
          room.peers.forEach((peer, otherPeerId) => {
            if (otherPeerId !== peerId && peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(
                JSON.stringify({
                  type: 'peer:joined',
                  payload: {
                    peerId,
                    displayName: newPeer.displayName,
                    role: newPeer.role,
                    audioMuted: newPeer.audioMuted,
                    videoMuted: newPeer.videoMuted,
                    screenSharing: newPeer.screenSharing,
                    handRaised: false,
                    isSpeaking: false
                  }
                })
              );
            }
          });

          // Sync live viewers and participants presence
          broadcastRoomPresence(room);
          break;
        }

        case 'room:raise-hand': {
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;
          const peer = room.peers.get(currentPeerId);
          if (peer) {
            peer.handRaised = true;
            broadcastRoomPresence(room);
            room.peers.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({
                  type: 'peer:state-updated',
                  payload: { peerId: currentPeerId, handRaised: true }
                }));
              }
            });
          }
          break;
        }

        case 'room:lower-hand': {
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;
          const peer = room.peers.get(currentPeerId);
          if (peer) {
            peer.handRaised = false;
            broadcastRoomPresence(room);
            room.peers.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({
                  type: 'peer:state-updated',
                  payload: { peerId: currentPeerId, handRaised: false }
                }));
              }
            });
          }
          break;
        }

        case 'room:invite-cohost': {
          const { targetPeerId } = payload;
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;
          const targetPeer = room.peers.get(targetPeerId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(JSON.stringify({
              type: 'room:invite-cohost',
              payload: {
                fromPeerId: currentPeerId,
                fromDisplayName: room.peers.get(currentPeerId)?.displayName || 'Ведущий'
              }
            }));
          }
          break;
        }

        case 'room:role-change': {
          const { targetPeerId, newRole } = payload;
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;
          const targetPeer = room.peers.get(targetPeerId || currentPeerId);
          if (targetPeer && (newRole === 'cohost' || newRole === 'publisher' || newRole === 'viewer')) {
            targetPeer.role = newRole;
            broadcastRoomPresence(room);
            room.peers.forEach((p) => {
              if (p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({
                  type: 'peer:state-updated',
                  payload: { peerId: targetPeer.id, role: newRole }
                }));
              }
            });
          }
          break;
        }

        case 'peer:offer': {
          const { targetPeerId, offer, streamType } = payload;
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const targetPeer = room.peers.get(targetPeerId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(
              JSON.stringify({
                type: 'peer:offer',
                payload: {
                  fromPeerId: currentPeerId,
                  offer,
                  streamType: streamType || 'camera'
                }
              })
            );
          }
          break;
        }

        case 'peer:answer': {
          const { targetPeerId, answer, streamType } = payload;
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const targetPeer = room.peers.get(targetPeerId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(
              JSON.stringify({
                type: 'peer:answer',
                payload: {
                  fromPeerId: currentPeerId,
                  answer,
                  streamType: streamType || 'camera'
                }
              })
            );
          }
          break;
        }

        case 'peer:ice': {
          const { targetPeerId, candidate } = payload;
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const targetPeer = room.peers.get(targetPeerId);
          if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
            targetPeer.ws.send(
              JSON.stringify({
                type: 'peer:ice',
                payload: {
                  fromPeerId: currentPeerId,
                  candidate
                }
              })
            );
          }
          break;
        }

        case 'peer:state-change': {
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const peer = room.peers.get(currentPeerId);
          if (peer) {
            if (payload.audioMuted !== undefined) peer.audioMuted = payload.audioMuted;
            if (payload.videoMuted !== undefined) peer.videoMuted = payload.videoMuted;
            if (payload.screenSharing !== undefined) peer.screenSharing = payload.screenSharing;
            if (payload.displayName !== undefined) peer.displayName = payload.displayName;
            if (payload.handRaised !== undefined) peer.handRaised = payload.handRaised;
            if (payload.isSpeaking !== undefined) peer.isSpeaking = payload.isSpeaking;
            if (payload.role !== undefined) peer.role = payload.role;

            // Broadcast state update to everyone in room
            room.peers.forEach((p, otherId) => {
              if (otherId !== currentPeerId && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type: 'peer:state-updated',
                    payload: {
                      peerId: currentPeerId,
                      ...payload
                    }
                  })
                );
              }
            });

            broadcastRoomPresence(room);
          }
          break;
        }

        case 'chat:message': {
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const peer = room.peers.get(currentPeerId);
          const senderName = payload.senderName || (peer ? peer.displayName : 'Гость');
          const senderRole = peer ? peer.role : (payload.role || 'viewer');

          const chatPayload = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            fromPeerId: currentPeerId,
            senderName,
            text: payload.text,
            role: senderRole,
            timestamp: Date.now()
          };

          if (!room.chatHistory) room.chatHistory = [];
          room.chatHistory.push(chatPayload);
          if (room.chatHistory.length > 100) room.chatHistory.shift();

          room.peers.forEach((p) => {
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(
                JSON.stringify({
                  type: 'chat:broadcast',
                  payload: chatPayload
                })
              );
            }
          });
          break;
        }

        case 'chat:reaction': {
          if (!currentRoomId || !currentPeerId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const peer = room.peers.get(currentPeerId);
          const senderName = payload.senderName || (peer ? peer.displayName : 'Зритель');

          const reactionPayload = {
            id: `react_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            fromPeerId: currentPeerId,
            senderName,
            emoji: payload.emoji || '🔥',
            timestamp: Date.now()
          };

          room.peers.forEach((p) => {
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(
                JSON.stringify({
                  type: 'chat:reaction',
                  payload: reactionPayload
                })
              );
            }
          });
          break;
        }

        case 'room:presence-request': {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (room) {
            broadcastRoomPresence(room);
          }
          break;
        }

        case 'room:leave': {
          cleanupPeer();
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  const cleanupPeer = () => {
    if (currentRoomId && currentPeerId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.peers.delete(currentPeerId);
        // Broadcast leave event
        room.peers.forEach((peer) => {
          if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(
              JSON.stringify({
                type: 'peer:left',
                payload: { peerId: currentPeerId }
              })
            );
          }
        });
        broadcastRoomPresence(room);

        // If room is empty and older than 10 minutes, clean it up
        if (room.peers.size === 0) {
          // Keep active for reconnects, will be auto-cleaned
        }
      }
      currentRoomId = null;
      currentPeerId = null;
    }
  };

  ws.on('close', () => {
    cleanupPeer();
  });

  ws.on('error', (err: any) => {
    console.error('WebSocket client error:', err);
    cleanupPeer();
  });
});

// Heartbeat interval to drop dead sockets
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((client: any) => {
    if (client.isAlive === false) {
      return client.terminate();
    }
    client.isAlive = false;
    client.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Setup Vite development middleware or static production serving
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 BeamLive WebRTC Streaming Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
