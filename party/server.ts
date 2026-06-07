import type * as Party from 'partykit/server';
import type {
  GameState, Player, Phase, Card, Team, Clue,
  ClientMessage, ServerMessage,
} from './types';
import { MAX_PER_TEAM } from './types';
import { startBlockReason, viewFor, isTeamRole } from './rules';
import { generateBoard } from './game';

// Normaliza para comparar palabras (sin acentos ni mayúsculas).
function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── Fases 1-2 ──
// Lobby server-authoritative (roles, ready, host, arranque validado §7.1) +
// loop de juego completo: pista del jefe, adivinanzas, conteo de N+1 intentos,
// cambios de turno, victoria/derrota y redacción anti-cheat por rol.
export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  private players = new Map<string, Player>();
  private hostId: string | null = null;

  private phase: Phase = 'lobby';
  private board: Card[] = [];
  private startingTeam: Team = 'red';
  private turn: Team = 'red';
  private clue: Clue | null = null;
  private remaining = { red: 0, blue: 0 };
  private winner: Team | null = null;

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const rawName = new URL(ctx.request.url).searchParams.get('name') ?? 'Jugador';
    this.players.set(conn.id, {
      id: conn.id,
      name: this.uniqueName(rawName),
      role: 'spectator',
      team: null,
      connected: true,
      ready: false,
    });
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

      case 'setRole': {
        if (this.phase !== 'lobby') {
          return this.fail(sender, 'No se puede cambiar de rol con la partida en curso.');
        }
        const team = isTeamRole(msg.role) ? msg.team : null;
        if (team && this.teamCount(team, sender.id) >= MAX_PER_TEAM) {
          return this.fail(sender, `El equipo ${team === 'red' ? 'Rojo' : 'Azul'} está completo (${MAX_PER_TEAM}).`);
        }
        player.role = msg.role;
        player.team = team;
        player.ready = false; // cambiar de asiento te marca como no listo
        break;
      }

      case 'setReady':
        player.ready = msg.value;
        break;

      case 'startGame': {
        if (sender.id !== this.hostId) {
          return this.fail(sender, 'Solo el host puede iniciar la partida.');
        }
        if (this.phase !== 'lobby') return;
        const reason = startBlockReason([...this.players.values()]);
        if (reason) return this.fail(sender, reason);
        this.startGame();
        break;
      }

      case 'returnToLobby': {
        if (sender.id !== this.hostId) {
          return this.fail(sender, 'Solo el host puede volver al lobby.');
        }
        this.resetToLobby();
        break;
      }

      case 'giveClue': {
        if (this.phase !== 'awaitingClue') return this.fail(sender, 'No es momento de dar una pista.');
        if (player.role !== 'spymaster' || player.team !== this.turn) {
          return this.fail(sender, 'Solo el jefe de espías del equipo en turno puede dar la pista.');
        }
        const word = msg.word.trim();
        const count = Math.floor(msg.count);
        if (!word) return this.fail(sender, 'La pista no puede estar vacía.');
        if (!(count >= 1 && count <= 9)) return this.fail(sender, 'El número debe estar entre 1 y 9.');
        if (this.board.some(c => !c.revealed && normalize(c.word) === normalize(word))) {
          return this.fail(sender, 'La pista no puede ser una palabra en juego del tablero.');
        }
        this.clue = { word, count, team: this.turn, guessesUsed: 0 };
        this.phase = 'guessing';
        break;
      }

      case 'guess': {
        if (this.phase !== 'guessing') return this.fail(sender, 'No es momento de adivinar.');
        if (!this.canGuess(player)) return this.fail(sender, 'No podés revelar cartas en este turno.');
        const card = this.board.find(c => c.id === msg.cardId);
        if (!card || card.revealed) return;
        card.revealed = true;
        this.resolveGuess(card);
        break;
      }

      case 'endTurn': {
        if (this.phase !== 'guessing') return;
        if (!this.canGuess(player)) return this.fail(sender, 'No podés terminar el turno ahora.');
        this.passTurn();
        break;
      }

      case 'newGame': {
        if (sender.id !== this.hostId) return this.fail(sender, 'Solo el host puede empezar una nueva partida.');
        if (this.phase !== 'finished') return;
        this.startGame();
        break;
      }

      default:
        return this.fail(sender, `Acción "${msg.type}" todavía no implementada.`);
    }

    this.broadcastState();
  }

  onClose(conn: Party.Connection) {
    const wasHost = this.hostId === conn.id;
    this.players.delete(conn.id);

    // Migración de host: al participante más antiguo que quede (orden de inserción).
    // (La gracia de reconexión de 5 min llega en la Fase 4; por ahora, salir = irse.)
    if (wasHost) {
      const next = [...this.players.values()][0] as Player | undefined;
      this.hostId = next?.id ?? null;
    }
    this.broadcastState();
  }

  // ── Transiciones ──

  private startGame() {
    const { board, startingTeam, remaining } = generateBoard();
    this.phase = 'awaitingClue';
    this.board = board;
    this.startingTeam = startingTeam;
    this.turn = startingTeam;
    this.remaining = remaining;
    this.clue = null;
    this.winner = null;
  }

  private resetToLobby() {
    this.phase = 'lobby';
    this.board = [];
    this.clue = null;
    this.winner = null;
    this.remaining = { red: 0, blue: 0 };
    for (const p of this.players.values()) p.ready = false;
  }

  private canGuess(player: Player): boolean {
    if (player.role === 'tableBoard') return true;
    return player.role === 'operative' && player.team === this.turn;
  }

  // Resuelve una carta revelada: acierto → sigue (hasta agotar N+1), neutral o
  // carta del rival → fin de turno, asesino → derrota; vaciar el color de un
  // equipo → victoria de ese equipo.
  private resolveGuess(card: Card) {
    const turn = this.turn;
    const other: Team = turn === 'red' ? 'blue' : 'red';

    if (card.color === 'assassin') {
      this.phase = 'finished';
      this.winner = other;
      return;
    }
    if (card.color === 'red' || card.color === 'blue') {
      this.remaining[card.color]--;
      if (this.remaining[card.color] === 0) {
        this.phase = 'finished';
        this.winner = card.color;
        return;
      }
      if (card.color === turn) {
        if (this.clue) {
          this.clue.guessesUsed++;
          if (this.clue.guessesUsed >= this.clue.count + 1) this.passTurn();
        }
        return;
      }
    }
    // neutral o carta del rival
    this.passTurn();
  }

  private passTurn() {
    this.turn = this.turn === 'red' ? 'blue' : 'red';
    this.clue = null;
    this.phase = 'awaitingClue';
  }

  // ── Helpers ──

  private teamCount(team: Team, exceptId: string): number {
    return [...this.players.values()].filter(
      p => p.id !== exceptId && p.team === team && isTeamRole(p.role),
    ).length;
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
      phase: this.phase,
      hostId: this.hostId ?? '',
      players: Object.fromEntries(this.players),
      board: this.board,
      startingTeam: this.startingTeam,
      turn: this.turn,
      clue: this.clue,
      remaining: this.remaining,
      winner: this.winner,
    };
  }

  // Cada conexión recibe la vista redactada según su rol (anti-cheat §9).
  private broadcastState() {
    const base = this.buildState();
    for (const conn of this.room.getConnections()) {
      const role = this.players.get(conn.id)?.role ?? 'spectator';
      const msg: ServerMessage = { type: 'state', state: viewFor(base, role) };
      conn.send(JSON.stringify(msg));
    }
  }

  private fail(conn: Party.Connection, message: string) {
    const msg: ServerMessage = { type: 'error', message };
    conn.send(JSON.stringify(msg));
  }
}

Server satisfies Party.Worker;
