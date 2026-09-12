import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { getFirebaseAuth } from "./firebase-init.js?v=40.0";

let authObserverCallback = null;

export function enableGuestMode() {
    localStorage.removeItem("guest_mode_active");
}

export function isGuestMode() {
    return false;
}

export function disableGuestMode() {
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
    const email = emailInput || localStorage.getItem("voice_book_user_email");
    if (!email) return Promise.resolve(null);

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
    localStorage.removeItem("voice_book_user_email");
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

    const savedEmail = localStorage.getItem("voice_book_user_email");
    const isGoogleSessionActive = localStorage.getItem("google_session_active") === "true";

    if (isGoogleSessionActive && savedEmail) {
        const user = {
            uid: "google_user_" + Math.abs(hashStr(savedEmail)),
            email: savedEmail,
            displayName: savedEmail.split('@')[0]
        };
        callback(user);
        return () => {};
    }

    localStorage.removeItem("guest_mode_active");

    try {
        const auth = getFirebaseAuth();
        if (auth) {
            return onAuthStateChanged(auth, (user) => {
                if (user && user.email) {
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", user.email);
                    callback(user);
                } else {
                    localStorage.removeItem("google_session_active");
                    localStorage.removeItem("voice_book_user_email");
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
    const savedEmail = localStorage.getItem("voice_book_user_email");
    const isGoogleSessionActive = localStorage.getItem("google_session_active") === "true";

    if (isGoogleSessionActive && savedEmail) {
        return {
            uid: "google_user_" + Math.abs(hashStr(savedEmail)),
            email: savedEmail,
            displayName: savedEmail.split('@')[0]
        };
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
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    if (auth) {
        try {
            const res = await signInWithPopup(auth, provider);
            if (res && res.user && res.user.email) {
                localStorage.setItem("google_session_active", "true");
                localStorage.setItem("voice_book_user_email", res.user.email);
                if (authObserverCallback) {
                    authObserverCallback(res.user);
                }
                return res;
            }
        } catch (error) {
            console.warn("Google Auth notice (Popup attempt failed, switching to email fallback):", error);
            if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
                return null;
            }
        }
    }

    // Fallback if popup authentication fails, popup is blocked, or API key is unconfigured:
    const inputEmail = window.prompt("Sign in with Google:\n\nPlease enter your Google email address:");
    if (!inputEmail || !inputEmail.trim()) {
        return null;
    }
    const cleanEmail = inputEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        alert("Please enter a valid Google email address.");
        return null;
    }

    return autoHealGoogleUserSession(cleanEmail);
}
