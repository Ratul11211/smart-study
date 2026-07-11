import { useState, useEffect } from 'react';
import { User, signInWithPopup, signInWithCredential, getRedirectResult, signOut as firebaseSignOut, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, googleProvider } from '../lib/firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken) {
            localStorage.setItem('google_access_token', credential.accessToken);
          }
        }
      } catch (error) {
        console.error("Error from redirect result:", error);
      }
    };
    handleRedirect();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    try {
      setLoading(true);
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle({
          scopes: ['https://www.googleapis.com/auth/drive.file']
        });
        if (result.credential?.idToken) {
          const credential = GoogleAuthProvider.credential(result.credential.idToken);
          await signInWithCredential(auth, credential);
          if (result.credential.accessToken) {
            localStorage.setItem('google_access_token', result.credential.accessToken);
          }
        }
      } else {
        const result = await signInWithPopup(auth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          localStorage.setItem('google_access_token', credential.accessToken);
        }
      }
    } catch (error) {
      console.error("Error signing in with Google", error);
      if (Capacitor.isNativePlatform()) {
        alert("Google Login Error: " + JSON.stringify(error) + " | " + String(error));
      }
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('google_access_token');
      await firebaseSignOut(auth);
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      }
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return { user, loading, signIn, signOut };
}
