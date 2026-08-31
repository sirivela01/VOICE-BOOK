import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase-init.js?v=1.5";

/**
 * Signs in an existing user using email/password.
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<UserCredential>}
 */
export function loginUser(email, password) {
    const auth = getFirebaseAuth();
    return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Registers a new user with email and password.
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<UserCredential>}
 */
export function registerUser(email, password) {
    const auth = getFirebaseAuth();
    return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Logs out the currently signed-in user.
 * @returns {Promise<void>}
 */
export function logoutUser() {
    const auth = getFirebaseAuth();
    return signOut(auth);
}

/**
 * Registers a listener that fires whenever user auth state changes.
 * @param {function(any): void} callback Function to invoke with user details or null
 * @returns {import("firebase/auth").Unsubscribe} Unsubscribe function
 */
export function observeAuthState(callback) {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, callback);
}

/**
 * Gets currently logged in user info.
 * @returns {Object|null} User object
 */
export function getCurrentUser() {
    try {
        const auth = getFirebaseAuth();
        return auth.currentUser;
    } catch (e) {
        return null;
    }
}

/**
 * Initiates standard Google login popup flow.
 * @returns {Promise<UserCredential>}
 */
export function loginWithGoogle() {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
}
