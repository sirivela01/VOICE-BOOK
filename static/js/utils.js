// Stable Seedable PRNG (Mulberry32)
// Used to make handwriting jitter deterministic based on book ID + page number + character index.
// This prevents characters from dancing around on page flips/resizes.

function cyrb128(str) {
    let h1 = 1779033703, h2 = 3024733165, h3 = 3362453619, h4 = 2786560965;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

/**
 * Returns a seedable random number generator function.
 * @param {string} seedString String to hash and seed the generator with.
 * @returns {function(): number} Random number generator returning values between [0, 1)
 */
export function getPRNG(seedString) {
    const seeds = cyrb128(seedString);
    return mulberry32(seeds[0]);
}

/**
 * Standard debounce utility
 * @param {Function} func Function to debounce
 * @param {number} wait Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Displays a non-intrusive toast notification in the UI.
 * @param {string} message Message text
 * @param {'success'|'error'|'info'} type Severity level
 */
export function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = `toast-notification active ${type}`;
    
    // Clear previous timeouts if click-spamming
    if (toast.dataset.timeoutId) {
        clearTimeout(parseInt(toast.dataset.timeoutId));
    }
    
    const timeoutId = setTimeout(() => {
        toast.classList.remove('active');
        delete toast.dataset.timeoutId;
    }, 4000);
    
    toast.dataset.timeoutId = timeoutId.toString();
}

/**
 * Hashes a string into a simple integer, useful for picking colors or deterministic values.
 * @param {string} str 
 * @returns {number}
 */
export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

export function safeLocalStorageGet(key, fallback = "") {
    try {
        return localStorage.getItem(key) || fallback;
    } catch (e) {
        return fallback;
    }
}

export function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("LocalStorage write skipped:", e);
    }
}
