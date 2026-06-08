import type { Player, Role, Team } from '../party/types';
import { startBlockReason, isTeamRole } from '../party/rules';
import type { RoomViewProps } from './viewProps';
import { ThemeToggle } from './components/ThemeToggle';

const CrownIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
    <path d="M3 7.5l3.8 2.7L12 4l5.2 6.2L21 7.5 19.3 17H4.7L3 7.5z" />
    <rect x="4.7" y="18.2" width="14.6" height="2.2" rx="1.1" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const RingIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="2.6" aria-hidden="true">
    <circle cx="12" cy="12" r="6" />
  </svg>
);

function MemberChip({ player, hostId, meId }: { player: Player; hostId: string; meId?: string }) {
  const isMe = player.id === meId;
  return (
    <li className={`member${player.connected ? '' : ' offline'}${isMe ? ' me' : ''}`}>
      <span className={`dot ${player.connected ? 'on' : 'off'}`} />
      <span className="pname">{player.name}</span>
      {hostId === player.id && (
        <span className="mi mi-host" title="Host (inicia la partida)"><CrownIcon /></span>
      )}
      {isTeamRole(player.role) && (
        player.ready
          ? <span className="mi mi-ready" title="Listo"><CheckIcon /></span>
          : <span className="mi mi-waiting" title="Esperando"><RingIcon /></span>
      )}
    </li>
  );
}

export function Lobby({ state, me, room, send, onLeave, error }: RoomViewProps) {
  const players = Object.values(state.players);
  const isHost = state.hostId === me?.id;
  const blockReason = startBlockReason(players);
  const hostName = state.players[state.hostId]?.name ?? '—';

  const iAm = (role: Role, team: Team | null) => me?.role === role && (me?.team ?? null) === team;
  const setRole = (role: Role, team: Team | null) => send({ type: 'setRole', role, team });
  const membersOf = (role: Role, team: Team | null) =>
    players.filter(p => p.role === role && (p.team ?? null) === team);

  // Otros miembros del grupo (yo me muestro vía el flipper del slot de unirse).
  const others = (role: Role, team: Team | null) =>
    membersOf(role, team).filter(p => p.id !== me?.id);

  // El "slot" de unirse es un flipper 3D: frente = botón "Unirme", dorso = tu
  // chip. Gira (rotateX) según si estás en este grupo, así el botón se "da
  // vuelta" y se convierte en tu cartel (y vuelve si te cambiás de equipo).
  // Se llama como función (no como <Componente/>) para que el elemento persista
  // entre renders y la transición CSS pueda animar.
  const joinSlot = (role: Role, team: Team | null) => {
    const active = iAm(role, team);
    return (
      <div className="join-slot">
        <div className={`join-flipper${active ? ' flipped' : ''}`}>
          <button className="join-btn join-front" onClick={() => setRole(role, team)} tabIndex={active ? -1 : 0}>
            Unirme
          </button>
          <div className="join-back">
            {me && <ul className="members"><MemberChip player={me} hostId={state.hostId} meId={me.id} /></ul>}
          </div>
        </div>
      </div>
    );
  };

  const roleGroup = (role: Role, team: Team | null, icon: string, title: string, single = false) => {
    const list = others(role, team);
    // Rol de ocupación única (jefe de espías): si ya lo tiene otro, no se puede unir.
    const taken = single && list.length > 0;
    return (
      <div className="role-group">
        <div className="role-group-title"><span>{icon}</span> {title}</div>
        {list.length > 0 && (
          <ul className="members">
            {list.map(p => <MemberChip key={p.id} player={p} hostId={state.hostId} meId={me?.id} />)}
          </ul>
        )}
        {(iAm(role, team) || !taken) && joinSlot(role, team)}
      </div>
    );
  };

  const neutralCard = (role: Role, icon: string, title: string, tip: string) => {
    const list = others(role, null);
    return (
      <div className="info-card">
        <div className="info-head">
          <span className="info-icon">{icon}</span>
          <span className="info-title">{title}</span>
          <span className="tip" tabIndex={0} role="img" aria-label={`info: ${tip}`} data-tip={tip}>ⓘ</span>
        </div>
        <div className="info-body">
          {list.length > 0 && (
            <ul className="members">
              {list.map(p => <MemberChip key={p.id} player={p} hostId={state.hostId} meId={me?.id} />)}
            </ul>
          )}
          {joinSlot(role, null)}
        </div>
      </div>
    );
  };

  return (
    <div className="screen lobby">
      <header className="room-head">
        <div>
          <h2>Sala <code className="room-code">{room}</code></h2>
        </div>
        <div className="head-actions">
          <ThemeToggle />
          <button className="ghost" onClick={onLeave}>Salir</button>
        </div>
      </header>

      <div className="lobby-teams">
        <div className="team-panel red">
          <div className="team-panel-head">🔴 Equipo Rojo</div>
          {roleGroup('spymaster', 'red', '🕵️', 'Jefe de espías', true)}
          {roleGroup('operative', 'red', '👤', 'Agentes')}
        </div>
        <div className="team-panel blue">
          <div className="team-panel-head">🔵 Equipo Azul</div>
          {roleGroup('spymaster', 'blue', '🕵️', 'Jefe de espías', true)}
          {roleGroup('operative', 'blue', '👤', 'Agentes')}
        </div>
      </div>

      <div className="lobby-neutrals">
        {neutralCard('tableBoard', '📺', 'Mesa / TV',
          'Pantalla compartida (TV): puede revelar cartas de ambos equipos y terminar turnos. Ideal para juntadas presenciales.')}
        {neutralCard('spectator', '👁️', 'Espectadores',
          'Solo observa la partida: no revela cartas ni da pistas.')}
      </div>

      {me && isTeamRole(me.role) && (
        <button
          className={`ready-btn${me.ready ? ' on' : ''}`}
          onClick={() => send({ type: 'setReady', value: !me.ready })}
        >
          {me.ready ? '✓ Estoy listo' : 'Marcarme listo'}
        </button>
      )}

      <section className="lobby-start">
        {isHost ? (
          <>
            <button className="start-btn" disabled={blockReason !== null} onClick={() => send({ type: 'startGame' })}>
              🚀 Iniciar partida
            </button>
            {blockReason && <p className="hint">⏳ {blockReason}</p>}
          </>
        ) : (
          <p className="tag">
            Esperando a que <strong>{hostName}</strong> (host) inicie la partida.
            {blockReason && <> Falta: {blockReason.toLowerCase()}</>}
          </p>
        )}
      </section>

      {error && <p className="err toast">⚠ {error}</p>}
    </div>
  );
}
