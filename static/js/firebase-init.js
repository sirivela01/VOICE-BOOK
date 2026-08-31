import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let appInstance = null;
let authInstance = null;
let dbInstance = null;

/**
 * Attemps to retrieve Firebase configurations from backend environment
 * or fallback to localStorage.
 * @returns {Promise<Object|null>} Firebase configuration object or null if unconfigured
 */
export async function fetchFirebaseConfig() {
    // 1. Try backend
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const backendConfig = await response.json();
            if (backendConfig && backendConfig.apiKey) {
                return backendConfig;
            }
        }
    } catch (e) {
        console.warn("Backend Firebase config check failed:", e);
    }

    // 2. Try localStorage
    try {
        const local = localStorage.getItem('firebase_config');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && parsed.apiKey) {
                return parsed;
            }
        }
    } catch (e) {
        console.warn("Local storage config check failed:", e);
    }

    return null;
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
 * Getter for Firebase Auth instance. Throws error if not initialized.
 */
export function getFirebaseAuth() {
    if (!authInstance) {
        throw new Error("Firebase Auth is not initialized yet. Configure Firebase first.");
    }
    return authInstance;
}

/**
 * Getter for Firestore database instance. Throws error if not initialized.
 */
export function getFirebaseDb() {
    if (!dbInstance) {
        throw new Error("Firebase Firestore is not initialized yet. Configure Firebase first.");
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
