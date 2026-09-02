import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase-init.js?v=13.0";

let authObserverCallback = null;
let isGuestActive = localStorage.getItem("guest_mode_active") === "true";

export function enableGuestMode() {
    isGuestActive = true;
    localStorage.setItem("guest_mode_active", "true");
    if (authObserverCallback) {
        authObserverCallback({ uid: "guest_user", email: "Guest User" });
    }
}

export function isGuestMode() {
    return isGuestActive;
}

export function disableGuestMode() {
    isGuestActive = false;
    localStorage.removeItem("guest_mode_active");
}

/**
 * Signs in an existing user using email/password.
 */
export function loginUser(email, password) {
    disableGuestMode();
    const auth = getFirebaseAuth();
    return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Registers a new user with email and password.
 */
export function registerUser(email, password) {
    disableGuestMode();
    const auth = getFirebaseAuth();
    return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Logs out the currently signed-in user.
 */
export function logoutUser() {
    disableGuestMode();
    try {
        const auth = getFirebaseAuth();
        return signOut(auth);
    } catch (e) {
        if (authObserverCallback) authObserverCallback(null);
        return Promise.resolve();
    }
}

/**
 * Registers a listener that fires whenever user auth state changes.
 */
export function observeAuthState(callback) {
    authObserverCallback = callback;
    if (isGuestActive) {
        callback({ uid: "guest_user", email: "Guest User" });
        return () => {};
    }
    try {
        const auth = getFirebaseAuth();
        return onAuthStateChanged(auth, callback);
    } catch (e) {
        // Fallback if Firebase auth is not initialized
        callback(null);
        return () => {};
    }
}

/**
 * Gets currently logged in user info.
 */
export function getCurrentUser() {
    if (isGuestActive) {
        return { uid: "guest_user", email: "Guest User" };
    }
    try {
        const auth = getFirebaseAuth();
        return auth.currentUser;
    } catch (e) {
        return null;
    }
}

export async function loginWithGoogle() {
    disableGuestMode();
    const auth = getFirebaseAuth();
    if (!auth) throw new Error("Firebase Auth is not initialized.");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        return await signInWithPopup(auth, provider);
    } catch (error) {
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return null;
        }
        throw error;
    }
}
