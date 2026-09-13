import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let appInstance = null;
let authInstance = null;
let dbInstance = null;

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBT1_9Pl1nUKLxlTTz8iyLX2lgIsn-m4GY",
    authDomain: "voice-book-5e5f0.firebaseapp.com",
    projectId: "voice-book-5e5f0",
    storageBucket: "voice-book-5e5f0.firebasestorage.app",
    messagingSenderId: "684418710763",
    appId: "1:684418710763:web:5be1ee506cd270634092ae",
    measurementId: "G-G5D1DHPHF2"
};

// Purge any stale legacy localStorage configuration on load
(function cleanupOldConfig() {
    try {
        const local = localStorage.getItem('firebase_config');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && (!parsed.apiKey || parsed.apiKey.includes("AIzaSyDe7EPi"))) {
                localStorage.removeItem('firebase_config');
            }
        }
    } catch (e) {}
})();

/**
 * Attempts to retrieve saved custom Firebase configuration from localStorage or default.
 * @returns {Object} Saved Firebase config or DEFAULT_FIREBASE_CONFIG
 */
export function getSavedFirebaseConfig() {
    try {
        const local = localStorage.getItem('firebase_config');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && parsed.apiKey && parsed.apiKey.trim() !== "" && !parsed.apiKey.includes("AIzaSyDe7EPi")) {
                return parsed;
            }
        }
    } catch (e) {}
    return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Returns active Firebase config.
 */
export async function fetchFirebaseConfig() {
    return getSavedFirebaseConfig();
}

/**
 * Initializes Firebase with the provided configuration object.
 * @param {Object} config Firebase configuration parameters
 * @returns {{auth: any, db: any}} auth and firestore instances
 */
export function initFirebase(config = DEFAULT_FIREBASE_CONFIG) {
    const activeConfig = config || DEFAULT_FIREBASE_CONFIG;
    try {
        if (!appInstance) {
            appInstance = initializeApp(activeConfig);
            authInstance = getAuth(appInstance);
            dbInstance = getFirestore(appInstance);
            console.log("Firebase App initialized successfully.");
        }
        return { auth: authInstance, db: dbInstance };
    } catch (e) {
        console.warn("Firebase initialization notice:", e);
        return { auth: authInstance, db: dbInstance };
    }
}

/**
 * Getter for Firebase Auth instance. Auto-initializes if not ready.
 */
export function getFirebaseAuth() {
    if (!authInstance) {
        initFirebase(getSavedFirebaseConfig());
    }
    return authInstance;
}

/**
 * Getter for Firestore database instance. Auto-initializes if not ready.
 */
export function getFirebaseDb() {
    if (!dbInstance) {
        initFirebase(getSavedFirebaseConfig());
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
 * Checks if a real, valid Firebase API key is loaded.
 * @returns {boolean}
 */
export function isRealFirebaseConfigured() {
    const cfg = getSavedFirebaseConfig();
    return cfg && cfg.apiKey && cfg.apiKey.trim() !== "";
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

// Synchronous auto-initialization at startup
try {
    if (!appInstance) {
        initFirebase(getSavedFirebaseConfig());
    }
} catch (e) {}
