import { useState } from 'react';
import type { Player, Role, Team } from '../party/types';
import { startBlockReason, isTeamRole, draftTeams, teamLabel } from '../party/rules';
import type { ReactNode } from 'react';
import type { RoomViewProps } from './viewProps';
import { SettingsMenu } from './components/SettingsMenu';
import { HelpButton } from './components/RulesHelp';
import { RoomCodeShare } from './components/RoomCodeShare';
import { generalSteps } from './help';
import { AutoHeight } from './components/AutoHeight';
import {
  SpyIcon, UserIcon, TvIcon, EyeIcon, RobotIcon, LockIcon, CloseIcon,
  DotIcon, TopHatIcon, RocketIcon, HourglassIcon, WarnIcon,
} from './components/icons';

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
  const aiOn = state.aiTeam === 'blue';
  const blockReason = startBlockReason(players);
  const hostName = state.players[state.hostId]?.name ?? '—';
  // Equipos que arrancarían sin jefe (se sorteará uno entre sus agentes): al
  // iniciar se le avisa al host y se le pide confirmar antes de mandar startGame.
  const needsDraft = draftTeams(players);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const onStartClick = () => {
    if (needsDraft.length > 0) setConfirmDraft(true);
    else send({ type: 'startGame' });
  };
  const confirmStart = () => { setConfirmDraft(false); send({ type: 'startGame' }); };
  const draftTeamsText = needsDraft.map(teamLabel).join(' y ');

  const iAm = (role: Role, team: Team | null) => me?.role === role && (me?.team ?? null) === team;
  const setRole = (role: Role, team: Team | null) => send({ type: 'setRole', role, team });
  const membersOf = (role: Role, team: Team | null) =>
    players.filter(p => !p.isAI && p.role === role && (p.team ?? null) === team);
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

  const roleGroup = (role: Role, team: Team | null, icon: ReactNode, title: string, single = false) => {
    const list = others(role, team);
    const active = iAm(role, team);
    // Rol de ocupación única (jefe de espías): si ya lo tiene otro, no se puede unir.
    const taken = single && list.length > 0;
    return (
      <div className="role-group">
        <div className="role-group-title"><span className="rg-ico">{icon}</span> {title}</div>
        <AutoHeight className="members-wrap">
          {list.length > 0 && (
            <ul className="members">
              {list.map(p => <MemberChip key={p.id} player={p} hostId={state.hostId} meId={me?.id} />)}
            </ul>
          )}
        </AutoHeight>
        {(active || !taken) && joinSlot(role, team)}
      </div>
    );
  };

  // Asiento de un jugador IA (bloqueado, no se puede unir nadie humano).
  const aiSeat = (icon: ReactNode, title: string, role: Role) => {
    const bot = players.find(p => p.isAI && p.role === role);
    return (
      <div className="role-group">
        <div className="role-group-title"><span className="rg-ico">{icon}</span> {title}</div>
        <ul className="members">
          {bot && (
            <li className="member ai">
              <span className="ai-avatar"><RobotIcon size={16} /></span>
              <span className="pname">{bot.name}</span>
              <span className="mi mi-lock" title="Asiento de IA (bloqueado)"><LockIcon size={13} /></span>
            </li>
          )}
        </ul>
      </div>
    );
  };

  const neutralCard = (role: Role, icon: ReactNode, title: string, tip: string) => {
    const list = others(role, null);
    return (
      <div className="info-card">
        <div className="info-head">
          <span className="info-icon">{icon}</span>
          <span className="info-title">{title}</span>
          <span className="tip" tabIndex={0} role="img" aria-label={`info: ${tip}`} data-tip={tip}>i</span>
        </div>
        <div className="info-body">
          <AutoHeight className="members-wrap">
            {list.length > 0 && (
              <ul className="members">
                {list.map(p => <MemberChip key={p.id} player={p} hostId={state.hostId} meId={me?.id} />)}
              </ul>
            )}
          </AutoHeight>
          {joinSlot(role, null)}
        </div>
      </div>
    );
  };

  return (
    <div className="screen lobby">
      <header className="room-head">
        <div>
          <h2>Sala <RoomCodeShare room={room} /></h2>
        </div>
        <div className="head-actions">
          <HelpButton steps={generalSteps} />
          <SettingsMenu />
          <button className="exit-btn" onClick={onLeave}>Salir</button>
        </div>
      </header>

      <div className="lobby-teams">
        <div className="team-panel red">
          <div className="team-panel-head">
            <span className="th-label"><DotIcon size={12} /> Equipo Rojo</span>
          </div>
          {roleGroup('spymaster', 'red', <SpyIcon size={15} />, 'Jefe de espías', true)}
          {roleGroup('operative', 'red', <UserIcon size={15} />, 'Agentes')}
        </div>
        <div className="team-slot">
          <div className={`team-flip${aiOn ? ' flipped' : ''}`}>
            <div className="team-panel blue flip-face flip-front">
              <div className="team-panel-head">
                <span className="th-label"><DotIcon size={12} /> Equipo Azul</span>
                {isHost && (
                  <button
                    className="head-ai-btn"
                    onClick={() => send({ type: 'setAITeam', enabled: true })}
                    title="Jugar contra la IA"
                    aria-label="Jugar contra la IA"
                  ><RobotIcon size={15} /></button>
                )}
              </div>
              {roleGroup('spymaster', 'blue', <SpyIcon size={15} />, 'Jefe de espías', true)}
              {roleGroup('operative', 'blue', <UserIcon size={15} />, 'Agentes')}
            </div>
            <div className="team-panel ai flip-face flip-back">
              <div className="team-panel-head ai-head">
                <span className="th-label"><RobotIcon size={16} /> Equipo IA</span>
                {isHost && (
                  <button
                    className="head-ai-btn"
                    onClick={() => send({ type: 'setAITeam', enabled: false })}
                    title="Quitar el equipo IA"
                    aria-label="Quitar el equipo IA"
                  ><CloseIcon size={14} /></button>
                )}
              </div>
              {aiSeat(<SpyIcon size={15} />, 'Jefe de espías', 'spymaster')}
              {aiSeat(<UserIcon size={15} />, 'Agente', 'operative')}
            </div>
          </div>
        </div>
      </div>

      <div className="lobby-neutrals">
        {neutralCard('tableBoard', <TvIcon size={16} />, 'Mesa / TV',
          'Pantalla compartida (TV): puede revelar cartas de ambos equipos y terminar turnos. Ideal para juntadas presenciales.')}
        {neutralCard('spectator', <EyeIcon size={16} />, 'Espectadores',
          'Solo observa la partida: no revela cartas ni da pistas.')}
      </div>

      {me && isTeamRole(me.role) && (
        <button
          className={`ready-btn${me.ready ? ' on' : ''}`}
          onClick={() => send({ type: 'setReady', value: !me.ready })}
        >
          {me.ready ? <><CheckIcon /> Estoy listo</> : 'Marcarme listo'}
        </button>
      )}

      <section className="lobby-start">
        {isHost ? (
          <>
            <div className="word-variant" role="group" aria-label="Set de palabras">
              <span className="wv-label">Palabras</span>
              <div className="wv-seg">
                <button
                  className={state.wordVariant === 'ar' ? 'on' : ''}
                  onClick={() => send({ type: 'setWordVariant', variant: 'ar' })}
                >Argentino</button>
                <button
                  className={state.wordVariant === 'es' ? 'on' : ''}
                  onClick={() => send({ type: 'setWordVariant', variant: 'es' })}
                >Español</button>
              </div>
            </div>
            <button className="start-btn" disabled={blockReason !== null} onClick={onStartClick}>
              <RocketIcon size={18} className="txt-ico" /> Iniciar partida
            </button>
            {blockReason && <p className="hint"><HourglassIcon size={14} className="txt-ico" /> {blockReason}</p>}
            {!blockReason && needsDraft.length > 0 && (
              <p className="hint"><TopHatIcon size={14} className="txt-ico" /> Se sorteará el jefe de {draftTeamsText} entre sus agentes.</p>
            )}
          </>
        ) : (
          <p className="tag">
            Esperando a que <strong>{hostName}</strong> (host) inicie la partida.
            {blockReason && <> Falta: {blockReason.toLowerCase()}</>}
          </p>
        )}
      </section>

      {confirmDraft && (
        <div className="modal-backdrop" onClick={() => setConfirmDraft(false)}>
          <div className="modal draft-modal" onClick={e => e.stopPropagation()}>
            <h3><TopHatIcon size={18} className="txt-ico" /> Sortear jefe de espías</h3>
            <p>
              {needsDraft.length > 1 ? 'Los equipos' : 'El equipo'} <strong>{draftTeamsText}</strong>{' '}
              {needsDraft.length > 1 ? 'no tienen' : 'no tiene'} jefe de espías. Se elegirá uno al azar
              entre sus agentes con una pequeña ruleta. ¿Iniciar igual?
            </p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirmDraft(false)}>Cancelar</button>
              <button className="start-btn" onClick={confirmStart}><RocketIcon size={17} className="txt-ico" /> Sortear e iniciar</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="err toast"><WarnIcon size={15} className="txt-ico" /> {error}</p>}
    </div>
  );
}
