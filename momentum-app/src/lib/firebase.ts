/* Momentum — Firebase bootstrap. Config from EXPO_PUBLIC_FIREBASE_* (.env). When the API key is unset the app runs in
   local demo mode: `firebaseEnabled === false` and every export below is null. */
/* eslint-disable @typescript-eslint/no-require-imports */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  EmailAuthProvider, browserLocalPersistence, createUserWithEmailAndPassword, getAuth, initializeAuth, linkWithCredential,
  onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut as fbSignOut, type Auth, type Persistence, type User,
} from 'firebase/auth';
import { initializeFirestore, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

const env = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const functionsEmulator = process.env.EXPO_PUBLIC_FUNCTIONS_EMULATOR;

/** true when .env provides a Firebase API key (cloud mode); false = local demo mode */
export const firebaseEnabled = !!(env.apiKey && env.projectId);

export let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let storage: FirebaseStorage | null = null;
export let functions: Functions | null = null;

if (firebaseEnabled) {
  const existing = getApps().length > 0;
  app = existing ? getApp() : initializeApp(env as Record<string, string>);
  if (existing) {
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    let persistence: Persistence;
    if (Platform.OS === 'web') persistence = browserLocalPersistence;
    else {
      // RN build of firebase/auth exports getReactNativePersistence (not in the default TS types)
      const { getReactNativePersistence } = require('firebase/auth') as { getReactNativePersistence: (s: typeof AsyncStorage) => Persistence };
      persistence = getReactNativePersistence(AsyncStorage);
    }
    auth = initializeAuth(app, { persistence });
    db = initializeFirestore(app, Platform.OS === 'web' ? { ignoreUndefinedProperties: true } : { ignoreUndefinedProperties: true, experimentalForceLongPolling: true });
  }
  storage = getStorage(app);
  functions = getFunctions(app, 'us-central1');
  if (functionsEmulator) {
    const [host, port] = functionsEmulator.split(':');
    try { connectFunctionsEmulator(functions, host, +(port || 5001)); } catch { /* already connected */ }
  }
}

/** Resolves with the signed-in user, signing in anonymously on first launch. null in demo mode. */
let signInPromise: Promise<User | null> | null = null;
export function ensureSignedIn(): Promise<User | null> {
  if (!auth) return Promise.resolve(null);
  if (signInPromise) return signInPromise;
  const a = auth;
  signInPromise = new Promise<User | null>((resolve, reject) => {
    const unsub = onAuthStateChanged(a, async u => {
      unsub();
      if (u) { resolve(u); return; }
      try { resolve((await signInAnonymously(a)).user); } catch (e) { signInPromise = null; reject(e); }
    }, e => { signInPromise = null; reject(e); });
  });
  return signInPromise;
}

/** Listen to auth changes (null user in demo mode). Returns unsubscribe. */
export function onUser(fn: (u: User | null) => void): () => void {
  if (!auth) { fn(null); return () => {}; }
  return onAuthStateChanged(auth, fn);
}
export const currentUser = (): User | null => auth?.currentUser ?? null;

const AUTH_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'That email already has an account. Sign in with it instead.',
  'auth/credential-already-in-use': 'That email already has an account. Sign in with it instead.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/weak-password': 'Use at least 6 characters for your password.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account uses that email.',
  'auth/network-request-failed': 'No connection. Try again when you’re online.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/operation-not-allowed': 'Email sign-in isn’t enabled for this Firebase project yet.',
};
export const authErrorMessage = (e: unknown) => AUTH_ERRORS[(e as { code?: string })?.code || ''] || 'Something went wrong. Try again.';

/** "Secure your account": link the anonymous user to email/password (keeps uid + data). */
export async function linkEmail(email: string, password: string): Promise<User> {
  if (!auth) throw Object.assign(new Error('Cloud sync is not configured.'), { code: 'not-configured' });
  const u = auth.currentUser || (await ensureSignedIn());
  const cred = EmailAuthProvider.credential(email.trim(), password);
  if (u && u.isAnonymous) return (await linkWithCredential(u, cred)).user;
  return (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
}
/** Sign in to an existing account on a new device (replaces the anonymous user; its unsynced data stays local only). */
export async function signInEmail(email: string, password: string): Promise<User> {
  if (!auth) throw Object.assign(new Error('Cloud sync is not configured.'), { code: 'not-configured' });
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}
export async function signOut(): Promise<void> { if (auth) { await fbSignOut(auth); signInPromise = null; } }
