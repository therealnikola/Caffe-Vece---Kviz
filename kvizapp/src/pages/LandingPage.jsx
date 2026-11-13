import { useState, useEffect, useCallback, useRef } from 'react';
import { database } from '../config/firebase';
import { ref, onValue, set, push } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

function LandingPage() {
  const [selectedEventId, setSelectedEventId] = useState('');
  const [events, setEvents] = useState([]);
  const [masterAnnouncements, setMasterAnnouncements] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [membersCount, setMembersCount] = useState('');
  const [phone, setPhone] = useState('');
  const [showRegistration, setShowRegistration] = useState(false);
  const [adminAccessCode, setAdminAccessCode] = useState('');
  const [showAdminInput, setShowAdminInput] = useState(false);
  const [showTeamLogin, setShowTeamLogin] = useState(false);
  const [teamLoginEventId, setTeamLoginEventId] = useState('');
  const [teamPassword, setTeamPassword] = useState('');
  const [uiNotice, setUiNotice] = useState(null); // { type, text }
  const [registrationResult, setRegistrationResult] = useState(null); // { teamPassword }
  const noticeTimeoutRef = useRef(null);

  const navigate = useNavigate();

  const showNotice = useCallback((text, type = 'info') => {
    setUiNotice({ type, text });
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setUiNotice(null), 4500);
  }, []);

  // Load active events
  useEffect(() => {
    const eventsRef = ref(database, 'events');
    const unsubscribe = onValue(eventsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const eventsList = Object.entries(data)
          .map(([id, event]) => ({ id, ...event }))
          .filter(event => event.isActive === true)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setEvents(eventsList);
      } else {
        setEvents([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load master announcements
  useEffect(() => {
    const announcementsRef = ref(database, 'masterAnnouncements');
    const unsubscribe = onValue(announcementsRef, (snapshot) => {
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
            // Backward compatibility - ako nema prikazi_od/vazi_do, koristi staru logiku
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

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, []);

  const handleEventSelect = () => {
    if (!selectedEventId) {
      showNotice('Molimo izaberite lokal.', 'error');
      return;
    }
    setShowRegistration(true);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!selectedEventId) {
      showNotice('Molimo izaberite lokal.', 'error');
      return;
    }
    if (!teamName || !captainName || !membersCount || !phone) {
      showNotice('Molimo popunite sva polja.', 'error');
      return;
    }

    const generateCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let teamCode;
    let attempts = 0;
    do {
      teamCode = generateCode();
      attempts++;
      if (attempts > 100) {
        showNotice('Nije moguće generisati jedinstveni kod tima. Molimo pokušajte ponovo.', 'error');
        return;
      }
      const checkRef = ref(database, `events/${selectedEventId}/teams/${teamCode}`);
      const exists = await new Promise((resolve) => {
        onValue(checkRef, (snap) => resolve(snap.exists()), { onlyOnce: true });
      });
      if (!exists) break;
    } while (true);
    
    // Generate team password
    const teamPassword = generateCode(6);
    
    const teamRef = ref(database, `events/${selectedEventId}/teams/${teamCode}`);
    const memberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      await set(teamRef, {
        teamName,
        captainName,
        membersCount: parseInt(membersCount),
        phone,
        score: 0,
        currentAnswer: null,
        createdAt: Date.now(),
        eventId: selectedEventId,
          active_responder: memberId,
        lastActivity: Date.now(),
        teamPassword: teamPassword, // Store password for login
        members: {
          [memberId]: {
            name: captainName,
            isCaptain: true,
            lastSeen: Date.now(),
          }
        }
      });

      localStorage.setItem(`team_${teamCode}_memberId`, memberId);
      localStorage.setItem(`team_${teamCode}_eventId`, selectedEventId);

      // Log aktivnost
      const eventName = events.find(e => e.id === selectedEventId)?.name || 'Nepoznat';
      push(ref(database, 'activityLog'), {
        type: 'team_join',
        eventId: selectedEventId,
        eventName: eventName,
        teamName: teamName,
        timestamp: Date.now(),
      });

      setRegistrationResult({ teamPassword });
      showNotice('Tim je uspešno registrovan. Sačuvajte šifru tima.', 'success');
      // Don't navigate automatically - admin will give them the link
      setShowRegistration(false);
      setSelectedEventId('');
      setTeamName('');
      setCaptainName('');
      setMembersCount('');
      setPhone('');
    } catch (error) {
      console.error('Greška pri registraciji tima:', error);
      showNotice('Došlo je do greške pri registraciji tima. Molimo pokušajte ponovo.', 'error');
    }
  };

  const handleTeamLogin = async () => {
    if (!teamLoginEventId || !teamPassword.trim()) {
      showNotice('Molimo izaberite lokal i unesite šifru tima.', 'error');
      return;
    }

    // Find team by password in selected event
    const teamsRef = ref(database, `events/${teamLoginEventId}/teams`);
    onValue(teamsRef, (snapshot) => {
      const teamsData = snapshot.val();
      if (teamsData) {
        const foundTeam = Object.entries(teamsData).find(([code, team]) => 
          team.teamPassword === teamPassword.toUpperCase()
        );
        
        if (foundTeam) {
          const [teamCode, teamData] = foundTeam;
          // Generate memberId for this login
          const memberId = `member_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem(`team_${teamCode}_memberId`, memberId);
          localStorage.setItem(`team_${teamCode}_eventId`, teamLoginEventId);
          
          // Add member to team if not already captain
          const members = teamData.members || {};
          if (!Object.values(members).some(m => m.isCaptain)) {
            // This shouldn't happen, but handle it
            members[memberId] = {
              name: 'Član',
              isCaptain: false,
              lastSeen: Date.now(),
            };
            set(ref(database, `events/${teamLoginEventId}/teams/${teamCode}/members`), members);
          } else {
            // Regular member
            members[memberId] = {
              name: 'Član',
              isCaptain: false,
              lastSeen: Date.now(),
            };
            set(ref(database, `events/${teamLoginEventId}/teams/${teamCode}/members`), members);
          }
          
          navigate(`/captain/${teamLoginEventId}/${teamCode}`);
        } else {
          showNotice('Nevažeća šifra tima za izabrani lokal.', 'error');
          setTeamPassword('');
        }
      } else {
        showNotice('Nema registrovanih timova u izabranom lokalu.', 'error');
      }
    }, { onlyOnce: true });
  };

  const handleAdminLogin = async () => {
    if (!adminAccessCode.trim()) {
      showNotice('Molimo unesite Admin Access Code.', 'error');
      return;
    }

    const eventsRef = ref(database, 'events');
    onValue(eventsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const foundEvent = Object.entries(data).find(([id, event]) => 
          event.adminCode === adminAccessCode.toUpperCase() &&
          event.isActive === true
        );
        if (foundEvent) {
          localStorage.setItem('adminEventId', foundEvent[0]);
          localStorage.setItem('isAdmin', 'true');
          setAdminAccessCode('');
          setShowAdminInput(false);
          navigate(`/admin/${foundEvent[0]}`);
        } else {
          showNotice('Nevažeći Admin Access Code ili lokal nije aktivan.', 'error');
          setAdminAccessCode('');
        }
      }
    }, { onlyOnce: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        {uiNotice && (
          <div className="max-w-4xl mx-auto mb-4">
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

        {registrationResult?.teamPassword && (
          <div className="max-w-4xl mx-auto mb-6">
            <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 border-2 border-neon-green glassmorphism">
              <h3 className="text-xl md:text-2xl font-bold text-neon-green mb-2">Registracija uspešna</h3>
              <p className="text-gray-300 text-sm md:text-base mb-3">
                Sačuvajte šifru tima (potrebna je za prijavu). Admin vam daje link za ulaz u kviz.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 bg-gray-900 rounded-lg border border-gray-700 font-bold text-center tracking-widest text-neon-purple">
                  {registrationResult.teamPassword}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(registrationResult.teamPassword).then(() => {
                      showNotice('Šifra tima je kopirana.', 'success');
                    }).catch(() => {
                      showNotice('Greška pri kopiranju šifre.', 'error');
                    });
                  }}
                  className="px-4 py-3 bg-neon-green text-gray-900 font-bold rounded-lg glow-button"
                >
                  Kopiraj
                </button>
                <button
                  onClick={() => setRegistrationResult(null)}
                  className="px-4 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600"
                >
                  Zatvori
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mb-8">
          <h2 className="text-5xl font-bold mb-2 neon-text text-neon-cyan">
            Real-time Quiz Platform
          </h2>
          <p className="text-xl text-gray-300 mb-6">
            Pridružite se igri i takmičite se sa drugim timovima!
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Master Announcements */}
          {masterAnnouncements.length > 0 && (
            <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-6 mb-8 border-2 border-neon-green shadow-lg glassmorphism">
              <h3 className="text-3xl font-bold mb-6 text-neon-green">Obaveštenja</h3>
              <div className="space-y-4">
                {masterAnnouncements.map((ann) => (
                  <div
                    key={ann.id}
                    className="bg-gray-700/60 backdrop-blur-md p-5 rounded-lg border border-gray-600 shadow-md glassmorphism"
                  >
                    <h4 className="text-xl font-bold text-neon-green mb-2">{ann.title || 'Bez naslova'}</h4>
                    <p className="text-white whitespace-pre-wrap mb-3">{ann.text}</p>
                    
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
                        <div className="flex items-center gap-2 mb-2 text-sm text-gray-300">
                          <span>📅</span>
                          <span>{dateStr}</span>
                        </div>
                      ) : null;
                    })()}
                    
                    {/* Address with Google Maps Link */}
                    {ann.address && ann.address.trim() && (
                      <div className="flex items-center gap-2 text-sm">
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Registration */}
          {!showRegistration ? (
            <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-neon-cyan shadow-lg glassmorphism">
              <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-neon-cyan">Prijava Tima</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Izaberite Lokal</label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                  >
                    <option value="">-- Izaberite lokal --</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                  {events.length === 0 && (
                    <p className="text-sm text-gray-400 mt-2">Nema aktivnih lokala trenutno.</p>
                  )}
                </div>

                <button
                  onClick={handleEventSelect}
                  disabled={!selectedEventId}
                  className="w-full py-3 bg-neon-cyan text-gray-900 font-bold rounded-lg glow-button hover:bg-opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Nastavi na Registraciju
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 lg:p-8 border-2 border-neon-cyan shadow-lg glassmorphism">
              <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-neon-cyan">Registracija Tima</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Ime Tima</label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Ime Kapitena</label>
                  <input
                    type="text"
                    value={captainName}
                    onChange={(e) => setCaptainName(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Broj Članova</label>
                  <input
                    type="number"
                    value={membersCount}
                    onChange={(e) => setMembersCount(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Telefon</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-neon-cyan text-white"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-neon-cyan text-gray-900 font-bold rounded-lg glow-button hover:bg-neon-green transition-all"
                  >
                    Registruj Tim
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegistration(false);
                      setSelectedEventId('');
                    }}
                    className="px-6 py-3 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-all"
                  >
                    Nazad
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Team Login */}
          <div className="mt-4 md:mt-6 lg:mt-8 bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 border-2 border-neon-purple glassmorphism">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-lg md:text-xl font-bold text-neon-purple">Prijava Timova</h3>
              {!showTeamLogin ? (
                <button
                  onClick={() => setShowTeamLogin(true)}
                  className="px-4 py-2 border-2 border-gray-600 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-800 hover:border-gray-500 transition-all"
                >
                  Prijavi se kao Tim
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowTeamLogin(false);
                    setTeamLoginEventId('');
                    setTeamPassword('');
                  }}
                  className="px-3 py-2 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-all"
                >
                  ✕
                </button>
              )}
            </div>
            
            {showTeamLogin && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Izaberite Lokal</label>
                  <select
                    value={teamLoginEventId}
                    onChange={(e) => setTeamLoginEventId(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    <option value="">-- Izaberite lokal --</option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-white">Šifra Tima</label>
                  <input
                    type="password"
                    value={teamPassword}
                    onChange={(e) => setTeamPassword(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="Unesite šifru koju vam je dao Admin"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-center text-xl font-bold tracking-widest"
                    maxLength="6"
                  />
                  <p className="text-sm text-gray-400 mt-2">
                    Šifru vam daje organizator lokala
                  </p>
                </div>
                <button
                  onClick={handleTeamLogin}
                  disabled={!teamLoginEventId || !teamPassword.trim()}
                  className="w-full py-3 bg-neon-purple text-gray-900 font-bold rounded-lg glow-button hover:bg-opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prijavi se
                </button>
              </div>
            )}
          </div>

          {/* Admin Login */}
          <div className="mt-4 md:mt-6 lg:mt-8 bg-gray-800/80 backdrop-blur-md rounded-lg p-4 md:p-6 border-2 border-neon-pink glassmorphism">
            <div className="flex items-center justify-between">
              <h3 className="text-lg md:text-xl font-bold text-neon-pink">Admin Prijava</h3>
              {!showAdminInput ? (
                <button
                  onClick={() => setShowAdminInput(true)}
                  className="px-4 py-2 border-2 border-gray-600 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-800 hover:border-gray-500 transition-all"
                >
                  Prijavi se kao Admin
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={adminAccessCode}
                    onChange={(e) => setAdminAccessCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="Admin Access Code"
                    className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm font-bold tracking-widest text-center"
                    maxLength="8"
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  />
                  <button
                    onClick={handleAdminLogin}
                    className="px-4 py-2 bg-neon-pink text-gray-900 text-sm font-medium rounded-lg hover:bg-opacity-80 transition-all"
                  >
                    →
                  </button>
                  <button
                    onClick={() => {
                      setShowAdminInput(false);
                      setAdminAccessCode('');
                    }}
                    className="px-3 py-2 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-all"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Master Admin Link */}
          <div className="mt-4 text-center">
            <a
              href="/master"
              className="text-gray-400 hover:text-white text-sm"
            >
              Master Admin
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
