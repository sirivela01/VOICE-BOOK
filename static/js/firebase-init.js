import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let appInstance = null;
let authInstance = null;
let dbInstance = null;

const EMPTY_FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

/**
 * Attempts to retrieve saved custom Firebase configuration from localStorage.
 * @returns {Object|null} Saved Firebase config or null
 */
export function getSavedFirebaseConfig() {
    try {
        const local = localStorage.getItem('firebase_config');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && parsed.apiKey && parsed.apiKey.trim() !== "") {
                return parsed;
            }
        }
    } catch (e) {}
    return null;
}

/**
 * Returns custom saved Firebase config or empty default.
 */
export async function fetchFirebaseConfig() {
    const saved = getSavedFirebaseConfig();
    return saved || EMPTY_FIREBASE_CONFIG;
}

/**
 * Initializes Firebase with the provided configuration object.
 * @param {Object} config Firebase configuration parameters
 * @returns {{auth: any, db: any}} auth and firestore instances
 */
export function initFirebase(config) {
    if (!config || !config.apiKey || config.apiKey.trim() === "") {
        return { auth: null, db: null };
    }
    try {
        if (!appInstance) {
            appInstance = initializeApp(config);
            authInstance = getAuth(appInstance);
            dbInstance = getFirestore(appInstance);
            console.log("Firebase App initialized successfully with custom configuration.");
        }
        return { auth: authInstance, db: dbInstance };
    } catch (e) {
        console.warn("Firebase initialization warning:", e);
        return { auth: null, db: null };
    }
}

/**
 * Getter for Firebase Auth instance. Auto-initializes if custom config is saved.
 */
export function getFirebaseAuth() {
    if (!authInstance) {
        const saved = getSavedFirebaseConfig();
        if (saved) {
            initFirebase(saved);
        }
    }
    return authInstance;
}

/**
 * Getter for Firestore database instance. Auto-initializes if custom config is saved.
 */
export function getFirebaseDb() {
    if (!dbInstance) {
        const saved = getSavedFirebaseConfig();
        if (saved) {
            initFirebase(saved);
        }
    }
    return dbInstance;
}

/**
 * Checks if Firebase setup is completed.
 * @returns {boolean}
 */
export function isFirebaseInitialized() {
    return appInstance !== null;
}

/**
 * Checks if a real, valid user-configured Firebase API key is loaded.
 * @returns {boolean}
 */
export function isRealFirebaseConfigured() {
    const saved = getSavedFirebaseConfig();
    return saved !== null && saved.apiKey && saved.apiKey.trim() !== "";
}

/**
 * Clears saved local Firebase configuration.
 */
export function clearFirebaseConfig() {
    localStorage.removeItem('firebase_config');
    appInstance = null;
    authInstance = null;
    dbInstance = null;
}

// Auto-initialize if user already saved custom config in localStorage
try {
    const saved = getSavedFirebaseConfig();
    if (saved) {
        initFirebase(saved);
    }
} catch (e) {}
