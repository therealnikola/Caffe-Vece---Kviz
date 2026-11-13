# Kompletna Refaktorizacija - Multi-Tenancy Sistem

## ✅ Završene Izmene

### 1. Landing Page (Početna Stranica)

**Funkcionalnosti:**
- ✅ Prikaz globalnih obaveštenja koje postavlja Master Admin
- ✅ Registracija tima:
  - Dropdown za izbor lokala (bez join_code verifikacije)
  - Forma: Ime tima, Kapiten, Broj članova, Telefon
  - Automatsko generisanje Team Code i Team Password
- ✅ Team Login:
  - Dropdown za izbor lokala
  - Unos šifre tima (koju daje Admin)
  - Pristup timu za kapiten i članove
- ✅ Admin Login sa Access Code + Password

**Izmene:**
- ❌ Uklonjen join_code za registraciju
- ✅ Dodat Team Login sa šifrom
- ✅ Sve na srpskom jeziku

### 2. Admin Panel (Organizator u lokalu)

**Funkcionalnosti:**
- ✅ Login putem Admin Access Code + Password (generiše Master)
- ✅ Vidi samo timove svog lokala (potpuna izolacija)
- ✅ Prikaz tim šifara:
  - Šifra tima vidljiva adminu
  - Kopiranje šifre
  - Link za pristup timu
- ✅ Kontrola kviza:
  - Dodavanje pitanja
  - Kontrola tajmera (default 30s, promenljivo)
  - Pokretanje pitanja
  - Pauziranje/nastavljanje
  - Otkrivanje odgovora
  - Rang lista
  - Izbacivanje timova
  - Resetovanje bodova/brisanje timova

**Izmene:**
- ✅ Dodat prikaz tim šifara
- ✅ Dodato kopiranje šifre i linka
- ✅ Sve na srpskom jeziku

### 3. Master Admin Panel

**Funkcionalnosti:**
- ✅ Kreiranje lokala:
  - Ime lokala
  - Lokacija (opciono)
  - Interna beleška (notes)
  - Automatsko generisanje Admin Code, Admin Password, Join Code
- ✅ Editovanje lokala:
  - Ime, lokacija, notes, admin kod
- ✅ Menjanje admin lozinki
- ✅ Upravljanje globalnim obaveštenjima:
  - Kreiranje, editovanje, brisanje
  - Automatsko brisanje na expiry
- ✅ Pregled i upravljanje timovima:
  - Pregled svih timova u lokalu
  - Editovanje podataka tima
  - Menjanje tim šifara
- ✅ Aktivacija/deaktivacija lokala
- ✅ Brisanje lokala

**Izmene:**
- ✅ Dodato editovanje lokala
- ✅ Dodato menjanje lozinki
- ✅ Dodato upravljanje timovima
- ✅ Sve na srpskom jeziku

### 4. Captain View (Kapiten i Članovi)

**Funkcionalnosti:**
- ✅ Pristup preko Team Password (koju daje Admin)
- ✅ Kapiten je jedini koji klikće na odgovore
- ✅ Čim kapiten klikne, odgovor je zaključan
- ✅ Članovi prate kviz (read-only)
- ✅ Fail-safe: Ako kapiten padne offline, automatski dozvoli drugom članu da pošalje odgovor
- ✅ Prikaz pitanja tek kada Admin pokrene tajmer

**Izmene:**
- ✅ Koristi Team Password umesto Team Code za login
- ✅ Handover logika za offline kapiten
- ✅ Sve na srpskom jeziku

### 5. TV View (Public Display)

**Funkcionalnosti:**
- ✅ Ruta: `/tv/:eventId`
- ✅ Bez dugmića i navigacije (potpuno pasivan)
- ✅ Tri stanja:

#### Waiting State
- Prikazuje ime lokala
- "Dobrodošli! Kviz uskoro počinje"
- Lista prijavljenih timova

#### Question State
- Prikazuje pitanje tek kada Admin pokrene tajmer
- Ogroman font za pitanje (text-7xl)
- 4 opcije sa velikim slovima
- Timer sa velikim fontom (text-9xl)
- Broj timova koji su odgovorili

#### Answer State
- Prikaz tačnog odgovora (označen zeleno)
- Lista odgovora timova (tačni/netačni)
- Visoki kontrast

#### Leaderboard State
- Top 10 timova
- Rangiranje sa poenima
- Posebno označeni top 3

**Izmene:**
- ✅ Prikazuje pitanje tek kada Admin pokrene
- ✅ Tamna pozadina, visoki kontrast
- ✅ Cursor sakriven
- ✅ Sve na srpskom jeziku

### 6. Izolacija Podataka

**Potpuna izolacija:**
- ✅ Svi podaci vezani za `eventId`
- ✅ Admin vidi samo podatke svog lokala
- ✅ Timovi vezani za određeni lokal
- ✅ TV prikaz vezan za određeni lokal
- ✅ Master Admin ima pristup svim lokalima

**Struktura baze:**
```
events/
  {eventId}/
    name, adminCode, admin_password, join_code, notes, isActive
    teams/
      {teamCode}/
        teamName, captainName, membersCount, phone, score
        teamPassword, currentAnswer, activeSender, lastActivity
        members/
          {memberId}/
            name, isCaptain, lastSeen
    questions/
      {questionId}/
        text, options, correctAnswer, points, status
    gameState/
      state, currentQuestion, timer, timerActive, isPaused
    announcements/
      {announcementId}/
        title, text, date, expiryTime
    settings/
      questionTimer

masterAnnouncements/
  {announcementId}/
    title, text, date, expiryTime, createdBy
```

## Access Codes i Šifre

1. **Master Admin**: `MASTER123` (hardcoded)
2. **Admin Access Code**: 8 karaktera (generiše Master)
3. **Admin Password**: 6 karaktera (generiše Master)
4. **Team Password**: 6 karaktera (generiše se pri registraciji, daje Admin kapitenima)
5. **Team Code**: 6 karaktera (generiše se pri registraciji, interno)

## Tok Registracije i Prijave

### Registracija Tima:
1. Korisnik bira lokal iz dropdown-a
2. Popunjava formu (Ime tima, Kapiten, Broj članova, Telefon)
3. Sistem generiše Team Code i Team Password
4. Admin vidi šifru i daje je kapitenima

### Prijava Tima:
1. Korisnik bira lokal iz dropdown-a
2. Unosi Team Password (koju je dobio od Admina)
3. Sistem proverava šifru i daje pristup timu
4. Kapiten i članovi mogu pristupiti istom timu

## Sigurnost

- ✅ Potpuna izolacija podataka između lokala
- ✅ Admin vidi samo svoje timove
- ✅ Tim šifre za pristup
- ✅ Master Admin ima potpunu kontrolu

## Lokalizacija

- ✅ Sav tekst na srpskom jeziku
- ✅ Svi label-i, poruke, dugmići
- ✅ Sve greške i obaveštenja

## Test Scenariji

1. **Master Admin**:
   - Kreiranje lokala
   - Editovanje lokala
   - Menjanje admin lozinki
   - Pregled i editovanje timova
   - Kreiranje globalnih obaveštenja

2. **Admin**:
   - Login sa Access Code + Password
   - Pregled timova (samo svoj lokal)
   - Kopiranje tim šifara
   - Kontrola kviza

3. **Tim Registracija**:
   - Izbor lokala
   - Popunjavanje forme
   - Dobijanje Team Code i Password

4. **Tim Login**:
   - Izbor lokala
   - Unos Team Password
   - Pristup timu

5. **TV View**:
   - Waiting state (lista timova)
   - Question state (pitanje tek kada admin pokrene)
   - Answer state (tačan odgovor)
   - Leaderboard state (rang lista)

6. **Fail-safe**:
   - Kapiten offline
   - Automatski handover drugom članu
   - Slanje odgovora

## Napomene

- Team Password se generiše pri registraciji i čuva u bazi
- Admin vidi i kopira Team Password da bi dao kapitenima
- Kapiten i članovi koriste istu šifru za pristup
- TV View prikazuje pitanje tek kada Admin pokrene tajmer
- Sve funkcionalnosti su na srpskom jeziku
