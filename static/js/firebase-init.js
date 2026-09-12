import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

let appInstance = null;
let authInstance = null;
let dbInstance = null;

const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDe7EPi-p6b5gnWFTucVC2Mz-LVJTHiI4",
    authDomain: "voice-book-5e5f0.firebaseapp.com",
    projectId: "voice-book-5e5f0",
    storageBucket: "voice-book-5e5f0.firebasestorage.app",
    messagingSenderId: "684418710763",
    appId: "1:684418710763:web:297972050bcab51a4092ae"
};

/**
 * Attemps to retrieve Firebase configurations from backend environment,
 * localStorage, or universal fallback.
 * @returns {Promise<Object>} Firebase configuration object
 */
export async function fetchFirebaseConfig() {
    // 1. Try localStorage if user saved custom credentials locally
    try {
        const local = localStorage.getItem('firebase_config');
        if (local) {
            const parsed = JSON.parse(local);
            if (parsed && parsed.apiKey && parsed.apiKey.trim() !== "") {
                return parsed;
            }
        }
    } catch (e) {}

    // 2. Return built-in VoiceBook Firebase configuration instantly
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
 * Getter for Firebase Auth instance. Auto-initializes if not ready.
 */
export function getFirebaseAuth() {
    if (!authInstance) {
        initFirebase(DEFAULT_FIREBASE_CONFIG);
    }
    return authInstance;
}

/**
 * Getter for Firestore database instance. Auto-initializes if not ready.
 */
export function getFirebaseDb() {
    if (!dbInstance) {
        initFirebase(DEFAULT_FIREBASE_CONFIG);
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
    if (!appInstance) {
        initFirebase(DEFAULT_FIREBASE_CONFIG);
    }
    const options = appInstance.options;
    if (!options || !options.apiKey) return false;
    if (options.apiKey.includes("UniversalKey") || options.apiKey.trim() === "") return false;
    return true;
}

// Immediate synchronous auto-initialization to guarantee zero delay for Auth
try {
    if (!appInstance) {
        initFirebase(DEFAULT_FIREBASE_CONFIG);
    }
} catch (e) {}

