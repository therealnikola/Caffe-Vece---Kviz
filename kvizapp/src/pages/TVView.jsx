import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { database } from '../config/firebase';
import { ref, onValue, set } from 'firebase/database';

// Connection Status Component
function ConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true);
  
  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      setIsConnected(snapshot.val() === true);
    });
    return () => unsubscribe();
  }, []);
  
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} shadow-lg`} title={isConnected ? 'Povezan' : 'Nije povezan'}></div>
    </div>
  );
}

function TVView() {
  const { eventId } = useParams();
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameState, setGameState] = useState('waiting');
  const [timer, setTimer] = useState(0);
  const [teams, setTeams] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [event, setEvent] = useState(null);
  const [hasPlayedCorrect, setHasPlayedCorrect] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [revealedByAdmin, setRevealedByAdmin] = useState(false);
  const [playPauseSound, setPlayPauseSound] = useState(false);
  const [playSuccessSound, setPlaySuccessSound] = useState(false);
  
  // Audio refs
  const tickAudioRef = useRef(null);
  const timeoutAudioRef = useRef(null);
  const correctAudioRef = useRef(null);
  
  const prevStateRef = useRef('waiting');
  const prevQuestionIdRef = useRef(null);
  const prevTimerRef = useRef(0);
  
  const stopAllSounds = () => {
    if (tickAudioRef.current) {
      tickAudioRef.current.pause();
      tickAudioRef.current.currentTime = 0;
    }
    if (timeoutAudioRef.current) {
      timeoutAudioRef.current.pause();
      timeoutAudioRef.current.currentTime = 0;
    }
    if (correctAudioRef.current) {
      correctAudioRef.current.pause();
      correctAudioRef.current.currentTime = 0;
    }
  };
  
  useEffect(() => {
    tickAudioRef.current = new Audio('/sounds/tick.mp3');
    timeoutAudioRef.current = new Audio('/sounds/timeout.mp3');
    correctAudioRef.current = new Audio('/sounds/correct.mp3');
    
    tickAudioRef.current.volume = 0.5;
    timeoutAudioRef.current.volume = 0.7;
    correctAudioRef.current.volume = 0.7;
    
    tickAudioRef.current.load();
    timeoutAudioRef.current.load();
    correctAudioRef.current.load();
    
    return () => {
      if (tickAudioRef.current) tickAudioRef.current.pause();
      if (timeoutAudioRef.current) timeoutAudioRef.current.pause();
      if (correctAudioRef.current) correctAudioRef.current.pause();
    };
  }, []);

  const enableAudio = () => {
    if (!audioEnabled) {
      const enableSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OSfTQ8MUKfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUqgc7y2Yk2CBtpvfDkn00PDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBACg==');
      enableSound.volume = 0.01;
      enableSound.play().then(() => {
        setAudioEnabled(true);
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!eventId) return;
    
    // Load event info
    const eventRef = ref(database, `events/${eventId}`);
    const unsubscribeEvent = onValue(eventRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setEvent({ id: eventId, ...data });
      }
    });

    const gameStateRef = ref(database, `events/${eventId}/gameState`);
    const teamsRef = ref(database, `events/${eventId}/teams`);

    const unsubscribeGameState = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const newState = data.state || 'waiting';
        const newQuestion = data.currentQuestion;
        const prevState = prevStateRef.current;
        const prevQuestionId = prevQuestionIdRef.current;
        
        setGameState(newState);
        setCurrentQuestion(newQuestion);
        setTimer(data.timer || 0);
        setIsPaused(data.isPaused || false);
        setRevealedByAdmin(data.revealedByAdmin || false);
        setPlayPauseSound(data.playPauseSound || false);
        setPlaySuccessSound(data.playSuccessSound || false);
        
        if (newState === 'question') {
          setHasPlayedCorrect(false);
          setRevealedByAdmin(false);
          setPlayPauseSound(false);
          setPlaySuccessSound(false);
          
          if (prevState === 'answer' || prevState === 'waiting' || prevQuestionId !== newQuestion?.id) {
            stopAllSounds();
          }
          
          prevStateRef.current = newState;
          prevQuestionIdRef.current = newQuestion?.id;
        } else {
          prevStateRef.current = newState;
        }
      }
    });

    const unsubscribeTeams = onValue(teamsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const tList = Object.entries(data).map(([id, team]) => ({
          code: id,
          ...team,
        }));
        setTeams(tList);
      } else {
        setTeams([]);
      }
    });

    return () => {
      unsubscribeEvent();
      unsubscribeGameState();
      unsubscribeTeams();
    };
  }, [eventId]);

  useEffect(() => {
    if (isPaused || timer === 0) {
      if (tickAudioRef.current) {
        tickAudioRef.current.pause();
        tickAudioRef.current.currentTime = 0;
      }
    }
  }, [isPaused, timer]);

  useEffect(() => {
    if (gameState === 'question' && timer > 0 && timer <= 5 && !isPaused && audioEnabled && tickAudioRef.current) {
      if (prevTimerRef.current !== timer && timer <= 5) {
        if (timeoutAudioRef.current) {
          timeoutAudioRef.current.pause();
          timeoutAudioRef.current.currentTime = 0;
        }
        if (correctAudioRef.current) {
          correctAudioRef.current.pause();
          correctAudioRef.current.currentTime = 0;
        }
        tickAudioRef.current.play().catch(err => {
          if (err.name !== 'NotAllowedError') {
            console.log('Tick sound error:', err);
          }
        });
      }
      prevTimerRef.current = timer;
    } else {
      if (tickAudioRef.current) {
        tickAudioRef.current.pause();
        tickAudioRef.current.currentTime = 0;
      }
      prevTimerRef.current = timer;
    }
  }, [timer, gameState, isPaused, audioEnabled]);

  useEffect(() => {
    if (playPauseSound && audioEnabled && timeoutAudioRef.current) {
      stopAllSounds();
      timeoutAudioRef.current.currentTime = 0;
      timeoutAudioRef.current.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.log('Pause sound error:', err);
        }
      });
      if (eventId) {
        set(ref(database, `events/${eventId}/gameState/playPauseSound`), false);
      }
      setPlayPauseSound(false);
    }
  }, [playPauseSound, audioEnabled, eventId]);

  useEffect(() => {
    if (gameState === 'question' && timer === 0 && prevTimerRef.current > 0 && !isPaused && !revealedByAdmin && audioEnabled && timeoutAudioRef.current) {
      stopAllSounds();
      timeoutAudioRef.current.currentTime = 0;
      timeoutAudioRef.current.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.log('Timeout sound error:', err);
        }
      });
      prevTimerRef.current = 0;
    }
  }, [timer, gameState, isPaused, revealedByAdmin, audioEnabled]);

  useEffect(() => {
    if (playSuccessSound && audioEnabled && correctAudioRef.current) {
      stopAllSounds();
      setHasPlayedCorrect(true);
      correctAudioRef.current.currentTime = 0;
      correctAudioRef.current.play().catch(err => {
        if (err.name !== 'NotAllowedError') {
          console.log('Success sound error:', err);
        }
      });
      if (eventId) {
        set(ref(database, `events/${eventId}/gameState/playSuccessSound`), false);
      }
      setPlaySuccessSound(false);
    }
  }, [playSuccessSound, audioEnabled, eventId]);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [teams]
  );

  const answeredCount = useMemo(() => {
    return teams.filter(t => t.currentAnswer !== null && t.currentAnswer !== undefined).length;
  }, [teams]);

  if (!eventId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-4xl">Nedostaje ID lokala</p>
      </div>
    );
  }

  return (
    <div 
      className="h-screen w-screen bg-black overflow-hidden relative" 
      onClick={enableAudio} 
      onTouchStart={enableAudio}
      style={{ cursor: 'none' }}
    >
      {/* Connection Status Indicator */}
      <ConnectionStatus />
      
      {/* Pause Overlay */}
      {isPaused && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-7xl md:text-9xl font-bold text-red-500 mb-8 animate-pulse" style={{ fontSize: 'clamp(4rem, 10vw, 9rem)' }}>KVIZ JE PAUZIRAN</h2>
            <p className="text-3xl md:text-5xl text-gray-300" style={{ fontSize: 'clamp(2rem, 5vw, 5rem)' }}>Sačekajte da admin nastavi...</p>
          </div>
        </div>
      )}
      {!audioEnabled && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-8 border-2 border-neon-cyan text-center max-w-md">
            <h3 className="text-2xl font-bold text-neon-cyan mb-4">Omogući Zvuk</h3>
            <p className="text-gray-300 mb-6">Kliknite bilo gde da omogućite zvučne efekte</p>
            <button
              onClick={enableAudio}
              className="px-6 py-3 bg-neon-cyan text-gray-900 font-bold rounded-lg glow-button"
            >
              Omogući
            </button>
          </div>
        </div>
      )}
      
      <div className="h-full w-full flex flex-col items-center justify-center overflow-hidden px-4 py-4">
        {/* WAITING STATE */}
        {gameState === 'waiting' && (
          <div className="h-full w-full flex flex-col items-center justify-center text-center animate-fade-in">
            <h1 className="text-white mb-4" style={{ fontSize: 'clamp(3rem, 8vw, 8rem)', fontWeight: 'bold' }}>{event?.name || 'Kviz'}</h1>
            <p className="text-gray-300 mb-8" style={{ fontSize: 'clamp(1.5rem, 4vw, 5rem)' }}>Dobrodošli! Kviz uskoro počinje</p>
            
            {teams.length > 0 && (
              <div className="flex-1 w-full overflow-y-auto animate-slide-up">
                <h2 className="text-white mb-4" style={{ fontSize: 'clamp(1.5rem, 3vw, 4rem)', fontWeight: 'bold' }}>Prijavljeni Timovi ({teams.length})</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3 lg:gap-4">
                  {teams.map((team, index) => (
                    <div
                      key={team.code}
                      className="bg-gray-900 rounded-lg p-3 md:p-4 lg:p-6 border-2 border-gray-700"
                    >
                      <div className="font-bold text-neon-cyan mb-1" style={{ fontSize: 'clamp(1.25rem, 2vw, 3rem)' }}>#{index + 1}</div>
                      <div className="font-bold text-white" style={{ fontSize: 'clamp(1rem, 1.5vw, 2rem)' }}>{team.teamName}</div>
                      <div className="text-gray-400 mt-1" style={{ fontSize: 'clamp(0.875rem, 1vw, 1.5rem)' }}>Kapetan: {team.captainName}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* QUESTION STATE */}
        {gameState === 'question' && currentQuestion && (
          <div className="h-full w-full flex flex-col items-center justify-center text-center px-4 py-4 animate-fade-in">
            <div className="mb-2 md:mb-4">
              <div className="font-bold text-neon-cyan text-5xl md:text-6xl lg:text-7xl">
                {timer}s {isPaused && <span className="text-orange-500 text-3xl md:text-4xl lg:text-5xl">(PAUZIRANO)</span>}
              </div>
            </div>
            <h2 className="text-white mb-4 md:mb-6 leading-tight px-2 md:px-4 lg:px-8 whitespace-pre-wrap text-4xl md:text-5xl font-bold">
              {currentQuestion.text}
            </h2>
            
            <div className="grid grid-cols-2 gap-3 md:gap-4 lg:gap-6 w-full max-w-5xl mb-3 md:mb-4">
              {currentQuestion.options.map((option, index) => (
                <div
                  key={index}
                  className="bg-gray-900 rounded-lg p-3 md:p-4 lg:p-6 border-2 border-gray-700"
                >
                  <div className="font-bold text-neon-cyan mb-2 text-4xl md:text-5xl">
                    {String.fromCharCode(65 + index)}
                  </div>
                  <div className="text-white font-semibold whitespace-pre-wrap text-xl md:text-2xl lg:text-3xl">{option}</div>
                </div>
              ))}
            </div>

            <div className="bg-gray-900 rounded-lg p-2 md:p-3 lg:p-4">
              <h3 className="font-bold text-neon-green text-lg md:text-xl lg:text-2xl">
                Timovi odgovorili: {answeredCount} / {teams.length}
              </h3>
            </div>
          </div>
        )}

        {/* ANSWER STATE - Show correct answer */}
        {gameState === 'answer' && currentQuestion && (
          <div className="h-full w-full flex flex-col items-center justify-center text-center px-4 py-4 overflow-hidden animate-fade-in">
            <h2 className="font-bold text-neon-purple mb-3 md:mb-4 text-3xl md:text-4xl lg:text-5xl">Odgovor Otkriven</h2>
            
            <div className="grid grid-cols-2 gap-2 md:gap-3 lg:gap-4 w-full max-w-5xl mb-3 md:mb-4">
              {currentQuestion.options.map((option, index) => {
                const isCorrect = index === currentQuestion.correctAnswer;
                return (
                  <div
                    key={index}
                    className={`rounded-lg p-3 md:p-4 lg:p-6 border-2 ${
                      isCorrect
                        ? 'bg-green-900 border-neon-green'
                        : 'bg-gray-900 border-gray-700'
                    }`}
                  >
                    <div className={`text-3xl md:text-4xl lg:text-5xl font-bold mb-2 ${isCorrect ? 'text-neon-green' : 'text-neon-cyan'}`}>
                      {String.fromCharCode(65 + index)}
                    </div>
                    <div className={`text-lg md:text-xl lg:text-2xl ${isCorrect ? 'text-neon-green font-bold' : 'text-white'}`}>
                      {option}
                    </div>
                    {isCorrect && (
                      <div className="mt-2 text-neon-green font-bold text-xl md:text-2xl lg:text-3xl">✓ TAČNO</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="bg-gray-900 rounded-lg p-2 md:p-3 lg:p-4 w-full max-w-5xl">
              <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-white mb-2 md:mb-3">Odgovori Timova:</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {teams.filter(t => t.currentAnswer !== null && t.currentAnswer !== undefined).map((team) => {
                  const isCorrect = team.currentAnswer === currentQuestion.correctAnswer;
                  return (
                    <div
                      key={team.code}
                      className={`rounded p-2 border-2 ${
                        isCorrect ? 'bg-green-900 border-neon-green' : 'bg-red-900 border-red-500'
                      }`}
                    >
                      <div className="font-bold text-white text-sm md:text-base lg:text-lg">{team.teamName || team.code}</div>
                      <div className={`text-xs md:text-sm lg:text-base mt-1 ${isCorrect ? 'text-neon-green' : 'text-red-300'}`}>
                        {String.fromCharCode(65 + team.currentAnswer)}. {currentQuestion.options[team.currentAnswer]}
                        {isCorrect && ' ✓'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* LEADERBOARD STATE */}
        {gameState === 'leaderboard' && (
          <div className="h-full w-full flex flex-col items-center justify-center text-center px-4 py-4 overflow-hidden animate-slide-up">
            <h1 className="font-bold text-neon-pink mb-3 md:mb-4 text-4xl md:text-5xl lg:text-6xl">Rang Lista</h1>
            <div className="flex-1 w-full max-w-5xl space-y-2 md:space-y-3 overflow-y-auto">
              {sortedTeams.slice(0, 10).map((team, index) => (
                <div
                  key={team.code}
                  className={`bg-gray-900 rounded-lg p-3 md:p-4 lg:p-5 border-2 flex items-center justify-between ${
                    index === 0 ? 'border-neon-cyan' :
                    index === 1 ? 'border-neon-green' :
                    index === 2 ? 'border-neon-purple' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3 md:gap-4 lg:gap-6">
                    <div className={`text-2xl md:text-3xl lg:text-4xl font-bold ${
                      index === 0 ? 'text-neon-cyan' :
                      index === 1 ? 'text-neon-green' :
                      index === 2 ? 'text-neon-purple' : 'text-gray-400'
                    }`}>
                      #{index + 1}
                    </div>
                    <div>
                      <div className="text-lg md:text-xl lg:text-2xl font-bold text-white">{team.teamName}</div>
                      <div className="text-sm md:text-base lg:text-lg text-gray-400">Kapetan: {team.captainName}</div>
                    </div>
                  </div>
                  <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-neon-cyan">{team.score || 0}</div>
                </div>
              ))}
            </div>
            {sortedTeams.length === 0 && (
              <p className="text-center text-gray-400 text-xl md:text-2xl lg:text-3xl mt-4 md:mt-6">Nema registrovanih timova još.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TVView;
