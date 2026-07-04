import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { DbService } from '../db/db.service';

interface WsClient {
  ws: WebSocket;
  userId: string;
  name: string;
  avatarUrl: string | null;
  trips: Set<string>;
  alive: boolean;
}

@Injectable()
export class WsService {
  private clients = new Set<WsClient>();

  constructor(
    private readonly jwt: JwtService,
    private readonly dbs: DbService,
  ) {}

  attach(server: HttpServer) {
    const wss = new WebSocketServer({ server, path: '/ws' });

    // Heartbeat: terminate connections that miss two ping cycles so
    // presence never shows ghosts after network drops.
    const heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        c.ws.ping();
      }
    }, 30_000);
    heartbeat.unref();
    wss.on('close', () => clearInterval(heartbeat));

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') || '';
      let payload: { sub: string };
      try {
        payload = this.jwt.verify(token);
      } catch {
        ws.close(4001, 'unauthorized');
        return;
      }
      const user = this.dbs.db
        .prepare('SELECT id, name, avatar_url FROM users WHERE id = ?')
        .get(payload.sub) as { id: string; name: string; avatar_url: string | null } | undefined;
      if (!user) {
        ws.close(4001, 'unauthorized');
        return;
      }
      const client: WsClient = {
        ws,
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatar_url,
        trips: new Set(),
        alive: true,
      };
      this.clients.add(client);
      ws.on('pong', () => {
        client.alive = true;
      });
      ws.on('message', (raw) => {
        try {
          this.onMessage(client, JSON.parse(String(raw)));
        } catch {
          /* ignore malformed frames */
        }
      });
      ws.on('close', () => {
        const trips = [...client.trips];
        this.clients.delete(client);
        trips.forEach((t) => this.sendPresence(t));
      });
    });
  }

  private memberRole(tripId: string, userId: string): string | null {
    const row = this.dbs.db
      .prepare('SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?')
      .get(tripId, userId) as { role: string } | undefined;
    return row ? row.role : null;
  }

  private onMessage(client: WsClient, msg: any) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'JOIN_TRIP': {
        if (typeof msg.tripId !== 'string') return;
        if (!this.memberRole(msg.tripId, client.userId)) return;
        client.trips.add(msg.tripId);
        this.sendPresence(msg.tripId);
        break;
      }
      case 'LEAVE_TRIP': {
        if (typeof msg.tripId !== 'string') return;
        client.trips.delete(msg.tripId);
        this.sendPresence(msg.tripId);
        break;
      }
      case 'SEND_MESSAGE': {
        if (typeof msg.tripId !== 'string') return;
        const role = this.memberRole(msg.tripId, client.userId);
        if (!role || role === 'viewer') return;
        const content = String(msg.content ?? '').trim().slice(0, 2000);
        if (!content) return;
        const id = randomUUID();
        this.dbs.db
          .prepare('INSERT INTO messages (id, trip_id, user_id, content) VALUES (?, ?, ?, ?)')
          .run(id, msg.tripId, client.userId, content);
        const message = this.dbs.db
          .prepare(
            `SELECT m.*, u.name AS user_name, u.avatar_url AS user_avatar
             FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
          )
          .get(id);
        this.broadcast(msg.tripId, 'MESSAGE_SENT', message);
        break;
      }
      default:
        break;
    }
  }

  sendPresence(tripId: string) {
    const users = new Map<string, { id: string; name: string; avatar_url: string | null }>();
    for (const c of this.clients) {
      if (c.trips.has(tripId)) {
        users.set(c.userId, { id: c.userId, name: c.name, avatar_url: c.avatarUrl });
      }
    }
    this.broadcast(tripId, 'PRESENCE', { users: [...users.values()] });
  }

  broadcast(tripId: string, type: string, payload: unknown) {
    const data = JSON.stringify({ type, tripId, payload });
    for (const c of this.clients) {
      if (c.trips.has(tripId) && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(data);
      }
    }
  }
}
