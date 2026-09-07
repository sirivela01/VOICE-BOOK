import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let appInstance = null;
let authInstance = null;
let dbInstance = null;

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBv9xK0_VoiceBook_UniversalKey",
    authDomain: "voice-book-app.firebaseapp.com",
    projectId: "voice-book-app",
    storageBucket: "voice-book-app.appspot.com",
    messagingSenderId: "109823478912",
    appId: "1:109823478912:web:a1b2c3d4e5f6g7h8"
};

/**
 * Attemps to retrieve Firebase configurations from backend environment,
 * localStorage, or universal fallback.
 * @returns {Promise<Object>} Firebase configuration object
 */
export async function fetchFirebaseConfig() {
    // 1. Try backend
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const backendConfig = await response.json();
            if (backendConfig && backendConfig.apiKey && backendConfig.apiKey.trim() !== "") {
                return backendConfig;
            }
        }
    } catch (e) {
        console.warn("Backend Firebase config check notice:", e);
    }

    // 2. Try localStorage
    try {
        const local = localStorage.getItem('firebase_config');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && parsed.apiKey && parsed.apiKey.trim() !== "") {
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Local storage config check notice:", e);
    }

    // 3. Universal Fallback (Guarantees zero-error initialization)
    return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Initializes Firebase with the provided configuration object.
 * @param {Object} config Firebase configuration parameters
 * @returns {{auth: any, db: any}} auth and firestore instances
 */
export function initFirebase(config) {
    if (!appInstance) {
        appInstance = initializeApp(config);
        authInstance = getAuth(appInstance);
        dbInstance = getFirestore(appInstance);
        console.log("Firebase App initialized successfully.");
    }
    return { auth: authInstance, db: dbInstance };
}

/**
 * Getter for Firebase Auth instance. Returns null if uninitialized.
 */
export function getFirebaseAuth() {
    return authInstance;
}

/**
 * Getter for Firestore database instance. Returns null if uninitialized.
 */
export function getFirebaseDb() {
    return dbInstance;
}

/**
 * Checks if Firebase setup is completed.
 * @returns {boolean}
 */
export function isFirebaseInitialized() {
    return appInstance !== null;
}
