import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// Explicitly import auth to ensure the component is registered
// @ts-ignore
import { initializeAuth, getAuth, Auth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

try {
  // 1. Initialize Firebase App
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }

  if (app) {
    // 2. Initialize Auth
    // The "Component auth has not been registered yet" error often happens when
    // initializeAuth is called before the Auth component is registered internally by Firebase.
    // However, importing from 'firebase/auth' should register it.
    
    // Check if auth is already initialized to avoid double-initialization error
    try {
        auth = initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage)
        });
    } catch (e: any) {
        if (e.code === 'auth/already-initialized') {
            auth = getAuth(app);
        } else {
            // If initializeAuth fails with "not registered", it might be a timing issue
            // or a tree-shaking issue. We fallback to getAuth which might auto-register.
            console.error("initializeAuth failed:", e);
            try {
                auth = getAuth(app);
            } catch (e2) {
                console.error("getAuth fallback failed:", e2);
            }
        }
    }

    // 3. Initialize other services
    db = getFirestore(app);
    storage = getStorage(app);
  }

} catch (error) {
  console.error("Firebase initialization failed:", error);
}

export const getAuthService = (): Auth | undefined => auth;
export { app, auth, db, storage };
export default app;
