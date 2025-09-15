import React, { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';

import PracticeBoard from './components/PracticeBoard';
import StartScreen from './components/StartScreen';
import PaymentScreen from './components/PaymentScreen';
import WaitingScreen from './components/WaitingScreen';
import GameScreen from './components/GameScreen';
import AchievementSystem from './components/AchievementSystem';
import MysteryBoxes from './components/MysteryBoxes';
import LeaderboardSystem from './components/LeaderboardSystem';
import './styles.css';
import './components/NewFeatures.css';
const PAYOUTS = {
  50: { winner: 80 },
  300: { winner: 500 },
  500: { winner: 800 },
  1000: { winner: 1700 },
  5000: { winner: 8000 },
  10000: { winner: 17000 },
};
const BET_OPTIONS = Object.keys(PAYOUTS).map(k => ({ amount: parseInt(k, 10), winnings: PAYOUTS[k].winner }));

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
const PAYMENT_TIMEOUT = 300; // 5 minutes like Sea Battle

export default function App() {
  const [activeTab, setActiveTab] = useState('Menu');
  const [gameState, setGameState] = useState('menu');
  const [currentScreen, setCurrentScreen] = useState('menu'); // 'menu', 'start', 'payment', 'waiting', 'game'
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);

  const [betAmount, setBetAmount] = useState(() => localStorage.getItem('ttt_lastBet') || '50');
  const [payoutAmount, setPayoutAmount] = useState(() => {
    const saved = localStorage.getItem('ttt_lastBet');
    const opt = BET_OPTIONS.find(o => o.amount === parseInt(saved || '50'));
    return opt ? String(opt.winnings) : '80';
  });
  const [lightningAddress, setLightningAddress] = useState('');
  const [acctId, setAcctId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [lnurl, setLnurl] = useState('');
  const [addressLocked, setAddressLocked] = useState(false);

  // Enhanced Payment state - Sea Battle style
  const [paymentInfo, setPaymentInfo] = useState(null); // { invoiceId, lightningInvoice, hostedInvoiceUrl, speedInterfaceUrl, amountSats, amountUSD }
  const [isWaitingForPayment, setIsWaitingForPayment] = useState(false);
  const [lightningInvoice, setLightningInvoice] = useState(null);
  const [hostedInvoiceUrl, setHostedInvoiceUrl] = useState(null);
  const [paymentTimer, setPaymentTimer] = useState(300); // 5 minutes like Sea Battle
  const [payButtonLoading, setPayButtonLoading] = useState(false);
  const paymentTimerRef = useRef(null);

  // Game state
  const [gameId, setGameId] = useState(null);
  const [symbol, setSymbol] = useState(null); // 'X' | 'O'
  const [turn, setTurn] = useState(null); // socketId whose turn
  const [board, setBoard] = useState(Array(9).fill(null));
  const [message, setMessage] = useState('');
  const [lastMove, setLastMove] = useState(null);
  const [winningLine, setWinningLine] = useState(null);
  const [turnDeadline, setTurnDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null); // seconds
  const [connected, setConnected] = useState(false);
  const [showHowToModal, setShowHowToModal] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('ttt_theme');
    return saved && saved !== 'neon' ? saved : 'simple';
  });
  const [turnDuration, setTurnDuration] = useState(null); // seconds for current turn
  const confettiRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(() => localStorage.getItem('ttt_sfx') !== '0');
  const [hapticsEnabled, setHapticsEnabled] = useState(() => localStorage.getItem('ttt_haptics') !== '0');
  const [tiltEnabled, setTiltEnabled] = useState(() => localStorage.getItem('ttt_tilt') !== '0');
  const boardRef = useRef(null);
  const audioCtxRef = useRef(null);
  const touchStartRef = useRef(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [waitingInfo, setWaitingInfo] = useState(null); // { minWait, maxWait, estWaitSeconds, spawnAt }
  const waitingIntervalRef = useRef(null);
  const [waitingSecondsLeft, setWaitingSecondsLeft] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null); // { opponent, startsIn, startAt }
  const matchIntervalRef = useRef(null);
  const [matchSecondsLeft, setMatchSecondsLeft] = useState(null);

  // New addictive features state
  const [showAchievements, setShowAchievements] = useState(false);
  const [showMysteryBoxes, setShowMysteryBoxes] = useState(false);
  const [showLeaderboards, setShowLeaderboards] = useState(false);
  const [playerSats, setPlayerSats] = useState(0);
  const [newAchievement, setNewAchievement] = useState(null);
  const [newMysteryBox, setNewMysteryBox] = useState(null);
  const [streakBonus, setStreakBonus] = useState(0);

  // History
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ttt_history') || '[]'); } catch { return []; }
  });

  const stats = useMemo(() => {
    let wins = 0, losses = 0, net = 0, streak = 0, cur = 0;
    for (const h of history) {
      if (h.outcome === 'win') { wins++; net += h.amount; cur = cur >= 0 ? cur + 1 : 1; }
      else { losses++; net += h.amount; cur = cur <= 0 ? cur - 1 : -1; }
    }
    streak = cur;
    const total = wins + losses;
    const wr = total ? Math.round((wins / total) * 100) : 0;
    return { wins, losses, net, streak, winrate: wr };
  }, [history]);

  useEffect(() => {
    if (!socket) {
      const newSocket = io(BACKEND_URL);
      setSocket(newSocket);

      newSocket.on('connect', () => {
        setConnected(true);
        setSocketId(newSocket.id);
      });

      newSocket.on('disconnect', () => {
        setConnected(false);
        setIsWaitingForPayment(false);
        setPayButtonLoading(false);
        setLightningInvoice(null);
        setHostedInvoiceUrl(null);
      });

      newSocket.on('error', (error) => {
        setConnected(false);
        setMessage(`Failed to connect to server: ${error.message}. Click Retry to try again.`);
        setIsWaitingForPayment(false);
        setPayButtonLoading(false);
        setLightningInvoice(null);
      });

      newSocket.on('waitingForOpponent', (data) => {
        setWaitingInfo(data);
        setCurrentScreen('waiting');
        setMessage('Waiting for opponent...');
      });

      // Enhanced payment handling - Sea Battle style
      newSocket.on('paymentRequest', ({ lightningInvoice, hostedInvoiceUrl, speedInterfaceUrl, amountSats, amountUSD, invoiceId }) => {
        setLightningInvoice(lightningInvoice);
        setHostedInvoiceUrl(hostedInvoiceUrl || null);
        setIsWaitingForPayment(true);
        setPayButtonLoading(false);
        setPaymentInfo({ 
          amountUSD, 
          amountSats,
          invoiceId,
          speedInterfaceUrl: speedInterfaceUrl || hostedInvoiceUrl
        });
        setPaymentTimer(PAYMENT_TIMEOUT);
        setMessage(`Pay ${amountSats} SATS (~$${amountUSD})`);
        setCurrentScreen('payment');
      });

      newSocket.on('paymentVerified', () => {
        setIsWaitingForPayment(false);
        setPayButtonLoading(false);
        setPaymentTimer(PAYMENT_TIMEOUT);
        setLightningInvoice(null);
        setHostedInvoiceUrl(null);
        setMessage('Payment verified! Preparing game...');
      });

      newSocket.on('message', (data) => {
        setMessage(data);
        const match = data.match(/wait time: (\d+)-(\d+) seconds/);
        if (match) {
          const minWait = parseInt(match[1]);
          const maxWait = parseInt(match[2]);
          const estimatedWait = Math.floor((minWait + maxWait) / 2);
          setWaitingInfo({ minWait, maxWait, estimatedWait });
          // Start countdown from max wait time
          setWaitingSecondsLeft(maxWait);
          
          if (waitingIntervalRef.current) { 
            clearInterval(waitingIntervalRef.current); 
          }
          
          const startTime = Date.now();
          waitingIntervalRef.current = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const remaining = Math.max(0, maxWait - elapsed);
            setWaitingSecondsLeft(remaining);
          }, 1000);
        } else {
          setWaitingInfo(null);
          setWaitingSecondsLeft(null);
        }
        setMatchInfo(null);
      });

      newSocket.on('matchFound', ({ opponent, startsIn, startAt }) => {
        // Switch to pre-game countdown
        if (waitingIntervalRef.current) { clearInterval(waitingIntervalRef.current); waitingIntervalRef.current = null; }
        setWaitingInfo(null);
        setMatchInfo({ opponent, startsIn, startAt });
        setGameState('waiting');
        setMessage('Opponent found! Starting soon...');
        if (matchIntervalRef.current) { clearInterval(matchIntervalRef.current); matchIntervalRef.current = null; }
        const tick = () => {
          const secs = Math.max(0, Math.ceil((Number(startAt) - Date.now()) / 1000));
          setMatchSecondsLeft(secs);
          // Clear interval when countdown reaches 0
          if (secs <= 0 && matchIntervalRef.current) {
            clearInterval(matchIntervalRef.current);
            matchIntervalRef.current = null;
          }
        };
        tick();
        matchIntervalRef.current = setInterval(tick, 250);
      });

      newSocket.on('startGame', ({ gameId, symbol, turn, message, turnDeadline }) => {
        // Clear waiting/match timers on actual game start
        if (waitingIntervalRef.current) { clearInterval(waitingIntervalRef.current); waitingIntervalRef.current = null; }
        if (matchIntervalRef.current) { clearInterval(matchIntervalRef.current); matchIntervalRef.current = null; }
        setWaitingInfo(null);
        setMatchInfo(null);
        setWaitingSecondsLeft(null);
        setMatchSecondsLeft(null);
        setGameId(gameId);
        setSymbol(symbol);
        setTurn(turn);
        setBoard(Array(9).fill(null));
        setLastMove(null);
        setWinningLine(null);
        setTurnDeadline(turnDeadline || null);
        const ttl = turnDeadline ? Math.max(1, Math.ceil((Number(turnDeadline) - Date.now()) / 1000)) : null;
        setTurnDuration(ttl);
        setGameState('playing');
        setCurrentScreen('game');
        setShowStartModal(false);
        setMessage(message || (turn === socketId ? 'Your move' : "Opponent's move"));
      });

      newSocket.on('boardUpdate', ({ board, lastMove }) => {
        setBoard(board);
        setLastMove(typeof lastMove === 'number' ? lastMove : null);
      });

      newSocket.on('moveMade', ({ position, symbol, nextTurn, board, turnDeadline, message }) => {
        setBoard(board);
        setLastMove(position);
        setTurn(nextTurn);
        setTurnDeadline(turnDeadline || null);
        const ttl = turnDeadline ? Math.max(1, Math.ceil((Number(turnDeadline) - Date.now()) / 1000)) : null;
        setTurnDuration(ttl);
        setMessage(message || (nextTurn === socketId ? 'Your move' : "Opponent's move"));
      });

      newSocket.on('nextTurn', ({ turn, turnDeadline, message }) => {
        setTurn(turn);
        setTurnDeadline(turnDeadline || null);
        const ttl = turnDeadline ? Math.max(1, Math.ceil((Number(turnDeadline) - Date.now()) / 1000)) : null;
        setTurnDuration(ttl);
        setMessage(message || (turn === socketId ? 'Your move' : "Opponent's move"));
      });

      newSocket.on('gameEnd', ({ message, winnerSymbol, winningLine, streakBonus: bonus }) => {
        setGameState('finished');
        setMessage(message);
        setWinningLine(Array.isArray(winningLine) ? winningLine : null);
        setTurnDeadline(null);
        setTimeLeft(null);
        if (bonus) {
          setStreakBonus(bonus);
          setTimeout(() => setStreakBonus(0), 5000);
        }
        // Save to history
        const isWin = !!(winnerSymbol && symbol && winnerSymbol === symbol);
        const isDraw = winnerSymbol == null;
        const entry = {
          id: `g_${Date.now()}`,
          ts: new Date().toISOString(),
          bet: parseInt(betAmount, 10),
          outcome: isDraw ? 'draw' : (isWin ? 'win' : 'loss'),
          amount: isDraw ? 0 : (isWin ? (PAYOUTS[betAmount]?.winner - parseInt(betAmount,10)) : -parseInt(betAmount,10)),
        };
        const newHist = [entry, ...history].slice(0, 100);
        setHistory(newHist);
        localStorage.setItem('ttt_history', JSON.stringify(newHist));
        if (isWin) {
          launchConfetti();
          sfxPlay('win');
          triggerHaptic([30, 40, 30]);
        } else if (isDraw) {
          // no-op for draw
        } else {
          sfxPlay('lose');
          triggerHaptic([15, 25]);
        }
      });

      // New addictive features events
      newSocket.on('newAchievement', ({ achievement, reward }) => {
        setNewAchievement({ achievement, reward });
        setTimeout(() => setNewAchievement(null), 5000);
      });

      newSocket.on('mysteryBoxAwarded', ({ boxType, reason }) => {
        setNewMysteryBox({ boxType, reason });
        setTimeout(() => setNewMysteryBox(null), 5000);
      });

      newSocket.on('playerStatsUpdate', ({ sats, stats }) => {
        setPlayerSats(sats || 0);
      });

      return () => {
        newSocket.disconnect();
        if (paymentTimerRef.current) {
          clearTimeout(paymentTimerRef.current);
        }
      };
    }
  }, []);

  // Update payout when bet changes
  useEffect(() => {
    const opt = BET_OPTIONS.find(o => o.amount === parseInt(betAmount, 10));
    setPayoutAmount(String(opt?.winnings || 0));
  }, [betAmount]);

  // Payment timer effect - Sea Battle style
  useEffect(() => {
    if (isWaitingForPayment && paymentTimer > 0) {
      paymentTimerRef.current = setTimeout(() => {
        setPaymentTimer(paymentTimer - 1);
      }, 1000);
    } else if (isWaitingForPayment && paymentTimer === 0) {
      setIsWaitingForPayment(false);
      setPayButtonLoading(false);
      setMessage('Payment timed out after 5 minutes. Click Retry to try again.');
      setLightningInvoice(null);
      setHostedInvoiceUrl(null);
      setPaymentInfo(null);
      socket?.emit('cancelGame', { gameId, socketId });
    }
    return () => {
      if (paymentTimerRef.current) {
        clearTimeout(paymentTimerRef.current);
      }
    };
  }, [isWaitingForPayment, paymentTimer, gameId, socketId, socket]);

  // Persist toggles
  useEffect(() => {
    localStorage.setItem('ttt_sfx', sfxEnabled ? '1' : '0');
    localStorage.setItem('ttt_haptics', hapticsEnabled ? '1' : '0');
    localStorage.setItem('ttt_tilt', tiltEnabled ? '1' : '0');
  }, [sfxEnabled, hapticsEnabled, tiltEnabled]);

  // Fetch player stats when connected
  useEffect(() => {
    if (connected && lightningAddress && socket) {
      socket.emit('requestPlayerStats', { lightningAddress });
    }
  }, [connected, lightningAddress, socket]);
  useEffect(() => { localStorage.setItem('ttt_tilt', tiltEnabled ? '1' : '0'); }, [tiltEnabled]);
  useEffect(() => { 
    localStorage.setItem('ttt_theme', theme);
    // Apply theme to body element
    document.body.className = theme !== 'simple' ? `theme-${theme}` : 'theme-simple';
  }, [theme]);

  // Game join handler
  const handleJoinGame = () => {
    console.log('handleJoinGame called');
    console.log('Socket:', socket, 'Connected:', connected);
    console.log('Lightning Address:', lightningAddress);
    console.log('Accepted Terms:', acceptedTerms);
    console.log('Bet Amount:', betAmount);
    
    if (!socket || !connected) {
      setMessage('Not connected to server');
      console.log('Not connected to server');
      return;
    }
    
    if (!lightningAddress) {
      setMessage('Please enter your Lightning address');
      console.log('Lightning address missing');
      return;
    }

    if (!acceptedTerms) {
      setMessage('Please accept the terms and conditions');
      console.log('Terms not accepted');
      return;
    }

    // Emit join game event
    console.log('Emitting joinGame event');
    socket?.emit('joinGame', { lightningAddress: addr, betAmount: parseInt(betAmount, 10), acctId });
    setPayButtonLoading(true);

    setMessage('Joining game...');
    setAddressLocked(true);
  };

  // Sea Battle style payment URL opener
  const openPaymentUrlSafely = (url) => {
    try {
      const preWin = window.open('', '_blank', 'noopener,noreferrer');
      if (preWin) {
        preWin.location.href = url;
        return true;
      }
      return false;
    } catch (e) {
      try {
        window.location.href = url;
        return true;
      } catch (e2) {
        return false;
      }
    }
  };

  // Sea Battle style payment handler
  const handlePay = () => {
    const paymentUrl = paymentInfo?.speedInterfaceUrl || hostedInvoiceUrl;
    
    if (paymentUrl) {
      const opened = openPaymentUrlSafely(paymentUrl);
      if (opened) {
        setPayButtonLoading(true);
      } else {
        setPayButtonLoading(false);
        setMessage('We could not open the payment page automatically. Please use the "Open Invoice" link below or scan the QR code.');
      }
    } else {
      setMessage('No payment URL available. Please scan the QR code to pay.');
    }
  };

  // Sea Battle style cancel game handler
  const handleCancelGame = () => {
    if (socket) {
      socket.emit('cancelGame', { gameId: gameId || null, socketId: socketId || null });
    }
    
    if (paymentTimerRef.current) {
      clearTimeout(paymentTimerRef.current);
      paymentTimerRef.current = null;
    }
    
    setGameState('menu');
    setCurrentScreen('menu');
    setMessage('Game canceled.');
    setLightningInvoice(null);
    setHostedInvoiceUrl(null);
    setIsWaitingForPayment(false);
    setPayButtonLoading(false);
    setPaymentTimer(PAYMENT_TIMEOUT);
    setPaymentInfo(null);
  };

  const launchConfetti = () => {
    if (confettiRef.current) {
      const canvas = confettiRef.current;
      const ctx = canvas.getContext('2d');
      const particles = [];
      
      for (let i = 0; i < 50; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          life: 60
        });
      }
      
      const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p, i) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.1;
          p.life--;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, 4, 4);
          if (p.life <= 0) particles.splice(i, 1);
        });
        if (particles.length > 0) requestAnimationFrame(animate);
      };
      animate();
    }
  };

  const resetToMenu = () => {
    setCurrentScreen('menu');
    setGameState('menu');
    setMessage('');
    setIsWaitingForPayment(false);
    setPayButtonLoading(false);
    setLightningInvoice(null);
    setHostedInvoiceUrl(null);
    setPaymentInfo(null);
    setAddressLocked(false);
  };

  const copyPayment = () => {
    if (lightningInvoice) {
      navigator.clipboard.writeText(lightningInvoice);
      setMessage('Payment request copied to clipboard!');
    }
  };

  return (
    <div className={`app ${theme}`}>
      <canvas ref={confettiRef} className="confetti" />
      
      {currentScreen === 'menu' && (
        <div className="menu-screen">
          <h1>Lightning Tic-Tac-Toe</h1>
          <button onClick={() => setCurrentScreen('start')}>Start Game</button>
          <button onClick={() => setCurrentScreen('practice')}>Practice</button>
        </div>
      )}

      {currentScreen === 'practice' && (
        <div className="practice-screen">
          <PracticeBoard />
        </div>
      )}

      {currentScreen === 'start' && (
        <StartScreen
          lightningAddress={lightningAddress}
          setLightningAddress={setLightningAddress}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          acceptedTerms={acceptedTerms}
          setAcceptedTerms={setAcceptedTerms}
          onStart={handleStartGame}
          connected={connected}
          onOpenTerms={() => setShowTerms(true)}
          onOpenPrivacy={() => setShowPrivacy(true)}
          addressLocked={addressLocked}
          noticeMessage={message}
        />
      )}

      {currentScreen === 'payment' && (
        <div className="payment-screen">
          <div className="payment-container">
            <h2>Payment Required</h2>
            <p className="payment-message">{message}</p>
            
            {isWaitingForPayment && (
              <div className="payment-timer">
                <p>Payment expires in: {Math.floor(paymentTimer / 60)}:{String(paymentTimer % 60).padStart(2, '0')}</p>
              </div>
            )}
            
            {lightningInvoice && (
              <div className="payment-details">
                <div className="qr-section">
                  <QRCodeSVG value={lightningInvoice} size={200} />
                </div>
                
                <div className="payment-buttons">
                  <button 
                    className="pay-button primary" 
                    onClick={handlePay}
                    disabled={payButtonLoading}
                  >
                    {payButtonLoading ? 'Opening...' : 'Pay with Lightning'}
                  </button>
                  
                  {(paymentInfo?.speedInterfaceUrl || hostedInvoiceUrl) && (
                    <a 
                      href={paymentInfo?.speedInterfaceUrl || hostedInvoiceUrl}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="invoice-link"
                    >
                      Open Invoice
                    </a>
                  )}
                  
                  <button className="copy-button secondary" onClick={copyPayment}>
                    Copy Invoice
                  </button>
                </div>
                
                <div className="payment-info">
                  {paymentInfo && (
                    <>
                      <p>Amount: {paymentInfo.amountSats} SATS</p>
                      <p>~${paymentInfo.amountUSD} USD</p>
                    </>
                  )}
                </div>
              </div>
            )}
            
            <button className="cancel-button" onClick={handleCancelGame}>
              Cancel Game
            </button>
          </div>
        </div>
      )}

      {currentScreen === 'waiting' && (
        <WaitingScreen
          waitingInfo={waitingInfo}
          waitingSecondsLeft={waitingSecondsLeft}
          matchInfo={matchInfo}
          matchSecondsLeft={matchSecondsLeft}
        />
      )}

      {currentScreen === 'game' && (
        <GameScreen
          board={board}
          symbol={symbol}
          turn={turn}
          socketId={socketId}
          lastMove={lastMove}
          winningLine={winningLine}
          message={message}
          gameState={gameState}
          onCellClick={onCellClick}
          onResign={doResign}
          onReturnToMenu={resetToMenu}
          onShareResult={shareResult}
          tiltEnabled={tiltEnabled}
          boardRef={boardRef}
          onBoardPointerMove={handleBoardPointer}
          onBoardPointerLeave={resetBoardTilt}
          timeLeft={timeLeft}
          turnDuration={turnDuration}
          turnProgress={turnProgress}
        />
      )}


      {currentScreen === 'history' && (
        <div className="panel neo-panel glass full-screen-panel">
          <div className="screen-header">
            <button 
              className="back-btn neo-btn"
              onClick={() => {
                setCurrentScreen('menu');
                setActiveTab('Menu');
              }}
            >
              ← Back to Menu
            </button>
            <h2>Game History</h2>
          </div>
          
          <div className="stats-chips" aria-label="Your stats">
            <span className="chip">Wins: {stats.wins}</span>
            <span className="chip">Losses: {stats.losses}</span>
            <span className="chip">Win rate: {stats.winrate}%</span>
            <span className="chip">Streak: {stats.streak}</span>
            <span className="chip">Net: {stats.net} SATS</span>
          </div>
          
          <div className="history-content">
            <h3>Recent Games</h3>
            {history.length === 0 ? (
              <div className="empty-state">
                <p>No games yet.</p>
                <p>Start playing to build your game history!</p>
              </div>
            ) : (
              <ul className="history">
                {history.map(h => (
                  <li key={h.id} className={`history-item outcome-${h.outcome}`}>
                    <div className="game-info">
                      <span className="game-date">{new Date(h.ts).toLocaleString()}</span>
                      <span className="game-outcome">{h.outcome.toUpperCase()}</span>
                    </div>
                    <div className="game-details">
                      <span className="game-bet">Bet: {h.bet} SATS</span>
                      <span className={`game-amount ${h.amount >= 0 ? 'positive' : 'negative'}`}>
                        {h.amount >= 0 ? '+' : ''}{h.amount} SATS
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <div ref={confettiRef} className="confetti-layer" />

      {/* Achievement Notification */}
      {newAchievement && (
        <div className="achievement-notification">
          <div className="achievement-content">
            <span className="achievement-icon">🏆</span>
            <div className="achievement-text">
              <h4>Achievement Unlocked!</h4>
              <p>{newAchievement.achievement.name}</p>
              <span className="reward">+{newAchievement.reward} sats</span>
            </div>
          </div>
        </div>
      )}

      {/* Mystery Box Notification */}
      {newMysteryBox && (
        <div className="mysterybox-notification">
          <div className="mysterybox-content">
            <span className="mysterybox-icon">🎁</span>
            <div className="mysterybox-text">
              <h4>Mystery Box Earned!</h4>
              <p>{newMysteryBox.boxType} Box</p>
              <span className="reason">{newMysteryBox.reason}</span>
            </div>
          </div>
        </div>
      )}

      {/* Streak Bonus Notification */}
      {streakBonus > 0 && (
        <div className="streak-notification">
          <div className="streak-content">
            <span className="streak-icon">🔥</span>
            <div className="streak-text">
              <h4>Streak Bonus!</h4>
              <p>+{streakBonus} sats bonus</p>
            </div>
          </div>
        </div>
      )}

      {/* Feature Modals */}
      {showAchievements && (
        <AchievementSystem 
          lightningAddress={lightningAddress}
          isOpen={showAchievements}
          onClose={() => setShowAchievements(false)}
          socket={socket}
        />
      )}
      
      {showMysteryBoxes && (
        <MysteryBoxes 
          lightningAddress={lightningAddress}
          isOpen={showMysteryBoxes}
          onClose={() => setShowMysteryBoxes(false)}
          socket={socket}
        />
      )}
      
      {showLeaderboards && (
        <LeaderboardSystem 
          lightningAddress={lightningAddress}
          isOpen={showLeaderboards}
          onClose={() => setShowLeaderboards(false)}
        />
      )}

      {showSettings && (
        <div className="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Settings</h3>
            <div className="section">
              <label><input type="checkbox" checked={sfxEnabled} onChange={(e)=>setSfxEnabled(e.target.checked)} /> Sound effects</label>
              <label><input type="checkbox" checked={hapticsEnabled} onChange={(e)=>setHapticsEnabled(e.target.checked)} /> Haptics (vibration)</label>
              <label><input type="checkbox" checked={tiltEnabled} onChange={(e)=>setTiltEnabled(e.target.checked)} /> 3D board tilt</label>
            </div>
            <div className="section">
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[['simple', 'Green'], ['blue', 'Monochrome'], ['pink', 'Red']].map(([key, label]) => (
                  <button key={key} className={`neo-btn ${theme===key?'primary':''}`} onClick={()=>setTheme(key)} style={{textTransform: 'capitalize'}}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button className="neo-btn" onClick={() => setShowSettings(false)}>Close</button>
            </div>
          </div>
        </div>
      )}


      {showHowToModal && (
        <div className="modal-backdrop" onClick={() => setShowHowToModal(false)}>
          <div className="modal how-to-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🎯 How to Play: Your Guide to Bitcoin-Powered Tic-Tac-Toe Mastery</h3>
              <p className="subtitle">Because apparently, regular tic-tac-toe wasn't stressful enough without money involved 💸</p>
            </div>
            
            <div className="how-to-content">
              <div className="game-overview">
                <div className="overview-text">
                  <h4>🧠 The Genius Concept</h4>
                  <p>It's tic-tac-toe, but with Lightning Network payments. Yes, we took a game that 5-year-olds master and added cryptocurrency. Revolutionary? Probably not. Fun? Absolutely! 🚀</p>
                  
                  <div className="feature-highlights">
                    <span className="highlight">⚡ Lightning Fast Payments</span>
                    <span className="highlight">🎮 Real-Time Multiplayer</span>
                    <span className="highlight">🏆 Achievement System</span>
                    <span className="highlight">🎁 Mystery Boxes</span>
                    <span className="highlight">📊 Leaderboards</span>
                  </div>
                </div>
                
                <div className="game-preview">
                  <div className="preview-board">
                    <div className="preview-cell">X</div>
                    <div className="preview-cell">O</div>
                    <div className="preview-cell">X</div>
                    <div className="preview-cell">O</div>
                    <div className="preview-cell win">X</div>
                    <div className="preview-cell">O</div>
                    <div className="preview-cell">X</div>
                    <div className="preview-cell"></div>
                    <div className="preview-cell"></div>
                  </div>
                  <p className="preview-caption">↑ Actual game footage (results may vary based on skill level)</p>
                </div>
              </div>

              <div className="rules-section">
                <h4>📜 The Sacred Rules (Please Don't Break Them)</h4>
                
                <div className="rule-card">
                  <div className="rule-number">1️⃣</div>
                  <div className="rule-content">
                    <h5>Getting Started (The Easy Part)</h5>
                    <ul>
                      <li>Enter your Lightning address (e.g., yourname@speed.app) - Yes, that @ symbol is important</li>
                      <li>Choose your bet amount (Start small, your ego will thank you later)</li>
                      <li>Accept terms (The legal stuff nobody reads but everyone agrees to)</li>
                      <li>Click "⚡ Start Game" like you mean it</li>
                    </ul>
                  </div>
                </div>

                <div className="rule-card">
                  <div className="rule-number">2️⃣</div>
                  <div className="rule-content">
                    <h5>Payment Time (Where Your Money Goes Bye-Bye)</h5>
                    <ul>
                      <li>You'll get a Lightning invoice - pay it or forever hold your peace</li>
                      <li>Scan the QR code with your Lightning wallet (or copy-paste like a caveman)</li>
                      <li>Payment confirmed? Great! Payment failed? Try again (and check your wallet balance) 💸</li>
                    </ul>
                  </div>
                </div>

                <div className="rule-card">
                  <div className="rule-number">3️⃣</div>
                  <div className="rule-content">
                    <h5>Matchmaking (Finding Your Opponent)</h5>
                    <ul>
                      <li>We'll search for a human opponent for 13-25 seconds</li>
                      <li>Opponent found = 5-second countdown = Game time! 🎮</li>
                    </ul>
                  </div>
                </div>

                <div className="rule-card">
                  <div className="rule-number">4️⃣</div>
                  <div className="rule-content">
                    <h5>Gameplay (The Moment of Truth)</h5>
                    <ul>
                      <li><strong>Objective:</strong> Get 3 in a row (horizontal, vertical, or diagonal) - kindergarten rules apply</li>
                      <li><strong>First Move:</strong> 8 seconds to think (use them wisely)</li>
                      <li><strong>Subsequent Moves:</strong> 5 seconds each (no pressure, just your money on the line)</li>
                      <li><strong>Timeout:</strong> Take too long = you forfeit your turn (tough love)</li>
                      <li><strong>Winning:</strong> Three in a row = victory dance time 🕺💃</li>
                      <li><strong>Draw:</strong> Nobody wins = awkward silence</li>
                    </ul>
                  </div>
                </div>

                <div className="rule-card">
                  <div className="rule-number">5️⃣</div>
                  <div className="rule-content">
                    <h5>Victory & Rewards (The Good Stuff)</h5>
                    <ul>
                      <li><strong>Win:</strong> Instant payout to your Lightning address (cha-ching! 💰)</li>
                      <li><strong>Lose:</strong> Character building experience (priceless, but you still lost money)</li>
                      <li><strong>Achievements:</strong> Unlock badges for various accomplishments</li>
                      <li><strong>Mystery Boxes:</strong> Earn them through gameplay (it's like gambling within gambling)</li>
                      <li><strong>Streaks:</strong> Win multiple games in a row for bonus rewards</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="features-section">
                <h4>🎮 Extra Features (Because Why Not?)</h4>
                
                <div className="feature-grid">
                  <div className="feature-item">
                    <span className="feature-icon">🏆</span>
                    <div>
                      <strong>Achievements</strong>
                      <p>Collect badges like "First Win", "Comeback King", and "Lightning Fast" (some easier than others)</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <span className="feature-icon">🎁</span>
                    <div>
                      <strong>Mystery Boxes</strong>
                      <p>Earn boxes through gameplay. Open them for surprise sat rewards (surprises not guaranteed to be pleasant)</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <span className="feature-icon">📊</span>
                    <div>
                      <strong>Leaderboards</strong>
                      <p>See how you rank against other players (prepare your ego accordingly)</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <span className="feature-icon">📈</span>
                    <div>
                      <strong>Game History</strong>
                      <p>Track your wins, losses, and net earnings (or losses - no judgment here)</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <span className="feature-icon">🔥</span>
                    <div>
                      <strong>Streak Bonuses</strong>
                      <p>Win consecutively for extra sats (because winning once just isn't enough)</p>
                    </div>
                  </div>
                  
                  <div className="feature-item">
                    <span className="feature-icon">⚙️</span>
                    <div>
                      <strong>Settings</strong>
                      <p>Customize sounds, haptics, and themes (make your losses look prettier)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="tips-section">
                <h4>💡 Pro Tips (From the Slightly Less Amateur Players)</h4>
                <div className="tips-grid">
                  <div className="tip">
                    <strong>🎯 Corner Strategy:</strong> Start with corners, they're involved in more winning combinations
                  </div>
                  <div className="tip">
                    <strong>🛡️ Defense First:</strong> Always block your opponent's potential winning move
                  </div>
                  <div className="tip">
                    <strong>⏰ Time Management:</strong> Don't overthink it - it's still just tic-tac-toe
                  </div>
                  <div className="tip">
                    <strong>💰 Bankroll:</strong> Don't bet your life savings (this should go without saying, but here we are)
                  </div>
                  <div className="tip">
                    <strong>🎯 Stay Focused:</strong> Keep your strategy simple and stay alert to your opponent's moves
                  </div>
                  <div className="tip">
                    <strong>🔄 Streaks:</strong> Momentum is real - ride those winning streaks (while they last)
                  </div>
                </div>
              </div>

              <div className="disclaimer-section">
                <h4>⚠️ The Fine Print (Read This or Regret It Later)</h4>
                <div className="disclaimer-content">
                  <p><strong>Gambling Responsibly:</strong> Only wager what you can afford to lose. This is entertainment, not a retirement plan.</p>
                  <p><strong>Technical Issues:</strong> Network problems happen. We're not liable for your WiFi deciding to take a coffee break.</p>
                  <p><strong>Fair Play:</strong> All matches are against real players in fair, competitive gameplay.</p>
                  <p><strong>Fairness:</strong> Games use standard tic-tac-toe logic. No rigging, no shenanigans, just good old-fashioned skill (or lack thereof).</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <div className="footer-message">
                <p>🎭 <em>Remember: This is a game of skill wrapped in childhood nostalgia, powered by internet money. What could go wrong?</em></p>
              </div>
              <button className="neo-btn primary" onClick={() => setShowHowToModal(false)}>
                Got It! Let's Play 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {showSupportModal && (
        <div className="modal-backdrop" onClick={() => setShowSupportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Contact Support</h3>
            <div className="section">
              <p>Chat with us on Telegram:</p>
              <p><a className="neo-btn outline" href="https://t.me/ThunderSlate" target="_blank" rel="noreferrer">Open Telegram @ThunderSlate</a></p>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button className="neo-btn" onClick={() => setShowSupportModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showTerms && (
        <div className="modal-backdrop" onClick={() => setShowTerms(false)}>
          <div className="modal terms-modal" onClick={(e) => e.stopPropagation()}>
            <div className="terms-header">
              <h3>Terms & Conditions</h3>
              <p className="terms-subtitle">Lightning Network Tic-Tac-Toe Game Service</p>
              <p className="last-updated">Last Updated: {new Date().toLocaleDateString()}</p>
            </div>
            
            <div className="terms-content scrollable">
              <div className="terms-section">
                <h4>1. ACCEPTANCE OF TERMS</h4>
                <p>By accessing, using, or playing this Lightning Network Tic-Tac-Toe game ("Service"), you ("User", "Player", "You") agree to be bound by these Terms & Conditions ("Terms"). If you do not agree to all terms, do not use this Service.</p>
                <p><strong>IMPORTANT:</strong> This Service involves real money wagering using Bitcoin Lightning Network. Only use this Service if you understand the risks and can afford to lose your wagers.</p>
              </div>

              <div className="terms-section">
                <h4>2. ELIGIBILITY AND LEGAL REQUIREMENTS</h4>
                <ul>
                  <li><strong>Age Requirement:</strong> You must be at least 18 years old or the legal gambling age in your jurisdiction, whichever is higher.</li>
                  <li><strong>Jurisdiction Compliance:</strong> You are responsible for ensuring online gambling/gaming is legal in your location. We do not provide legal advice.</li>
                  <li><strong>Prohibited Jurisdictions:</strong> This Service is not available to residents of countries where Bitcoin or online gambling is prohibited.</li>
                  <li><strong>Identity Verification:</strong> We reserve the right to request identity verification at any time. Failure to provide requested information may result in account suspension and forfeiture of funds.</li>
                  <li><strong>One Account Policy:</strong> One account per person. Multiple accounts will result in permanent ban and fund forfeiture.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>3. GAME RULES AND MECHANICS</h4>
                <ul>
                  <li><strong>Game Type:</strong> Standard 3x3 Tic-Tac-Toe with monetary wagers using Bitcoin Lightning Network.</li>
                  <li><strong>Turn Timers:</strong> First move: 8 seconds maximum. Subsequent moves: 5 seconds maximum. Exceeding time limits forfeits your turn.</li>
                  <li><strong>Winning Conditions:</strong> First player to achieve three marks in a row (horizontal, vertical, or diagonal) wins.</li>
                  <li><strong>Draw Games:</strong> If the board is full without a winner, the game is a draw and wagers are returned (minus any network fees).</li>
                  <li><strong>Game Integrity:</strong> All moves are recorded with timestamps. Games cannot be reversed once completed.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>4. PAYMENT TERMS AND WAGERS</h4>
                <ul>
                  <li><strong>Currency:</strong> All wagers and payouts are in Bitcoin Satoshis (SATS) via Lightning Network.</li>
                  <li><strong>Wallet Requirements:</strong> You must provide a valid Lightning Network address for payouts. Invalid addresses may result in permanent fund loss.</li>
                  <li><strong>Wager Processing:</strong> Wagers are debited immediately upon joining a game. No refunds for completed games.</li>
                  <li><strong>Payout Processing:</strong> Winnings are automatically sent to your provided Lightning address within 60 seconds of game completion.</li>
                  <li><strong>Network Fees:</strong> Lightning Network transaction fees are deducted from payouts. Fees typically range from 0-10 SATS.</li>
                  <li><strong>Minimum/Maximum Wagers:</strong> Wager limits are displayed in-game and may change without notice.</li>
                  <li><strong>Failed Transactions:</strong> We are not liable for failed Lightning transactions due to network issues, invalid addresses, or insufficient channel liquidity.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>5. LIMITATION OF LIABILITY</h4>
                <p><strong>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</strong></p>
                <ul>
                  <li><strong>Service "As-Is":</strong> This Service is provided "AS-IS" without warranties of any kind, express or implied.</li>
                  <li><strong>Technical Issues:</strong> We are not liable for losses due to internet outages, server downtime, wallet malfunctions, Lightning Network failures, or any technical problems.</li>
                  <li><strong>Maximum Liability:</strong> Our total liability to you cannot exceed the amount of your wagers in the past 30 days.</li>
                  <li><strong>Consequential Damages:</strong> We are not liable for indirect, incidental, special, or consequential damages.</li>
                  <li><strong>Force Majeure:</strong> We are not liable for delays or failures due to circumstances beyond our reasonable control.</li>
                  <li><strong>Third-Party Services:</strong> We are not responsible for failures of third-party services including Lightning Network, wallet providers, or payment processors.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>6. PROHIBITED CONDUCT</h4>
                <p>The following activities are strictly prohibited and may result in immediate account termination and fund forfeiture:</p>
                <ul>
                  <li><strong>Cheating:</strong> Using bots, scripts, exploits, or any automated tools to gain unfair advantage.</li>
                  <li><strong>Collusion:</strong> Coordinating with other players to manipulate game outcomes.</li>
                  <li><strong>Multiple Accounts:</strong> Creating or using multiple accounts to circumvent limits or policies.</li>
                  <li><strong>Bug Exploitation:</strong> Intentionally exploiting software bugs or vulnerabilities.</li>
                  <li><strong>Harassment:</strong> Abusive, threatening, or inappropriate behavior toward other users.</li>
                  <li><strong>Fraud:</strong> Using stolen funds, fake identities, or engaging in any fraudulent activity.</li>
                  <li><strong>Money Laundering:</strong> Using the Service to disguise the source of illegal funds.</li>
                  <li><strong>Reverse Engineering:</strong> Attempting to decompile, reverse engineer, or extract source code.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>7. ACCOUNT TERMINATION AND ENFORCEMENT</h4>
                <ul>
                  <li><strong>Immediate Termination:</strong> We may terminate your access immediately for violations of these Terms.</li>
                  <li><strong>Fund Forfeiture:</strong> Serious violations may result in permanent forfeiture of deposited and won funds.</li>
                  <li><strong>Investigation Rights:</strong> We may investigate suspicious activity and freeze accounts pending investigation.</li>
                  <li><strong>Law Enforcement:</strong> We cooperate with law enforcement and may report illegal activity.</li>
                  <li><strong>No Refund Policy:</strong> Terminated accounts are not entitled to refunds of wagers or deposits.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>8. PRIVACY AND DATA COLLECTION</h4>
                <ul>
                  <li><strong>Minimal Data:</strong> We collect only data necessary for game operation and fraud prevention.</li>
                  <li><strong>Game Records:</strong> All games, moves, timestamps, and wager amounts are permanently recorded.</li>
                  <li><strong>Payment Data:</strong> Lightning addresses and transaction IDs are stored for payout processing and dispute resolution.</li>
                  <li><strong>No Personal Information:</strong> We do not require or store personal identification information unless legally required.</li>
                  <li><strong>Data Retention:</strong> Game and payment data may be retained indefinitely for legal and operational purposes.</li>
                  <li><strong>Third-Party Sharing:</strong> Data may be shared with law enforcement, regulators, or service providers as required.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>9. SERVICE AVAILABILITY</h4>
                <ul>
                  <li><strong>No Guaranteed Uptime:</strong> We do not guarantee continuous service availability.</li>
                  <li><strong>Maintenance:</strong> Scheduled maintenance may temporarily interrupt service.</li>
                  <li><strong>Emergency Shutdowns:</strong> We may suspend service immediately for security or legal reasons.</li>
                  <li><strong>Permanent Closure:</strong> We reserve the right to permanently close the Service with 30 days notice.</li>
                  <li><strong>Final Settlement:</strong> Upon permanent closure, all outstanding wagers will be settled and funds returned where possible.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>10. DISPUTE RESOLUTION AND ARBITRATION</h4>
                <ul>
                  <li><strong>Arbitration Agreement:</strong> All disputes must be resolved through binding arbitration, not court proceedings.</li>
                  <li><strong>Individual Claims Only:</strong> No class action lawsuits are permitted under these Terms.</li>
                  <li><strong>Governing Law:</strong> These Terms are governed by the laws of [YOUR JURISDICTION] without regard to conflict of law principles.</li>
                  <li><strong>Dispute Process:</strong> Contact support first for dispute resolution. Unresolved disputes proceed to arbitration.</li>
                  <li><strong>Limitation Period:</strong> All claims must be brought within 1 year of the event giving rise to the claim.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>11. INTELLECTUAL PROPERTY</h4>
                <ul>
                  <li><strong>Our Rights:</strong> All game software, designs, and content are our exclusive property.</li>
                  <li><strong>Limited License:</strong> You receive only a limited, revocable license to use the Service.</li>
                  <li><strong>No Copying:</strong> Reproduction, distribution, or modification of our content is prohibited.</li>
                  <li><strong>Trademark:</strong> All trademarks and logos are our property and may not be used without permission.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>12. AUTOMATED OPPONENTS (BOTS)</h4>
                <p><strong>BOT USAGE:</strong> This service may utilize computer-controlled opponents ("Bots") when insufficient human players are available.</p>
                <ul>
                  <li><strong>Bot Deployment:</strong> Bots may be used at our discretion to maintain game availability and reduce wait times.</li>
                  <li><strong>No Identification Required:</strong> We are not obligated to identify whether your opponent is human or automated.</li>
                  <li><strong>Payout Equality:</strong> Winning against bots pays the same as winning against human opponents.</li>
                  <li><strong>Player Acceptance:</strong> By using this service, you acknowledge and accept that you may play against automated opponents without prior notice or identification.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>13. RESPONSIBLE GAMBLING</h4>
                <ul>
                  <li><strong>Risk Warning:</strong> Gambling involves risk of monetary loss. Never wager more than you can afford to lose.</li>
                  <li><strong>Addiction Resources:</strong> If you have gambling problems, seek help from appropriate organizations.</li>
                  <li><strong>Self-Exclusion:</strong> Contact support to permanently close your account if needed.</li>
                  <li><strong>Cooling-Off Periods:</strong> We may implement cooling-off periods for heavy users.</li>
                  <li><strong>No Credit:</strong> We do not extend credit or loans for gambling purposes.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>14. MODIFICATIONS TO TERMS</h4>
                <ul>
                  <li><strong>Update Rights:</strong> We may modify these Terms at any time without prior notice.</li>
                  <li><strong>Effective Date:</strong> Changes take effect immediately upon posting.</li>
                  <li><strong>Continued Use:</strong> Your continued use constitutes acceptance of modified Terms.</li>
                  <li><strong>Material Changes:</strong> Significant changes may be announced via the Service interface.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>15. SEVERABILITY AND ENTIRE AGREEMENT</h4>
                <ul>
                  <li><strong>Severability:</strong> If any provision is found invalid, the remaining Terms remain in effect.</li>
                  <li><strong>Entire Agreement:</strong> These Terms constitute the complete agreement between you and us.</li>
                  <li><strong>No Waiver:</strong> Failure to enforce any provision does not constitute a waiver of that provision.</li>
                  <li><strong>Survival:</strong> Provisions regarding liability, disputes, and intellectual property survive termination.</li>
                </ul>
              </div>

              <div className="terms-section">
                <h4>16. CONTACT INFORMATION</h4>
                <p>For support, legal notices, or questions about these Terms:</p>
                <ul>
                  <li><strong>Email:</strong> support@[yourgame].com</li>
                  <li><strong>Legal Department:</strong> legal@[yourgame].com</li>
                  <li><strong>Mailing Address:</strong> [Your Business Address]</li>
                  <li><strong>Response Time:</strong> We aim to respond within 48 hours for support requests, 7 days for legal matters.</li>
                </ul>
                <p className="terms-footer">Last Updated: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
            
            <div className="terms-footer">
              <button className="neo-btn primary" onClick={() => setShowTerms(false)}>
                I Accept These Terms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacy && (
          <div className="modal-backdrop" onClick={() => setShowPrivacy(false)}>
            <div className="modal privacy-policy" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>🔒 Privacy Policy</h3>
                <button className="modal-close" onClick={() => setShowPrivacy(false)}>×</button>
              </div>
              
              <div className="modal-content">
                <p className="privacy-intro">
                  <strong>Effective Date:</strong> {new Date().toLocaleDateString()}<br/>
                  This Privacy Policy explains how we collect, use, protect, and share your information when you use our Bitcoin-powered Tic-Tac-Toe gaming service ("Service").
                </p>

                <div className="privacy-section">
                  <h4>1. INFORMATION WE COLLECT</h4>
                  
                  <h5>1.1 Automatically Collected Data</h5>
                  <ul>
                    <li><strong>Game Session Data:</strong> Game moves, timestamps, turn durations, game outcomes, wager amounts</li>
                    <li><strong>Technical Data:</strong> IP addresses, browser type, device information, operating system, screen resolution</li>
                    <li><strong>Usage Analytics:</strong> Pages visited, features used, session duration, click patterns, error logs</li>
                    <li><strong>Performance Data:</strong> Loading times, network latency, connection quality, server response times</li>
                    <li><strong>Socket Connection Data:</strong> Connection timestamps, disconnection events, reconnection attempts</li>
                  </ul>

                  <h5>1.2 User-Provided Data</h5>
                  <ul>
                    <li><strong>Lightning Address:</strong> Your Bitcoin Lightning Network address for receiving payouts</li>
                    <li><strong>Payment Information:</strong> Transaction IDs, invoice details, payment confirmation data</li>
                    <li><strong>Game Preferences:</strong> Theme settings, sound preferences, haptic feedback settings, notification preferences</li>
                    <li><strong>Account Settings:</strong> Display preferences, timezone settings, language preferences</li>
                    <li><strong>Communication Data:</strong> Support messages, feedback, bug reports, feature requests</li>
                  </ul>

                  <h5>1.3 Generated Gaming Data</h5>
                  <ul>
                    <li><strong>Achievement Records:</strong> Unlocked achievements, progress tracking, completion timestamps</li>
                    <li><strong>Statistics:</strong> Win/loss ratios, total games played, earning history, streak records</li>
                    <li><strong>Mystery Box Data:</strong> Box opening history, reward distributions, probability calculations</li>
                    <li><strong>Leaderboard Information:</strong> Rankings, scores, competitive performance metrics</li>
                    <li><strong>Behavioral Patterns:</strong> Playing habits, preferred game times, betting patterns, strategy analysis</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>2. HOW WE USE YOUR INFORMATION</h4>
                  
                  <h5>2.1 Core Game Operations</h5>
                  <ul>
                    <li><strong>Game Functionality:</strong> Process moves, determine winners, manage game state, enforce rules</li>
                    <li><strong>Matchmaking:</strong> Pair players with similar skill levels, manage waiting queues, balance game difficulty</li>
                    <li><strong>Payment Processing:</strong> Execute Lightning Network transactions, verify payments, distribute winnings</li>
                    <li><strong>Anti-Fraud Protection:</strong> Detect suspicious activity, prevent cheating, identify bot usage</li>
                    <li><strong>Game Integrity:</strong> Maintain fair play, prevent exploitation, ensure random outcomes</li>
                  </ul>

                  <h5>2.2 User Experience Enhancement</h5>
                  <ul>
                    <li><strong>Personalization:</strong> Customize interface themes, remember preferences, suggest optimal bet amounts</li>
                    <li><strong>Performance Optimization:</strong> Improve loading times, reduce latency, enhance stability</li>
                    <li><strong>Feature Development:</strong> Analyze usage patterns to develop new features and improvements</li>
                    <li><strong>Achievement Systems:</strong> Track progress, unlock rewards, calculate bonuses and streaks</li>
                    <li><strong>Leaderboards:</strong> Rank players, display statistics, create competitive environments</li>
                  </ul>

                  <h5>2.3 Business Operations</h5>
                  <ul>
                    <li><strong>Analytics:</strong> Understand user behavior, measure engagement, identify popular features</li>
                    <li><strong>Technical Support:</strong> Diagnose issues, provide assistance, improve service quality</li>
                    <li><strong>Legal Compliance:</strong> Maintain records for regulatory requirements, respond to legal requests</li>
                    <li><strong>Security Monitoring:</strong> Detect threats, prevent attacks, maintain system integrity</li>
                    <li><strong>Service Improvement:</strong> Identify bugs, optimize performance, enhance user satisfaction</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>3. AUTOMATED OPPONENT (BOT) DATA USAGE</h4>
                  <p><strong>AI and Machine Learning:</strong> We use your gameplay data to improve our automated opponents and game algorithms:</p>
                  <ul>
                    <li><strong>Strategy Analysis:</strong> Your moves and strategies may be analyzed to improve bot behavior and create more challenging opponents</li>
                    <li><strong>Difficulty Adjustment:</strong> Your skill level and performance data helps calibrate bot difficulty for balanced gameplay</li>
                    <li><strong>Pattern Recognition:</strong> Your playing patterns contribute to machine learning models that enhance game AI</li>
                    <li><strong>Behavioral Training:</strong> Your interaction data helps train bots to exhibit more human-like gameplay characteristics</li>
                    <li><strong>No Personal Identification:</strong> Bot training uses anonymized gameplay data without linking to your personal identity</li>
                    <li><strong>Opt-Out Not Available:</strong> Participation in AI improvement through gameplay data is mandatory for service usage</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>4. LIGHTNING NETWORK AND BITCOIN DATA</h4>
                  
                  <h5>4.1 Payment Data Collection</h5>
                  <ul>
                    <li><strong>Lightning Addresses:</strong> Stored securely for payout processing and verification</li>
                    <li><strong>Transaction Records:</strong> Complete history of all payments, winnings, and fees for accounting and legal purposes</li>
                    <li><strong>Invoice Data:</strong> Payment requests, confirmation codes, settlement information</li>
                    <li><strong>Network Fees:</strong> Tracking of Lightning Network fees deducted from payouts</li>
                    <li><strong>Failed Transactions:</strong> Records of failed payments for troubleshooting and resolution</li>
                  </ul>

                  <h5>4.2 Financial Data Protection</h5>
                  <ul>
                    <li><strong>Encryption:</strong> All payment data encrypted using AES-256 encryption standards</li>
                    <li><strong>Limited Access:</strong> Payment data accessible only to authorized personnel for processing</li>
                    <li><strong>Audit Trails:</strong> Complete logs of all access to financial data for security monitoring</li>
                    <li><strong>Compliance:</strong> Financial data handling complies with applicable cryptocurrency regulations</li>
                    <li><strong>Retention:</strong> Financial records retained for minimum 7 years for legal and tax purposes</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>5. DATA SHARING AND THIRD PARTIES</h4>
                  
                  <h5>5.1 Service Providers</h5>
                  <ul>
                    <li><strong>Lightning Network Nodes:</strong> Payment routing requires sharing transaction data with network participants</li>
                    <li><strong>Hosting Services:</strong> Server providers may have access to encrypted data for infrastructure maintenance</li>
                    <li><strong>Analytics Platforms:</strong> Anonymized usage data shared with analytics services for insights</li>
                    <li><strong>Security Services:</strong> Fraud detection and security monitoring services receive relevant threat data</li>
                    <li><strong>Support Tools:</strong> Customer service platforms access support communications and relevant account data</li>
                  </ul>

                  <h5>5.2 Legal and Regulatory Sharing</h5>
                  <ul>
                    <li><strong>Law Enforcement:</strong> Data shared when legally required by valid court orders or subpoenas</li>
                    <li><strong>Regulatory Compliance:</strong> Financial data provided to regulators as required by applicable laws</li>
                    <li><strong>Tax Authorities:</strong> Transaction records shared with tax authorities when legally mandated</li>
                    <li><strong>Legal Proceedings:</strong> Data disclosed as necessary for legal defense or compliance with litigation</li>
                    <li><strong>Safety Investigations:</strong> Information shared to investigate potential fraud, money laundering, or other crimes</li>
                  </ul>

                  <h5>5.3 Business Transfers</h5>
                  <ul>
                    <li><strong>Mergers and Acquisitions:</strong> Data may be transferred as part of business sale or merger</li>
                    <li><strong>Asset Sales:</strong> Customer data included in sale of business assets</li>
                    <li><strong>Bankruptcy:</strong> Data may be transferred to creditors or purchasers in bankruptcy proceedings</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>6. DATA SECURITY AND PROTECTION</h4>
                  
                  <h5>6.1 Technical Safeguards</h5>
                  <ul>
                    <li><strong>Encryption:</strong> All data encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
                    <li><strong>Access Controls:</strong> Multi-factor authentication and role-based access controls for all systems</li>
                    <li><strong>Network Security:</strong> Firewalls, intrusion detection systems, and DDoS protection</li>
                    <li><strong>Data Backups:</strong> Regular encrypted backups stored in geographically distributed locations</li>
                    <li><strong>Vulnerability Management:</strong> Regular security audits, penetration testing, and patch management</li>
                  </ul>

                  <h5>6.2 Operational Security</h5>
                  <ul>
                    <li><strong>Employee Training:</strong> Regular security awareness training for all personnel</li>
                    <li><strong>Background Checks:</strong> Security screening for employees with data access</li>
                    <li><strong>Incident Response:</strong> Comprehensive breach response procedures and notification protocols</li>
                    <li><strong>Monitoring:</strong> 24/7 security monitoring and automated threat detection</li>
                    <li><strong>Data Minimization:</strong> Collection and retention limited to necessary data only</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>7. DATA RETENTION AND DELETION</h4>
                  
                  <h5>7.1 Retention Periods</h5>
                  <ul>
                    <li><strong>Game Data:</strong> Game history, moves, and outcomes retained indefinitely for service integrity</li>
                    <li><strong>Financial Records:</strong> Payment and transaction data retained for minimum 7 years</li>
                    <li><strong>Account Data:</strong> User preferences and settings retained while account is active</li>
                    <li><strong>Technical Logs:</strong> Server logs and analytics data retained for 2 years maximum</li>
                    <li><strong>Support Communications:</strong> Customer service records retained for 3 years</li>
                  </ul>

                  <h5>7.2 Data Deletion</h5>
                  <ul>
                    <li><strong>Account Closure:</strong> Personal preferences deleted within 30 days of account closure</li>
                    <li><strong>Legal Requirements:</strong> Some data must be retained longer for legal compliance</li>
                    <li><strong>Anonymization:</strong> Personal identifiers removed while preserving anonymous gameplay statistics</li>
                    <li><strong>Automatic Deletion:</strong> Temporary data (sessions, cache) automatically deleted after expiration</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>8. YOUR PRIVACY RIGHTS</h4>
                  
                  <h5>8.1 Access and Control</h5>
                  <ul>
                    <li><strong>Data Access:</strong> Request copies of your personal data we have collected</li>
                    <li><strong>Data Correction:</strong> Request correction of inaccurate or incomplete personal data</li>
                    <li><strong>Data Portability:</strong> Receive your data in a structured, machine-readable format</li>
                    <li><strong>Account Deletion:</strong> Request deletion of your account and associated personal data</li>
                    <li><strong>Communication Preferences:</strong> Opt out of marketing communications (where applicable)</li>
                  </ul>

                  <h5>8.2 Limitations on Rights</h5>
                  <ul>
                    <li><strong>Legal Requirements:</strong> Some data must be retained for legal compliance</li>
                    <li><strong>Service Integrity:</strong> Game history data may be retained to prevent fraud</li>
                    <li><strong>Financial Records:</strong> Payment data retained for accounting and tax purposes</li>
                    <li><strong>Security Purposes:</strong> Some data retained to protect against fraud and abuse</li>
                  </ul>

                  <h5>8.3 Regional Rights</h5>
                  <ul>
                    <li><strong>GDPR (EU):</strong> Enhanced rights including data protection officer contact</li>
                    <li><strong>CCPA (California):</strong> Right to know, delete, and opt-out of sale</li>
                    <li><strong>Other Jurisdictions:</strong> Rights as provided by local privacy laws</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>9. INTERNATIONAL DATA TRANSFERS</h4>
                  <ul>
                    <li><strong>Global Service:</strong> Your data may be processed in countries other than your residence</li>
                    <li><strong>Adequate Protection:</strong> All transfers comply with applicable data protection laws</li>
                    <li><strong>Safeguards:</strong> Standard contractual clauses and adequacy decisions where required</li>
                    <li><strong>Lightning Network:</strong> Bitcoin transactions inherently involve international data transfer</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>10. COOKIES AND TRACKING</h4>
                  
                  <h5>10.1 Local Storage</h5>
                  <ul>
                    <li><strong>Game Preferences:</strong> Theme, sound, and display settings stored locally</li>
                    <li><strong>Performance Data:</strong> Local caching to improve loading times</li>
                    <li><strong>Session Data:</strong> Temporary game state and connection information</li>
                  </ul>

                  <h5>10.2 Analytics Tracking</h5>
                  <ul>
                    <li><strong>Usage Analytics:</strong> Anonymous usage statistics for service improvement</li>
                    <li><strong>Performance Monitoring:</strong> Error tracking and performance metrics</li>
                    <li><strong>No Advertising:</strong> We do not use tracking for advertising purposes</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>11. CHILDREN'S PRIVACY</h4>
                  <ul>
                    <li><strong>Age Restriction:</strong> Service not intended for users under 18 years of age</li>
                    <li><strong>No Knowing Collection:</strong> We do not knowingly collect data from minors</li>
                    <li><strong>Parental Rights:</strong> Parents may request deletion of child's data if discovered</li>
                    <li><strong>Verification:</strong> We may require age verification for compliance</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>12. CHANGES TO THIS PRIVACY POLICY</h4>
                  <ul>
                    <li><strong>Update Notification:</strong> Users notified of material changes via email or in-app notification</li>
                    <li><strong>Effective Date:</strong> Changes become effective 30 days after notification</li>
                    <li><strong>Continued Use:</strong> Continued service use constitutes acceptance of updated policy</li>
                    <li><strong>Version History:</strong> Previous versions available upon request</li>
                  </ul>
                </div>

                <div className="privacy-section">
                  <h4>13. CONTACT INFORMATION</h4>
                  <p>For privacy-related questions, requests, or concerns:</p>
                  <ul>
                    <li><strong>Privacy Officer:</strong> privacy@[yourgame].com</li>
                    <li><strong>Data Protection Officer:</strong> dpo@[yourgame].com (EU residents)</li>
                    <li><strong>General Support:</strong> support@[yourgame].com</li>
                    <li><strong>Mailing Address:</strong> [Your Business Address]</li>
                    <li><strong>Response Time:</strong> Privacy requests processed within 30 days</li>
                  </ul>
                  
                  <p><strong>Regulatory Authorities:</strong> You have the right to lodge complaints with your local data protection authority regarding our privacy practices.</p>
                </div>

                <p className="privacy-footer">
                  <strong>Last Updated:</strong> {new Date().toLocaleDateString()}<br/>
                  <strong>Version:</strong> 1.0<br/>
                  This Privacy Policy is effective immediately and applies to all users of our service.
                </p>
              </div>
            </div>
          </div>
        )}

      {/* New Feature Modals */}
      {showAchievements && (
        <AchievementSystem 
          isOpen={showAchievements} 
          onClose={() => setShowAchievements(false)}
          lightningAddress={lightningAddress}
          socket={socket}
        />
      )}

      {showMysteryBoxes && (
        <MysteryBoxes 
          isOpen={showMysteryBoxes} 
          onClose={() => setShowMysteryBoxes(false)}
          lightningAddress={lightningAddress}
          socket={socket}
        />
      )}

      {showLeaderboards && (
        <LeaderboardSystem 
          isOpen={showLeaderboards} 
          onClose={() => setShowLeaderboards(false)}
          lightningAddress={lightningAddress}
          socket={socket}
        />
      )}


      {/* Notifications */}
      {newAchievement && (
        <div className="achievement-notification">
          <div className="achievement-content">
            <div className="achievement-icon">🏆</div>
            <div className="achievement-text">
              <h4>Achievement Unlocked!</h4>
              <p>{newAchievement.name}</p>
              <p className="reward">+{newAchievement.reward} sats</p>
            </div>
          </div>
        </div>
      )}

      {newMysteryBox && (
        <div className="mysterybox-notification">
          <div className="mysterybox-content">
            <div className="mysterybox-icon">🎁</div>
            <div className="mysterybox-text">
              <h4>Mystery Box Received!</h4>
              <p>{newMysteryBox.boxType} Box</p>
              <p className="reason">{newMysteryBox.reason}</p>
            </div>
          </div>
        </div>
      )}

      {streakBonus && (
        <div className="streak-notification">
          <div className="streak-content">
            <div className="streak-icon">🔥</div>
            <div className="streak-text">
              <h4>Streak Bonus!</h4>
              <p>Win streak: {streakBonus.streak}</p>
              <p className="reward">+{streakBonus.bonus} sats bonus</p>
            </div>
          </div>
        </div>
      )}

      <div ref={confettiRef} className="confetti-container"></div>
    </div>
  );
}
