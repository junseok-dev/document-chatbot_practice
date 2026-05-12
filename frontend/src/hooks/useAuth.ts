import { useState } from 'react';

export interface GoogleUser {
  sub: string;
  name: string;
  email: string;
  picture: string;
}

const STORAGE_KEY = 'googleUser';

const decodeJwt = (token: string): GoogleUser => {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
};

export const getStoredGoogleUser = (): GoogleUser | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export const useAuth = () => {
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(getStoredGoogleUser);

  const loginWithGoogle = (credential: string) => {
    const user = decodeJwt(credential);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    setGoogleUser(user);
    window.location.reload();
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setGoogleUser(null);
    window.location.reload();
  };

  return { googleUser, loginWithGoogle, logout };
};
