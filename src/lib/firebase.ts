import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAeQ1HK7-TMua64Pe9oF8rtJ81E77jwNQg",
  authDomain: "smart-study-6fee3.firebaseapp.com",
  projectId: "smart-study-6fee3",
  storageBucket: "smart-study-6fee3.firebasestorage.app",
  messagingSenderId: "260568166093",
  appId: "1:260568166093:web:3e3c906cc354633d4f8384"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let db: ReturnType<typeof getFirestore>;

if (typeof window !== "undefined") {
  // Enable "Beast Mode" local caching for browser clients
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} else {
  db = getFirestore(app);
}

const storage = getStorage(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
// We need this scope to create and manage backup files in Google Drive
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

export { app, db, storage, auth, googleProvider };
