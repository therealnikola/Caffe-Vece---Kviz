import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { database } from '../config/firebase';
import { ref, push, onValue, set, remove, update } from 'firebase/database';

// Komponenta za status konekcije
const ConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const connectedRef = ref(database, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snap) => {
      setIsConnected(snap.val() === true);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="fixed top-4 right-4 flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full border border-gray-700 z-50">
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
      <span className="text-xs text-gray-300 font-medium">{isConnected ? 'Povezano' : 'Prekid veze'}</span>
    </div>
  );
};


function MasterAdmin() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isMasterAdmin') === 'true';
  });
  const [events, setEvents] = useState([]);
  const [masterAnnouncements, setMasterAnnouncements] = useState([]);
  const [newEventName, setNewEventName] = useState('');
  const [newEventNotes, setNewEventNotes] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    text: '',
    address: '',
    eventDate: '',
    prikazi_od: new Date().toISOString().split('T')[0],
    vazi_do: ''
  });
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [editAnnouncement, setEditAnnouncement] = useState({
    title: '',
    text: '',
    address: '',
    eventDate: '',
    prikazi_od: '',
    vazi_do: ''
  });
  const [editingEventId, setEditingEventId] = useState(null);
  const [editEvent, setEditEvent] = useState({
    name: '',
    location: '',
    notes: '',
    adminCode: ''
  });
  const [selectedEventForTeams, setSelectedEventForTeams] = useState(null);
  const [teamsForEvent, setTeamsForEvent] = useState([]);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editTeam, setEditTeam] = useState({
    teamName: '',
    captainName: '',
    phone: '',
    teamPassword: ''
  });
  const [adminMessages, setAdminMessages] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [uiNotice, setUiNotice] = useState(null); // { type, text }
  const noticeTimeoutRef = useRef(null);

  const navigate = useNavigate();

  const showNotice = useCallback((text, type = 'info') => {
    setUiNotice({ type, text });
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setUiNotice(null), 4500);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const eventsRef = ref(database, 'events');
    const unsubscribeEvents = onValue(eventsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const eventsList = Object.entries(data).map(([id, event]) => ({
          id,
          ...event,
        }));
        setEvents(eventsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      } else {
        setEvents([]);
      }
    });

    const announcementsRef = ref(database, 'masterAnnouncements');
    const unsubscribeAnnouncements = onValue(announcementsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const now = Date.now();
        const annList = Object.entries(data)
          .map(([id, ann]) => ({ id, ...ann }))
          .filter((ann) => {
            // Proveri prikazi_od
            if (ann.prikazi_od && now < ann.prikazi_od) return false;
            // Proveri vazi_do
            if (ann.vazi_do && now > ann.vazi_do) return false;
            // Backward compatibility
            if (!ann.prikazi_od && !ann.vazi_do && ann.expiryTime) {
              const expiryTimestamp = new Date(ann.expiryTime).getTime();
              return now <= expiryTimestamp;
            }
            return true;
          });
        setMasterAnnouncements(annList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      } else {
        setMasterAnnouncements([]);
      }
    });

    // Load admin messages
    const messagesRef = ref(database, 'adminMessages');
    const unsubscribeMessages = onValue(messagesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const messagesList = Object.entries(data).map(([id, msg]) => ({ id, ...msg }));
        setAdminMessages(messagesList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      } else {
        setAdminMessages([]);
      }
    });

    // Load activity log
    const activityRef = ref(database, 'activityLog');
    const unsubscribeActivity = onValue(activityRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const logList = Object.entries(data).map(([id, log]) => ({ id, ...log }));
        setActivityLog(logList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 50));
      } else {
        setActivityLog([]);
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeAnnouncements();
      unsubscribeMessages();
      unsubscribeActivity();
    };
  }, [isAuthenticated]);

  // Teams listener (sa cleanup-om) – nema više “leak” listenera na klik
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!selectedEventForTeams) {
      setTeamsForEvent([]);
      return;
    }

    const teamsRef = ref(database, `events/${selectedEventForTeams}/teams`);
    const unsubscribe = onValue(teamsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const teamsList = Object.entries(data).map(([code, team]) => ({
          code,
          ...team,
        }));
        setTeamsForEvent(teamsList);
      } else {
        setTeamsForEvent([]);
      }
    });

    return () => unsubscribe();
  }, [isAuthenticated, selectedEventForTeams]);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  const handleLogin = () => {
    const masterPassword = import.meta.env.VITE_MASTER_ADMIN_PASSWORD || 'MASTER123';
    if (password === masterPassword) {
      setIsAuthenticated(true);
      localStorage.setItem('isMasterAdmin', 'true');
      setPassword('');
    } else {
      showNotice('Nevažeća lozinka.', 'error');
    }
  };

  const generateCode = (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) {
      showNotice('Molimo unesite ime lokala.', 'error');
      return;
    }

    const adminCode = generateCode(8);
    
    // Proveri da li kod već postoji
    const eventsRef = ref(database, 'events');
    const snapshot = await new Promise((resolve) => {
      onValue(eventsRef, (snap) => resolve(snap.val()), { onlyOnce: true });
    });
    
    if (snapshot) {
      const existingAdminCodes = Object.values(snapshot).map(e => e.adminCode);
      if (existingAdminCodes.includes(adminCode)) {
        showNotice('Greška pri generisanju koda. Pokušajte ponovo.', 'error');
        return;
      }
    }

    const newEventRef = push(ref(database, 'events'));
    const eventId = newEventRef.key;

    try {
      await set(newEventRef, {
        name: newEventName.trim(),
        adminCode: adminCode,
        notes: newEventNotes.trim() || '',
        isActive: true,
        masterAdminId: localStorage.getItem('masterAdminId') || 'default',
        createdAt: Date.now(),
      });

      // Kreiraj početne strukture za event
      await set(ref(database, `events/${eventId}/gameState`), {
        state: 'waiting',
        currentQuestion: null,
        timer: 0,
        timerActive: false,
        isPaused: false,
        questionTimer: 30,
        revealedByAdmin: false,
        playSuccessSound: false,
        playPauseSound: false,
      });

      await set(ref(database, `events/${eventId}/settings/questionTimer`), 30);

      showNotice(`Lokal "${newEventName}" je kreiran. Admin Access Code: ${adminCode}`, 'success');
      setNewEventName('');
      setNewEventNotes('');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Greška pri kreiranju lokala:', error);
      showNotice('Došlo je do greške pri kreiranju lokala. Molimo pokušajte ponovo.', 'error');
    }
  };

  const handleDeleteEvent = async (eventId, eventName) => {
    if (confirm(`Da li ste sigurni da želite da obrišete lokal "${eventName}"?\n\nOvo će trajno obrisati sve podatke: timove, pitanja, rezultate i obaveštenja.`)) {
      try {
        // Cascade delete - Firebase automatski briše sve grane kada se briše parent node
        await remove(ref(database, `events/${eventId}`));
        showNotice(`Lokal "${eventName}" je uspešno obrisan sa svim podacima.`, 'success');
      } catch (error) {
        console.error('Greška pri brisanju lokala:', error);
        showNotice('Došlo je do greške pri brisanju lokala. Molimo pokušajte ponovo.', 'error');
      }
    }
  };

  const handleToggleEventStatus = (eventId, currentStatus) => {
    update(ref(database, `events/${eventId}`), {
      isActive: !currentStatus,
    });
  };

  const handleStartEditEvent = (event) => {
    setEditingEventId(event.id);
    setEditEvent({
      name: event.name || '',
      location: event.location || '',
      notes: event.notes || '',
      adminCode: event.adminCode || '',
    });
  };

  const handleSaveEditEvent = () => {
    if (!editEvent.name.trim()) {
      showNotice('Molimo unesite ime lokala.', 'error');
      return;
    }
    update(ref(database, `events/${editingEventId}`), {
      name: editEvent.name.trim(),
      location: editEvent.location.trim(),
      notes: editEvent.notes.trim(),
      adminCode: editEvent.adminCode.toUpperCase().trim(),
    });
    setEditingEventId(null);
    setEditEvent({ name: '', location: '', notes: '', adminCode: '' });
  };


  const handleViewTeams = (eventId) => {
    setSelectedEventForTeams(eventId);
  };

  const handleStartEditTeam = (team) => {
    setEditingTeamId(team.code);
    setEditTeam({
      teamName: team.teamName || '',
      captainName: team.captainName || '',
      phone: team.phone || '',
      teamPassword: team.teamPassword || '',
    });
  };

  const handleSaveEditTeam = () => {
    if (!editTeam.teamName.trim()) {
      showNotice('Molimo unesite ime tima.', 'error');
      return;
    }
    update(ref(database, `events/${selectedEventForTeams}/teams/${editingTeamId}`), {
      teamName: editTeam.teamName.trim(),
      captainName: editTeam.captainName.trim(),
      phone: editTeam.phone.trim(),
      teamPassword: editTeam.teamPassword.toUpperCase().trim(),
    });
    setEditingTeamId(null);
    setEditTeam({ teamName: '', captainName: '', phone: '', teamPassword: '' });
  };

  const handleChangeTeamPassword = (teamCode) => {
    const newPassword = generateCode(6);
    update(ref(database, `events/${selectedEventForTeams}/teams/${teamCode}`), {
      teamPassword: newPassword,
    });
    showNotice(`Nova šifra tima: ${newPassword}`, 'success');
  };

  const handleDeleteAllMessages = () => {
    if (confirm('Da li ste sigurni da želite da obrišete sve poruke?')) {
      const messagesRef = ref(database, 'adminMessages');
      remove(messagesRef);
      showNotice('Sve poruke su obrisane.', 'success');
    }
  };

  const handleAddAnnouncement = () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.text.trim()) {
      showNotice('Molimo popunite naslov i tekst obaveštenja.', 'error');
      return;
    }
    
    const prikaziOd = newAnnouncement.prikazi_od 
      ? new Date(newAnnouncement.prikazi_od + 'T00:00').getTime()
      : Date.now();
    
    const vaziDo = newAnnouncement.vazi_do 
      ? new Date(newAnnouncement.vazi_do + 'T23:59').getTime()
      : null;
    
    push(ref(database, 'masterAnnouncements'), {
      title: newAnnouncement.title,
      text: newAnnouncement.text,
      address: newAnnouncement.address.trim() || '',
      eventDate: newAnnouncement.eventDate || '',
      prikazi_od: prikaziOd,
      vazi_do: vaziDo,
      timestamp: Date.now(),
      createdBy: localStorage.getItem('masterAdminId') || 'default',
    });
    
    setNewAnnouncement({
      title: '',
      text: '',
      address: '',
      eventDate: '',
      prikazi_od: new Date().toISOString().split('T')[0],
      vazi_do: ''
    });
  };

  const handleDeleteAnnouncement = (id) => {
    if (confirm('Da li ste sigurni da želite da obrišete ovo obaveštenje?')) {
      remove(ref(database, `masterAnnouncements/${id}`));
    }
  };

  const handleStartEditAnnouncement = (ann) => {
    setEditingAnnouncementId(ann.id);
    const prikaziOd = ann.prikazi_od 
      ? new Date(ann.prikazi_od).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const vaziDo = ann.vazi_do 
      ? new Date(ann.vazi_do).toISOString().split('T')[0]
      : '';
    let eventDate = '';
    if (ann.eventDate) {
      if (typeof ann.eventDate === 'number') {
        // Ako je timestamp
        eventDate = new Date(ann.eventDate).toISOString().split('T')[0];
      } else if (typeof ann.eventDate === 'string') {
        // Ako je string, proveri format
        if (ann.eventDate.includes('T')) {
          eventDate = ann.eventDate.split('T')[0];
        } else if (ann.eventDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Ako je već u formatu YYYY-MM-DD
          eventDate = ann.eventDate;
        } else {
          // Pokušaj da parsiraš
          const parsed = new Date(ann.eventDate);
          if (!isNaN(parsed.getTime())) {
            eventDate = parsed.toISOString().split('T')[0];
          } else {
            eventDate = ann.eventDate;
          }
        }
      }
    }
    setEditAnnouncement({
      title: ann.title || '',
      text: ann.text || '',
      address: ann.address || '',
      eventDate: eventDate,
      prikazi_od: prikaziOd,
      vazi_do: vaziDo
    });
  };

  const handleSaveEditAnnouncement = () => {
    if (!editAnnouncement.title.trim() || !editAnnouncement.text.trim()) return;
    
    const prikaziOd = editAnnouncement.prikazi_od 
      ? new Date(editAnnouncement.prikazi_od + 'T00:00').getTime()
      : Date.now();
    
    const vaziDo = editAnnouncement.vazi_do 
      ? new Date(editAnnouncement.vazi_do + 'T23:59').getTime()
      : null;
    
    update(ref(database, `masterAnnouncements/${editingAnnouncementId}`), {
      title: editAnnouncement.title,
      text: editAnnouncement.text,
      address: editAnnouncement.address.trim() || '',
      eventDate: editAnnouncement.eventDate || '',
      prikazi_od: prikaziOd,
      vazi_do: vaziDo,
      timestamp: Date.now(),
    });
    
    setEditingAnnouncementId(null);
    setEditAnnouncement({
      title: '',
      text: '',
      address: '',
      eventDate: '',
      prikazi_od: '',
      vazi_do: ''
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 border-2 border-neon-pink max-w-md w-full">
          <h2 className="text-3xl font-bold mb-6 text-neon-pink text-center">Master Admin Prijava</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Lozinka"
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg mb-4 focus:outline-none focus:border-neon-pink text-white"
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button
            onClick={handleLogin}
            className="w-full py-3 bg-neon-pink text-gray-900 font-bold rounded-lg glow-button"
          >
            Prijavi se
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2 mt-4 text-gray-400 hover:text-white"
          >
            Nazad na Početnu
          </button>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold neon-text text-neon-pink">Master Admin Panel</h1>
          <div className="flex gap-2">
            {adminMessages.length > 0 && (
              <span className="px-3 py-1 bg-red-600 text-white rounded-full text-sm font-bold">
                {adminMessages.length} Nova Poruka{adminMessages.length > 1 ? 'a' : ''}
              </span>
            )}
            <button
              onClick={() => {
                localStorage.removeItem('isMasterAdmin');
                setIsAuthenticated(false);
                navigate('/');
              }}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Odjavi se
            </button>

            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Nazad na početnu
            </button>
          </div>
        </div>

      

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
          {/* Inbox za Poruke Admina */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 border-2 border-neon-cyan">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-neon-cyan">Inbox</h2>
              {adminMessages.length > 0 && (
                <button
                  onClick={handleDeleteAllMessages}
                  className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700"
                >
                  Obriši Sve
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {adminMessages.length === 0 ? (
                <p className="text-gray-400 text-center py-4 text-sm">Nema poruka</p>
              ) : (
                adminMessages.map((msg) => (
                  <div key={msg.id} className="bg-gray-700/50 p-3 rounded-lg border border-gray-600">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-bold text-neon-cyan">{msg.lokalName || 'Nepoznat Lokal'}</p>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.timestamp).toLocaleString('sr-RS')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live Activity Log */}
          <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 border-2 border-neon-green">
            <h2 className="text-xl md:text-2xl font-bold text-neon-green mb-4">Live Activity Log</h2>
            <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
              {activityLog.length === 0 ? (
                <p className="text-gray-400 text-center py-4">Nema aktivnosti</p>
              ) : (
                activityLog.map((log) => {
                  let logText = '';
                  let logColor = 'text-gray-300';
                  
                  if (log.type === 'admin_login') {
                    logText = `Admin [${log.eventName || 'Nepoznat'}] se ulogovao`;
                    logColor = 'text-blue-400';
                  } else if (log.type === 'team_join') {
                    logText = `Tim [${log.teamName || 'Nepoznat'}] se pridružio lokalu [${log.eventName || 'Nepoznat'}]`;
                    logColor = 'text-green-400';
                  } else if (log.type === 'free_answer_mode') {
                    logText = `Slobodno odgovaranje ${log.value ? 'AKTIVIRANO' : 'DEAKTIVIRANO'} - [${log.eventName || 'Nepoznat'}]`;
                    logColor = 'text-yellow-400';
                  } else if (log.type === 'question_started') {
                    logText = `Pitanje pokrenuto - [${log.eventName || 'Nepoznat'}]`;
                    logColor = 'text-purple-400';
                  } else {
                    logText = JSON.stringify(log);
                  }
                  
                  return (
                    <div key={log.id} className={`${logColor} py-1`}>
                      <span className="text-gray-500">
                        {new Date(log.timestamp).toLocaleTimeString('sr-RS')}
                      </span>
                      {' '}
                      {logText}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Create Event Form */}
          <div className="bg-gray-800 rounded-lg p-6 border-2 border-neon-cyan">
            {!showCreateForm ? (
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full py-4 bg-neon-cyan text-gray-900 font-bold rounded-lg glow-button text-xl"
              >
                + Kreiraj Novi Lokal
              </button>
            ) : (
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-neon-cyan mb-4">Kreiraj Novi Lokal</h2>
                <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  placeholder="Ime lokala (npr. 'Kviz Beograd 2024')"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                />
                <textarea
                  value={newEventNotes}
                  onChange={(e) => setNewEventNotes(e.target.value)}
                  placeholder="Interna beleška (opciono)"
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                  rows="3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateEvent}
                    className="flex-1 py-3 bg-neon-cyan text-gray-900 font-bold rounded-lg glow-button"
                  >
                    Kreiraj Lokal
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewEventName('');
                      setNewEventNotes('');
                    }}
                    className="px-6 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600"
                  >
                    Otkaži
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Global Announcements */}
          <div className="bg-gray-800 rounded-lg p-6 border-2 border-neon-green">
            <h2 className="text-2xl font-bold mb-4 text-neon-green">Globalna Obaveštenja</h2>
            
            <div className="mb-4 space-y-3">
              <input
                type="text"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                placeholder="Naslov obaveštenja..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
              <textarea
                value={newAnnouncement.text}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, text: e.target.value })}
                placeholder="Tekst obaveštenja..."
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                rows="2"
              />
              <input
                type="text"
                value={newAnnouncement.address}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, address: e.target.value })}
                placeholder="Adresa (npr. Knez Mihailova 1, Beograd)"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
              <input
                type="date"
                value={newAnnouncement.eventDate}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, eventDate: e.target.value })}
                placeholder="Datum događaja"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Prikaži od:</label>
                  <input
                    type="date"
                    value={newAnnouncement.prikazi_od}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, prikazi_od: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Važi do:</label>
                  <input
                    type="date"
                    value={newAnnouncement.vazi_do}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, vazi_do: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>
              </div>
              <button
                onClick={handleAddAnnouncement}
                className="w-full py-2 bg-neon-green text-gray-900 font-bold rounded-lg glow-button"
              >
                Dodaj Obaveštenje
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {masterAnnouncements.map((ann) => (
                <div key={ann.id} className="bg-gray-700 p-3 rounded-lg border border-gray-600">
                  {editingAnnouncementId === ann.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editAnnouncement.title}
                        onChange={(e) => setEditAnnouncement({ ...editAnnouncement, title: e.target.value })}
                        className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                      />
                      <textarea
                        value={editAnnouncement.text}
                        onChange={(e) => setEditAnnouncement({ ...editAnnouncement, text: e.target.value })}
                        className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                        rows="2"
                      />
                      <input
                        type="text"
                        value={editAnnouncement.address}
                        onChange={(e) => setEditAnnouncement({ ...editAnnouncement, address: e.target.value })}
                        placeholder="Adresa"
                        className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                      />
                      <input
                        type="date"
                        value={editAnnouncement.eventDate}
                        onChange={(e) => setEditAnnouncement({ ...editAnnouncement, eventDate: e.target.value })}
                        placeholder="Datum događaja"
                        className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Prikaži od:</label>
                          <input
                            type="date"
                            value={editAnnouncement.prikazi_od}
                            onChange={(e) => setEditAnnouncement({ ...editAnnouncement, prikazi_od: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Važi do:</label>
                          <input
                            type="date"
                            value={editAnnouncement.vazi_do}
                            onChange={(e) => setEditAnnouncement({ ...editAnnouncement, vazi_do: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEditAnnouncement}
                          className="px-3 py-1 bg-neon-green text-gray-900 font-bold rounded text-xs"
                        >
                          Sačuvaj
                        </button>
                        <button
                          onClick={() => setEditingAnnouncementId(null)}
                          className="px-3 py-1 bg-gray-600 text-white rounded text-xs"
                        >
                          Otkaži
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-bold text-neon-green">{ann.title}</h4>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleStartEditAnnouncement(ann)}
                            className="px-2 py-1 bg-neon-cyan text-gray-900 text-xs font-bold rounded"
                          >
                            Izmeni
                          </button>
                          <button
                            onClick={() => handleDeleteAnnouncement(ann.id)}
                            className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded"
                          >
                            Obriši
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-gray-300 whitespace-pre-wrap">{ann.text}</p>
                      
                      {/* Event Date */}
                      {ann.eventDate && (() => {
                        let dateStr = '';
                        try {
                          if (typeof ann.eventDate === 'number') {
                            dateStr = new Date(ann.eventDate).toLocaleDateString('sr-RS', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric' 
                            });
                          } else if (typeof ann.eventDate === 'string') {
                            // Ako je već u formatu YYYY-MM-DD, parsiraj direktno
                            const date = new Date(ann.eventDate + 'T00:00');
                            if (!isNaN(date.getTime())) {
                              dateStr = date.toLocaleDateString('sr-RS', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric' 
                              });
                            } else {
                              dateStr = ann.eventDate;
                            }
                          }
                        } catch (e) {
                          dateStr = ann.eventDate;
                        }
                        return dateStr ? (
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            <span>📅</span>
                            <span>{dateStr}</span>
                          </div>
                        ) : null;
                      })()}
                      
                      {/* Address with Google Maps Link */}
                      {ann.address && ann.address.trim() && (
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <span>📍</span>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ann.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300 transition-colors"
                          >
                            {ann.address}
                          </a>
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-500 mt-1">
                        {ann.prikazi_od && (
                          <span>Prikaži od: {new Date(ann.prikazi_od).toLocaleDateString('sr-RS')}</span>
                        )}
                        {ann.vazi_do && (
                          <span className="ml-2">Važi do: {new Date(ann.vazi_do).toLocaleDateString('sr-RS')}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Teams View for Selected Event */}
        {selectedEventForTeams && (
          <div className="bg-gray-800 rounded-lg p-6 border-2 border-blue-500 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-blue-400">
                Timovi za: {events.find(e => e.id === selectedEventForTeams)?.name}
              </h2>
              <button
                onClick={() => {
                  setSelectedEventForTeams(null);
                  setTeamsForEvent([]);
                }}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              >
                Zatvori
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {teamsForEvent.length === 0 ? (
                <p className="text-gray-400">Nema timova u ovom lokalu.</p>
              ) : (
                teamsForEvent.map((team) => (
                  <div key={team.code} className="bg-gray-700 p-4 rounded-lg border border-gray-600">
                    {editingTeamId === team.code ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editTeam.teamName}
                          onChange={(e) => setEditTeam({ ...editTeam, teamName: e.target.value })}
                          placeholder="Ime tima"
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                        />
                        <input
                          type="text"
                          value={editTeam.captainName}
                          onChange={(e) => setEditTeam({ ...editTeam, captainName: e.target.value })}
                          placeholder="Ime kapitena"
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                        />
                        <input
                          type="text"
                          value={editTeam.phone}
                          onChange={(e) => setEditTeam({ ...editTeam, phone: e.target.value })}
                          placeholder="Telefon"
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                        />
                        <input
                          type="text"
                          value={editTeam.teamPassword}
                          onChange={(e) => setEditTeam({ ...editTeam, teamPassword: e.target.value.toUpperCase() })}
                          placeholder="Šifra tima"
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          maxLength="6"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEditTeam}
                            className="px-3 py-1 bg-neon-green text-gray-900 font-bold rounded text-xs"
                          >
                            Sačuvaj
                          </button>
                          <button
                            onClick={() => setEditingTeamId(null)}
                            className="px-3 py-1 bg-gray-600 text-white rounded text-xs"
                          >
                            Otkaži
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-bold text-white">{team.teamName}</p>
                          <p className="text-sm text-gray-400">Kod: {team.code}</p>
                          <p className="text-sm text-gray-300">Kapetan: {team.captainName}</p>
                          <p className="text-sm text-gray-300">Telefon: {team.phone || 'N/A'}</p>
                          <p className="text-sm text-neon-purple font-bold">Šifra za login: {team.teamPassword || 'N/A'}</p>
                          <p className="text-sm text-gray-400">Bodovi: {team.score || 0}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => handleStartEditTeam(team)}
                            className="px-3 py-1 bg-neon-cyan text-gray-900 font-bold rounded text-xs"
                          >
                            Izmeni
                          </button>
                          <button
                            onClick={() => handleChangeTeamPassword(team.code)}
                            className="px-3 py-1 bg-yellow-600 text-white font-bold rounded text-xs"
                          >
                            Nova Šifra
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Events List */}
        <div className="bg-gray-800 rounded-lg p-6 border-2 border-neon-purple mt-6">
          <h2 className="text-2xl font-bold mb-4 text-neon-purple">Lokali</h2>
          {events.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Nema kreiranih lokala. Kreirajte prvi lokal da počnete.</p>
          ) : (
            <div className="space-y-4">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`bg-gray-700 rounded-lg p-6 border-2 ${
                    event.isActive ? 'border-neon-green' : 'border-gray-600'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-white">{event.name}</h3>
                        <span className={`px-3 py-1 rounded text-sm font-bold ${
                          event.isActive 
                            ? 'bg-green-900 text-neon-green' 
                            : 'bg-gray-600 text-gray-400'
                        }`}>
                          {event.isActive ? 'Aktivan' : 'Neaktivan'}
                        </span>
                      </div>
                      <div className="mb-2">
                        <p className="text-sm text-gray-400">Admin Access Code:</p>
                        <p className="text-neon-cyan font-bold">{event.adminCode}</p>
                        
                        

                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        Lokacija: {event.location}
                      </p>
                      {event.notes && (
                        <p className="text-sm text-gray-500 italic whitespace-pre-wrap">Beleška: {event.notes}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
                        Kreiran: {new Date(event.createdAt).toLocaleString('sr-RS')}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {editingEventId === event.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editEvent.name}
                            onChange={(e) => setEditEvent({ ...editEvent, name: e.target.value })}
                            placeholder="Ime lokala"
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          />
                          <input
                            type="text"
                            value={editEvent.location}
                            onChange={(e) => setEditEvent({ ...editEvent, location: e.target.value })}
                            placeholder="Lokacija"
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          />
                          <textarea
                            value={editEvent.notes}
                            onChange={(e) => setEditEvent({ ...editEvent, notes: e.target.value })}
                            placeholder="Beleška"
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                            rows="2"
                          />
                          <input
                            type="text"
                            value={editEvent.adminCode}
                            onChange={(e) => setEditEvent({ ...editEvent, adminCode: e.target.value.toUpperCase() })}
                            placeholder="Admin Code"
                            className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                            maxLength="8"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveEditEvent}
                              className="px-3 py-1 bg-neon-green text-gray-900 font-bold rounded text-xs"
                            >
                              Sačuvaj
                            </button>
                            <button
                              onClick={() => setEditingEventId(null)}
                              className="px-3 py-1 bg-gray-600 text-white rounded text-xs"
                            >
                              Otkaži
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEditEvent(event)}
                            className="px-4 py-2 bg-neon-cyan text-gray-900 rounded font-bold text-sm hover:bg-opacity-80"
                          >
                            Izmeni
                          </button>
                          <button
                            onClick={() => handleViewTeams(event.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm hover:bg-blue-700"
                          >
                            Vidi Timove
                          </button>
                          <button
                            onClick={() => handleToggleEventStatus(event.id, event.isActive)}
                            className={`px-4 py-2 rounded font-bold text-sm ${
                              event.isActive
                                ? 'bg-orange-600 text-white hover:bg-orange-700'
                                : 'bg-neon-green text-gray-900 hover:bg-opacity-80'
                            }`}
                          >
                            {event.isActive ? 'Deaktiviraj' : 'Aktiviraj'}
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event.id, event.name)}
                            className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm hover:bg-red-700"
                          >
                            Obriši
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MasterAdmin;
