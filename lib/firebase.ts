import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, connectAuthEmulator, setPersistence } from 'firebase/auth';
import { CACHE_SIZE_UNLIMITED, connectFirestoreEmulator, initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
// Local testing only: point the app at the Firebase Emulator Suite (e.g. "127.0.0.1").
const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST?.trim();
export const configured = Boolean(config.apiKey && config.projectId && config.appId);
export const app = configured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
// Optional fields (e.g. an empty note amount) are skipped instead of rejecting the whole write.
// The device keeps a full copy of the user's data (lib/sync.ts), so the cache must never evict documents.
export const db = app ? (() => { try { return initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }) }); } catch { return getFirestore(app); } })() : null;
export const storage = app ? getStorage(app) : null;
if (emulatorHost && typeof window !== 'undefined' && auth && db && storage && !(globalThis as { __dompetEmulator?: boolean }).__dompetEmulator) {
  (globalThis as { __dompetEmulator?: boolean }).__dompetEmulator = true;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8080);
  connectStorageEmulator(storage, emulatorHost, 9199);
}
export async function rememberSession() { if (auth) await setPersistence(auth, browserLocalPersistence); }
