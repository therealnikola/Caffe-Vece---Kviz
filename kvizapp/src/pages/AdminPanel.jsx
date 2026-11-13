import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { database } from '../config/firebase';
import { ref, push, onValue, set, remove, update } from 'firebase/database';

// 1. Connection Status - OVO MORA BITI ČISTO (BEZ adminCode i eventData)
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








function AdminPanel() {

  const { eventId } = useParams();
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check localStorage for admin status and eventId match
    const storedEventId = localStorage.getItem('adminEventId');
    return localStorage.getItem('isAdmin') === 'true' && storedEventId === eventId;
  });
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [teams, setTeams] = useState([]);
  const [gameState, setGameState] = useState('waiting'); // waiting, question, answer, leaderboard
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [questionTimer, setQuestionTimer] = useState(30);
  
  const [newQuestion, setNewQuestion] = useState({
    text: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    points: 10,
  });
  const [supportMessage, setSupportMessage] = useState('');
  const [freeAnswerMode, setFreeAnswerMode] = useState(false);
  const [eventName, setEventName] = useState('');
  const [previewQuestionId, setPreviewQuestionId] = useState(null);
  const [uiNotice, setUiNotice] = useState(null); // { type, text }
  const noticeTimeoutRef = useRef(null);

  const navigate = useNavigate();

  const showNotice = useCallback((text, type = 'info') => {
    setUiNotice({ type, text });
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setUiNotice(null), 4000);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !eventId) return;

    const questionsRef = ref(database, `events/${eventId}/questions`);
    const teamsRef = ref(database, `events/${eventId}/teams`);
    const gameStateRef = ref(database, `events/${eventId}/gameState`);

    const unsubscribeQuestions = onValue(questionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const qList = Object.entries(data).map(([id, q]) => ({ 
          id, 
          ...q,
          status: q.status || 'pending' // Default to pending if no status
        }));
        setQuestions(qList.sort((a, b) => b.timestamp - a.timestamp));
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

    const unsubscribeGameState = onValue(gameStateRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(data.state || 'waiting');
        setCurrentQuestion(data.currentQuestion || null);
        setTimer(data.timer || 0);
        setTimerActive(data.timerActive || false);
        setIsPaused(data.isPaused || false);
        setQuestionTimer(data.questionTimer || 30);
      }
    });

    // Load timer setting
    const timerSettingRef = ref(database, `events/${eventId}/settings/questionTimer`);
    const unsubscribeTimer = onValue(timerSettingRef, (snapshot) => {
      if (snapshot.exists()) {
        setQuestionTimer(snapshot.val());
      }
    });

    // Load event name and log admin login
    const eventRef = ref(database, `events/${eventId}`);
    const unsubscribeEvent = onValue(eventRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const newEventName = data.name || '';
        setEventName(newEventName);
        
        // Log admin login aktivnost (samo jednom)
        if (newEventName && !localStorage.getItem(`admin_logged_${eventId}`)) {
          push(ref(database, 'activityLog'), {
            type: 'admin_login',
            eventId: eventId,
            eventName: newEventName,
            timestamp: Date.now(),
          });
          localStorage.setItem(`admin_logged_${eventId}`, 'true');
        }
      }
    });

    // Load free answer mode
    const freeAnswerRef = ref(database, `events/${eventId}/settings/freeAnswerMode`);
    const unsubscribeFreeAnswer = onValue(freeAnswerRef, (snapshot) => {
      setFreeAnswerMode(snapshot.val() === true);
    });

    return () => {
      unsubscribeQuestions();
      unsubscribeTeams();
      unsubscribeGameState();
      unsubscribeTimer();
      unsubscribeEvent();
      unsubscribeFreeAnswer();
    };

  }, [isAuthenticated, eventId]);

  useEffect(() => {
    if (timerActive && !isPaused) {
      const interval = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 0) return 0;
          const newTimer = prev - 1;
          if (newTimer <= 0) {
            setTimerActive(false);
            if (!eventId) return 0;
            set(ref(database, `events/${eventId}/gameState/timerActive`), false);
            set(ref(database, `events/${eventId}/gameState/timer`), 0);
            
            // Auto-reveal answer and score when timer hits 0
            const gameStateRef = ref(database, `events/${eventId}/gameState`);
            
            onValue(gameStateRef, (gameSnapshot) => {
              const gameData = gameSnapshot.val();
              if (gameData && gameData.state === 'question' && gameData.currentQuestion) {
                const question = gameData.currentQuestion;
                
                // Update game state to answer (automatic timeout - NOT revealed by admin)
                set(ref(database, `events/${eventId}/gameState`), {
                  state: 'answer',
                  currentQuestion: question,
                  timer: 0,
                  timerActive: false,
                  isPaused: false,
                  questionTimer: questionTimer,
                  revealedByAdmin: false,
                  playSuccessSound: false,
                  playPauseSound: false,
                });
                
                // Score correct answers based on team.currentAnswer
                const teamsRef = ref(database, `events/${eventId}/teams`);
                onValue(teamsRef, (teamsSnapshot) => {
                  const teamsData = teamsSnapshot.val() || {};
                  Object.entries(teamsData).forEach(([teamCode, teamData]) => {
                    if (teamData.currentAnswer === question.correctAnswer) {
                      const points = question.points || 10;
                      const newScore = (teamData.score || 0) + points;
                      update(ref(database, `events/${eventId}/teams/${teamCode}`), {
                        score: newScore,
                      });
                    }
                  });
                }, { onlyOnce: true });
              }
            }, { onlyOnce: true });
            
            return 0;
          }
          if (eventId) {
            set(ref(database, `events/${eventId}/gameState/timer`), newTimer);
          }
          return newTimer;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timerActive, questionTimer, isPaused, eventId]);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  const handleLogin = () => {
    // Login is now handled via Access Code in LandingPage
    // This should not be reached, but keep for backward compatibility
    if (eventId && password === 'admin123') {
      setIsAuthenticated(true);
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('adminEventId', eventId);
    } else {
      showNotice('Nevažeća lozinka ili nedostaje ID lokala.', 'error');
      navigate('/');
    }
  };

  const handleAddQuestion = () => {
    if (!eventId) {
      showNotice('Nedostaje ID lokala.', 'error');
      return;
    }
    if (!newQuestion.text || newQuestion.options.some(opt => !opt.trim())) {
      showNotice('Molimo popunite sva polja.', 'error');
      return;
    }
    push(ref(database, `events/${eventId}/questions`), {
      ...newQuestion,
      status: 'pending',
      timestamp: Date.now(),
      usedDate: null,
      eventId: eventId,
    });
    setNewQuestion({
      text: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      points: 10,
    });
  };

  const handleStartQuestion = (question) => {
    if (!eventId) return;
    
    // Log aktivnost
    push(ref(database, 'activityLog'), {
      type: 'question_started',
      eventId: eventId,
      eventName: eventName,
      questionText: question.text?.substring(0, 50) || '',
      timestamp: Date.now(),
    });
    
    // Log admin login aktivnost (prvi put)
    if (eventName) {
      push(ref(database, 'activityLog'), {
        type: 'admin_login',
        eventId: eventId,
        eventName: eventName,
        timestamp: Date.now(),
      });
    }
    
    // Mark any previously active question as used
    const questionsRef = ref(database, `events/${eventId}/questions`);
    onValue(questionsRef, (snapshot) => {
      const questionsData = snapshot.val() || {};
      Object.entries(questionsData).forEach(([qId, qData]) => {
        if (qData.status === 'active' && qId !== question.id) {
          update(ref(database, `events/${eventId}/questions/${qId}`), {
            status: 'used',
            usedDate: new Date().toISOString().split('T')[0],
          });
        }
      });
    }, { onlyOnce: true });
    
    setCurrentQuestion(question);
    setTimer(questionTimer);
    setTimerActive(true);
    
    // Mark question as active
    update(ref(database, `events/${eventId}/questions/${question.id}`), {
      status: 'active',
    });
    
    set(ref(database, `events/${eventId}/gameState`), {
      state: 'question',
      currentQuestion: question,
      timer: questionTimer,
      timerActive: true,
      isPaused: false,
      questionTimer: questionTimer,
      revealedByAdmin: false,
      playSuccessSound: false,
      playPauseSound: false,
    });
    // Clear all team currentAnswer fields for new question
    const teamsRef = ref(database, `events/${eventId}/teams`);
    onValue(teamsRef, (snapshot) => {
      const teamsData = snapshot.val() || {};
      Object.keys(teamsData).forEach((teamCode) => {
        update(ref(database, `events/${eventId}/teams/${teamCode}`), {
          currentAnswer: null,
        });
      });
    }, { onlyOnce: true });
  };

  const handleRevealAnswer = () => {
    if (!eventId) return;
    setTimerActive(false);
    set(ref(database, `events/${eventId}/gameState/timerActive`), false);
    set(ref(database, `events/${eventId}/gameState`), {
      state: 'answer',
      currentQuestion: currentQuestion,
      timer: timer,
      timerActive: false,
      isPaused: false,
      questionTimer: questionTimer,
      revealedByAdmin: true,
      playSuccessSound: true,
      playPauseSound: false,
    });
    
    // Mark question as used
    if (currentQuestion) {
      update(ref(database, `events/${eventId}/questions/${currentQuestion.id}`), {
        status: 'used',
        usedDate: new Date().toISOString().split('T')[0],
      });
    }
    
    // Auto-score correct answers based on team.currentAnswer
    if (currentQuestion) {
      const teamsRef = ref(database, `events/${eventId}/teams`);
      onValue(teamsRef, (snapshot) => {
        const teamsData = snapshot.val() || {};
        Object.entries(teamsData).forEach(([teamCode, teamData]) => {
          if (teamData.currentAnswer === currentQuestion.correctAnswer) {
            const points = currentQuestion.points || 10;
            const newScore = (teamData.score || 0) + points;
            update(ref(database, `events/${eventId}/teams/${teamCode}`), {
              score: newScore,
            });
          }
        });
      }, { onlyOnce: true });
    }
  };

  const handleSendSupportMessage = () => {
    if (!supportMessage.trim() || !eventId || !eventName) {
      showNotice('Molimo unesite poruku.', 'error');
      return;
    }
    
    push(ref(database, 'adminMessages'), {
      eventId: eventId,
      lokalName: eventName,
      message: supportMessage.trim(),
      timestamp: Date.now(),
    });
    
    setSupportMessage('');
    showNotice('Poruka je poslata Masteru.', 'success');
  };

  const handleToggleFreeAnswerMode = () => {
    if (!eventId) return;
    const newMode = !freeAnswerMode;
    setFreeAnswerMode(newMode);
    set(ref(database, `events/${eventId}/settings/freeAnswerMode`), newMode);
    
    // Log aktivnost
    push(ref(database, 'activityLog'), {
      type: 'free_answer_mode',
      eventId: eventId,
      eventName: eventName,
      value: newMode,
      timestamp: Date.now(),
    });
  };

  const handlePauseTimer = () => {
    if (!eventId) return;
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    set(ref(database, `events/${eventId}/gameState/isPaused`), newPausedState);
    set(ref(database, `events/${eventId}/gameState/timer`), timer);
    if (newPausedState) {
      set(ref(database, `events/${eventId}/gameState/revealedByAdmin`), false);
      set(ref(database, `events/${eventId}/gameState/playPauseSound`), true);
    } else {
      set(ref(database, `events/${eventId}/gameState/playPauseSound`), false);
    }
  };

  const handleUpdateTimer = (newTimer) => {
    if (!eventId) return;
    setQuestionTimer(newTimer);
    set(ref(database, `events/${eventId}/settings/questionTimer`), newTimer);
  };

  const handleKickTeam = (teamCode) => {
    if (!eventId) return;
    remove(ref(database, `events/${eventId}/teams/${teamCode}`));
  };

  const handleDeleteAllTeams = () => {
    if (!eventId) return;
    if (confirm('Da li ste sigurni da želite da obrišete SVE timove? Ovo će trajno obrisati sve registrovan timove i ne može se poništiti.')) {
      const teamsRef = ref(database, `events/${eventId}/teams`);
      remove(teamsRef);
    }
  };

  const handleShowLeaderboard = () => {
    if (!eventId) return;
    setShowLeaderboard(true);
    set(ref(database, `events/${eventId}/gameState`), {
      state: 'leaderboard',
      currentQuestion: null,
      timer: 0,
      timerActive: false,
      isPaused: false,
      questionTimer: questionTimer,
    });
  };

  const handleResetScores = () => {
    if (!eventId) return;
    if (confirm('Da li ste sigurni da želite da resetujete bodove? Ovo će postaviti sve bodove timova na 0.')) {
      const teamsRef = ref(database, `events/${eventId}/teams`);
      onValue(teamsRef, (snapshot) => {
        const teamsData = snapshot.val() || {};
        Object.keys(teamsData).forEach((teamCode) => {
          update(ref(database, `events/${eventId}/teams/${teamCode}`), {
            score: 0,
          });
        });
      }, { onlyOnce: true });
    }
  };

  const handleResetGame = () => {
    if (!eventId) return;
    if (confirm('Da li ste sigurni da želite da resetujete igru? Ovo će resetovati bodove I vratiti sva pitanja u pending status.')) {
      set(ref(database, `events/${eventId}/gameState`), {
        state: 'waiting',
        currentQuestion: null,
        timer: 0,
        timerActive: false,
        isPaused: false,
        questionTimer: questionTimer,
      });
      // Clear all team currentAnswer fields and reset scores
      const teamsRef = ref(database, `events/${eventId}/teams`);
      onValue(teamsRef, (snapshot) => {
        const teamsData = snapshot.val() || {};
        Object.keys(teamsData).forEach((teamCode) => {
          update(ref(database, `events/${eventId}/teams/${teamCode}`), {
            currentAnswer: null,
            score: 0,
          });
        });
      }, { onlyOnce: true });
      
      // Reset all questions to pending status
      const questionsRef = ref(database, `events/${eventId}/questions`);
      onValue(questionsRef, (snapshot) => {
        const questionsData = snapshot.val() || {};
        Object.keys(questionsData).forEach((questionId) => {
          update(ref(database, `events/${eventId}/questions/${questionId}`), {
            status: 'pending',
            usedDate: null,
          });
        });
      }, { onlyOnce: true });
      
      setCurrentQuestion(null);
      setShowLeaderboard(false);
    }
  };

  const handleScoreAnswer = (teamCode, isCorrect) => {
    if (!eventId) return;
    const teamRef = ref(database, `events/${eventId}/teams/${teamCode}`);
    onValue(teamRef, (snapshot) => {
      const teamData = snapshot.val();
      if (teamData) {
        const newScore = (teamData.score || 0) + (isCorrect ? 10 : 0);
        update(ref(database, `events/${eventId}/teams/${teamCode}`), {
          score: newScore,
        });
      }
    }, { onlyOnce: true });
  };

  const handleRestoreQuestion = (questionId) => {
    if (!eventId) return;
    update(ref(database, `events/${eventId}/questions/${questionId}`), {
      status: 'pending',
      usedDate: null,
    });
  };


  if (!eventId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 border-2 border-neon-pink max-w-md w-full text-center">
          <h2 className="text-3xl font-bold mb-6 text-neon-pink">Greška</h2>
          <p className="text-gray-300 mb-4">Nedostaje ID lokala.</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-neon-pink text-gray-900 font-bold rounded-lg glow-button"
          >
            Nazad na Početnu
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 border-2 border-neon-pink max-w-md w-full">
          <h2 className="text-3xl font-bold mb-6 text-neon-pink text-center">Admin Prijava</h2>
          <p className="text-gray-300 mb-4 text-center text-sm">Molimo koristite Access Code na početnoj stranici.</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-neon-pink text-gray-900 font-bold rounded-lg glow-button"
          >
            Nazad na Početnu
          </button>
        </div>
      </div>
    );
  }

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [teams]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4 md:p-6 lg:p-8 relative">
      <ConnectionStatus />
      <div className="container mx-auto">
        {uiNotice && (
          <div className="mb-4">
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-6 lg:mb-8">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold neon-text text-neon-pink">Admin Panel</h1>

            

          <div className="flex gap-4">
            <button
              onClick={() => window.open(`/tv/${eventId}`, '_blank')}
              className="px-4 py-2 bg-neon-purple text-white rounded-lg hover:bg-opacity-80 glow-button"
            >
              Prikaz za TV
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Nazad na početnu
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Question Management */}
          <div className="bg-gray-800 rounded-lg p-6 border-2 border-neon-cyan">
            <h2 className="text-2xl font-bold mb-4 text-neon-cyan">Kreiraj Pitanje</h2>
            <div className="space-y-4">
              <textarea
                value={newQuestion.text}
                onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                placeholder="Tekst pitanja..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan"
                rows="3"
              />
              {newQuestion.options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={newQuestion.correctAnswer === idx}
                    onChange={() => setNewQuestion({ ...newQuestion, correctAnswer: idx })}
                    className="w-5 h-5 text-neon-cyan"
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...newQuestion.options];
                      newOptions[idx] = e.target.value;
                      setNewQuestion({ ...newQuestion, options: newOptions });
                    }}
                    placeholder={`Opcija ${idx + 1}`}
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">Bodovi:</label>
                <input
                  type="number"
                  value={newQuestion.points}
                  onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) || 10 })}
                  min="1"
                  className="w-24 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan"
                />
              </div>
              <button
                onClick={handleAddQuestion}
                className="w-full py-3 bg-neon-cyan text-gray-900 font-bold rounded-lg glow-button"
              >
                Dodaj Pitanje
              </button>
            </div>
          </div>

          {/* Questions List */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-6 border-2 border-neon-green glassmorphism">
            <h2 className="text-2xl font-bold mb-4 text-neon-green">Pitanja</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {questions.length === 0 ? (
                <p className="text-gray-400">Nema pitanja još.</p>
              ) : (
                <>
                  {/* Active/Pending Questions */}
                  {questions.filter(q => q.status !== 'used').map((q) => (
                    <div
                      key={q.id}
                      className={`p-4 rounded-lg border ${
                        q.status === 'active' 
                          ? 'bg-gray-700 border-neon-cyan' 
                          : q.status === 'used'
                          ? 'bg-orange-500 bg-opacity-20 border-orange-500'
                          : 'bg-gray-700 border-gray-600'
                      }`}
                    >
                      <p className="text-white mb-2">{q.text}</p>
                      <p className="text-sm text-gray-400 mb-2">Bodovi: {q.points || 10}</p>
                      <p className="text-xs text-gray-500 mb-2">
                        Status: {q.status === 'active' ? 'Aktivno' : 'Čeka'}
                      </p>
                      {q.status !== 'active' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewQuestionId(previewQuestionId === q.id ? null : q.id)}
                            className="px-3 py-1 bg-neon-cyan text-gray-900 text-xs font-bold rounded-lg hover:bg-opacity-80"
                          >
                            {previewQuestionId === q.id ? 'Sakrij' : 'Pregled'}
                          </button>
                          <button
                            onClick={() => handleStartQuestion(q)}
                            className="px-4 py-2 bg-neon-green text-gray-900 font-bold rounded-lg glow-button text-sm"
                          >
                            Pokreni Pitanje
                          </button>
                        </div>
                      )}
                      {previewQuestionId === q.id && (
                        <div className="mt-3 p-3 bg-gray-700/50 backdrop-blur-md rounded-lg border border-neon-cyan">
                          <p className="text-sm text-gray-300 mb-2 font-semibold">Pregled pitanja:</p>
                          <p className="text-white mb-3 whitespace-pre-wrap">{q.text}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {q.options.map((opt, idx) => (
                              <div key={idx} className={`p-2 rounded text-xs ${idx === q.correctAnswer ? 'bg-green-900/50 border border-green-500' : 'bg-gray-800 border border-gray-600'}`}>
                                <span className="font-bold text-neon-cyan">{String.fromCharCode(65 + idx)}.</span> {opt}
                                {idx === q.correctAnswer && <span className="ml-2 text-green-400">✓</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Archive Section */}
          {questions.filter(q => q.status === 'used').length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-orange-500">
              <h2 className="text-2xl font-bold mb-4 text-orange-500">Arhiva pitanja</h2>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Object.entries(
                  questions
                    .filter(q => q.status === 'used')
                    .reduce((acc, q) => {
                      const date = q.usedDate || new Date(q.timestamp).toISOString().split('T')[0];
                      if (!acc[date]) acc[date] = [];
                      acc[date].push(q);
                      return acc;
                    }, {})
                )
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, dateQuestions]) => (
                    <div key={date} className="mb-4">
                      <h3 className="text-lg font-bold text-orange-400 mb-2">{date}</h3>
                      {dateQuestions.map((q) => (
                        <div
                          key={q.id}
                          className="bg-orange-900 bg-opacity-30 p-3 rounded-lg border border-orange-500 mb-2"
                        >
                          <p className="text-white text-sm mb-2">{q.text}</p>
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-orange-300">Bodovi: {q.points || 10}</p>
                            <button
                              onClick={() => handleRestoreQuestion(q.id)}
                              className="px-3 py-1 bg-neon-green text-gray-900 font-bold rounded-lg glow-button text-xs hover:bg-opacity-80"
                            >
                              Vrati u igru
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Current Question Control */}
          {currentQuestion && (
            <div className="bg-gray-800 rounded-lg p-6 border-2 border-neon-purple">
              <h2 className="text-2xl font-bold mb-4 text-neon-purple">Trenutno Pitanje</h2>
              <p className="text-white mb-4">{currentQuestion.text}</p>
              <div className="mb-4">
                <div className="text-4xl font-bold text-neon-cyan mb-2">{timer}s</div>
                <div className="text-sm text-gray-400">
                  Status: {gameState === 'question' ? 'Aktivno' : gameState === 'answer' ? 'Otkriveno' : 'Čeka'}
                </div>
              </div>
              <div className="space-y-2">
                {gameState === 'question' && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleRevealAnswer}
                      className="flex-1 py-3 bg-neon-purple text-white font-bold rounded-lg glow-button"
                    >
                      Otkrij Odgovor
                    </button>
                    <button
                      onClick={handlePauseTimer}
                      className="px-6 py-3 bg-orange-600 text-white font-bold rounded-lg glow-button hover:bg-orange-700"
                    >
                      {isPaused ? 'Nastavi' : 'Pauziraj'}
                    </button>
                  </div>
                )}
                {gameState === 'answer' && (
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <p className="text-neon-green font-bold mb-2">
                      Tačan Odgovor: {currentQuestion.options[currentQuestion.correctAnswer]}
                    </p>
                    <div className="space-y-2">
                      {teams.filter(team => team.currentAnswer !== null && team.currentAnswer !== undefined).map((team) => {
                        const isCorrect = team.currentAnswer === currentQuestion.correctAnswer;
                        return (
                          <div key={team.code} className="flex justify-between items-center">
                            <span className={isCorrect ? 'text-neon-green' : 'text-red-400'}>
                              {team.teamName || team.code}: {currentQuestion.options[team.currentAnswer]}
                            </span>
                            <div className="flex gap-2">
                              <span className="text-sm text-gray-400">
                                {isCorrect ? `+${currentQuestion.points || 10} (automatski)` : 'Netačno'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Teams & Leaderboard */}
          <div className="bg-gray-800 rounded-lg p-6 border-2 border-neon-pink">
            <h2 className="text-2xl font-bold mb-4 text-neon-pink">Timovi</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {teams.length === 0 ? (
                <p className="text-gray-400">Nema registrovanih timova.</p>
              ) : (
                sortedTeams.map((team) => (
                  <div
                    key={team.code}
                    className="bg-gray-700 p-4 rounded-lg border border-gray-600"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="font-bold text-white text-lg">{team.teamName}</p>
                        {/*<p className="text-sm text-gray-400">Kod: {team.code}</p>*/}
                        <div className="mt-2 p-2 bg-gray-800 rounded border border-neon-purple">
                          <p className="text-xs text-gray-400 mb-1">Šifra Tima:</p>
                          <div className="flex items-center gap-2">
                            <p className="text-neon-purple font-bold text-lg">{team.teamPassword || 'N/A'}</p>
                            {team.teamPassword && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(team.teamPassword).then(() => {
                                    showNotice('Šifra je kopirana.', 'success');
                                  });
                                }}
                                className="px-2 py-1 bg-neon-purple text-gray-900 text-xs font-bold rounded hover:bg-opacity-80"
                              >
                                Kopiraj
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Link: {window.location.origin}/captain/{eventId}/{team.code}
                          </p>
                        </div>
                        <p className="text-sm text-gray-300 mt-2">Kapetan: {team.captainName}</p>
                        <p className="text-sm text-gray-300">Članovi: {team.membersCount || 0}</p>
                        <p className="text-sm text-gray-300">Telefon: {team.phone || 'N/A'}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xl font-bold text-neon-cyan mb-2">Bodovi: {team.score || 0}</p>
                        <button
                          onClick={() => handleKickTeam(team.code)}
                          className="px-3 py-1 bg-red-600 text-white font-bold rounded text-sm hover:bg-red-700"
                        >
                          Izbaci
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 space-y-2">
              <button
                onClick={handleShowLeaderboard}
                className="w-full py-3 bg-neon-pink text-gray-900 font-bold rounded-lg glow-button"
              >
                Prikaži Rang Listu
              </button>
              <button
                onClick={handleResetScores}
                className="w-full py-3 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700"
              >
                Resetuj Bodove
              </button>
              <button
                onClick={handleResetGame}
                className="w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700"
              >
                Resetuj Igru
              </button>
              <button
                onClick={handleDeleteAllTeams}
                className="w-full py-3 bg-red-800 text-white font-bold rounded-lg hover:bg-red-900"
              >
                Obriši Sve Timove
              </button>
            </div>
          </div>

          {/* Timer Control */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-6 border-2 border-neon-purple glassmorphism">
            <h2 className="text-2xl font-bold mb-4 text-neon-purple">Podešavanja Tajmera</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Tajmer Pitanja (sekunde):</label>
                <input
                  type="number"
                  value={questionTimer}
                  onChange={(e) => handleUpdateTimer(parseInt(e.target.value) || 30)}
                  min="5"
                  max="300"
                  className="w-24 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-purple"
                />
              </div>
              <p className="text-sm text-gray-400">Podrazumevani tajmer za svako pitanje. Trenutno: {questionTimer}s</p>
            </div>
          </div>

          {/* Panic Button - Free Answer Mode */}
          <div className="bg-gray-800 rounded-lg p-6 border-2 border-red-500">
            <h2 className="text-2xl font-bold mb-4 text-red-500">Panic Button</h2>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Slobodno odgovaranje:</label>
              <button
                onClick={handleToggleFreeAnswerMode}
                className={`px-6 py-3 rounded-lg font-bold transition-all ${
                  freeAnswerMode 
                    ? 'bg-red-600 text-white hover:bg-red-700' 
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {freeAnswerMode ? 'AKTIVNO' : 'NE'}
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              {freeAnswerMode 
                ? '⚠️ Svi članovi timova mogu da odgovaraju bez provere kapitena!' 
                : 'Isključuje proveru kapitena - svi mogu da kliknu na odgovor'}
            </p>
          </div>

          {/* Support Section */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-6 border-2 border-neon-cyan glassmorphism">
            <h2 className="text-2xl font-bold mb-4 text-neon-cyan">Podrška</h2>
            <div className="space-y-4">
              <textarea
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Pošaljite poruku Master Adminu..."
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                rows="4"
              />
              <button
                onClick={handleSendSupportMessage}
                className="w-full py-3 bg-neon-cyan text-gray-900 font-bold rounded-lg hover:bg-opacity-80 transition-all"
              >
                Pošalji Masteru
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
