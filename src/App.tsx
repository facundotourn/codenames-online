import { useState } from 'react';
import { Room } from './Room';

// Identidad persistente: un id estable por dispositivo (para reconexión).
function getPlayerId(): string {
  let id = localStorage.getItem('playerId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('playerId', id);
  }
  return id;
}

export default function App() {
  const [name, setName] = useState(() => localStorage.getItem('playerName') ?? '');
  const [roomInput, setRoomInput] = useState('sala-1');
  const [joined, setJoined] = useState<{ room: string; name: string } | null>(null);

  const join = () => {
    const finalName = name.trim() || 'Jugador';
    const room = roomInput.trim() || 'sala-1';
    localStorage.setItem('playerName', finalName);
    setJoined({ room, name: finalName });
  };

  if (joined) {
    return (
      <Room
        playerId={getPlayerId()}
        room={joined.room}
        name={joined.name}
        onLeave={() => setJoined(null)}
      />
    );
  }

  return (
    <div className="screen">
      <h1><span className="r">Code</span><span className="b">names</span> Online</h1>
      <p className="tag">Fase 0 — scaffold: lobby en tiempo real con PartyKit</p>
      <div className="form">
        <label>
          Nombre
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre" />
        </label>
        <label>
          Sala
          <input value={roomInput} onChange={e => setRoomInput(e.target.value)} placeholder="código de sala" />
        </label>
        <button onClick={join}>Entrar a la sala</button>
      </div>
    </div>
  );
}
