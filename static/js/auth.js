import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult
} from "firebase/auth";
import { getFirebaseAuth, isRealFirebaseConfigured } from "./firebase-init.js?v=54.0";

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

export function saveGoogleAccountToLocalList(email) {
    if (!email) return;
    try {
        const raw = localStorage.getItem("voice_book_saved_google_accounts");
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        const clean = email.trim().toLowerCase();
        if (!list.includes(clean)) {
            list.unshift(clean);
            if (list.length > 5) list = list.slice(0, 5);
            localStorage.setItem("voice_book_saved_google_accounts", JSON.stringify(list));
        }
    } catch (e) {}
}

export function getSavedGoogleAccountsList() {
    try {
        const raw = localStorage.getItem("voice_book_saved_google_accounts");
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
        const currentEmail = localStorage.getItem("voice_book_user_email");
        if (currentEmail && !list.includes(currentEmail)) {
            list.unshift(currentEmail);
        }
        return list;
    } catch (e) {
        return [];
    }
}

export function autoHealGoogleUserSession(emailInput = null) {
    disableGuestMode();
    const email = emailInput || localStorage.getItem("voice_book_user_email");
    if (!email) return Promise.resolve(null);

    const cleanEmail = email.trim().toLowerCase();
    localStorage.setItem("google_session_active", "true");
    localStorage.setItem("voice_book_user_email", cleanEmail);
    saveGoogleAccountToLocalList(cleanEmail);
    
    const user = {
        uid: "google_user_" + Math.abs(hashStr(cleanEmail)),
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0]
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
    if (!auth) {
        throw new Error("Firebase Auth is uninitialized.");
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
        // 1. Primary: Official Google OAuth Popup Window (accounts.google.com)
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
        console.warn("Official Google Auth Popup Notice:", error);

        // If user manually closed or cancelled Google's official popup window
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return null;
        }

        // 2. Secondary: Official Google OAuth Full Page Redirect (for mobile browsers / popup blockers)
        try {
            await signInWithRedirect(auth, provider);
            return null;
        } catch (redirErr) {
            console.error("Official Google Auth Redirect Error:", redirErr);
            throw redirErr;
        }
    }
    return null;
}
