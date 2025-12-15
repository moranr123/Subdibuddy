import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAcWeoaUkuWyODs2dLwP9wblhGm7uBg6HA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "subsibuddy-88108.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "subsibuddy-88108",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "subsibuddy-88108.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "9632330814",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:9632330814:web:a40032aa07f294eb0dcd6f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-YTVMYLV5J2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

