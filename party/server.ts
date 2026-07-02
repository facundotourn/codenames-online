import type * as Party from 'partykit/server';
import type {
  GameState, Player, Phase, Card, Team, Clue, Role, AiActivity, Draft, DraftPick, WordVariant,
  TurnRecord, ClientMessage, ServerMessage,
} from './types';
import { MAX_PER_TEAM, MAX_AI_CLUES, VIABILITY_GRACE_MS, DRAFT_MS } from './types';
import { startBlockReason, viewFor, isTeamRole, gameViable } from './rules';
import { generateBoard } from './game';
import { wordsFor } from './words';

// Normaliza para comparar palabras (sin acentos ni mayúsculas).
function normalize(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// La sala (y la partida en curso) se descarta tras este lapso con TODOS los
// participantes desconectados (§14).
const ABANDON_MS = 5 * 60 * 1000;

// Sugerencia de pista por IA (§13): modelo y rate-limit por sala para acotar
// costo. La key vive segura en el server (variable de entorno).
const CLUE_MODEL = 'claude-haiku-4-5';
const CLUE_COOLDOWN_MS = 6 * 1000;

// Ritmo del turno del equipo IA (§13.5): pausado a propósito, para que los
// humanos lean el razonamiento del agente. Tiempos en ms.
const AI_CLUE_THINK_MS = 3500;    // mínimo que dura "el jefe IA piensa"
const AI_CLUE_READ_MS = 2600;     // pausa para leer la pista antes de adivinar
const AI_GUESS_THINK_MS = 2400;   // "el agente IA lee la pista"
const AI_ANALYSIS_READ_MS = 4200; // pausa para leer el análisis del agente
const AI_GUESS_ANNOUNCE_MS = 2800;// anuncia cada intento antes de revelar
const AI_GUESS_AFTER_MS = 1700;   // pausa tras revelar una carta

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
  aiTeam: Team | null;
  wordVariant: WordVariant;
  history: TurnRecord[];
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
  private aiTeam: Team | null = null;
  // Set de palabras elegido por el host (lobby). Default argentino.
  private wordVariant: WordVariant = 'ar';

  // Sorteo de jefe de espías en curso (fase 'drafting'). Efímero: no se persiste
  // (la promoción del agente sí queda en players). Ver startGame/draftSpymasters.
  private draft: Draft | null = null;

  // Cartas reveladas en el turno actual (para el evento de analytics 'turn_ended':
  // qué palabras sacó el equipo con la pista vigente). Se vacía con cada pista.
  private turnReveals: { word: string; color: Card['color'] }[] = [];

  // Historial de turnos cerrados (pista + intentos) de la partida en curso, para
  // el resumen del final. Se reinicia con cada partida nueva.
  private history: TurnRecord[] = [];

  // Motor del equipo IA: narración efímera + flag de turno en curso + un
  // "generation" que invalida un turno IA en vuelo si la partida se reinicia.
  private aiActivity: AiActivity | null = null;
  private aiLog = '';
  private aiRunning = false;
  private aiGen = 0;

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
    // Al arrancar nadie está conectado todavía; se marcan al reconectar. Los
    // jugadores IA no tienen conexión real: viven siempre "conectados" y listos.
    this.players = new Map(snap.players.map(([id, p]) => [id, {
      ...p, connected: p.isAI === true, aiCluesUsed: p.aiCluesUsed ?? 0,
    }]));
    this.hostId = snap.hostId;
    this.phase = snap.phase;
    this.board = snap.board;
    this.startingTeam = snap.startingTeam;
    this.turn = snap.turn;
    this.clue = snap.clue;
    this.remaining = snap.remaining;
    this.winner = snap.winner;
    this.aiTeam = snap.aiTeam ?? null;
    this.wordVariant = snap.wordVariant ?? 'ar';
    this.history = snap.history ?? [];
    // El sorteo es efímero y su timer no sobrevive al reinicio del DO: si quedó
    // a mitad, los agentes ya fueron promovidos en players, así que se pasa
    // directo a esperar la pista (sin re-animar la ruleta).
    if (this.phase === 'drafting') this.phase = 'awaitingClue';
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
    // Si quedó un turno IA pendiente (p. ej. el DO se reinició), retomarlo.
    this.maybeRunAI();
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
        if (team && team === this.aiTeam) {
          return this.fail(sender, 'El equipo IA no admite jugadores humanos.');
        }
        if (team && this.teamCount(team, sender.id) >= MAX_PER_TEAM) {
          return this.fail(sender, `El equipo ${team === 'red' ? 'Rojo' : 'Azul'} está completo (${MAX_PER_TEAM}).`);
        }
        // Un solo jefe de espías por equipo.
        if (msg.role === 'spymaster' && team &&
            [...this.players.values()].some(p => p.id !== sender.id && p.role === 'spymaster' && p.team === team)) {
          return this.fail(sender, `El equipo ${team === 'red' ? 'Rojo' : 'Azul'} ya tiene jefe de espías.`);
        }
        player.role = msg.role;
        player.team = team;
        player.ready = false; // cambiar de asiento te marca como no listo
        break;
      }

      case 'setReady':
        player.ready = msg.value;
        break;

      case 'setAITeam': {
        if (sender.id !== this.hostId) {
          return this.fail(sender, 'Solo el host puede activar el equipo IA.');
        }
        if (this.phase !== 'lobby') {
          return this.fail(sender, 'El equipo IA solo se cambia en el lobby.');
        }
        // Solo el azul puede ser IA (decisión de diseño).
        this.setAITeam(msg.enabled ? 'blue' : null);
        break;
      }

      case 'setWordVariant': {
        if (sender.id !== this.hostId) {
          return this.fail(sender, 'Solo el host puede cambiar el set de palabras.');
        }
        if (this.phase !== 'lobby') {
          return this.fail(sender, 'El set de palabras solo se cambia en el lobby.');
        }
        this.wordVariant = msg.variant === 'es' ? 'es' : 'ar';
        break;
      }

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
        this.turnReveals = [];
        break;
      }

      case 'guess': {
        if (this.phase !== 'guessing') return this.fail(sender, 'No es momento de adivinar.');
        if (this.turn === this.aiTeam) return this.fail(sender, 'Es el turno de la IA, esperá.');
        if (!this.canGuess(player)) return this.fail(sender, 'No podés revelar cartas en este turno.');
        const card = this.board.find(c => c.id === msg.cardId);
        if (!card || card.revealed) return;
        card.revealed = true;
        this.resolveGuess(card);
        break;
      }

      case 'endTurn': {
        if (this.phase !== 'guessing') return;
        if (this.turn === this.aiTeam) return this.fail(sender, 'Es el turno de la IA, esperá.');
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
    this.maybeRunAI();
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
    this.aiTeam = null;
    this.resetToLobby();
    await this.room.storage.deleteAll();
  }

  // ── Transiciones ──

  private startGame() {
    this.aiGen++; // invalida cualquier turno IA (y un sorteo) en vuelo
    this.aiActivity = null;
    this.aiLog = '';
    // Equipos sin jefe pero con ≥2 agentes: se promueve a uno al azar y se entra
    // a la fase de sorteo ('drafting') para que todos vean la ruleta antes de
    // arrancar. Sin sorteos pendientes, se va directo a esperar la pista.
    this.draft = this.draftSpymasters();
    const { board, startingTeam, remaining } = generateBoard(wordsFor(this.wordVariant));
    this.phase = this.draft ? 'drafting' : 'awaitingClue';
    this.board = board;
    this.startingTeam = startingTeam;
    this.turn = startingTeam;
    this.remaining = remaining;
    this.clue = null;
    this.winner = null;
    // Cada jefe arranca con sus sugerencias de IA disponibles (§13).
    for (const p of this.players.values()) p.aiCluesUsed = 0;
    if (this.draft) this.scheduleDraftFinish();
    this.turnReveals = [];
    this.history = [];
    void this.sendGAEvent('game_started', {
      starting_team: startingTeam,
      vs_ai: this.aiTeam ? 1 : 0,
      players: [...this.players.values()].filter(p => p.connected && !p.isAI && isTeamRole(p.role)).length,
      drafted: this.draft ? 1 : 0,
    });
  }

  // Promueve un agente al azar a jefe en cada equipo conectado que arrancó sin
  // jefe pero con ≥2 agentes (ver draftTeams en rules.ts). Devuelve el detalle
  // del sorteo para animarlo, o null si no hubo ninguno.
  private draftSpymasters(): Draft | null {
    const picks: DraftPick[] = [];
    for (const team of ['red', 'blue'] as Team[]) {
      const members = [...this.players.values()].filter(
        p => p.connected && isTeamRole(p.role) && p.team === team);
      if (members.some(p => p.role === 'spymaster')) continue;
      const operatives = members.filter(p => p.role === 'operative');
      if (operatives.length < 2) continue;
      const chosen = operatives[Math.floor(Math.random() * operatives.length)];
      chosen.role = 'spymaster';
      picks.push({ team, candidateIds: operatives.map(p => p.id), chosenId: chosen.id });
    }
    return picks.length ? { picks } : null;
  }

  // Tras DRAFT_MS (lo que dura la ruleta en el cliente), cierra el sorteo y
  // arranca la partida. El generation (aiGen) cancela si se reinició/volvió al
  // lobby mientras tanto. El timer vive mientras el DO siga vivo.
  private scheduleDraftFinish() {
    const gen = this.aiGen;
    setTimeout(() => {
      if (this.aiGen !== gen || this.phase !== 'drafting') return;
      this.draft = null;
      this.phase = 'awaitingClue';
      this.broadcastState();
      this.maybeRunAI();
    }, DRAFT_MS);
  }

  private resetToLobby() {
    this.aiGen++; // invalida cualquier turno IA (y un sorteo) en vuelo
    this.aiActivity = null;
    this.aiLog = '';
    this.draft = null;
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
    this.history = [];
    // El equipo IA persiste entre partidas y siempre está listo.
    for (const p of this.players.values()) if (!p.isAI) p.ready = false;
  }

  // Activa/desactiva el equipo IA en un equipo (solo lobby). Al activarlo, saca a
  // los humanos de ese equipo y sienta un jefe + un agente sintéticos (sin
  // conexión, siempre listos). Al desactivarlo, los quita.
  private setAITeam(team: Team | null) {
    if (team === this.aiTeam) return;
    for (const [id, p] of this.players) if (p.isAI) this.players.delete(id);
    this.aiTeam = team;
    if (team) {
      for (const p of this.players.values()) {
        if (isTeamRole(p.role) && p.team === team) {
          p.role = 'spectator';
          p.team = null;
          p.ready = false;
        }
      }
      this.players.set(`ai-spymaster-${team}`, this.makeAI(`ai-spymaster-${team}`, 'Jefe IA', 'spymaster', team));
      this.players.set(`ai-operative-${team}`, this.makeAI(`ai-operative-${team}`, 'Agente IA', 'operative', team));
    }
  }

  private makeAI(id: string, name: string, role: Role, team: Team): Player {
    return { id, name, role, team, connected: true, ready: true, aiCluesUsed: 0, isAI: true };
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

  // Sugerencia de pista por IA (§13) para un jefe HUMANO: valida, controla
  // rate-limit y responde SOLO a quien la pidió (nunca a la TV ni a operativos).
  private async suggestClue(conn: Party.Connection, player: Player) {
    if (this.phase !== 'awaitingClue') return this.fail(conn, 'No es momento de pedir una pista.');
    if (player.role !== 'spymaster' || player.team !== this.turn) {
      return this.fail(conn, 'Solo el jefe del equipo en turno puede pedir una sugerencia.');
    }
    if (player.aiCluesUsed >= MAX_AI_CLUES) {
      return this.fail(conn, `Ya usaste tus ${MAX_AI_CLUES} sugerencias de IA de esta partida.`);
    }
    if (!this.room.env.ANTHROPIC_API_KEY) {
      return this.fail(conn, 'La sugerencia por IA no está configurada en el server.');
    }
    if (this.clueInFlight) return this.fail(conn, 'Ya estoy pensando una pista, esperá un momento…');
    const wait = CLUE_COOLDOWN_MS - (Date.now() - this.lastClueRequestAt);
    if (wait > 0) return this.fail(conn, `Esperá ${Math.ceil(wait / 1000)} s antes de pedir otra sugerencia.`);

    this.clueInFlight = true;
    this.lastClueRequestAt = Date.now();
    try {
      const result = await this.requestClue(player.team as Team, 2);
      if (!result) return this.fail(conn, 'La IA no encontró una pista válida, probá de nuevo.');
      player.aiCluesUsed++;
      this.broadcastState();
      const msg: ServerMessage = {
        type: 'clueSuggestion', word: result.word, count: result.count, words: result.words, reasoning: result.reasoning,
      };
      conn.send(JSON.stringify(msg));
    } catch (err) {
      console.error('suggestClue failed', err);
      this.fail(conn, 'No pude generar una sugerencia ahora mismo.');
    } finally {
      this.clueInFlight = false;
    }
  }

  // Pide a Claude Haiku una pista para `team` con el estado real del tablero.
  // Devuelve { word, count, words, reasoning } o null si falla / no es válida.
  // La usan tanto la sugerencia humana como el jefe de espías IA.
  private async requestClue(team: Team, maxWords: number): Promise<{ word: string; count: number; words: string[]; reasoning: string } | null> {
    const apiKey = this.room.env.ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) return null;

    const own = this.unrevealedWords(team);
    const rival = this.unrevealedWords(team === 'red' ? 'blue' : 'red');
    const neutral = this.unrevealedWords('neutral');
    const assassin = this.unrevealedWords('assassin');

    const boardSet = new Set(this.board.map(c => normalize(c.word)));
    const ownByNorm = new Map(own.map(w => [normalize(w), w]));

    // La sugerencia para humanos limita a 2 (no resolverles el juego); el jefe
    // IA juega en serio y conecta tantas como pueda con confianza.
    const strategy = maxWords <= 2
      ? '- NUNCA conectes más de 2 palabras con una pista. El máximo absoluto es 2.\n' +
        '- Lo ideal es una pista clara y específica que conecte 2 palabras; conectar 1 ' +
        'también es perfectamente válido.\n'
      : '- Conectá tantas palabras de tu equipo como puedas con UNA sola pista (1, 2, 3 o más), ' +
        'SIEMPRE que la conexión sea sólida y clara para todas ellas.\n' +
        '- No te obligues a un número alto: más vale una conexión fuerte de pocas que una floja de muchas.\n';

    const system =
      'Sos un jefe de espías experto en Codenames en español. Proponé UNA sola ' +
      'pista para tu equipo.\n' +
      'Estrategia (MUY importante):\n' +
      strategy +
      '- Priorizá la PRECISIÓN por sobre la cantidad. NO fuerces una pista vaga o ' +
      'ambigua: es contraproducente, porque una pista débil hace que tu equipo dude o ' +
      'señale palabras del rival, neutrales o el asesino.\n' +
      '- La partida dura VARIOS turnos: no hace falta ganar en una sola pista. Más vale ' +
      'una conexión fuerte que una floja.\n' +
      'Reglas estrictas para la pista:\n' +
      '- Una sola palabra en español, SIN números, SIN espacios y SIN caracteres especiales.\n' +
      '- NUNCA puede ser una palabra del tablero, ni parte, variante o derivada de ellas.\n' +
      '- Evitá a toda costa el asesino; no orientes hacia palabras del rival ni neutrales.\n' +
      'Devolvé la pista, la lista EXACTA de palabras de tu equipo que conecta de forma ' +
      'sólida, y una frase breve justificando la conexión.';

    const board =
      `Palabras de tu equipo (a adivinar): ${own.join(', ') || '—'}\n` +
      `Palabras del rival (a evitar): ${rival.join(', ') || '—'}\n` +
      `Palabras neutrales (a evitar): ${neutral.join(', ') || '—'}\n` +
      `Asesino (NUNCA orientar hacia acá): ${assassin.join(', ') || '—'}`;

    let lastBad = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = attempt === 0
        ? board
        : `${board}\n\nTu propuesta anterior («${lastBad}») no sirve: es una palabra del tablero o tiene números/caracteres. Probá otra, respetando las reglas.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
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
        return null;
      }

      const data = await res.json() as { content?: { type: string; text?: string }[] };
      const text = data.content?.find(b => b.type === 'text')?.text;
      if (!text) return null;

      const parsed = JSON.parse(text) as { word?: string; words?: string[]; reasoning?: string };
      // Saneo: primer token, solo letras (incluye acentos y ñ).
      const word = (parsed.word ?? '').trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, '');
      lastBad = (parsed.word ?? '').trim();

      if (!word || boardSet.has(normalize(word))) continue;

      const words = (parsed.words ?? [])
        .map(w => ownByNorm.get(normalize(w)))
        .filter((w): w is string => !!w)
        .slice(0, maxWords);
      const count = Math.max(1, Math.min(maxWords, words.length || 1));
      return { word, count, words, reasoning: parsed.reasoning ?? '' };
    }
    return null;
  }

  // ── Motor del equipo IA (§13.5) ──
  // Cuando el turno es del equipo IA, el server lo juega solo: el jefe IA da una
  // pista (reusa requestClue, sin gastar el cupo humano) y el agente IA adivina,
  // todo a ritmo pausado y narrando para que los humanos lo lean.

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Titular corto (arriba) + línea opcional para la transcripción (abajo).
  private setStage(headline: string, thinking: boolean, logLine?: string) {
    this.aiActivity = { headline, thinking };
    if (logLine) this.aiLog = this.aiLog ? `${this.aiLog}\n${logLine}` : logLine;
    this.broadcastState();
  }

  // ¿El turno IA en curso sigue siendo válido? (no se reinició la partida, sigue
  // siendo el turno del equipo IA en la fase esperada, y hay humanos mirando).
  private aiStillValid(gen: number, phase: Phase): boolean {
    return gen === this.aiGen
      && this.aiTeam !== null
      && this.turn === this.aiTeam
      && this.phase === phase
      && !this.noneConnected();
  }

  // Dispara el turno IA si corresponde (idempotente: no arranca dos veces).
  private maybeRunAI() {
    if (!this.aiTeam || this.aiRunning) return;
    if (this.turn !== this.aiTeam) return;
    if (this.phase !== 'awaitingClue' && this.phase !== 'guessing') return;
    if (this.noneConnected()) return; // nadie mirando; se retoma al reconectar
    void this.runAITurn();
  }

  private async runAITurn() {
    if (this.aiRunning) return;
    this.aiRunning = true;
    const gen = this.aiGen;
    try {
      if (this.aiStillValid(gen, 'awaitingClue')) await this.aiGiveClue(gen);
      if (this.aiStillValid(gen, 'guessing')) await this.aiGuess(gen);
    } catch (err) {
      console.error('AI turn failed', err);
      // Nunca colgar la partida: si seguimos en el turno IA, pasarlo.
      if (this.aiTeam && this.turn === this.aiTeam && (this.phase === 'awaitingClue' || this.phase === 'guessing')) {
        this.passTurn();
      }
    } finally {
      this.aiRunning = false;
      if (gen === this.aiGen) {
        this.aiActivity = null;
        this.broadcastState();
      }
      this.maybeRunAI(); // por si el siguiente turno también es de la IA
    }
  }

  private async aiGiveClue(gen: number) {
    this.aiLog = ''; // arranca un turno IA nuevo: transcripción limpia
    this.setStage('El jefe IA piensa una pista', true);
    // El jefe IA puede conectar hasta tantas palabras como le queden vivas (máx 9).
    const maxWords = Math.max(1, Math.min(9, this.unrevealedWords(this.aiTeam as Team).length));
    // La pista y un tiempo mínimo de "pensar" corren en paralelo.
    const [result] = await Promise.all([this.requestClue(this.aiTeam as Team, maxWords), this.delay(AI_CLUE_THINK_MS)]);
    if (!this.aiStillValid(gen, 'awaitingClue')) return;

    if (!result) {
      this.setStage('Sin pista', false, '🤔 El jefe IA no encontró una pista clara — pasa el turno.');
      await this.delay(AI_GUESS_AFTER_MS);
      if (this.aiStillValid(gen, 'awaitingClue')) { this.passTurn(); this.broadcastState(); }
      return;
    }

    this.clue = { word: result.word, count: result.count, team: this.aiTeam as Team, guessesUsed: 0 };
    this.phase = 'guessing';
    this.turnReveals = [];
    this.setStage(`Pista: «${result.word}» · ${result.count}`, false, `🔑 Pista: «${result.word}» · ${result.count}`);
    await this.delay(AI_CLUE_READ_MS); // que los humanos lean la pista
  }

  private async aiGuess(gen: number) {
    this.setStage('El agente IA lee la pista', true);
    const [plan] = await Promise.all([this.requestGuesses(), this.delay(AI_GUESS_THINK_MS)]);
    if (!this.aiStillValid(gen, 'guessing')) return;

    if (!plan || plan.intentos.length === 0) {
      this.setStage('No arriesga', false, '🤔 El agente IA no se anima a arriesgar — pasa el turno.');
      await this.delay(AI_GUESS_AFTER_MS);
      if (this.aiStillValid(gen, 'guessing')) { this.passTurn(); this.broadcastState(); }
      return;
    }

    if (plan.analisis) {
      this.setStage('Pensando…', false, `💭 ${plan.analisis}`);
      await this.delay(AI_ANALYSIS_READ_MS);
    }

    for (const intento of plan.intentos) {
      if (!this.aiStillValid(gen, 'guessing')) return;
      const card = this.board.find(c => !c.revealed && normalize(c.word) === normalize(intento.palabra));
      if (!card) continue; // la IA nombró algo que no está en el tablero

      this.setStage(`Arriesga «${card.word}»`, false, `• «${card.word}» — ${intento.razon}`);
      await this.delay(AI_GUESS_ANNOUNCE_MS);
      if (!this.aiStillValid(gen, 'guessing')) return;

      const wasOwn = card.color === this.aiTeam; // ¿era una carta del equipo IA?
      card.revealed = true;
      this.resolveGuess(card);
      this.broadcastState();
      await this.delay(AI_GUESS_AFTER_MS);

      if (gen !== this.aiGen) return;
      if (this.phase === 'finished') return;          // el banner de fin se encarga
      if (this.turn !== this.aiTeam) {                 // el turno pasó al rival
        if (wasOwn) this.setStage('Sin más intentos', false, '↪ Usó todos sus intentos — pasa el turno.');
        else this.setStage('Se equivocó', false, '✗ Esa no era — pierde el turno.');
        await this.delay(AI_GUESS_AFTER_MS);
        return;
      }
      // Sigue siendo turno IA → acertó y le quedan intentos: continúa el loop.
    }

    // Si llegó hasta acá sin error, se planta y cierra el turno.
    if (this.aiStillValid(gen, 'guessing')) {
      this.setStage('Se planta', false, '✋ Se planta y termina el turno.');
      await this.delay(AI_GUESS_AFTER_MS);
      if (this.aiStillValid(gen, 'guessing')) { this.passTurn(); this.broadcastState(); }
    }
  }

  // Prompt del agente que ADIVINA: recibe solo la pista y las palabras vivas SIN
  // color (anti-trampa §9). Devuelve intentos ordenados por confianza con su
  // razón. "Decente pero no perfecta": cauteloso, no arriesga de más.
  private async requestGuesses(): Promise<{ analisis: string; intentos: { palabra: string; razon: string }[] } | null> {
    const apiKey = this.room.env.ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey || !this.clue) return null;
    const clue = this.clue; // capturar: el await de abajo invalida el narrowing

    const unrevealed = this.board.filter(c => !c.revealed).map(c => c.word);
    // Mezclar para que el orden de la lista no sesgue al modelo.
    const shuffled = [...unrevealed].sort(() => Math.random() - 0.5);

    const system =
      'Sos un agente jugando Codenames en español. Tu jefe de espías te dio una ' +
      'pista (una palabra y un número N). Tenés que adivinar las palabras de tu ' +
      'equipo relacionadas con la pista, eligiéndolas SOLO de la lista del tablero.\n' +
      'NO sabés de qué color es cada palabra: además de las tuyas hay palabras del ' +
      'rival, neutrales y UN asesino que pierde la partida si lo tocás.\n' +
      'Estrategia (sé decente pero NO perfecto, podés equivocarte como un humano):\n' +
      '- Ordená tus intentos de MAYOR a menor confianza.\n' +
      '- El número N indica cuántas palabras conecta la pista; podés intentar hasta ' +
      'N (a lo sumo N+1 si estás muy seguro), pero NO te obligues a llegar a N.\n' +
      '- Sé CAUTELOSO: si una palabra te cierra poco, no la arriesgues. Una sola ' +
      'palabra equivocada termina tu turno y puede regalarle una carta al rival, o ' +
      'peor, ser el asesino.\n' +
      '- Elegí únicamente palabras que estén en la lista, tal cual aparecen.\n' +
      'Devolvé un análisis breve (1-2 frases, como pensando en voz alta) y la lista ' +
      'ordenada de intentos, cada uno con una razón corta de por qué lo elegís.';

    const user =
      `Pista: «${clue.word}» — número ${clue.count}.\n` +
      `Palabras en el tablero (no reveladas): ${shuffled.join(', ')}.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: CLUE_MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                analisis: { type: 'string', description: 'razonamiento breve sobre la pista (pensar en voz alta)' },
                intentos: {
                  type: 'array',
                  description: 'palabras a arriesgar, ordenadas de mayor a menor confianza',
                  items: {
                    type: 'object',
                    properties: {
                      palabra: { type: 'string', description: 'una palabra de la lista, tal cual aparece' },
                      razon: { type: 'string', description: 'razón corta de por qué la elegís' },
                    },
                    required: ['palabra', 'razon'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['analisis', 'intentos'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok) {
      console.error('Anthropic API error (guess)', res.status, await res.text());
      return null;
    }
    const data = await res.json() as { content?: { type: string; text?: string }[] };
    const text = data.content?.find(b => b.type === 'text')?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as { analisis?: string; intentos?: { palabra?: string; razon?: string }[] };
    const intentos = (parsed.intentos ?? [])
      .map(i => ({ palabra: (i.palabra ?? '').trim(), razon: (i.razon ?? '').trim() }))
      .filter(i => i.palabra)
      // No más de N+1 intentos (regla de Codenames).
      .slice(0, clue.count + 1);
    return { analisis: (parsed.analisis ?? '').trim(), intentos };
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
    this.turnReveals.push({ word: card.word, color: card.color });

    if (card.color === 'assassin') {
      this.logTurnEnded('assassin');
      this.phase = 'finished';
      this.winner = other;
      return;
    }
    if (card.color === 'red' || card.color === 'blue') {
      this.remaining[card.color]--;
      if (this.remaining[card.color] === 0) {
        this.logTurnEnded(card.color === turn ? 'win' : 'win_opponent');
        this.phase = 'finished';
        this.winner = card.color;
        return;
      }
      if (card.color === turn) {
        if (this.clue) {
          this.clue.guessesUsed++;
          if (this.clue.guessesUsed >= this.clue.count + 1) this.passTurn('exhausted');
        }
        return;
      }
    }
    // neutral o carta del rival
    this.passTurn(card.color === 'neutral' ? 'neutral' : 'opponent_card');
  }

  private passTurn(reason = 'end_turn') {
    this.logTurnEnded(reason);
    this.turn = this.turn === 'red' ? 'blue' : 'red';
    this.clue = null;
    this.phase = 'awaitingClue';
  }

  // Analytics del turno que termina: la pista y qué palabras sacó el equipo, para
  // poder rankear "mejores pistas" más adelante. Lee la pista vigente (todavía no
  // se limpió) y el acumulado de reveladas. Sin pista no hay nada que registrar.
  private logTurnEnded(reason: string) {
    const clue = this.clue;
    if (!clue) return;
    const team = clue.team;
    const reveals = this.turnReveals;
    // Guardar el turno en el historial (para el resumen del final de partida).
    this.history.push({
      team,
      clueWord: clue.word,
      clueCount: clue.count,
      reveals: reveals.map(r => ({ word: r.word, color: r.color ?? 'neutral' })),
    });
    const correct = reveals.filter(r => r.color === team).length;
    const wrong = reveals.filter(r => (r.color === 'red' || r.color === 'blue') && r.color !== team).length;
    const neutral = reveals.filter(r => r.color === 'neutral').length;
    const assassin = reveals.some(r => r.color === 'assassin') ? 1 : 0;
    void this.sendGAEvent('turn_ended', {
      team,
      is_ai: this.aiTeam === team ? 1 : 0,
      clue_word: clue.word,
      clue_count: clue.count,
      guesses: reveals.length,
      correct,
      wrong,
      neutral,
      assassin,
      won: this.winner === team ? 1 : 0,
      reason,
      // "palabra:color" separadas por coma (GA trunca el texto a 100 chars).
      words: reveals.map(r => `${r.word}:${r.color ?? '?'}`).join(','),
    });
    this.turnReveals = [];
  }

  // Envía un evento a GA4 vía Measurement Protocol (el server es el único con la
  // verdad completa de la partida). No-op si faltan las credenciales (dev/local).
  // client_id estable por sala para que GA agrupe los eventos de una misma sala.
  private async sendGAEvent(name: string, params: Record<string, unknown>) {
    const id = this.room.env.GA_MEASUREMENT_ID as string | undefined;
    const secret = this.room.env.GA_API_SECRET as string | undefined;
    if (!id || !secret) return;
    try {
      await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${id}&api_secret=${secret}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: this.room.id,
            // engagement_time_msec ayuda a que GA4 atribuya el evento a una sesión
            // y lo muestre en los reportes estándar.
            events: [{ name, params: { ...params, room: this.room.id, engagement_time_msec: 1 } }],
          }),
        },
      );
    } catch (e) {
      console.error('GA event failed', name, e);
    }
  }

  // ── Helpers ──

  private teamCount(team: Team, exceptId: string): number {
    return [...this.players.values()].filter(
      p => p.id !== exceptId && p.team === team && isTeamRole(p.role),
    ).length;
  }

  // Primer participante humano conectado, en orden de ingreso (para migrar el
  // host). Los jugadores IA nunca son host.
  private oldestConnectedId(): string | null {
    for (const p of this.players.values()) if (p.connected && !p.isAI) return p.id;
    return null;
  }

  // ¿No queda ningún humano conectado? (Los IA no cuentan para mantener viva la sala.)
  private noneConnected(): boolean {
    for (const p of this.players.values()) if (p.connected && !p.isAI) return false;
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
      aiTeam: this.aiTeam,
      aiActivity: this.aiActivity,
      aiLog: this.aiLog,
      draft: this.draft,
      wordVariant: this.wordVariant,
      history: this.history,
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
      aiTeam: this.aiTeam,
      wordVariant: this.wordVariant,
      history: this.history,
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
