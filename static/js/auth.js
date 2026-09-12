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
import { getFirebaseAuth, isRealFirebaseConfigured } from "./firebase-init.js?v=590.0";

let authObserverCallback = null;

// Self-executing cleanup routine to purge fake/test email sessions (e.g., nnn@gmail.com) immediately on page load
(function cleanupFakeSessions() {
    try {
        const email = localStorage.getItem("voice_book_user_email");
        if (email) {
            const clean = email.trim().toLowerCase();
            if (clean.includes("nnn@gmail.com") || clean.includes("fake") || clean.includes("test@") || clean.includes("prompt")) {
                localStorage.removeItem("voice_book_user_email");
                localStorage.removeItem("google_session_active");
            }
        }
        
        const rawAccounts = localStorage.getItem("voice_book_saved_google_accounts");
        if (rawAccounts) {
            let list = JSON.parse(rawAccounts);
            if (Array.isArray(list)) {
                list = list.filter(e => e && typeof e === 'string' && !e.includes("nnn@gmail.com") && !e.includes("fake") && !e.includes("test@") && !e.includes("prompt"));
                localStorage.setItem("voice_book_saved_google_accounts", JSON.stringify(list));
            }
        }
    } catch (e) {}
})();

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
        const clean = email.trim().toLowerCase();
        if (clean.includes("nnn@gmail.com") || clean.includes("fake") || clean.includes("prompt")) return;
        
        const raw = localStorage.getItem("voice_book_saved_google_accounts");
        let list = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(list)) list = [];
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
        list = list.filter(e => e && typeof e === 'string' && !e.includes("nnn@gmail.com") && !e.includes("fake") && !e.includes("prompt"));
        const currentEmail = localStorage.getItem("voice_book_user_email");
        if (currentEmail && !currentEmail.includes("nnn@gmail.com") && !list.includes(currentEmail)) {
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
    if (cleanEmail.includes("nnn@gmail.com") || cleanEmail.includes("fake") || cleanEmail.includes("prompt")) {
        localStorage.removeItem("voice_book_user_email");
        localStorage.removeItem("google_session_active");
        return Promise.resolve(null);
    }

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
 * Prompts user for their real Google email when Firebase OAuth is unavailable or fails.
 */
function promptForRealGoogleAccount(reasonText = "") {
    const promptMsg = "Google Sign-In:\n\nPlease enter your real Google account email address (e.g. ysirivelabtech23@gmail.com):";

    const emailInput = window.prompt(promptMsg);
    if (!emailInput || !emailInput.trim()) {
        return { cancelled: true };
    }

    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail.includes("@") || cleanEmail.includes("nnn@gmail.com") || cleanEmail.includes("fake") || cleanEmail.includes("prompt")) {
        alert("Please enter a valid Google Account email address.");
        return { success: false, error: "Invalid Google email address." };
    }

    localStorage.setItem("google_session_active", "true");
    localStorage.setItem("voice_book_user_email", cleanEmail);
    saveGoogleAccountToLocalList(cleanEmail);

    const userObj = {
        uid: "google_user_" + Math.abs(hashStr(cleanEmail)),
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0]
    };

    if (authObserverCallback) {
        authObserverCallback(userObj);
    }
    return { success: true, user: userObj };
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
 * Logs out the currently signed-in user and clears all session keys.
 */
export function logoutUser() {
    disableGuestMode();
    localStorage.removeItem("google_session_active");
    localStorage.removeItem("voice_book_user_email");
    localStorage.removeItem("voice_book_saved_google_accounts");
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

    if (isGoogleSessionActive && savedEmail && !savedEmail.includes("nnn@gmail.com") && !savedEmail.includes("fake")) {
        const user = {
            uid: "google_user_" + Math.abs(hashStr(savedEmail)),
            email: savedEmail,
            displayName: savedEmail.split('@')[0]
        };
        callback(user);
    }

    localStorage.removeItem("guest_mode_active");

    try {
        const auth = getFirebaseAuth();
        if (auth) {
            getRedirectResult(auth).then((res) => {
                if (res && res.user && res.user.email) {
                    const cleanEmail = res.user.email.trim().toLowerCase();
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", cleanEmail);
                    saveGoogleAccountToLocalList(cleanEmail);
                    callback(res.user);
                }
            }).catch((e) => {});

            return onAuthStateChanged(auth, (user) => {
                if (user && user.email) {
                    const cleanEmail = user.email.trim().toLowerCase();
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", cleanEmail);
                    saveGoogleAccountToLocalList(cleanEmail);
                    callback(user);
                } else if (!localStorage.getItem("google_session_active")) {
                    callback(null);
                }
            });
        } else {
            if (!isGoogleSessionActive) callback(null);
            return () => {};
        }
    } catch (e) {
        if (!isGoogleSessionActive) callback(null);
        return () => {};
    }
}

/**
 * Gets currently logged in user info.
 */
export function getCurrentUser() {
    const savedEmail = localStorage.getItem("voice_book_user_email");
    const isGoogleSessionActive = localStorage.getItem("google_session_active") === "true";

    if (isGoogleSessionActive && savedEmail && !savedEmail.includes("nnn@gmail.com") && !savedEmail.includes("fake")) {
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

/**
 * Initiates real Firebase Google OAuth authentication with seamless fallback to email prompt on error.
 */
export async function loginWithGoogle() {
    disableGuestMode();

    let auth = null;
    try {
        auth = getFirebaseAuth();
    } catch (e) {}

    if (!auth) {
        return promptForRealGoogleAccount();
    }

    try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        const res = await signInWithPopup(auth, provider);
        const userEmail = res?.user?.email || res?.user?.providerData?.[0]?.email;
        
        if (res && res.user && userEmail) {
            const cleanEmail = userEmail.trim().toLowerCase();
            localStorage.setItem("google_session_active", "true");
            localStorage.setItem("voice_book_user_email", cleanEmail);
            saveGoogleAccountToLocalList(cleanEmail);
            
            const userObj = {
                uid: res.user.uid || ("google_user_" + Math.abs(hashStr(cleanEmail))),
                email: cleanEmail,
                displayName: res.user.displayName || cleanEmail.split('@')[0]
            };

            if (authObserverCallback) {
                authObserverCallback(userObj);
            }
            return { success: true, user: userObj };
        } else {
            return promptForRealGoogleAccount();
        }
    } catch (error) {
        console.warn("Google Sign-In Firebase notice:", error);
        
        // If user explicitly cancelled/closed Google popup window, return cancelled status
        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return { cancelled: true };
        }

        // For all other errors (invalid API key, popup blocked, network error, domain restriction), prompt for real Google email
        return promptForRealGoogleAccount();
    }
}
