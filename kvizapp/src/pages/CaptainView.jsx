import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { database } from '../config/firebase';
import { ref, onValue, set, update, onDisconnect, serverTimestamp, runTransaction } from 'firebase/database';

function CaptainView() {
  const { eventId, teamCode } = useParams();
  const [team, setTeam] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameState, setGameState] = useState('waiting');
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [memberId, setMemberId] = useState(null);
  const [isActiveResponder, setIsActiveResponder] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamLink, setTeamLink] = useState('');
  const [freeAnswerMode, setFreeAnswerMode] = useState(false);
  const [answerColor, setAnswerColor] = useState(null);
  const [showAnswerFeedback, setShowAnswerFeedback] = useState(false);
  const [uiNotice, setUiNotice] = useState(null); // { type: 'info'|'error'|'success', text: string }
  
  const presenceRef = useRef(null);
  const handoverIntervalRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const noticeTimeoutRef = useRef(null);
  const answerFeedbackTimeoutRef = useRef(null);
  const latestTeamRef = useRef(null);
  const latestGameStateRef = useRef('waiting');
  const latestTimerRef = useRef(0);
  const memberIdRef = useRef(null);
  const freeAnswerModeRef = useRef(false);

  const showNotice = useCallback((text, type = 'info') => {
    setUiNotice({ type, text });
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setUiNotice(null), 3500);
  }, []);

  useEffect(() => {
    if (!eventId || !teamCode) return;

    // Rehidratacija iz localStorage
    const storedMemberId = localStorage.getItem(`team_${teamCode}_memberId`);
    const storedEventId = localStorage.getItem(`team_${teamCode}_eventId`);
    
    let currentMemberId = storedMemberId;
    if (!storedMemberId || storedEventId !== eventId) {
      currentMemberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(`team_${teamCode}_memberId`, currentMemberId);
      localStorage.setItem(`team_${teamCode}_eventId`, eventId);
    }
    setMemberId(currentMemberId);
    memberIdRef.current = currentMemberId;

    const teamLinkValue = `${window.location.origin}/captain/${eventId}/${teamCode}`;
    setTeamLink(teamLinkValue);

    const teamRef = ref(database, `events/${eventId}/teams/${teamCode}`);
    const gameStateRef = ref(database, `events/${eventId}/gameState`);
    const settingsRef = ref(database, `events/${eventId}/settings`);
    const connectedRef = ref(database, '.info/connected');

    // Load free answer mode
    const unsubscribeSettings = onValue(settingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const fam = data.freeAnswerMode === true;
        freeAnswerModeRef.current = fam;
        setFreeAnswerMode(fam);
      }
    });

    // Firebase Presence - Connection Status
    const unsubscribeConnected = onValue(connectedRef, (snapshot) => {
      const connected = snapshot.val();
      setIsConnected(connected === true);
      
      if (connected && currentMemberId) {
        // Set up presence
        const presencePath = ref(database, `events/${eventId}/teams/${teamCode}/members/${currentMemberId}/presence`);
        set(presencePath, {
          online: true,
          lastSeen: serverTimestamp(),
        });
        
        // Set up disconnect handler
        presenceRef.current = presencePath;
        onDisconnect(presencePath).set({
          online: false,
          lastSeen: serverTimestamp(),
        });
      }
    });

    let currentGameState = 'waiting';

    const unsubscribeTeam = onValue(teamRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        latestTeamRef.current = data;
        setTeam({ code: teamCode, ...data });
        
        // Check if this member is the active responder
        const active = data.active_responder === currentMemberId;
        setIsActiveResponder(active);

        // Real-time optimizacija - proveri odgovor samo kada je pitanje aktívno
        if (currentGameState === 'question') {
          if (data.currentAnswer !== null && data.currentAnswer !== undefined) {
            setHasAnswered(true);
            setIsLocked(true);
            setSelectedAnswer(data.currentAnswer);
          } else {
            setHasAnswered(false);
            setIsLocked(false);
            setSelectedAnswer(null);
          }
        }
      }
    });

    const unsubscribeGameState = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const newState = data.state || 'waiting';
        currentGameState = newState;
        latestGameStateRef.current = newState;
        setGameState(newState);
        setCurrentQuestion(data.currentQuestion);
        const nextTimer = data.timer || 0;
        latestTimerRef.current = nextTimer;
        setTimer(nextTimer);
        
        // Real-time optimizacija - koristi postojeći team listener umesto novog
        // Team listener već postoji i automatski ažurira stanje
        if (newState !== 'question') {
          setIsLocked(false);
          // Resetuj odgovor kada pitanje završi
          if (newState === 'answer' || newState === 'waiting' || newState === 'leaderboard') {
            setHasAnswered(false);
            setSelectedAnswer(null);
          }
        }
      }
    });

    // Heartbeat: periodično osvežavanje lastSeen (bez petlje kroz onValue)
    heartbeatIntervalRef.current = setInterval(() => {
      const mid = memberIdRef.current;
      if (!mid) return;
      update(ref(database, `events/${eventId}/teams/${teamCode}/members/${mid}`), {
        lastSeen: Date.now(),
      });
    }, 10000);

    // Fail-safe: Monitor for offline status and handover (bez novih listenera / network read-a)
    handoverIntervalRef.current = setInterval(() => {
      const teamData = latestTeamRef.current;
      const mid = memberIdRef.current;
      if (!teamData || !teamData.members || !mid) return;

      // Ne radi handover ako je slobodno odgovaranje aktivno
      if (freeAnswerModeRef.current === true) return;

      const activeResponderId = teamData.active_responder;
      if (!activeResponderId) {
        const activeResponderRef = ref(database, `events/${eventId}/teams/${teamCode}/active_responder`);
        runTransaction(activeResponderRef, (current) => {
          if (current === null || current === undefined) return mid;
          return current;
        });
        return;
      }

      // Ako smo mi već aktivni - ništa
      if (activeResponderId === mid) return;

      const activeMember = teamData.members[activeResponderId];
      const timeSinceLastSeen = Date.now() - (activeMember?.lastSeen || 0);
      const isActiveMemberOnline = activeMember?.presence?.online === true;
      if (!isActiveMemberOnline || timeSinceLastSeen > 12000) {
        const activeResponderRef = ref(database, `events/${eventId}/teams/${teamCode}/active_responder`);
        runTransaction(activeResponderRef, (current) => {
          if (current === activeResponderId) return mid;
          return current;
        });
      }
    }, 4000);

    return () => {
      unsubscribeTeam();
      unsubscribeGameState();
      unsubscribeConnected();
      unsubscribeSettings();
      if (handoverIntervalRef.current) {
        clearInterval(handoverIntervalRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
      if (answerFeedbackTimeoutRef.current) {
        clearTimeout(answerFeedbackTimeoutRef.current);
      }
      if (presenceRef.current) {
        onDisconnect(presenceRef.current).cancel();
      }
    };
  }, [eventId, teamCode]);

  const handleTakeOver = () => {
    if (!eventId || !teamCode || !memberId) return;
    
    // Race condition fix - koristi transakciju
    const activeResponderRef = ref(database, `events/${eventId}/teams/${teamCode}/active_responder`);
    runTransaction(activeResponderRef, (current) => {
      // Uvek dozvoli preuzimanje (korisnik eksplicitno kliknuo)
      return memberId;
    }).then((result) => {
      if (result.committed) {
        update(ref(database, `events/${eventId}/teams/${teamCode}/members/${memberId}`), {
          lastSeen: Date.now(),
          presence: {
            online: true,
            lastSeen: serverTimestamp(),
          },
        });
        setIsActiveResponder(true);
      }
    }).catch((error) => {
      console.error('Greška pri preuzimanju kontrole:', error);
      showNotice('Greška pri preuzimanju kontrole. Molimo pokušajte ponovo.', 'error');
    });
  };

  const handleAnswer = (answerIndex) => {
    if (!eventId || !teamCode || !memberId) return;
    if (hasAnswered || isLocked || gameState !== 'question' || isSubmitting || isPaused) return;
    if (!freeAnswerMode && !isActiveResponder) {
      showNotice('Samo aktivni odgovarač može da pošalje odgovor. Kliknite "Preuzmi kontrolu" ili sačekajte automatski handover.', 'info');
      return;
    }

    // Ako je tajmer istekao (live sync), prekini odmah
    if (!currentQuestion?.id || latestTimerRef.current <= 0) {
      showNotice('Tajmer je istekao. Odgovor nije prihvaćen.', 'error');
      return;
    }
    
    // Latency Compensation - Optimistički update (odmah vizuelno)
    setIsSubmitting(true);
    setIsLocked(true);
    setSelectedAnswer(answerIndex);
    setHasAnswered(true);
    
    // Dinamički feedback - boja ekrana
    const colors = ['bg-blue-900/50', 'bg-green-900/50', 'bg-yellow-900/50', 'bg-red-900/50'];
    setAnswerColor(colors[answerIndex]);
    setShowAnswerFeedback(true);
    if (answerFeedbackTimeoutRef.current) clearTimeout(answerFeedbackTimeoutRef.current);
    answerFeedbackTimeoutRef.current = setTimeout(() => {
      setShowAnswerFeedback(false);
      setAnswerColor(null);
    }, 2000);
    
    // Race Condition Fix - Firebase Transaction (po pitanju)
    const qid = currentQuestion.id;
    const answerRef = ref(database, `events/${eventId}/teams/${teamCode}/answers/${qid}`);
    runTransaction(answerRef, (current) => {
      const existing = current?.selectedAnswer;
      if (existing !== null && existing !== undefined) return current; // već odgovoreno
      return {
        selectedAnswer: answerIndex,
        memberId,
        createdAt: Date.now(),
      };
    }).then((result) => {
      const val = result.snapshot.val();
      const accepted = result.committed && val?.selectedAnswer === answerIndex;
      if (accepted) {
        // Mirror za postojeću logiku (Admin/TV čitaju currentAnswer)
        update(ref(database, `events/${eventId}/teams/${teamCode}`), {
          currentAnswer: answerIndex,
          lastActivity: Date.now(),
        });
        setIsSubmitting(false);
      } else {
        // Rollback optimističkog update-a
        setIsSubmitting(false);
        setIsLocked(false);
        setHasAnswered(false);
        setSelectedAnswer(null);
        setShowAnswerFeedback(false);
        setAnswerColor(null);
        showNotice('Tim je već poslao odgovor na ovo pitanje.', 'error');
      }
    }).catch((error) => {
      console.error('Greška pri slanju odgovora:', error);
      setIsSubmitting(false);
      setIsLocked(false);
      setHasAnswered(false);
      setSelectedAnswer(null);
      setShowAnswerFeedback(false);
      setAnswerColor(null);
      showNotice('Greška pri slanju odgovora. Molimo pokušajte ponovo.', 'error');
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(teamLink).then(() => {
      showNotice('Link je kopiran u clipboard!', 'success');
    }).catch(() => {
      showNotice('Greška pri kopiranju linka.', 'error');
    });
  };

  if (!team || !eventId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-cyan mx-auto mb-4"></div>
          <p className="text-2xl text-gray-400">Učitavanje podataka tima...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4 md:p-6 lg:p-8 relative transition-colors duration-500 ${answerColor || ''}`}>
      {/* Connection Status Indicator */}
      <div className="fixed top-4 right-4 z-50">
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} shadow-lg`} title={isConnected ? 'Povezan' : 'Nije povezan'}></div>
      </div>

      {/* UI Notice (bez alert-a) */}
      {uiNotice && (
        <div className="fixed top-4 left-4 z-50 max-w-md">
          <div className={`px-4 py-3 rounded-lg border glassmorphism ${
            uiNotice.type === 'success'
              ? 'border-green-500 text-green-200'
              : uiNotice.type === 'error'
              ? 'border-red-500 text-red-200'
              : 'border-neon-cyan text-gray-200'
          }`}>
            <p className="text-sm font-medium whitespace-pre-wrap">{uiNotice.text}</p>
          </div>
        </div>
      )}

      {/* Pause Overlay */}
      {isPaused && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-6xl md:text-8xl font-bold text-red-500 mb-4 animate-pulse">KVIZ JE PAUZIRAN</h2>
            <p className="text-2xl md:text-3xl text-gray-300">Sačekajte da admin nastavi...</p>
          </div>
        </div>
      )}

      {/* Answer Feedback Overlay */}
      {showAnswerFeedback && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-5xl md:text-7xl font-bold text-white mb-4 animate-fade-in">TIM JE ODGOVORIO</h2>
            <p className="text-2xl md:text-3xl text-gray-300">
              {selectedAnswer !== null && currentQuestion 
                ? `${String.fromCharCode(65 + selectedAnswer)}. ${currentQuestion.options[selectedAnswer]}`
                : ''}
            </p>
          </div>
        </div>
      )}

      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-4 md:mb-6 lg:mb-8">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold neon-text text-neon-cyan mb-2">{team.teamName}</h1>
          <p className="text-sm md:text-base lg:text-lg text-gray-400">Bodovi: {team.score || 0}</p>
          
          {/* Team Link Sharing */}
          <div className="mt-4 bg-gray-800/80 backdrop-blur-md rounded-lg p-3 md:p-4 border-2 border-neon-purple glassmorphism">
            <p className="text-sm text-gray-400 mb-2">Podelite link sa članovima tima:</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={teamLink}
                readOnly
                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-neon-purple text-white font-bold rounded-lg hover:bg-opacity-80 transition-all active:scale-95"
              >
                Kopiraj
              </button>
            </div>
          </div>

          {/* Active Responder Status */}
          {isActiveResponder ? (
            <div className="mt-2 bg-green-900 bg-opacity-30 rounded-lg p-2 border border-green-500">
              <p className="text-green-400 text-sm font-bold">✓ Vi ste aktivni odgovarač</p>
            </div>
          ) : (
            <div className="mt-2 bg-orange-900 bg-opacity-30 rounded-lg p-2 border border-orange-500">
              <p className="text-orange-400 text-sm mb-2">Član tima je aktivni odgovarač.</p>
              {!freeAnswerMode && (
                <button
                  onClick={handleTakeOver}
                  className="w-full mt-2 px-4 py-2 bg-neon-purple text-white font-bold rounded-lg hover:bg-opacity-80 transition-all active:scale-95"
                >
                  Preuzmi Kontrolu
                </button>
              )}
            </div>
          )}
          
          {freeAnswerMode && (
            <div className="mt-2 bg-yellow-900 bg-opacity-30 rounded-lg p-2 border border-yellow-500">
              <p className="text-yellow-400 text-sm font-bold">⚠️ Slobodno odgovaranje je aktivno - svi mogu da odgovaraju!</p>
            </div>
          )}
        </div>

        {gameState === 'waiting' && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-6 md:p-8 lg:p-12 border-2 border-neon-cyan text-center animate-fade-in glassmorphism">
            <h2 className="text-2xl md:text-3xl font-bold text-neon-cyan mb-4">Čeka se Pitanje</h2>
            <p className="text-base md:text-lg text-gray-400">Molimo sačekajte da admin pokrene pitanje...</p>
          </div>
        )}

        {gameState === 'question' && currentQuestion && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-neon-green animate-fade-in glassmorphism">
            <div className="text-center mb-4 md:mb-6">
              <div className="text-4xl md:text-5xl font-bold text-neon-cyan mb-4">{timer}s</div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-4 md:mb-6 whitespace-pre-wrap">{currentQuestion.text}</h2>
            </div>
            
            {!hasAnswered && !isLocked && (freeAnswerMode || isActiveResponder) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {currentQuestion.options.map((option, index) => {
                  const colors = [
                    'border-blue-500 hover:border-blue-400 hover:bg-blue-900/30',
                    'border-green-500 hover:border-green-400 hover:bg-green-900/30',
                    'border-yellow-500 hover:border-yellow-400 hover:bg-yellow-900/30',
                    'border-red-500 hover:border-red-400 hover:bg-red-900/30'
                  ];
                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswer(index)}
                      disabled={isLocked || hasAnswered || gameState !== 'question' || isSubmitting || isPaused}
                      className={`py-4 md:py-6 px-4 md:px-6 bg-gray-700/80 backdrop-blur-md border-2 ${colors[index]} rounded-lg text-white font-bold text-base md:text-lg glow-button transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[60px] md:min-h-[80px] active:scale-95 shadow-lg`}
                      style={{
                        boxShadow: `0 0 20px ${['rgba(59, 130, 246, 0.5)', 'rgba(34, 197, 94, 0.5)', 'rgba(234, 179, 8, 0.5)', 'rgba(239, 68, 68, 0.5)'][index]}`
                      }}
                    >
                      {String.fromCharCode(65 + index)}. {option}
                    </button>
                  );
                })}
              </div>
            ) : !hasAnswered && !isLocked && !isActiveResponder && !freeAnswerMode ? (
              <div className="text-center">
                <div className="bg-gray-700/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-orange-500 glassmorphism">
                  <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-orange-400 mb-2 md:mb-4">Čeka se Aktivni Odgovarač</h3>
                  <p className="text-sm md:text-base text-white mb-2">Aktivni član tima je trenutno odgovarač.</p>
                  <p className="text-xs md:text-sm lg:text-base text-gray-400 mt-2 md:mt-4">Ako aktivni član padne sa mreže, sistem će automatski omogućiti drugom članu tima da pošalje odgovor.</p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="bg-gray-700/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-neon-green glassmorphism">
                  <h3 className="text-lg md:text-xl lg:text-2xl font-bold text-neon-green mb-2 md:mb-4">Odgovor Zaključan!</h3>
                  <p className="text-base md:text-lg lg:text-xl text-white mb-2">
                    Izabrali ste: <span className="text-neon-cyan font-bold">
                      {String.fromCharCode(65 + selectedAnswer)}. {currentQuestion.options[selectedAnswer]}
                    </span>
                  </p>
                  <p className="text-sm md:text-base lg:text-lg text-gray-400 mt-2 md:mt-4">Čeka se sledeće pitanje...</p>
                </div>
              </div>
            )}
          </div>
        )}

        {gameState === 'answer' && currentQuestion && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-neon-purple animate-fade-in glassmorphism">
            <div className="text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-neon-purple mb-3 md:mb-4">Odgovor Otkriven</h2>
              <div className="bg-gray-700 rounded-lg p-4 md:p-6 mb-3 md:mb-4">
                <p className="text-lg md:text-xl text-white mb-2">Tačan Odgovor:</p>
                <p className="text-xl md:text-2xl font-bold text-neon-green">
                  {String.fromCharCode(65 + currentQuestion.correctAnswer)}. {currentQuestion.options[currentQuestion.correctAnswer]}
                </p>
              </div>
              {hasAnswered && (
                <div className={`rounded-lg p-3 md:p-4 ${selectedAnswer === currentQuestion.correctAnswer ? 'bg-green-900 border-2 border-neon-green' : 'bg-red-900 border-2 border-red-500'}`}>
                  <p className={`text-lg md:text-xl font-bold ${selectedAnswer === currentQuestion.correctAnswer ? 'text-neon-green' : 'text-red-400'}`}>
                    {selectedAnswer === currentQuestion.correctAnswer ? '✓ Tačno!' : '✗ Netačno'}
                  </p>
                  <p className="text-sm md:text-base text-white mt-2">
                    Vaš odgovor: {String.fromCharCode(65 + selectedAnswer)}. {currentQuestion.options[selectedAnswer]}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {gameState === 'leaderboard' && (
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-neon-pink animate-fade-in glassmorphism">
            <h2 className="text-2xl md:text-3xl font-bold text-neon-pink text-center mb-4 md:mb-6">Igra Završena</h2>
            <p className="text-center text-sm md:text-base text-gray-400">Proverite TV ekran za rang listu!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CaptainView;
