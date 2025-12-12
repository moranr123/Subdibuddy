import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAcWeoaUkuWyODs2dLwP9wblhGm7uBg6HA",
  authDomain: "subsibuddy-88108.firebaseapp.com",
  projectId: "subsibuddy-88108",
  storageBucket: "subsibuddy-88108.firebasestorage.app",
  messagingSenderId: "9632330814",
  appId: "1:9632330814:web:a40032aa07f294eb0dcd6f",
  measurementId: "G-YTVMYLV5J2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;

