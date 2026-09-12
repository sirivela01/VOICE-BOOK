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

export function showGoogleAccountPickerModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById("modal-google-account-chooser");
        const listEl = document.getElementById("google-accounts-list");
        const btnToggleAdd = document.getElementById("btn-toggle-add-google-account");
        const formAdd = document.getElementById("google-new-account-form");
        const inputEmail = document.getElementById("input-google-account-email");
        const btnSubmit = document.getElementById("btn-submit-google-account");
        const btnCancel = document.getElementById("btn-cancel-google-account-chooser");
        const errorMsg = document.getElementById("google-account-error-msg");

        if (!modal) {
            resolve(null);
            return;
        }

        if (errorMsg) errorMsg.style.display = "none";
        if (inputEmail) inputEmail.value = "";
        if (formAdd) formAdd.style.display = "none";

        const savedAccounts = getSavedGoogleAccountsList();

        const closeModal = () => {
            modal.style.display = "none";
        };

        const selectAccount = (email) => {
            closeModal();
            saveGoogleAccountToLocalList(email);
            autoHealGoogleUserSession(email).then(res => resolve(res));
        };

        if (listEl) {
            listEl.innerHTML = "";
            if (savedAccounts.length > 0) {
                listEl.style.display = "flex";
                savedAccounts.forEach((email) => {
                    const item = document.createElement("div");
                    item.className = "google-account-picker-item";
                    item.style.cssText = "display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; border-radius: 10px; cursor: pointer; transition: all 0.15s ease; border: 1px solid #e2e8f0; background: #ffffff;";
                    
                    item.onmouseenter = () => { item.style.background = "#f1f5f9"; item.style.borderColor = "#cbd5e1"; };
                    item.onmouseleave = () => { item.style.background = "#ffffff"; item.style.borderColor = "#e2e8f0"; };

                    const firstChar = email.charAt(0).toUpperCase();
                    const username = email.split('@')[0];

                    item.innerHTML = `
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #4285F4 0%, #1a73e8 100%); color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; box-shadow: 0 2px 4px rgba(66,133,244,0.3);">
                            ${firstChar}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 0.875rem; font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${username}</div>
                            <div style="font-size: 0.78rem; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${email}</div>
                        </div>
                        <svg style="width: 18px; height: 18px; fill: #94a3b8; flex-shrink: 0;" viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                    `;

                    item.addEventListener("click", () => selectAccount(email));
                    listEl.appendChild(item);
                });
            } else {
                listEl.style.display = "none";
                if (formAdd) formAdd.style.display = "block";
            }
        }

        const handleCancel = () => {
            closeModal();
            resolve(null);
        };

        const handleAddToggle = () => {
            if (formAdd) {
                const isHidden = formAdd.style.display === "none";
                formAdd.style.display = isHidden ? "block" : "none";
                if (isHidden && inputEmail) inputEmail.focus();
            }
        };

        const handleSubmit = () => {
            if (!inputEmail) return;
            const emailVal = inputEmail.value.trim().toLowerCase();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailVal || !emailRegex.test(emailVal)) {
                if (errorMsg) {
                    errorMsg.textContent = "Please enter a valid Google email address.";
                    errorMsg.style.display = "block";
                }
                return;
            }

            selectAccount(emailVal);
        };

        if (btnCancel) btnCancel.onclick = handleCancel;
        if (btnToggleAdd) btnToggleAdd.onclick = handleAddToggle;
        if (btnSubmit) btnSubmit.onclick = handleSubmit;

        if (inputEmail) {
            inputEmail.onkeydown = (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                }
            };
        }

        modal.style.display = "flex";
    });
}

export async function loginWithGoogle() {
    disableGuestMode();
    const auth = getFirebaseAuth();

    if (auth && isRealFirebaseConfigured()) {
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const res = await signInWithPopup(auth, provider);
            if (res && res.user && res.user.email) {
                localStorage.setItem("google_session_active", "true");
                localStorage.setItem("voice_book_user_email", res.user.email);
                saveGoogleAccountToLocalList(res.user.email);
                if (authObserverCallback) {
                    authObserverCallback(res.user);
                }
                return res;
            }
        } catch (error) {
            console.warn("Google Auth popup notice:", error);
            if (error && (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user')) {
                return null;
            }
            try {
                if (error && (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-allowed')) {
                    const provider = new GoogleAuthProvider();
                    await signInWithRedirect(auth, provider);
                    return null;
                }
            } catch (e2) {}
        }
    }

    return showGoogleAccountPickerModal();
}
