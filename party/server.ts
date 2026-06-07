import type * as Party from 'partykit/server';
import type {
  GameState, Player, Phase, Card, Team, Clue,
  ClientMessage, ServerMessage,
} from './types';
import { MAX_PER_TEAM } from './types';
import { startBlockReason, viewFor, isTeamRole, gameViable } from './rules';
import { generateBoard } from './game';

// Normaliza para comparar palabras (sin acentos ni mayúsculas).
function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// La sala (y la partida en curso) se descarta tras este lapso con TODOS los
// participantes desconectados (§14).
const ABANDON_MS = 5 * 60 * 1000;

// Gracia antes de abortar una partida inviable (§16): da tiempo a que un jugador
// que se cayó (o recargó la página) reconecte sin tumbar la partida de todos.
const VIABILITY_GRACE_MS = 20 * 1000;

// Snapshot serializable del estado, persistido en DO Storage para sobrevivir
// reinicios del Durable Object y permitir reconexión.
interface Snapshot {
  players: [string, Player][];
  hostId: string | null;
  phase: Phase;
  board: Card[];
  startingTeam: Team;
  turn: Team;
  clue: Clue | null;
  remaining: { red: number; blue: number };
  winner: Team | null;
}

// ── Fases 1-4 ──
// Lobby + loop de juego completos (§7.1, §8) con redacción anti-cheat (§9), más
// persistencia, reconexión, migración de host, descarte de sala abandonada y
// viabilidad de la partida en curso (§14, §16).
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

  // Timer de gracia de viabilidad (en memoria; la sala sigue viva porque hay
  // otros participantes conectados durante la ventana).
  private viabilityTimer: ReturnType<typeof setTimeout> | null = null;

  // Rehidrata el estado persistido al (re)arrancar el Durable Object (§14).
  async onStart() {
    const snap = await this.room.storage.get<Snapshot>('snapshot');
    if (!snap) return;
    // Al arrancar nadie está conectado todavía; se marcan al reconectar.
    this.players = new Map(snap.players.map(([id, p]) => [id, { ...p, connected: false }]));
    this.hostId = snap.hostId;
    this.phase = snap.phase;
    this.board = snap.board;
    this.startingTeam = snap.startingTeam;
    this.turn = snap.turn;
    this.clue = snap.clue;
    this.remaining = snap.remaining;
    this.winner = snap.winner;
    // Si quedó gente pero nadie se reconecta, la sala se limpia sola.
    if (this.players.size > 0) await this.room.storage.setAlarm(Date.now() + ABANDON_MS);
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    const existing = this.players.get(conn.id);
    if (existing) {
      existing.connected = true; // reconexión por id: conserva asiento, rol, equipo y ready
    } else {
      const rawName = (new URL(ctx.request.url).searchParams.get('name') ?? 'Jugador').trim();
      // Reclamo por nombre: si hay un asiento DESCONECTADO con ese mismo nombre,
      // el nuevo jugador lo toma (caso: cerró la pestaña y volvió a entrar, ya sin
      // su sessionStorage). Conserva rol y equipo en vez de entrar como "nombre (1)".
      const reclaim = [...this.players.values()].find(p => !p.connected && p.name === rawName);
      if (reclaim) {
        this.players.delete(reclaim.id);
        if (this.hostId === reclaim.id) this.hostId = conn.id;
        this.players.set(conn.id, { ...reclaim, id: conn.id, connected: true });
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
    }
    // Asegurar siempre un host conectado.
    if (!this.hostId || !this.players.get(this.hostId)?.connected) {
      this.hostId = this.oldestConnectedId() ?? conn.id;
    }
    // Si la reconexión devuelve viabilidad a la partida, cancelar la gracia.
    if (this.viabilityTimer && gameViable([...this.players.values()])) {
      clearTimeout(this.viabilityTimer);
      this.viabilityTimer = null;
    }
    // Alguien volvió: cancelar el descarte de sala abandonada.
    await this.room.storage.deleteAlarm();
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

  async onClose(conn: Party.Connection) {
    const player = this.players.get(conn.id);
    if (!player) return;

    if (this.phase === 'lobby') {
      // En el lobby no hay nada que preservar: el asiento se libera.
      this.players.delete(conn.id);
    } else {
      // En partida (o pantalla de fin) se conserva el asiento para reconexión.
      player.connected = false;
    }

    // Migración de host: al participante conectado más antiguo (orden de ingreso).
    if (this.hostId === conn.id) {
      this.hostId = this.oldestConnectedId();
    }

    // Viabilidad de la partida en curso (§16): si un equipo quedó sin jefe o sin
    // quién adivine, se da una gracia para reconectar antes de volver al lobby.
    if ((this.phase === 'awaitingClue' || this.phase === 'guessing') &&
        !gameViable([...this.players.values()])) {
      this.scheduleViabilityCheck();
    }

    // Sala abandonada: si no queda nadie conectado, programar el descarte (§14).
    if (this.noneConnected()) {
      await this.room.storage.setAlarm(Date.now() + ABANDON_MS);
    }

    this.broadcastState();
  }

  // Descarte de sala abandonada: tras ABANDON_MS sin nadie conectado, se borra
  // todo. Si alguien volvió mientras tanto, no se hace nada.
  async onAlarm() {
    if (!this.noneConnected()) return;
    this.players.clear();
    this.hostId = null;
    this.resetToLobby();
    await this.room.storage.deleteAll();
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
    if (this.viabilityTimer) { clearTimeout(this.viabilityTimer); this.viabilityTimer = null; }
    // En el lobby no se preservan asientos: se descartan los desconectados para no
    // dejar fantasmas que bloqueen el inicio (no estarán "ready" nunca).
    for (const [id, p] of this.players) if (!p.connected) this.players.delete(id);
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = this.oldestConnectedId();
    this.phase = 'lobby';
    this.board = [];
    this.clue = null;
    this.winner = null;
    this.remaining = { red: 0, blue: 0 };
    for (const p of this.players.values()) p.ready = false;
  }

  // Tras la gracia, si la partida sigue inviable, vuelve al lobby con aviso.
  private scheduleViabilityCheck() {
    if (this.viabilityTimer) return; // ya hay una gracia en curso
    this.viabilityTimer = setTimeout(() => {
      this.viabilityTimer = null;
      if ((this.phase === 'awaitingClue' || this.phase === 'guessing') &&
          !gameViable([...this.players.values()])) {
        this.resetToLobby();
        this.failAll('La partida volvió al lobby: un equipo quedó sin jefe de espías o sin quién adivine.');
        this.broadcastState();
      }
    }, VIABILITY_GRACE_MS);
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

  // Primer participante conectado en orden de ingreso (para migrar el host).
  private oldestConnectedId(): string | null {
    for (const p of this.players.values()) if (p.connected) return p.id;
    return null;
  }

  private noneConnected(): boolean {
    for (const p of this.players.values()) if (p.connected) return false;
    return true;
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

  // Cada conexión recibe la vista redactada según su rol (anti-cheat §9), y se
  // persiste el snapshot tras cada cambio.
  private broadcastState() {
    const base = this.buildState();
    for (const conn of this.room.getConnections()) {
      const role = this.players.get(conn.id)?.role ?? 'spectator';
      const msg: ServerMessage = { type: 'state', state: viewFor(base, role) };
      conn.send(JSON.stringify(msg));
    }
    this.save();
  }

  private save() {
    const snap: Snapshot = {
      players: [...this.players.entries()],
      hostId: this.hostId,
      phase: this.phase,
      board: this.board,
      startingTeam: this.startingTeam,
      turn: this.turn,
      clue: this.clue,
      remaining: this.remaining,
      winner: this.winner,
    };
    void this.room.storage.put('snapshot', snap);
  }

  private fail(conn: Party.Connection, message: string) {
    const msg: ServerMessage = { type: 'error', message };
    conn.send(JSON.stringify(msg));
  }

  private failAll(message: string) {
    const msg: ServerMessage = { type: 'error', message };
    for (const conn of this.room.getConnections()) conn.send(JSON.stringify(msg));
  }
}

Server satisfies Party.Worker;
