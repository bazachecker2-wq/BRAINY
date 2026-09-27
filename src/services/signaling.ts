import { SignalingMessage } from '../types/webrtc';

type MessageHandler = (payload: any) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private lastJoinPayload: any = null;
  private isExplicitlyClosed = false;
  private messageQueue: SignalingMessage[] = [];
  public isConnected = false;
  private onStatusChangeCallbacks = new Set<(status: 'connecting' | 'connected' | 'disconnected' | 'error') => void>();

  constructor() {}

  public onStatusChange(callback: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) {
    this.onStatusChangeCallbacks.add(callback);
    return () => this.onStatusChangeCallbacks.delete(callback);
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error') {
    this.onStatusChangeCallbacks.forEach((cb) => cb(status));
  }

  public connect(): Promise<void> {
    this.isExplicitlyClosed = false;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return Promise.resolve();
    }

    this.notifyStatus('connecting');

    return new Promise((resolve) => {
      try {
        const url = new URL('/ws/signaling', window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = url.toString();

        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          // Already in connecting state, wait for open
          const checkTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              clearInterval(checkTimer);
              resolve();
            } else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
              clearInterval(checkTimer);
              resolve(); // let caller continue
            }
          }, 200);
          setTimeout(() => {
            clearInterval(checkTimer);
            resolve();
          }, 3000);
          return;
        }

        this.ws = new WebSocket(wsUrl);

        let hasResolved = false;

        this.ws.onopen = () => {
          this.isConnected = true;
          const wasReconnecting = this.reconnectAttempts > 0;
          this.reconnectAttempts = 0;
          this.notifyStatus('connected');

          // Keep-Alive Ping Interval to stay robustly connected
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 15000);

          // If was reconnecting and has a prior room join payload, auto-rejoin room!
          if (wasReconnecting && this.lastJoinPayload) {
            console.log('[Signaling] Auto-rejoining room:', this.lastJoinPayload.roomId);
            this.send('room:join', this.lastJoinPayload);
            
            // Trigger listeners of custom 'reconnected' event
            const listeners = this.handlers.get('reconnected');
            if (listeners) {
              listeners.forEach((handler) => handler(this.lastJoinPayload));
            }
          }

          // Flush queued messages
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            if (msg) this.send(msg.type, msg.payload);
          }

          if (!hasResolved) {
            hasResolved = true;
            resolve();
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const data: SignalingMessage = JSON.parse(event.data);
            if (data.type as any === 'pong') {
              // Internal keep-alive pong, ignore
              return;
            }
            const listeners = this.handlers.get(data.type);
            if (listeners) {
              listeners.forEach((handler) => handler(data.payload));
            }
          } catch (err) {
            console.warn('Failed to parse incoming WebSocket message:', err);
          }
        };

        this.ws.onerror = (event) => {
          console.warn('Signaling WebSocket connection state notice:', event?.type || 'offline');
          this.notifyStatus('error');
          if (!hasResolved) {
            hasResolved = true;
            resolve();
          }
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.notifyStatus('disconnected');
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          console.log(`WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);

          if (!this.isExplicitlyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
            this.reconnectAttempts++;
            console.log(`Attempting reconnect in ${delay}ms...`);
            this.reconnectTimeout = setTimeout(() => {
              this.connect().catch(() => {
                console.warn('Reconnection attempt failed');
              });
            }, delay);
          }
        };
      } catch (err) {
        console.warn('WebSocket connection initialization notice:', err);
        this.notifyStatus('error');
        resolve(); // do not block app setup
      }
    });
  }

  public send(type: SignalingMessage['type'], payload: any = {}) {
    if (type === 'room:join') {
      this.lastJoinPayload = payload;
    }
    const msg: SignalingMessage = { type, payload };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  public on(type: SignalingMessage['type'] | string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.off(type, handler);
    };
  }

  public off(type: SignalingMessage['type'] | string, handler: MessageHandler) {
    const listeners = this.handlers.get(type);
    if (listeners) {
      listeners.delete(handler);
    }
  }

  public close() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
    this.messageQueue = [];
    this.isConnected = false;
    this.lastJoinPayload = null;
  }
}
