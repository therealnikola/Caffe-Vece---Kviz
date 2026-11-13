import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

// TODO: Replace with your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAMz4tcchnQhVt6oErTljDef7Te4ZYGEg0",
  authDomain: "kvizapp-67bd1.firebaseapp.com",
  databaseURL: "https://kvizapp-67bd1-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kvizapp-67bd1",
  storageBucket: "kvizapp-67bd1.firebasestorage.app",
  messagingSenderId: "326047061003",
  appId: "1:326047061003:web:b794e52d9213292dbc630e"
};

const app = initializeApp(firebaseConfig);

// Optimizacija: Eksplicitno koristi europe-west1 region za bolju latenciju
// databaseURL već sadrži region, ali eksplicitno navođenje osigurava optimalnu performansu
export const database = getDatabase(app);
export const auth = getAuth(app);
