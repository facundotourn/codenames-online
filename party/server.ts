import type * as Party from 'partykit/server';
import type {
  GameState, Player, Phase, Card, Team, Clue,
  ClientMessage, ServerMessage,
} from './types';
import { MAX_PER_TEAM, MAX_AI_CLUES } from './types';
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

// Sugerencia de pista por IA (§13): modelo y rate-limit por sala para acotar
// costo. La key vive segura en el server (variable de entorno).
const CLUE_MODEL = 'claude-haiku-4-5';
const CLUE_COOLDOWN_MS = 6 * 1000;

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

  // Rate-limit de la sugerencia de IA (§13): cooldown por sala + un pedido a la
  // vez (no persiste; es solo control de costo durante la vida del DO).
  private lastClueRequestAt = 0;
  private clueInFlight = false;

  // Rehidrata el estado persistido al (re)arrancar el Durable Object (§14).
  async onStart() {
    const snap = await this.room.storage.get<Snapshot>('snapshot');
    if (!snap) return;
    // Al arrancar nadie está conectado todavía; se marcan al reconectar.
    this.players = new Map(snap.players.map(([id, p]) => [id, { ...p, connected: false, aiCluesUsed: p.aiCluesUsed ?? 0 }]));
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
          aiCluesUsed: 0,
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

      case 'requestClueSuggestion':
        // Asíncrona (llama a la IA) y no muta el estado compartido: se atiende
        // aparte y se responde solo a quien la pidió, sin re-broadcast.
        void this.suggestClue(sender, player);
        return;

      default:
        return this.fail(sender, `Acción "${(msg as { type?: string }).type ?? '?'}" no reconocida.`);
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
    // Cada jefe arranca con sus sugerencias de IA disponibles (§13).
    for (const p of this.players.values()) p.aiCluesUsed = 0;
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

  // Sugerencia de pista por IA (§13): el server arma el prompt con el estado
  // real del tablero (info autoritativa que ya tiene) y pide a Claude Haiku una
  // pista. La respuesta vuelve SOLO al jefe que la pidió — nunca a la TV ni a
  // los operativos. Rate-limit por sala para acotar costo.
  private async suggestClue(conn: Party.Connection, player: Player) {
    if (this.phase !== 'awaitingClue') return this.fail(conn, 'No es momento de pedir una pista.');
    if (player.role !== 'spymaster' || player.team !== this.turn) {
      return this.fail(conn, 'Solo el jefe del equipo en turno puede pedir una sugerencia.');
    }

    if (player.aiCluesUsed >= MAX_AI_CLUES) {
      return this.fail(conn, `Ya usaste tus ${MAX_AI_CLUES} sugerencias de IA de esta partida.`);
    }

    const apiKey = this.room.env.ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) return this.fail(conn, 'La sugerencia por IA no está configurada en el server.');

    if (this.clueInFlight) return this.fail(conn, 'Ya estoy pensando una pista, esperá un momento…');
    const wait = CLUE_COOLDOWN_MS - (Date.now() - this.lastClueRequestAt);
    if (wait > 0) return this.fail(conn, `Esperá ${Math.ceil(wait / 1000)} s antes de pedir otra sugerencia.`);

    this.clueInFlight = true;
    this.lastClueRequestAt = Date.now();
    try {
      const own = this.unrevealedWords(player.team);
      const rival = this.unrevealedWords(player.team === 'red' ? 'blue' : 'red');
      const neutral = this.unrevealedWords('neutral');
      const assassin = this.unrevealedWords('assassin');

      // Conjunto de palabras del tablero (normalizadas) para rechazar pistas que
      // sean una palabra en juego (la IA a veces propone una del tablero).
      const boardSet = new Set(this.board.map(c => normalize(c.word)));
      const ownByNorm = new Map(own.map(w => [normalize(w), w]));

      const system =
        'Sos un jefe de espías experto en Codenames en español. Proponé UNA sola ' +
        'pista para tu equipo.\n' +
        'Estrategia (MUY importante):\n' +
        '- NUNCA conectes más de 2 palabras con una pista. El máximo absoluto es 2.\n' +
        '- Lo ideal es una pista clara y específica que conecte 2 palabras; conectar 1 ' +
        'también es perfectamente válido.\n' +
        '- Priorizá la PRECISIÓN por sobre la cantidad. NO fuerces una pista vaga o ' +
        'ambigua: es contraproducente, porque una pista débil hace que tu equipo dude o ' +
        'señale palabras del rival, neutrales o el asesino.\n' +
        '- La partida dura VARIOS turnos: no hace falta ganar en una sola pista. Más vale ' +
        'una conexión fuerte de 1-2 palabras que una floja.\n' +
        'Reglas estrictas para la pista:\n' +
        '- Una sola palabra en español, SIN números, SIN espacios y SIN caracteres especiales.\n' +
        '- NUNCA puede ser una palabra del tablero, ni parte, variante o derivada de ellas.\n' +
        '- Evitá a toda costa el asesino; no orientes hacia palabras del rival ni neutrales.\n' +
        'Devolvé la pista, la lista EXACTA de palabras de tu equipo (1 o 2, tal cual ' +
        'aparecen) que conecta de forma sólida, y una frase breve justificando la conexión.';

      const board =
        `Palabras de tu equipo (a adivinar): ${own.join(', ') || '—'}\n` +
        `Palabras del rival (a evitar): ${rival.join(', ') || '—'}\n` +
        `Palabras neutrales (a evitar): ${neutral.join(', ') || '—'}\n` +
        `Asesino (NUNCA orientar hacia acá): ${assassin.join(', ') || '—'}`;

      // Hasta 2 intentos: si la IA devuelve algo inválido (vacío, con números o
      // una palabra del tablero), reintentamos una vez explicándole el motivo.
      let lastBad = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const user = attempt === 0
          ? board
          : `${board}\n\nTu propuesta anterior («${lastBad}») no sirve: es una palabra del tablero o tiene números/caracteres. Probá otra, respetando las reglas.`;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: CLUE_MODEL,
            max_tokens: 512,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: {
              format: {
                type: 'json_schema',
                schema: {
                  type: 'object',
                  properties: {
                    word: { type: 'string', description: 'la pista: una sola palabra, sin números ni símbolos' },
                    words: {
                      type: 'array', items: { type: 'string' },
                      description: 'las palabras de tu equipo que conecta la pista, tal cual aparecen en el tablero',
                    },
                    reasoning: { type: 'string', description: 'una frase breve explicando la conexión' },
                  },
                  required: ['word', 'words', 'reasoning'],
                  additionalProperties: false,
                },
              },
            },
          }),
        });

        if (!res.ok) {
          console.error('Anthropic API error', res.status, await res.text());
          return this.fail(conn, 'No pude generar una sugerencia ahora mismo.');
        }

        const data = await res.json() as { content?: { type: string; text?: string }[] };
        const text = data.content?.find(b => b.type === 'text')?.text;
        if (!text) return this.fail(conn, 'No pude generar una sugerencia ahora mismo.');

        const parsed = JSON.parse(text) as { word?: string; words?: string[]; reasoning?: string };
        // Saneo: primer token, solo letras (incluye acentos y ñ).
        const word = (parsed.word ?? '').trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, '');
        lastBad = (parsed.word ?? '').trim();

        // Inválida si quedó vacía o coincide con una palabra del tablero.
        if (!word || boardSet.has(normalize(word))) continue;

        // Quedarnos solo con las palabras propuestas que realmente son del equipo,
        // y como mucho 2 (regla dura para fomentar el ingenio de los jugadores).
        const words = (parsed.words ?? [])
          .map(w => ownByNorm.get(normalize(w)))
          .filter((w): w is string => !!w)
          .slice(0, 2);
        const count = Math.max(1, Math.min(2, words.length || 1));

        // Consumir una de las sugerencias disponibles del jefe y propagar el
        // contador (el resto del estado no cambia).
        player.aiCluesUsed++;
        this.broadcastState();

        const msg: ServerMessage = { type: 'clueSuggestion', word, count, words, reasoning: parsed.reasoning ?? '' };
        return conn.send(JSON.stringify(msg));
      }

      this.fail(conn, 'La IA no encontró una pista válida, probá de nuevo.');
    } catch (err) {
      console.error('suggestClue failed', err);
      this.fail(conn, 'No pude generar una sugerencia ahora mismo.');
    } finally {
      this.clueInFlight = false;
    }
  }

  // Palabras todavía no reveladas de un color (para armar el prompt de la IA).
  private unrevealedWords(color: Card['color']): string[] {
    return this.board.filter(c => !c.revealed && c.color === color).map(c => c.word);
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
