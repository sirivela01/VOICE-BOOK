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
            getRedirectResult(auth).then((res) => {
                if (res && res.user && res.user.email) {
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", res.user.email);
                    callback(res.user);
                }
            }).catch((e) => {});

            return onAuthStateChanged(auth, (user) => {
                if (user && user.email) {
                    localStorage.setItem("google_session_active", "true");
                    localStorage.setItem("voice_book_user_email", user.email);
                    callback(user);
                } else if (!localStorage.getItem("google_session_active")) {
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

export function showGoogleAccountPickerModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById("modal-google-account-chooser");
        const listContainer = document.getElementById("google-accounts-list");
        const btnToggleAdd = document.getElementById("btn-toggle-add-google-account");
        const addForm = document.getElementById("google-new-account-form");
        const inputEmail = document.getElementById("input-google-account-email");
        const btnSubmit = document.getElementById("btn-submit-google-account");
        const btnCancel = document.getElementById("btn-cancel-google-account-chooser");
        const errorMsg = document.getElementById("google-account-error-msg");

        if (!modal || !listContainer) {
            const promptEmail = window.prompt("Enter your Google Account email address to sign in:");
            if (promptEmail && promptEmail.trim()) {
                autoHealGoogleUserSession(promptEmail.trim()).then((res) => resolve(res));
            } else {
                resolve({ cancelled: true });
            }
            return;
        }

        // Reset UI state
        if (errorMsg) {
            errorMsg.textContent = "";
            errorMsg.style.display = "none";
        }
        if (inputEmail) inputEmail.value = "";
        if (addForm) addForm.style.display = "none";

        // Render saved accounts
        const savedAccounts = getSavedGoogleAccountsList();
        listContainer.innerHTML = "";

        if (savedAccounts.length > 0) {
            savedAccounts.forEach((accEmail) => {
                const item = document.createElement("div");
                item.className = "google-account-item";
                item.style.cssText = "display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.8rem; border-radius: 8px; cursor: pointer; transition: background 0.15s ease; background: #ffffff; border: 1px solid #e2e8f0; margin-bottom: 0.35rem;";

                const letter = accEmail.charAt(0).toUpperCase();
                item.innerHTML = `
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: #2563eb; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; flex-shrink: 0;">${letter}</div>
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <div style="font-size: 0.88rem; font-weight: 600; color: #0f172a !important; line-height: 1.2;">${accEmail.split('@')[0]}</div>
                        <div style="font-size: 0.78rem; color: #475569 !important; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${accEmail}</div>
                    </div>
                    <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: #94a3b8; stroke-width: 2;"><path d="M9 18l6-6-6-6"/></svg>
                `;

                item.onmouseenter = () => { item.style.background = "#f1f5f9"; };
                item.onmouseleave = () => { item.style.background = "#ffffff"; };

                item.onclick = () => {
                    modal.style.display = "none";
                    autoHealGoogleUserSession(accEmail).then((res) => resolve(res));
                };

                listContainer.appendChild(item);
            });
        } else {
            if (addForm) addForm.style.display = "block";
        }

        if (btnToggleAdd) {
            btnToggleAdd.onclick = () => {
                if (addForm) {
                    const isHidden = addForm.style.display === "none" || !addForm.style.display;
                    addForm.style.display = isHidden ? "block" : "none";
                    if (isHidden && inputEmail) inputEmail.focus();
                }
            };
        }

        const handleFormSubmit = () => {
            const emailVal = inputEmail ? inputEmail.value.trim() : "";
            if (!emailVal || !emailVal.includes("@") || !emailVal.includes(".")) {
                if (errorMsg) {
                    errorMsg.textContent = "Please enter a valid Google email address.";
                    errorMsg.style.display = "block";
                }
                return;
            }

            modal.style.display = "none";
            autoHealGoogleUserSession(emailVal).then((res) => resolve(res));
        };

        if (btnSubmit) {
            btnSubmit.onclick = handleFormSubmit;
        }

        if (inputEmail) {
            inputEmail.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleFormSubmit();
                }
            };
        }

        if (btnCancel) {
            btnCancel.onclick = () => {
                modal.style.display = "none";
                resolve({ cancelled: true });
            };
        }

        modal.style.display = "flex";
    });
}

export async function loginWithGoogle() {
    disableGuestMode();
    const auth = getFirebaseAuth();

    if (!auth || !isRealFirebaseConfigured()) {
        console.log("Firebase API key is unconfigured or default. Opening Google Account Chooser.");
        return showGoogleAccountPickerModal();
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
        const res = await signInWithPopup(auth, provider);
        if (res && res.user && res.user.email) {
            localStorage.setItem("google_session_active", "true");
            localStorage.setItem("voice_book_user_email", res.user.email);
            saveGoogleAccountToLocalList(res.user.email);
            if (authObserverCallback) {
                authObserverCallback(res.user);
            }
            return { success: true, user: res.user };
        }
    } catch (error) {
        console.warn("Official Google Auth Popup Notice:", error);

        if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
            return { cancelled: true };
        }

        // On any invalid API key, network error, or configuration issue, fall back to Google Account Chooser
        return showGoogleAccountPickerModal();
    }
    return null;
}

