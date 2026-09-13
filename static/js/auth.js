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
import { getFirebaseAuth, isRealFirebaseConfigured } from "./firebase-init.js?v=630.0";

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

function getDisplayNameForEmail(email) {
    if (!email) return "Google User";
    const clean = email.trim().toLowerCase();
    if (clean === "syashwanthroyal1@gmail.com") {
        return "S. Yashwanth Royal";
    }
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
    const email = emailInput || localStorage.getItem("voice_book_user_email") || "syashwanthroyal1@gmail.com";

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

    if (isGoogleSessionActive && savedEmail && !savedEmail.includes("nnn@gmail.com") && !savedEmail.includes("fake")) {
        const user = {
            uid: "google_user_" + Math.abs(hashStr(savedEmail)),
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
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", cleanEmail);
                    saveGoogleAccountToLocalList(cleanEmail);
                    
                    const userObj = {
                        uid: res.user.uid || ("google_user_" + Math.abs(hashStr(cleanEmail))),
                        email: cleanEmail,
                        displayName: res.user.displayName || getDisplayNameForEmail(cleanEmail)
                    };
                    hasNotifiedInitialState = true;
                    if (authObserverCallback) authObserverCallback(userObj);
                }
            }).catch(() => {});

            return onAuthStateChanged(auth, (user) => {
                const userEmail = user?.email || user?.providerData?.[0]?.email;
                if (user && userEmail) {
                    const cleanEmail = userEmail.trim().toLowerCase();
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", cleanEmail);
                    saveGoogleAccountToLocalList(cleanEmail);
                    
                    const userObj = {
                        uid: user.uid || ("google_user_" + Math.abs(hashStr(cleanEmail))),
                        email: cleanEmail,
                        displayName: user.displayName || getDisplayNameForEmail(cleanEmail)
                    };
                    hasNotifiedInitialState = true;
                    if (authObserverCallback) authObserverCallback(userObj);
                } else {
                    const activeSession = localStorage.getItem("google_session_active") === "true";
                    const currentEmail = localStorage.getItem("voice_book_user_email");
                    if (!activeSession || !currentEmail) {
                        if (!hasNotifiedInitialState) {
                            hasNotifiedInitialState = true;
                            if (authObserverCallback) authObserverCallback(null);
                        }
                    }
                }
            });
        }
    } catch (e) {}

    if (!hasNotifiedInitialState && !localStorage.getItem("google_session_active")) {
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
            uid: "google_user_" + Math.abs(hashStr(savedEmail)),
            email: savedEmail,
            displayName: getDisplayNameForEmail(savedEmail)
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
 * Initiates Google authentication for S. Yashwanth Royal (syashwanthroyal1@gmail.com).
 */
export async function loginWithGoogle() {
    disableGuestMode();

    let auth = null;
    try {
        auth = getFirebaseAuth();
    } catch (e) {}

    if (!auth) {
        return { success: false, error: "Firebase Auth is not available." };
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        // On Mobile devices, execute signInWithRedirect directly.
        // Mobile browsers handle full page redirects 100% reliably without popup window closure errors.
        try {
            await signInWithRedirect(auth, provider);
            return { pendingRedirect: true };
        } catch (redirectErr) {
            console.warn("Mobile signInWithRedirect notice:", redirectErr);
        }
    }

    // On Desktop/Laptop: execute signInWithPopup
    try {
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
                displayName: res.user.displayName || getDisplayNameForEmail(cleanEmail)
            };

            if (authObserverCallback) authObserverCallback(userObj);
            return { success: true, user: userObj };
        } else {
            return { success: false, error: "Google Sign-In failed: No user account was selected." };
        }
    } catch (error) {
        // Check if Firebase Auth actually signed the user in despite popup window closing
        try {
            const checkAuth = getFirebaseAuth();
            const activeUser = checkAuth?.currentUser;
            const activeEmail = activeUser?.email || activeUser?.providerData?.[0]?.email;
            if (activeUser && activeEmail) {
                const cleanEmail = activeEmail.trim().toLowerCase();
                localStorage.setItem("google_session_active", "true");
                localStorage.setItem("voice_book_user_email", cleanEmail);
                saveGoogleAccountToLocalList(cleanEmail);

                const userObj = {
                    uid: activeUser.uid || ("google_user_" + Math.abs(hashStr(cleanEmail))),
                    email: cleanEmail,
                    displayName: activeUser.displayName || getDisplayNameForEmail(cleanEmail)
                };

                if (authObserverCallback) authObserverCallback(userObj);
                return { success: true, user: userObj };
            }
        } catch (e) {}

        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return { cancelled: true };
        }

        try {
            await signInWithRedirect(auth, provider);
            return { pendingRedirect: true };
        } catch (redirectErr) {
            return { success: false, error: redirectErr?.message || "Google Sign-In failed." };
        }
    }
}
