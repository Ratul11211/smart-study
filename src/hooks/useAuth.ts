import { useState, useEffect } from 'react';
import { User, signInWithRedirect, getRedirectResult, signOut as firebaseSignOut, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';
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
      await signInWithRedirect(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('google_access_token');
      await firebaseSignOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  return { user, loading, signIn, signOut };
}
