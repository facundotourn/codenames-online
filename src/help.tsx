import type { GameState, Player, Team } from '../party/types';
import { teamLabel } from '../party/rules';
import type { HelpStep } from './components/RulesHelp';

// Une nombres en "A", "A y B", "A, B y C". "—" si no hay nadie.
function listNames(ps: Player[]): string {
  const names = ps.map(p => p.name);
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}

// Reglas generales (home y lobby): cómo se desarrolla la partida.
export const generalSteps: HelpStep[] = [
  {
    title: '¿De qué se trata?',
    body: <p>Hay <strong>25 cartas</strong> con palabras sobre la mesa. Dos equipos, <strong>rojo</strong> y <strong>azul</strong>, compiten por descubrir cuáles son sus cartas.</p>,
  },
  {
    title: 'Los roles',
    body: <p>Cada equipo tiene un <strong>jefe de espías</strong> (es el único que ve los colores secretos) y uno o más <strong>agentes</strong> (no los ven). También podés sumarte como <strong>Mesa/TV</strong> (pantalla compartida) o como <strong>espectador</strong>.</p>,
  },
  {
    title: 'La pista',
    body: <p>En su turno, el jefe da una pista: una <strong>palabra</strong> y un <strong>número</strong>. La palabra relaciona varias de sus cartas; el número dice cuántas. No puede ser ninguna palabra que esté en el tablero.</p>,
  },
  {
    title: 'Adivinar',
    body: <p>Los agentes tocan las cartas que creen de su color. Si <strong>aciertan</strong>, siguen (hasta el número de la pista + 1). Si tocan una carta <strong>neutral</strong> o del <strong>rival</strong>, su turno termina.</p>,
  },
  {
    title: 'El asesino',
    body: <p>Una de las cartas es el <strong>asesino</strong>. Si un equipo la toca, <strong>pierde la partida al instante</strong>. ¡Ojo con las pistas ambiguas!</p>,
  },
  {
    title: 'Cómo se gana',
    body: <p>Gana el equipo que primero revela <strong>todas sus cartas</strong>.</p>,
  },
];

// Ayuda específica del rol que ocupa el jugador, nombrando al resto.
export function gameSteps(me: Player, state: GameState): HelpStep[] {
  const players = Object.values(state.players);
  const spy = (t: Team) => players.filter(p => p.role === 'spymaster' && p.team === t);
  const ops = (t: Team) => players.filter(p => p.role === 'operative' && p.team === t);

  const winRule: HelpStep = {
    title: 'Cómo se gana',
    body: <p>Gana el equipo que primero revela <strong>todas sus cartas</strong>. Hay una carta <strong>asesino</strong>: si tu equipo la toca, pierde en el acto.</p>,
  };

  const teamsOverview = (
    <p>
      Rojo: jefe <strong>{listNames(spy('red'))}</strong>, agentes <strong>{listNames(ops('red'))}</strong>.<br />
      Azul: jefe <strong>{listNames(spy('blue'))}</strong>, agentes <strong>{listNames(ops('blue'))}</strong>.
    </p>
  );

  if (me.role === 'spymaster' && me.team) {
    const team = me.team;
    const rival: Team = team === 'red' ? 'blue' : 'red';
    return [
      {
        title: 'Sos el jefe de espías',
        body: <p>Equipo <strong>{teamLabel(team)}</strong>. Sos el único de tu equipo que <strong>ve los colores</strong>. Tu trabajo es dar pistas para que tus agentes descubran las cartas de tu color.</p>,
      },
      {
        title: 'Tu equipo',
        body: <p>Tus agentes son <strong>{listNames(ops(team))}</strong>: ellos no ven los colores y dependen de tus pistas. Enfrente, el equipo <strong>{teamLabel(rival)}</strong> tiene de jefe a <strong>{listNames(spy(rival))}</strong>.</p>,
      },
      {
        title: 'Cómo dar la pista',
        body: <p>Una <strong>palabra</strong> + un <strong>número</strong>: la palabra conecta varias de tus cartas y el número dice cuántas. No puede ser una palabra del tablero. Si te trabás, podés pedir una <strong>sugerencia a la IA</strong>.</p>,
      },
      {
        title: 'Cuidá a tus agentes',
        body: <p>Evitá pistas que apunten sin querer a cartas neutrales, del rival o al <strong>asesino</strong>. Una pista ambigua puede costarles el turno… o la partida.</p>,
      },
      winRule,
    ];
  }

  if (me.role === 'operative' && me.team) {
    const team = me.team;
    const rival: Team = team === 'red' ? 'blue' : 'red';
    const mates = ops(team).filter(p => p.id !== me.id);
    return [
      {
        title: 'Sos un agente',
        body: <p>Equipo <strong>{teamLabel(team)}</strong>. Adivinás las cartas de tu equipo a partir de la pista de tu jefe. Vos <strong>no ves</strong> los colores.</p>,
      },
      {
        title: 'Tu equipo',
        body: <p>Tu jefe de espías es <strong>{listNames(spy(team))}</strong>. {mates.length > 0 ? <>Tus compañeros agentes son <strong>{listNames(mates)}</strong>.</> : <>Por ahora sos el único agente.</>} Enfrente juega el equipo <strong>{teamLabel(rival)}</strong> (jefe <strong>{listNames(spy(rival))}</strong>).</p>,
      },
      {
        title: 'Cómo adivinar',
        body: <p>Cuando tu jefe dé la pista (palabra + número), tocá las cartas que creas de tu color. Si <strong>acertás</strong> podés seguir (hasta el número + 1). Si tocás una <strong>neutral</strong> o una del <strong>rival</strong>, tu turno termina.</p>,
      },
      winRule,
    ];
  }

  if (me.role === 'tableBoard') {
    return [
      {
        title: 'Sos la Mesa / TV',
        body: <p>Sos la pantalla compartida: revelás cartas por <strong>los dos equipos</strong> según lo que deciden sus agentes en la sala, y terminás los turnos.</p>,
      },
      { title: 'Los equipos', body: teamsOverview },
      {
        title: 'Cómo se juega',
        body: <p>En el turno de cada equipo, su jefe da una pista y sus agentes te indican qué cartas tocar. Revelás esas cartas y terminás el turno cuando lo decidan.</p>,
      },
      winRule,
    ];
  }

  // Espectador
  return [
    {
      title: 'Estás de espectador',
      body: <p>Seguís la partida sin participar: no revelás cartas ni das pistas.</p>,
    },
    { title: 'Los equipos', body: teamsOverview },
    {
      title: 'Cómo se juega',
      body: <p>Cada turno, el jefe da una pista (palabra + número) y sus agentes adivinan. Aciertan → siguen; tocan una neutral o del rival → pierden el turno. Si alguien toca el <strong>asesino</strong>, pierde en el acto.</p>,
    },
  ];
}
