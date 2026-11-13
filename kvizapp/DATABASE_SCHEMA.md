# Nova Firebase Šema za Multi-Tenancy

## Struktura Baze Podataka

### 1. Events (Lokali)
```
events/
  {eventId}/
    name: string                    // Ime lokala
    adminCode: string              // Access Code za Admina (Organizatora) - za ulaz u admin panel
    admin_password: string          // Lozinka za admin panel tog lokala
    join_code: string               // Kod koji timovi kucaju pri prijavi
    notes: string                   // Interno za Mastera
    isActive: boolean               // Da li je lokal aktivan
    masterAdminId: string           // ID Master Admina koji je kreirao
    createdAt: timestamp
```

### 2. Globalna Obaveštenja (Master Announcements)
```
masterAnnouncements/
  {announcementId}/
    title: string
    text: string
    date: string
    expiryTime: timestamp | null
    timestamp: timestamp
    createdBy: string               // Master Admin ID
```

### 3. Teams (Timovi) - sa eventId
```
events/{eventId}/teams/
  {teamCode}/
    teamName: string
    captainName: string
    membersCount: number
    phone: string
    score: number
    currentAnswer: number | null
    createdAt: timestamp
    eventId: string                 // FK na Event
    teamPassword: string           // Šifra za pristup timu (daje Admin kapitenima)
    activeSender: string            // ID aktivnog pošiljaoca (kapiten ili član)
    lastActivity: timestamp         // Za proveru offline statusa
    members: object                 // Map of memberId -> {name, isCaptain, lastSeen}
```

### 4. Questions (Pitanja) - sa eventId
```
events/{eventId}/questions/
  {questionId}/
    text: string
    options: string[]
    correctAnswer: number
    points: number
    status: 'pending' | 'active' | 'used'
    timestamp: timestamp
    usedDate: string | null
    eventId: string                 // FK na Event
```

### 5. GameState - sa eventId
```
events/{eventId}/gameState/
    state: 'waiting' | 'question' | 'answer' | 'leaderboard'
    currentQuestion: object | null
    timer: number
    timerActive: boolean
    isPaused: boolean
    questionTimer: number
    revealedByAdmin: boolean
    playSuccessSound: boolean
    playPauseSound: boolean
```

### 6. Local Announcements (Obaveštenja za lokal) - sa eventId
```
events/{eventId}/announcements/
  {announcementId}/
    title: string
    text: string
    date: string
    expiryTime: timestamp | null
    timestamp: timestamp
    eventId: string                 // FK na Event
```

### 7. Settings - sa eventId
```
events/{eventId}/settings/
    questionTimer: number
```

### 8. Master Admins
```
masterAdmins/
  {masterAdminId}/
    email: string
    name: string
    createdAt: timestamp
```

## Access Codes i Šifre

- **Master Admin Code**: Hardcoded (`MASTER123`)
- **Admin Access Code**: Generiše Master Admin za svaki Event (8 karaktera, za pristup admin panelu)
- **Admin Password**: Generiše Master Admin za svaki Event (6 karaktera, lozinka za admin panel)
- **Team Password**: Generiše se pri registraciji tima (6 karaktera, daje Admin kapitenima za pristup)
- **Team Code**: Generiše se pri registraciji tima (6 karaktera, interno)
- **Join Code**: Generiše Master Admin (6 karaktera, trenutno se ne koristi za registraciju)

## Izolacija Podataka

Svi upiti moraju uključivati `eventId`:
- Admin vidi samo: `events/{eventId}/teams`, `events/{eventId}/questions`, itd.
- Tim vidi samo svoje podatke: `events/{eventId}/teams/{teamCode}`
- TV View prikazuje samo: `events/{eventId}/gameState`, `events/{eventId}/teams`
