import type * as Party from 'partykit/server';
import type { GameState, Player, ClientMessage, ServerMessage } from './types';

// ── Fase 0 ──
// Lobby básico server-authoritative: maneja conexiones, nombres (con
// desambiguación), elección de rol/equipo, "ready" y migración de host.
// El loop de juego (pista, adivinanzas, turnos, redacción anti-cheat) llega
// en las fases 1-2 — por ahora esas acciones responden con un `error`.
export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  private players = new Map<string, Player>();
  private hostId: string | null = null;

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const rawName = new URL(ctx.request.url).searchParams.get('name') ?? 'Jugador';
    const existing = this.players.get(conn.id);
    if (existing) {
      existing.connected = true; // reconexión: recupera su asiento
    } else {
      this.players.set(conn.id, {
        id: conn.id,
        name: this.uniqueName(rawName),
        role: 'spectator',
        team: null,
        connected: true,
        ready: false,
      });
    }
    if (!this.hostId) this.hostId = conn.id;
    this.broadcastState();
  }

  onMessage(raw: string, sender: Party.Connection) {
    const player = this.players.get(sender.id);
    if (!player) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'setName':
        player.name = this.uniqueName(msg.name, sender.id);
        break;
      case 'setRole':
        player.role = msg.role;
        player.team = msg.team;
        player.ready = false; // cambiar de asiento te marca como no listo
        break;
      case 'setReady':
        player.ready = msg.value;
        break;
      default:
        this.send(sender, {
          type: 'error',
          message: `Acción "${msg.type}" todavía no implementada (Fase 0).`,
        });
        return;
    }
    this.broadcastState();
  }

  onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    if (player) player.connected = false;

    // Migración de host: al participante conectado más antiguo (orden de inserción).
    if (this.hostId === conn.id) {
      const next = [...this.players.values()].find(p => p.connected);
      this.hostId = next ? next.id : null;
    }
    this.broadcastState();
  }

  // Agrega " (n)" (n = 1..9) si el nombre ya está tomado en la sala.
  private uniqueName(desired: string, selfId?: string): string {
    const base = desired.trim() || 'Jugador';
    const taken = new Set(
      [...this.players.values()].filter(p => p.id !== selfId).map(p => p.name),
    );
    if (!taken.has(base)) return base;
    for (let n = 1; n <= 9; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${base} (9)`;
  }

  private buildState(): GameState {
    return {
      phase: 'lobby',
      hostId: this.hostId ?? '',
      players: Object.fromEntries(this.players),
      board: [],
      startingTeam: 'red',
      turn: 'red',
      clue: null,
      remaining: { red: 0, blue: 0 },
      winner: null,
    };
  }

  private broadcastState() {
    // Fase 0: el board está vacío, así que todavía no hay nada que redactar.
    const msg: ServerMessage = { type: 'state', state: this.buildState() };
    this.room.broadcast(JSON.stringify(msg));
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }
}

Server satisfies Party.Worker;
