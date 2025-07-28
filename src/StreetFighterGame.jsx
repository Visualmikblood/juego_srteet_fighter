import React, { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// Detecta entorno local y ajusta la URL del backend automáticamente
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const socket = io(backendUrl, {
  transports: ["polling"]
});

const StreetFighterGame = () => {
  const [gameState, setGameState] = useState({
    player1: {
      x: 100, y: 300, hp: 100, maxHp: 100, facing: 'right',
      isAttacking: false, isBlocking: false, isJumping: false,
      jumpVelocity: 0, combo: 0, special: 100, lastAttackTime: 0
    },
    player2: {
      x: 600, y: 300, hp: 100, maxHp: 100, facing: 'left',
      isAttacking: false, isBlocking: false, isJumping: false,
      jumpVelocity: 0, combo: 0, special: 100, lastAttackTime: 0
    },
    gameStarted: false,
    winner: null,
    round: 1,
    timer: 90
  });

  const [playerId, setPlayerId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [playersConnected, setPlayersConnected] = useState({ total: 0 });
  
  const localKeys = useRef({});
  const remoteKeys = useRef({});
  const [effects, setEffects] = useState([]);

  // Socket connection management
  useEffect(() => {
    socket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
      console.log('Disconnected from server');
    });

    socket.on('assignPlayer', (data) => {
      setPlayerId(data.role);
      setConnectionStatus('assigned');
      console.log('Assigned as:', data.role);
    });

    socket.on('playersUpdate', (data) => {
      setPlayersConnected(data);
      console.log('Players update:', data);
    });

    socket.on('updatePlayerKeys', ({ player, keys }) => {
      console.log('Received keys from:', player, 'My ID:', playerId);
      // Solo actualizar si las teclas son del otro jugador
      if (player !== playerId) {
        remoteKeys.current = keys;
      }
    });

    socket.on('gameStateUpdate', (newGameState) => {
      setGameState(prev => ({
        ...prev,
        ...newGameState
      }));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('assignPlayer');
      socket.off('playersUpdate');
      socket.off('updatePlayerKeys');
      socket.off('gameStateUpdate');
    };
  }, [playerId]);

  // Keyboard input handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      localKeys.current[key] = true;
      
      if (playerId && (playerId === 'player1' || playerId === 'player2')) {
        socket.emit('playerAction', {
          player: playerId,
          keys: { ...localKeys.current }
        });
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      localKeys.current[key] = false;
      
      if (playerId && (playerId === 'player1' || playerId === 'player2')) {
        socket.emit('playerAction', {
          player: playerId,
          keys: { ...localKeys.current }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [playerId]);

  const addEffect = (x, y, type, color = '#FFD700') => {
    const effect = {
      id: Date.now() + Math.random(),
      x, y, type, color
    };
    setEffects(prev => [...prev, effect]);
    setTimeout(() => {
      setEffects(prev => prev.filter(e => e.id !== effect.id));
    }, 500);
  };

  const performAttack = (attacker, defender, type = 'normal') => {
    const distance = Math.abs(attacker.x - defender.x);
    if (distance < 80) {
      let damage = type === 'special' ? 25 : 15;
      if (attacker.combo > 0) damage += Math.floor(attacker.combo * 2);

      if (defender.isBlocking) {
        damage *= 0.3;
        addEffect(defender.x, defender.y - 20, 'block', '#4A90E2');
        return { hp: Math.max(0, defender.hp - damage), breakCombo: true };
      } else {
        addEffect(defender.x, defender.y - 20, 'hit', '#FF4444');
        if (type === 'special') addEffect(defender.x, defender.y - 40, 'special', '#FF00FF');
        if (attacker.combo > 0) addEffect(defender.x + 30, defender.y - 60, 'combo', '#FFD700');
      }
      return { hp: Math.max(0, defender.hp - damage), breakCombo: false };
    }
    return { hp: defender.hp, breakCombo: false };
  };

  // Timer countdown
  useEffect(() => {
    if (gameState.gameStarted && !gameState.winner) {
      const timer = setInterval(() => {
        setGameState(prev => {
          if (prev.timer <= 1) {
            const winner = prev.player1.hp > prev.player2.hp ? 'Player 1' :
                          prev.player2.hp > prev.player1.hp ? 'Player 2' : 'Draw';
            return { ...prev, timer: 0, winner };
          }
          return { ...prev, timer: prev.timer - 1 };
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [gameState.gameStarted, gameState.winner]);

  const startGame = () => {
    // Emitir evento al servidor, no modificar estado local directamente
    socket.emit('startGame');
  };

  const resetGame = () => startGame();

  const styles = {
    container: {
      width: '100%',
      height: '100vh',
      background: 'linear-gradient(to bottom, #60a5fa, #4ade80)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    },
    stageBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(to top, rgba(202, 138, 4, 0.3), transparent)'
    },
    statusBar: {
      position: 'absolute',
      top: '1rem',
      right: '1rem',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '0.5rem 1rem',
      borderRadius: '0.5rem',
      fontSize: '0.875rem'
    },
    hud: {
      position: 'absolute',
      top: '3rem',
      left: 0,
      right: 0,
      padding: '1rem',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      color: 'white'
    },
    hudContent: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      maxWidth: '64rem',
      margin: '0 auto'
    },
    playerInfo: {
      flex: 1
    },
    playerInfoRight: {
      flex: 1,
      textAlign: 'right'
    },
    timerSection: {
      flex: 1,
      textAlign: 'center'
    },
    hpBar: {
      width: '100%',
      backgroundColor: '#374151',
      borderRadius: '9999px',
      height: '1rem',
      marginBottom: '0.5rem'
    },
    hpFill: {
      backgroundColor: '#ef4444',
      height: '1rem',
      borderRadius: '9999px',
      transition: 'width 0.3s'
    },
    specialBar: {
      width: '100%',
      backgroundColor: '#374151',
      borderRadius: '9999px',
      height: '0.5rem'
    },
    specialFill: {
      backgroundColor: '#3b82f6',
      height: '0.5rem',
      borderRadius: '9999px',
      transition: 'width 0.3s'
    },
    arena: {
      position: 'relative',
      width: '100%',
      maxWidth: '64rem',
      height: '24rem',
      background: 'linear-gradient(to bottom, transparent, #a16207)',
      borderBottom: '4px solid #92400e'
    },
    floorLine: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '0.5rem',
      backgroundColor: '#92400e'
    },
    player: {
      position: 'absolute',
      transition: 'all 0.1s'
    },
    playerCharacter: {
      width: '4rem',
      height: '5rem',
      borderRadius: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '2rem',
      fontWeight: 'bold',
      transition: 'all 0.3s'
    },
    player1Normal: {
      backgroundColor: '#2563eb',
      color: 'white'
    },
    player2Normal: {
      backgroundColor: '#dc2626',
      color: 'white'
    },
    playerAttacking: {
      backgroundColor: '#ef4444',
      color: 'white',
      transform: 'scale(1.1)'
    },
    playerBlocking: {
      backgroundColor: '#3b82f6',
      color: 'white'
    },
    effect: {
      position: 'absolute',
      fontSize: '1.5rem',
      fontWeight: 'bold',
      animation: 'bounce 0.5s ease-in-out',
      pointerEvents: 'none'
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      textAlign: 'center'
    },
    button: {
      backgroundColor: '#dc2626',
      color: 'white',
      padding: '0.75rem 1.5rem',
      borderRadius: '0.375rem',
      border: 'none',
      fontSize: '1.25rem',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'background-color 0.3s'
    },
    buttonHover: {
      backgroundColor: '#b91c1c'
    },
    controls: {
      position: 'absolute',
      bottom: '1rem',
      left: '1rem',
      right: '1rem',
      display: 'flex',
      justifyContent: 'space-between',
      color: 'white',
      fontSize: '0.875rem'
    },
    controlsBox: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      padding: '0.5rem',
      borderRadius: '0.375rem'
    },
    controlsBoxRight: {
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      padding: '0.5rem',
      borderRadius: '0.375rem',
      textAlign: 'right'
    },
    attackEffect: {
      position: 'absolute',
      top: '50%',
      fontSize: '1.25rem',
      color: '#fbbf24',
      transform: 'translateY(-50%)'
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10b981';
      case 'assigned': return '#3b82f6';
      case 'disconnected': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected';
      case 'assigned': return `You are ${playerId}`;
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.stageBackground}></div>
      
      {/* Connection Status */}
      <div style={{
        ...styles.statusBar,
        backgroundColor: getStatusColor(),
      }}>
        {getStatusText()}
        <br />
        Players: {playersConnected.total || 0}/2
      </div>

      {/* HUD */}
      <div style={styles.hud}>
        <div style={styles.hudContent}>
          <div style={styles.playerInfo}>
            <div style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>
              Player 1 {playerId === 'player1' && '(You)'}
            </div>
            <div style={styles.hpBar}>
              <div style={{
                ...styles.hpFill,
                width: `${(gameState.player1.hp / gameState.player1.maxHp) * 100}%`
              }}></div>
            </div>
            <div style={styles.specialBar}>
              <div style={{
                ...styles.specialFill,
                width: `${gameState.player1.special}%`
              }}></div>
            </div>
            <div style={{ fontSize: '0.875rem' }}>Combo: {gameState.player1.combo}</div>
          </div>
          
          <div style={styles.timerSection}>
            <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{gameState.timer}</div>
            <div style={{ fontSize: '1.125rem' }}>Round {gameState.round}</div>
          </div>
          
          <div style={styles.playerInfoRight}>
            <div style={{ fontSize: '1.125rem', fontWeight: 'bold' }}>
              Player 2 {playerId === 'player2' && '(You)'}
            </div>
            <div style={styles.hpBar}>
              <div style={{
                ...styles.hpFill,
                width: `${(gameState.player2.hp / gameState.player2.maxHp) * 100}%`
              }}></div>
            </div>
            <div style={styles.specialBar}>
              <div style={{
                ...styles.specialFill,
                width: `${gameState.player2.special}%`
              }}></div>
            </div>
            <div style={{ fontSize: '0.875rem' }}>Combo: {gameState.player2.combo}</div>
          </div>
        </div>
      </div>

      {/* Arena */}
      <div style={styles.arena}>
        <div style={styles.floorLine}></div>
        
        {/* Player 1 */}
        <div style={{
          ...styles.player,
          left: `${gameState.player1.x}px`,
          bottom: `${400 - gameState.player1.y}px`,
          transform: `scaleX(${gameState.player1.facing === 'left' ? -1 : 1})`
        }}>
          <div style={{
            ...styles.playerCharacter,
            ...(gameState.player1.isAttacking ? styles.playerAttacking :
                gameState.player1.isBlocking ? styles.playerBlocking :
                styles.player1Normal)
          }}>
            🥋
          </div>
          {gameState.player1.isAttacking && (
            <div style={{
              ...styles.attackEffect,
              right: gameState.player1.facing === 'right' ? '-2rem' : 'auto',
              left: gameState.player1.facing === 'left' ? '-2rem' : 'auto'
            }}>
              ⚡
            </div>
          )}
        </div>

        {/* Player 2 */}
        <div style={{
          ...styles.player,
          left: `${gameState.player2.x}px`,
          bottom: `${400 - gameState.player2.y}px`,
          transform: `scaleX(${gameState.player2.facing === 'left' ? -1 : 1})`
        }}>
          <div style={{
            ...styles.playerCharacter,
            ...(gameState.player2.isAttacking ? styles.playerAttacking :
                gameState.player2.isBlocking ? styles.playerBlocking :
                styles.player2Normal)
          }}>
            🥊
          </div>
          {gameState.player2.isAttacking && (
            <div style={{
              ...styles.attackEffect,
              right: gameState.player2.facing === 'right' ? '-2rem' : 'auto',
              left: gameState.player2.facing === 'left' ? '-2rem' : 'auto'
            }}>
              ⚡
            </div>
          )}
        </div>

        {/* Effects */}
        {effects.map(effect => (
          <div key={effect.id} style={{
            ...styles.effect,
            left: `${effect.x}px`,
            bottom: `${400 - effect.y}px`,
            color: effect.color,
            fontSize: effect.type === 'special' ? '1.5rem' : '1.125rem'
          }}>
            {effect.type === 'hit' && '💥'}
            {effect.type === 'block' && '🛡️'}
            {effect.type === 'special' && '✨'}
            {effect.type === 'combo' && 'COMBO!'}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.controlsBox}>
          <div style={{ fontWeight: 'bold' }}>Player 1 (WASD)</div>
          <div>Move: WASD | Attack: F | Block: G | Special: H</div>
        </div>
        <div style={styles.controlsBoxRight}>
          <div style={{ fontWeight: 'bold' }}>Player 2 (Arrows)</div>
          <div>Move: ← → ↑ ↓ | Attack: 1 | Block: 2 | Special: 3</div>
        </div>
      </div>

      {/* Start/End screens */}
      {(!gameState.gameStarted || gameState.winner) && (
        <div style={styles.overlay}>
          <div>
            {gameState.winner ? (
              <div>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                  {gameState.winner === 'Draw' ? 'EMPATE!' : `${gameState.winner} WINS!`}
                </h2>
                <button
                  onClick={resetGame}
                  style={styles.button}
                  onMouseEnter={(e) => e.target.style.backgroundColor = styles.buttonHover.backgroundColor}
                  onMouseLeave={(e) => e.target.style.backgroundColor = styles.button.backgroundColor}
                >
                  Jugar de Nuevo
                </button>
              </div>
            ) : (
              <div>
                <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1rem' }}>STREET FIGHTER</h1>
                <p style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>¡Prepárate para la batalla!</p>
                <p style={{ fontSize: '1rem', marginBottom: '2rem' }}>
                  Jugadores conectados: {playersConnected.total || 0}/2
                </p>
                {(playersConnected.total >= 2) && (playerId === 'player1' || playerId === 'player2') && (
                  <button
                    onClick={startGame}
                    style={styles.button}
                    onMouseEnter={(e) => e.target.style.backgroundColor = styles.buttonHover.backgroundColor}
                    onMouseLeave={(e) => e.target.style.backgroundColor = styles.button.backgroundColor}
                  >
                    FIGHT!
                  </button>
                )}
                {(!playersConnected.total || playersConnected.total < 2) && (
                  <p style={{ color: '#fbbf24' }}>Esperando más jugadores...</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    {/* Controles móviles tipo SNES */}
    {isMobileLandscape() && gameState.gameStarted && (playerId === 'player1' || playerId === 'player2') && (
      <MobileControls onAction={handleMobileAction} />
    )}
  </div>
  );

// --- COMPONENTE Y FUNCIONES PARA CONTROLES MÓVILES ---

function isMobileLandscape() {
  // Detecta móvil en landscape (ancho > alto y pantalla pequeña)
  if (typeof window === 'undefined') return false;
  return window.innerWidth > window.innerHeight && window.innerWidth < 1100;
}

function MobileControls({ onAction }) {
  // Mapeo de botones SNES: A (rojo), B (amarillo), X (azul), Y (verde)
  // D-Pad: izquierda, derecha, arriba, abajo
  return (
    <div className="mobile-controls">
      <div className="dpad">
        <button className="dpad-btn up" onTouchStart={() => onAction('up')}>&#8593;</button>
        <div className="dpad-middle-row">
          <button className="dpad-btn left" onTouchStart={() => onAction('left')}>&#8592;</button>
          <button className="dpad-btn center" disabled></button>
          <button className="dpad-btn right" onTouchStart={() => onAction('right')}>&#8594;</button>
        </div>
        <button className="dpad-btn down" onTouchStart={() => onAction('down')}>&#8595;</button>
      </div>
      <div className="snes-buttons">
        <button className="snes-btn snes-a" onTouchStart={() => onAction('attack')}>A</button>
        <button className="snes-btn snes-b" onTouchStart={() => onAction('block')}>B</button>
        <button className="snes-btn snes-x" onTouchStart={() => onAction('special')}>X</button>
        <button className="snes-btn snes-y" onTouchStart={() => onAction('jump')}>Y</button>
      </div>
    </div>
  );
}

function emitPlayerKeys() {
  if (playerId && (playerId === 'player1' || playerId === 'player2')) {
    socket.emit('playerAction', {
      player: playerId,
      keys: { ...localKeys.current }
    });
  }
}

function handleMobileAction(action) {
  // Simula las teclas o acciones del teclado para el jugador local
  switch (action) {
    case 'left':
      localKeys.current['a'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['a'] = false; emitPlayerKeys(); }, 100);
      break;
    case 'right':
      localKeys.current['d'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['d'] = false; emitPlayerKeys(); }, 100);
      break;
    case 'up':
      localKeys.current['w'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['w'] = false; emitPlayerKeys(); }, 100);
      break;
    case 'down':
      localKeys.current['s'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['s'] = false; emitPlayerKeys(); }, 100);
      break;
    case 'attack':
      localKeys.current['f'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['f'] = false; emitPlayerKeys(); }, 120);
      break;
    case 'block':
      localKeys.current['g'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['g'] = false; emitPlayerKeys(); }, 120);
      break;
    case 'special':
      localKeys.current['h'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['h'] = false; emitPlayerKeys(); }, 120);
      break;
    case 'jump':
      localKeys.current['w'] = true;
      emitPlayerKeys();
      setTimeout(() => { localKeys.current['w'] = false; emitPlayerKeys(); }, 150);
      break;
    default:
      break;
  }
}


};

export default StreetFighterGame;