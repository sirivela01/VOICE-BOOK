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
import { getFirebaseAuth, isRealFirebaseConfigured } from "./firebase-init.js?v=950.0";

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

function getCanonicalUid(email) {
    if (!email) return "guest_user";
    const cleanEmail = email.trim().toLowerCase();
    return "user_" + cleanEmail.replace(/[^a-z0-9]/g, "_");
}

function getDisplayNameForEmail(email) {
    if (!email) return "Google User";
    const clean = email.trim().toLowerCase();
    const parts = clean.split('@')[0].split('.');
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
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
        uid: getCanonicalUid(cleanEmail),
        email: cleanEmail,
        displayName: getDisplayNameForEmail(cleanEmail)
    };

    if (authObserverCallback) {
        authObserverCallback(user);
    }
    return Promise.resolve({ success: true, user: user });
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
    localStorage.removeItem("google_login_pending");
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

    localStorage.removeItem("guest_mode_active");

    let hasNotifiedInitialState = false;

    // 1. If active Google session exists in localStorage, transition directly to bookshelf
    if (isGoogleSessionActive && savedEmail && !savedEmail.includes("nnn@gmail.com") && !savedEmail.includes("fake")) {
        const user = {
            uid: getCanonicalUid(savedEmail),
            email: savedEmail,
            displayName: getDisplayNameForEmail(savedEmail)
        };
        hasNotifiedInitialState = true;
        callback(user);
    }

    try {
        const auth = getFirebaseAuth();
        if (auth) {
            getRedirectResult(auth).then((res) => {
                const userEmail = res?.user?.email || res?.user?.providerData?.[0]?.email;
                if (res && res.user && userEmail) {
                    const cleanEmail = userEmail.trim().toLowerCase();
                    localStorage.removeItem("google_login_pending");
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", cleanEmail);
                    saveGoogleAccountToLocalList(cleanEmail);
                    
                    const userObj = {
                        uid: getCanonicalUid(cleanEmail),
                        email: cleanEmail,
                        displayName: res.user.displayName || getDisplayNameForEmail(cleanEmail)
                    };
                    hasNotifiedInitialState = true;
                    if (authObserverCallback) authObserverCallback(userObj);
                }
            }).catch((err) => {
                console.warn("getRedirectResult notice:", err);
            });

            return onAuthStateChanged(auth, (user) => {
                const userEmail = user?.email || user?.providerData?.[0]?.email;
                if (user && userEmail) {
                    const cleanEmail = userEmail.trim().toLowerCase();
                    localStorage.removeItem("google_login_pending");
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", cleanEmail);
                    saveGoogleAccountToLocalList(cleanEmail);
                    
                    const userObj = {
                        uid: getCanonicalUid(cleanEmail),
                        email: cleanEmail,
                        displayName: user.displayName || getDisplayNameForEmail(cleanEmail)
                    };
                    hasNotifiedInitialState = true;
                    if (authObserverCallback) authObserverCallback(userObj);
                } else {
                    const activeSession = localStorage.getItem("google_session_active") === "true";
                    const currentEmail = localStorage.getItem("voice_book_user_email");
                    const isPending = localStorage.getItem("google_login_pending") === "true";

                    if (!activeSession || !currentEmail) {
                        if (isPending && currentEmail) {
                            localStorage.removeItem("google_login_pending");
                            autoHealGoogleUserSession(currentEmail);
                        } else if (!hasNotifiedInitialState && !isPending) {
                            hasNotifiedInitialState = true;
                            if (authObserverCallback) authObserverCallback(null);
                        }
                    }
                }
            });
        }
    } catch (e) {}

    if (!hasNotifiedInitialState && !localStorage.getItem("google_session_active") && !localStorage.getItem("google_login_pending")) {
        callback(null);
    }

    return () => {};
}

/**
 * Gets currently logged in user info.
 */
export function getCurrentUser() {
    const savedEmail = localStorage.getItem("voice_book_user_email");
    const isGoogleSessionActive = localStorage.getItem("google_session_active") === "true";

    if (isGoogleSessionActive && savedEmail && !savedEmail.includes("nnn@gmail.com") && !savedEmail.includes("fake")) {
        return {
            uid: getCanonicalUid(savedEmail),
            email: savedEmail,
            displayName: getDisplayNameForEmail(savedEmail)
        };
    }

    try {
        const auth = getFirebaseAuth();
        if (auth && auth.currentUser) {
            const email = auth.currentUser.email || auth.currentUser.providerData?.[0]?.email;
            if (email) {
                return {
                    uid: getCanonicalUid(email),
                    email: email.trim().toLowerCase(),
                    displayName: auth.currentUser.displayName || getDisplayNameForEmail(email)
                };
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Initiates Google authentication allowing user to pick any Google account.
 */
export async function loginWithGoogle() {
    disableGuestMode();
    
    // Reset previous session keys before initiating Google account selection
    localStorage.removeItem("google_session_active");
    localStorage.removeItem("voice_book_user_email");
    localStorage.setItem("google_login_pending", "true");

    let auth = null;
    try {
        auth = getFirebaseAuth();
    } catch (e) {}

    if (!auth) {
        localStorage.removeItem("google_login_pending");
        return { success: false, error: "Firebase Auth is not available." };
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        try {
            await signInWithRedirect(auth, provider);
            return { pendingRedirect: true };
        } catch (redirectErr) {
            console.warn("Mobile signInWithRedirect notice:", redirectErr);
        }
    }

    // On Desktop or fallback: try signInWithPopup
    try {
        const res = await signInWithPopup(auth, provider);
        const userEmail = res?.user?.email || res?.user?.providerData?.[0]?.email;
        
        if (res && res.user && userEmail) {
            const cleanEmail = userEmail.trim().toLowerCase();
            localStorage.removeItem("google_login_pending");
            localStorage.setItem("google_session_active", "true");
            localStorage.setItem("voice_book_user_email", cleanEmail);
            saveGoogleAccountToLocalList(cleanEmail);
            
            const userObj = {
                uid: getCanonicalUid(cleanEmail),
                email: cleanEmail,
                displayName: res.user.displayName || getDisplayNameForEmail(cleanEmail)
            };

            if (authObserverCallback) authObserverCallback(userObj);
            return { success: true, user: userObj };
        }
    } catch (error) {
        console.log("signInWithPopup notice:", error?.code || error?.message);
    }

    // Check if Firebase Auth currentUser is already authenticated
    try {
        const checkAuth = getFirebaseAuth();
        const activeUser = checkAuth?.currentUser;
        const activeEmail = activeUser?.email || activeUser?.providerData?.[0]?.email;
        if (activeUser && activeEmail) {
            const cleanEmail = activeEmail.trim().toLowerCase();
            localStorage.removeItem("google_login_pending");
            localStorage.setItem("google_session_active", "true");
            localStorage.setItem("voice_book_user_email", cleanEmail);
            saveGoogleAccountToLocalList(cleanEmail);

            const userObj = {
                uid: getCanonicalUid(cleanEmail),
                email: cleanEmail,
                displayName: activeUser.displayName || getDisplayNameForEmail(cleanEmail)
            };

            if (authObserverCallback) authObserverCallback(userObj);
            return { success: true, user: userObj };
        }
    } catch (e) {}

    // Fallback on mobile: trigger redirect
    try {
        await signInWithRedirect(auth, provider);
        return { pendingRedirect: true };
    } catch (err) {
        localStorage.removeItem("google_login_pending");
        return { success: false, error: err?.message || "Google Sign-In failed." };
    }
}
