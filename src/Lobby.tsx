import type { Player, Role, Team } from '../party/types';
import { startBlockReason, roleLabel, isTeamRole } from '../party/rules';
import type { RoomViewProps } from './viewProps';

interface RoleOption {
  label: string;
  role: Role;
  team: Team | null;
}

const ROLE_OPTIONS: RoleOption[] = [
  { label: 'Rojo · Jefe de espías', role: 'spymaster', team: 'red' },
  { label: 'Rojo · Agente', role: 'operative', team: 'red' },
  { label: 'Azul · Jefe de espías', role: 'spymaster', team: 'blue' },
  { label: 'Azul · Agente', role: 'operative', team: 'blue' },
  { label: 'Mesa / TV', role: 'tableBoard', team: null },
  { label: 'Espectador', role: 'spectator', team: null },
];

function PlayerChip({ player, hostId, meId }: { player: Player; hostId: string; meId?: string }) {
  return (
    <li>
      <span className="pname">{player.name}</span>
      <span className="prole">{roleLabel(player.role)}</span>
      {hostId === player.id && <span className="badge host">host</span>}
      {player.id === meId && <span className="badge you">vos</span>}
      {isTeamRole(player.role) && player.ready && <span className="badge ready">listo</span>}
    </li>
  );
}

function TeamColumn({ team, players, hostId, meId }: {
  team: Team; players: Player[]; hostId: string; meId?: string;
}) {
  const members = players.filter(p => p.team === team && isTeamRole(p.role));
  return (
    <div className={`team-col ${team}`}>
      <h4>{team === 'red' ? '🔴 Equipo Rojo' : '🔵 Equipo Azul'}</h4>
      {members.length === 0
        ? <p className="empty">Sin jugadores</p>
        : <ul className="players">
            {members.map(p => <PlayerChip key={p.id} player={p} hostId={hostId} meId={meId} />)}
          </ul>}
    </div>
  );
}

export function Lobby({ state, me, room, send, onLeave, error }: RoomViewProps) {
  const players = Object.values(state.players);
  const neutrals = players.filter(p => !isTeamRole(p.role));
  const isHost = state.hostId === me?.id;
  const blockReason = startBlockReason(players);
  const hostName = state.players[state.hostId]?.name ?? '—';

  const selected = (opt: RoleOption) => me?.role === opt.role && (me?.team ?? null) === opt.team;

  return (
    <div className="screen">
      <header className="room-head">
        <div>
          <h2>Sala <code className="room-code">{room}</code></h2>
          <p className="tag">Compartí el código para que se unan · sos <strong>{me?.name ?? '—'}</strong></p>
        </div>
        <button className="ghost" onClick={onLeave}>Salir</button>
      </header>

      <section className="panel">
        <h3>Tu rol</h3>
        <div className="role-grid">
          {ROLE_OPTIONS.map(opt => (
            <button
              key={opt.label}
              className={`role-btn${selected(opt) ? ' active' : ''}`}
              onClick={() => send({ type: 'setRole', role: opt.role, team: opt.team })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {me && isTeamRole(me.role) && (
          <button
            className={`ready-btn${me.ready ? ' on' : ''}`}
            onClick={() => send({ type: 'setReady', value: !me.ready })}
          >
            {me.ready ? '✓ Estoy listo' : 'Marcarme listo'}
          </button>
        )}
        {me && !isTeamRole(me.role) && (
          <p className="hint">Como neutral no necesitás marcarte listo.</p>
        )}
      </section>

      <section className="panel">
        <h3>Equipos</h3>
        <div className="teams">
          <TeamColumn team="red" players={players} hostId={state.hostId} meId={me?.id} />
          <TeamColumn team="blue" players={players} hostId={state.hostId} meId={me?.id} />
        </div>
        <div className="neutrals">
          <h4>Neutrales</h4>
          {neutrals.length === 0
            ? <p className="empty">Nadie</p>
            : <ul className="players">
                {neutrals.map(p => <PlayerChip key={p.id} player={p} hostId={state.hostId} meId={me?.id} />)}
              </ul>}
        </div>
      </section>

      <section className="panel">
        {isHost ? (
          <>
            <button className="start-btn" disabled={blockReason !== null} onClick={() => send({ type: 'startGame' })}>
              Iniciar partida
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
