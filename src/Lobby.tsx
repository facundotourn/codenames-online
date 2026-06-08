import { useRef, useLayoutEffect, type RefObject } from 'react';
import type { Player, Role, Team } from '../party/types';
import { startBlockReason, isTeamRole } from '../party/rules';
import type { RoomViewProps } from './viewProps';
import { ThemeToggle } from './components/ThemeToggle';
import { AutoHeight } from './components/AutoHeight';

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

function MemberChip({ player, hostId, meId, chipRef }: {
  player: Player; hostId: string; meId?: string; chipRef?: RefObject<HTMLLIElement>;
}) {
  const isMe = player.id === meId;
  return (
    <li ref={chipRef} className={`member${player.connected ? '' : ' offline'}${isMe ? ' me' : ''}`}>
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

// Lista de miembros (incluido yo, arriba) + botón "Unirme" al fondo. Cuando me
// uno, animo mi chip con un FLIP: arranca donde estaba el botón (abajo) y sube
// girando hasta su lugar en la lista.
function MemberSlot({ members, me, hostId, active, showJoin, onJoin }: {
  members: Player[]; me: Player | undefined; hostId: string;
  active: boolean; showJoin: boolean; onJoin: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const lastBtnTop = useRef<number | null>(null);
  const myChip = useRef<HTMLLIElement>(null);
  const wasActive = useRef(active);

  // Recordá dónde está el botón mientras exista (para el FLIP al unirse).
  useLayoutEffect(() => {
    if (btnRef.current) lastBtnTop.current = btnRef.current.getBoundingClientRect().top;
  });

  useLayoutEffect(() => {
    if (!wasActive.current && active && myChip.current && lastBtnTop.current != null
        && typeof myChip.current.animate === 'function') {
      const delta = lastBtnTop.current - myChip.current.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) {
        myChip.current.animate(
          [
            { transform: `perspective(600px) translateY(${delta}px) rotateX(-90deg)`, opacity: 0.2 },
            { transform: 'perspective(600px) translateY(0) rotateX(0deg)', opacity: 1 },
          ],
          { duration: 420, easing: 'cubic-bezier(0.34, 1.45, 0.6, 1)' },
        );
      }
    }
    wasActive.current = active;
  }, [active]);

  return (
    <>
      {members.length > 0 && (
        <ul className="members">
          {members.map(p => (
            <MemberChip
              key={p.id} player={p} hostId={hostId} meId={me?.id}
              chipRef={p.id === me?.id ? myChip : undefined}
            />
          ))}
        </ul>
      )}
      {showJoin && (
        <div className="join-slot">
          <button ref={btnRef} className="join-btn" onClick={onJoin}>Unirme</button>
        </div>
      )}
    </>
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

  const roleGroup = (role: Role, team: Team | null, icon: string, title: string, single = false) => {
    const members = membersOf(role, team);
    const active = iAm(role, team);
    // Rol de ocupación única (jefe): si ya lo tiene otro, no se puede unir.
    const taken = single && members.some(p => p.id !== me?.id);
    return (
      <div className="role-group">
        <div className="role-group-title"><span>{icon}</span> {title}</div>
        <MemberSlot
          members={members} me={me} hostId={state.hostId}
          active={active} showJoin={!active && !taken}
          onJoin={() => setRole(role, team)}
        />
      </div>
    );
  };

  const neutralCard = (role: Role, icon: string, title: string, tip: string) => {
    const members = membersOf(role, null);
    const active = iAm(role, null);
    return (
      <div className="info-card">
        <div className="info-head">
          <span className="info-icon">{icon}</span>
          <span className="info-title">{title}</span>
          <span className="tip" tabIndex={0} role="img" aria-label={`info: ${tip}`} data-tip={tip}>i</span>
        </div>
        <AutoHeight className="info-body">
          <MemberSlot
            members={members} me={me} hostId={state.hostId}
            active={active} showJoin={!active}
            onJoin={() => setRole(role, null)}
          />
        </AutoHeight>
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
        <AutoHeight className="team-panel red">
          <div className="team-panel-head">🔴 Equipo Rojo</div>
          {roleGroup('spymaster', 'red', '🕵️', 'Jefe de espías', true)}
          {roleGroup('operative', 'red', '👤', 'Agentes')}
        </AutoHeight>
        <AutoHeight className="team-panel blue">
          <div className="team-panel-head">🔵 Equipo Azul</div>
          {roleGroup('spymaster', 'blue', '🕵️', 'Jefe de espías', true)}
          {roleGroup('operative', 'blue', '👤', 'Agentes')}
        </AutoHeight>
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
