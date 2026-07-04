import { useAuthStore } from '../store/auth';
import { useTripStore } from '../store/trip';
import type { WsEvent } from '../types';

/**
 * Singleton WebSocket connection. Joins one trip room at a time;
 * on reconnect it re-joins and triggers a full REST re-sync.
 */
class FableSocket {
  private ws: WebSocket | null = null;
  private tripId: string | null = null;
  private retry = 0;
  private closedByUs = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect() {
    const token = useAuthStore.getState().accessToken;
    if (!token || (this.ws && this.ws.readyState <= WebSocket.OPEN)) return;
    this.closedByUs = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws.onopen = () => {
      const wasRetry = this.retry > 0;
      this.retry = 0;
      if (this.tripId) {
        this.send({ type: 'JOIN_TRIP', tripId: this.tripId });
        // Missed events while offline: reload authoritative state.
        if (wasRetry) useTripStore.getState().reload();
      }
    };
    this.ws.onmessage = (e) => {
      try {
        const evt: WsEvent = JSON.parse(e.data);
        useTripStore.getState().applyEvent(evt);
      } catch {
        /* ignore malformed frames */
      }
    };
    this.ws.onclose = async (e) => {
      this.ws = null;
      if (this.closedByUs) return;
      // 4001 = server rejected the token (access tokens expire every 15m).
      // Refresh before reconnecting or we would loop on a dead token.
      if (e.code === 4001) {
        const { api } = await import('./api');
        const ok = await api.refresh();
        if (!ok) return;
      }
      const delay = Math.min(1000 * 2 ** this.retry, 15000);
      this.retry += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  joinTrip(tripId: string) {
    if (this.tripId && this.tripId !== tripId) {
      this.send({ type: 'LEAVE_TRIP', tripId: this.tripId });
    }
    this.tripId = tripId;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'JOIN_TRIP', tripId });
    } else {
      this.connect();
    }
  }

  leaveTrip() {
    if (this.tripId) this.send({ type: 'LEAVE_TRIP', tripId: this.tripId });
    this.tripId = null;
  }

  sendMessage(tripId: string, content: string) {
    this.send({ type: 'SEND_MESSAGE', tripId, content });
  }

  private send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  disconnect() {
    this.closedByUs = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.tripId = null;
    this.ws?.close();
    this.ws = null;
  }
}

export const socket = new FableSocket();
