# Real-time Quiz App

A modern, real-time quiz application built with React, Tailwind CSS, and Firebase Realtime Database.

## Features

- **Landing Page**: Team registration and admin announcements
- **Admin Panel**: Full game control with authentication
- **Captain View**: Team answer interface
- **TV/Public View**: Live question display and leaderboard

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Firebase:
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Realtime Database
   - Copy your Firebase config to `src/config/firebase.js`

3. Run the development server:
```bash
npm run dev
```

## Firebase Configuration

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Realtime Database** (not Firestore)
3. Go to Project Settings > General > Your apps > Web app
4. Copy your Firebase configuration
5. Update `src/config/firebase.js` with your Firebase credentials:

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com/",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

6. Set up Realtime Database rules (for development, you can use the rules in `firebase-rules.json`):
   - Go to Realtime Database > Rules
   - For production, implement proper authentication rules

## Usage

1. **Admin**: 
   - Password: `admin123`
   - Access `/admin` to manage the quiz
   - Create questions, start timer, view answers, manage teams

2. **Teams**: 
   - Register on landing page with team details
   - Receive a team code after registration
   - Use the team code to access captain view at `/captain/[TEAM_CODE]`
   - Answer questions by clicking the option buttons

3. **TV View**: 
   - Access `/tv` for public display
   - Shows current question, timer, and answers
   - Displays leaderboard at the end

## Features

- ✅ Real-time synchronization across all views
- ✅ 30-second timer for each question
- ✅ Team registration with unique codes
- ✅ Admin announcements system
- ✅ Live answer tracking
- ✅ Automatic scoring system
- ✅ Beautiful dark mode UI with neon accents
- ✅ Responsive design
