# Implementacija Novih Funkcija za Globalna Obaveštenja

## ✅ Sve Izmene Završene

### 1. Podaci i Firebase ✅

**Ažurirani State:**
- ✅ `newAnnouncement` sada uključuje `address` i `eventDate`
- ✅ `editAnnouncement` sada uključuje `address` i `eventDate`
- ✅ Ispravljena varijabla `adress` → `address` kroz ceo kod

**Ažurirane Funkcije:**
- ✅ `handleAddAnnouncement`: Čuva `address` i `eventDate` u Firebase
- ✅ `handleSaveEditAnnouncement`: Ažurira `address` i `eventDate` u Firebase
- ✅ `handleStartEditAnnouncement`: Učitava `address` i `eventDate` sa pravilnim formatiranjem

**Firebase Struktura:**
```javascript
masterAnnouncements/{id}/
  title: string
  text: string
  address: string        // NOVO
  eventDate: string      // NOVO (YYYY-MM-DD format)
  prikazi_od: timestamp
  vazi_do: timestamp
  timestamp: timestamp
```

### 2. Google Maps Integracija ✅

**Klikabilni Link za Adresu:**
- ✅ Adresa je sada klikabilni link koji otvara Google Maps
- ✅ Format linka: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(announcement.address)}`
- ✅ Koristi `target="_blank"` i `rel="noopener noreferrer"` za bezbednost
- ✅ Stilizovan sa Tailwind: `text-blue-400 underline hover:text-blue-300`

**Implementacija:**
- Master Admin Panel: Adresa je klikabilna u listi obaveštenja
- Landing Page: Adresa je klikabilna u javnim obaveštenjima
- Uslovno renderovanje: Prikazuje se samo ako `address` nije prazan

### 3. UI Dizajn Obaveštenja ✅

**Nova Polja u Kartici:**
- ✅ **Datum događaja** sa ikonicom kalendara 📅
  - Format: DD.MM.YYYY (srpski format)
  - Stilizovan sa `text-sm text-gray-300` (Landing) ili `text-xs text-gray-400` (Master)
  - Flex layout: `flex items-center gap-2`
  
- ✅ **Adresa** sa ikonicom lokacije 📍
  - Klikabilni link (plavi, podvučen)
  - Hover efekat: `hover:text-blue-300`
  - Stilizovan sa `text-blue-400 underline`

**Layout:**
```
[Naslov]
[Tekst obaveštenja]
📅 DD.MM.YYYY          (ako postoji eventDate)
📍 [Klikabilna adresa] (ako postoji address)
[Prikaži od / Važi do] (Master Admin samo)
```

### 4. Edit Mod ✅

**Dodata Polja u Edit Formu:**
- ✅ Polje za `address` (text input)
- ✅ Polje za `eventDate` (date input)
- ✅ Polja su vidljiva u edit modu
- ✅ Master može da ispravi adresu i datum ako pogreši

**Formatiranje Datuma:**
- ✅ Podrška za različite formate (timestamp, string, YYYY-MM-DD)
- ✅ Automatska konverzija u YYYY-MM-DD format za date input
- ✅ Prikaz u srpskom formatu (DD.MM.YYYY)

### 5. Dodatna Poliranja ✅

**Uslovno Renderovanje:**
- ✅ Ikona lokacije se prikazuje samo ako `address` nije prazan
- ✅ Ikona kalendara se prikazuje samo ako `eventDate` postoji
- ✅ Trim-ovanje adrese pre čuvanja

**Responzivnost:**
- ✅ Svi elementi su responzivni za mobilne telefone
- ✅ Flex layout sa `gap-2` za razmak između ikone i teksta
- ✅ Text size: `text-xs` (Master) ili `text-sm` (Landing)

**Jezik:**
- ✅ Sve poruke na srpskom jeziku
- ✅ Format datuma: srpski (DD.MM.YYYY)
- ✅ Placeholder tekstovi na srpskom

---

## Struktura Promena

### Ažurirani Fajlovi

1. **`src/pages/MasterAdmin.jsx`**
   - ✅ Dodata polja `address` i `eventDate` u state
   - ✅ Ažurirane funkcije za kreiranje i editovanje
   - ✅ Dodata polja u create i edit formu
   - ✅ Dodat prikaz sa ikonicama i Google Maps linkom
   - ✅ Formatiranje datuma u srpskom formatu

2. **`src/pages/LandingPage.jsx`**
   - ✅ Dodat prikaz sa ikonicama i Google Maps linkom
   - ✅ Formatiranje datuma u srpskom formatu
   - ✅ Uslovno renderovanje

---

## Test Scenariji

### 1. Kreiranje Obaveštenja
- ✅ Master može da unese adresu i datum
- ✅ Adresa i datum se čuvaju u Firebase
- ✅ Forma se resetuje nakon kreiranja

### 2. Editovanje Obaveštenja
- ✅ Master može da edituje adresu i datum
- ✅ Polja su vidljiva u edit modu
- ✅ Izmene se čuvaju u Firebase

### 3. Prikaz Obaveštenja
- ✅ Datum se prikazuje sa ikonicom kalendara 📅
- ✅ Adresa se prikazuje sa ikonicom lokacije 📍
- ✅ Adresa je klikabilna i otvara Google Maps
- ✅ Uslovno renderovanje radi ispravno

### 4. Google Maps Link
- ✅ Klik na adresu otvara Google Maps
- ✅ Link je pravilno formatiran sa `encodeURIComponent`
- ✅ Otvara se u novom tabu (`target="_blank"`)

---

## Napomene

- **Google Maps Link**: Format `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
- **Format Datuma**: Prikaz u srpskom formatu (DD.MM.YYYY), čuvanje u YYYY-MM-DD
- **Uslovno Renderovanje**: Polja se prikazuju samo ako nisu prazna
- **Responzivnost**: Svi elementi su optimizovani za mobilne telefone

---

## Status: ✅ SPREMNO ZA PRODUKCIJU

Sve izmene su primenjene. Obaveštenja sada imaju adresu i datum sa Google Maps integracijom! 🚀
