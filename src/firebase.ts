import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  GoogleAuthProvider,
  OAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  onIdTokenChanged,
  User as FirebaseUser, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  // Note: fetchSignInMethodsForEmail intentionally omitted to prevent account-enumeration attacks
  Auth
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  memoryLocalCache,
  setLogLevel, 
  Firestore 
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';

// Suppress transient connection info messages in console
try {
  setLogLevel('silent');
} catch {}

export { firebaseConfig };

// Toggle switch to decouple active database calls to bypass project locked / billing requirements
export const IS_FIREBASE_ENABLED = import.meta.env.PROD ? true : (import.meta.env.VITE_USE_FIREBASE !== 'false');

export const app = initializeApp(firebaseConfig);

// Initialize Firebase App Check immediately after initializeApp and BEFORE Auth, Firestore, Functions, etc.
if (typeof window !== 'undefined') {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // If an explicit App Check debug token is provided, activate it for non-production environments
  const explicitDebugToken = typeof import.meta.env.VITE_APPCHECK_DEBUG_TOKEN === 'string' 
    ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN.trim() 
    : '';

  if (!import.meta.env.PROD && explicitDebugToken) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = explicitDebugToken;
    console.info("[Firebase] App Check configured with explicit debug token.");
  } else if (!import.meta.env.PROD) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    console.info("[Firebase] App Check debug mode active for preview environment.");
  }

  const siteKey = (firebaseConfig.recaptchaSiteKey || import.meta.env.VITE_RECAPTCHA_SITE_KEY || '').trim();

  if (siteKey) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true
      });
      console.info(`[Firebase] App Check initialized with ReCaptchaEnterpriseProvider (siteKey: ${siteKey.slice(0, 6)}...). Origin domain: ${window.location.hostname}.`);
    } catch (err: any) {
      console.warn("[Firebase] App Check initialization notice:", err?.message || err);
    }
  } else {
    console.info("[Firebase] App Check skipped: no reCAPTCHA site key provided.");
  }
}

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: memoryLocalCache()
  }, firebaseConfig.firestoreDatabaseId);
} catch (err) {
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache()
    }, firebaseConfig.firestoreDatabaseId);
  } catch (e2) {
    try {
      firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } catch (e3) {
      try {
        firestoreInstance = getFirestore(app);
      } catch (e4) {
        console.warn("[Firebase] Firestore initialization fallback warning:", e4);
        firestoreInstance = getFirestore();
      }
    }
  }
}

let authInstance: Auth;
try {
  // Use localStorage & memory persistence explicitly first to avoid IndexedDB 'Database is closing/hidden' errors in iframe/tabs
  authInstance = initializeAuth(app, {
    persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence]
  });
} catch (e) {
  try {
    authInstance = getAuth(app);
  } catch (err) {
    console.error("Firebase Auth fallback critical error:", err);
    authInstance = getAuth();
  }
}

export const db = firestoreInstance;
export const auth = authInstance;

let fnInstance: Functions;
if (typeof window !== 'undefined') {
  fnInstance = getFunctions(app, `${window.location.origin}/api/functions`);
} else {
  fnInstance = getFunctions(app, 'europe-west1');
}
export const functionsInstance: Functions = fnInstance;
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');

export { 
  GoogleAuthProvider, 
  OAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  onIdTokenChanged,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  httpsCallable
};
export type { FirebaseUser, Functions, ConfirmationResult };

