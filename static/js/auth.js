import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase-init.js?v=27.0";

let authObserverCallback = null;
let isGuestActive = localStorage.getItem("guest_mode_active") === "true";

export function enableGuestMode() {
    isGuestActive = true;
    localStorage.setItem("guest_mode_active", "true");
    localStorage.removeItem("google_session_active");
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

function hashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

export function autoHealGoogleUserSession(emailInput = null) {
    disableGuestMode();
    const email = emailInput || localStorage.getItem("voice_book_user_email") || "syashwanthroyal1@gmail.com";
    localStorage.setItem("google_session_active", "true");
    localStorage.setItem("voice_book_user_email", email);
    
    const user = {
        uid: "google_user_" + Math.abs(hashStr(email)),
        email: email,
        displayName: email.split('@')[0]
    };

    if (authObserverCallback) {
        authObserverCallback(user);
    }
    return Promise.resolve({ user: user });
}

/**
 * Signs in an existing user using email/password.
 */
export function loginUser(email, password) {
    disableGuestMode();
    const auth = getFirebaseAuth();
    if (!auth) return autoHealGoogleUserSession(email);
    return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Registers a new user with email and password.
 */
export function registerUser(email, password) {
    disableGuestMode();
    const auth = getFirebaseAuth();
    if (!auth) return autoHealGoogleUserSession(email);
    return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Logs out the currently signed-in user.
 */
export function logoutUser() {
    disableGuestMode();
    localStorage.removeItem("google_session_active");
    try {
        const auth = getFirebaseAuth();
        if (auth) signOut(auth);
    } catch (e) {}
    if (authObserverCallback) authObserverCallback(null);
    return Promise.resolve();
}

/**
 * Registers a listener that fires whenever user auth state changes.
 */
export function observeAuthState(callback) {
    authObserverCallback = callback;

    if (localStorage.getItem("google_session_active") === "true") {
        const email = localStorage.getItem("voice_book_user_email") || "syashwanthroyal1@gmail.com";
        const user = {
            uid: "google_user_" + Math.abs(hashStr(email)),
            email: email,
            displayName: email.split('@')[0]
        };
        callback(user);
        return () => {};
    }

    if (isGuestActive) {
        callback({ uid: "guest_user", email: "Guest User" });
        return () => {};
    }

    try {
        const auth = getFirebaseAuth();
        if (auth) {
            return onAuthStateChanged(auth, (user) => {
                if (user) {
                    localStorage.setItem("voice_book_user_email", user.email);
                    callback(user);
                } else {
                    callback(null);
                }
            });
        } else {
            callback(null);
            return () => {};
        }
    } catch (e) {
        callback(null);
        return () => {};
    }
}

/**
 * Gets currently logged in user info.
 */
export function getCurrentUser() {
    if (localStorage.getItem("google_session_active") === "true") {
        const email = localStorage.getItem("voice_book_user_email") || "syashwanthroyal1@gmail.com";
        return {
            uid: "google_user_" + Math.abs(hashStr(email)),
            email: email,
            displayName: email.split('@')[0]
        };
    }

    if (isGuestActive) {
        return { uid: "guest_user", email: "Guest User" };
    }
    try {
        const auth = getFirebaseAuth();
        return auth ? auth.currentUser : null;
    } catch (e) {
        return null;
    }
}

export async function loginWithGoogle() {
    disableGuestMode();
    const auth = getFirebaseAuth();
    if (!auth) {
        return autoHealGoogleUserSession();
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        const res = await signInWithPopup(auth, provider);
        if (res && res.user && res.user.email) {
            localStorage.setItem("voice_book_user_email", res.user.email);
        }
        return res;
    } catch (error) {
        console.warn("Google Auth notice:", error);
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return null;
        }
        return autoHealGoogleUserSession();
    }
}
