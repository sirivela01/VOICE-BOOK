import { fetchFirebaseConfig, initFirebase, isFirebaseInitialized } from "./firebase-init.js";
import { loginUser, registerUser, logoutUser, observeAuthState, getCurrentUser, loginWithGoogle } from "./auth.js";
import { createBook, getUserBooks, deleteBook, getPageContent, savePageContent, updateCurrentPage } from "./db.js";
import { startListening, stopListening, isMicActive, isSpeechSupported } from "./speech.js";
import { initRenderer, setRenderOptions, renderText, appendText, clearPage, getPageText } from "./renderer.js";
import { showToast, hashString, debounce } from "./utils.js";

// Session App State
let activeBookId = null;
let activeBookName = "";
let activePageNumber = 1;
const bookColors = ["navy", "maroon", "forest", "plum"];

// DOM elements
let viewAuth, viewShelf, viewNotebook;
let formLogin, formSignup;
let btnLogout, btnBackShelf;
let shelfBooksContainer, cardNewBook;
let selectFont, inputFontSize, inputJitter, valFontSize, valJitter;
let btnToggleMic, micStatusIndicator, speechStatusText, liveTranscriptBox;
let btnPrevPage, btnNextPage, btnClearPage, pageDisplayCounter, notebookTitle;
let modalConfig, modalCreateBook, formCreateBook;

/**
 * Main initialization entrypoint
 */
document.addEventListener("DOMContentLoaded", async () => {
    // Cache DOM Elements
    cacheElements();
    
    // Check Speech Recognition capability
    if (!isSpeechSupported()) {
        showToast("Speech recognition is not supported in this browser. Handwriting by voice will not function.", "error");
    }

    // Try to auto-initialize Firebase
    const config = await fetchFirebaseConfig();
    if (config) {
        initFirebase(config);
        setupAuthListener();
    } else {
        // Force config modal if not configured
        showModal(modalConfig);
    }

    // Bind event handlers
    setupEventListeners();
});

function cacheElements() {
    viewAuth = document.getElementById("view-auth");
    viewShelf = document.getElementById("view-shelf");
    viewNotebook = document.getElementById("view-notebook");
    
    formLogin = document.getElementById("form-login");
    formSignup = document.getElementById("form-signup");
    
    btnLogout = document.getElementById("btn-logout");
    btnBackShelf = document.getElementById("btn-back-shelf");
    shelfBooksContainer = document.getElementById("shelf-books-container");
    cardNewBook = document.getElementById("card-new-book");
    
    selectFont = document.getElementById("select-font");
    inputFontSize = document.getElementById("input-font-size");
    inputJitter = document.getElementById("input-jitter");
    valFontSize = document.getElementById("val-font-size");
    valJitter = document.getElementById("val-jitter");
    
    btnToggleMic = document.getElementById("btn-toggle-mic");
    micStatusIndicator = document.getElementById("mic-status-indicator");
    speechStatusText = document.getElementById("speech-status-text");
    liveTranscriptBox = document.getElementById("live-transcript-box");
    
    btnPrevPage = document.getElementById("btn-prev-page");
    btnNextPage = document.getElementById("btn-next-page");
    btnClearPage = document.getElementById("btn-clear-page");
    pageDisplayCounter = document.getElementById("page-display-counter");
    notebookTitle = document.getElementById("notebook-title");
    
    modalConfig = document.getElementById("modal-config");
    modalCreateBook = document.getElementById("modal-create-book");
    formCreateBook = document.getElementById("form-create-book");
}

function setupAuthListener() {
    observeAuthState((user) => {
        if (user) {
            document.getElementById("user-display-email").innerText = user.email;
            showView("view-shelf");
            loadBookshelf();
        } else {
            showView("view-auth");
        }
    });
}

function showView(viewId) {
    [viewAuth, viewShelf, viewNotebook].forEach(view => {
        if (view.id === viewId) {
            view.classList.add("active-view");
        } else {
            view.classList.remove("active-view");
        }
    });
}

function showModal(modalEl) {
    modalEl.classList.add("active-modal");
}

function closeModal(modalEl) {
    modalEl.classList.remove("active-modal");
}

// Autosave handler (Debounced)
const triggerAutosave = debounce(async () => {
    await saveActivePageData();
}, 2000);

async function saveActivePageData() {
    if (!activeBookId) return;
    
    setSaveStatus("saving", "Saving progress...");
    try {
        const text = getPageText();
        await savePageContent(activeBookId, activePageNumber, text);
        setSaveStatus("saved", "All changes saved");
    } catch (err) {
        console.error("Autosave error:", err);
        setSaveStatus("error", "Error saving progress");
    }
}

function setSaveStatus(type, message) {
    const statusDot = document.querySelector("#save-status .status-dot");
    const statusText = document.querySelector("#save-status .status-text");
    if (!statusDot || !statusText) return;
    
    statusDot.className = "status-dot";
    statusText.innerText = message;
    
    if (type === "saved") statusDot.classList.add("green");
    else if (type === "saving") statusDot.classList.add("yellow");
    else if (type === "error") statusDot.classList.add("red");
}

/* ================= 1. BOOKSHELF HANDLERS ================= */
async function loadBookshelf() {
    if (!isFirebaseInitialized()) return;
    
    shelfBooksContainer.innerHTML = `<div class="loading-text">Loading notebooks...</div>`;
    try {
        const books = await getUserBooks();
        shelfBooksContainer.innerHTML = "";
        
        if (books.length === 0) {
            shelfBooksContainer.innerHTML = `
                <div class="empty-shelf-message">
                    <p>Your bookshelf is empty.</p>
                    <p>Click "New Notebook" to create your first book!</p>
                </div>
            `;
            return;
        }
        
        books.forEach(book => {
            // Assign color based on name hash
            const colorIdx = hashString(book.name) % bookColors.length;
            const bookColor = bookColors[colorIdx];
            
            const card = document.createElement("div");
            card.className = "book-card";
            card.setAttribute("data-color", bookColor);
            
            const dateStr = book.createdAt ? new Date(book.createdAt.seconds * 1000).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', year: 'numeric'
            }) : 'Just now';
            
            card.innerHTML = `
                <div class="book-cover">
                    <span class="book-badge">365 Pages</span>
                    <h3 class="book-card-title">${escapeHTML(book.name)}</h3>
                </div>
                <div class="book-card-meta">
                    <div class="book-pages">
                        <span>Pg. ${book.currentPage || 1}</span>
                    </div>
                    <span class="book-date">${dateStr}</span>
                    <button class="btn-delete-book" data-id="${book.id}" data-name="${escapeHTML(book.name)}" title="Delete notebook">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            `;
            
            // Clicking card opens the book (except when clicking delete)
            card.addEventListener("click", (e) => {
                if (e.target.closest(".btn-delete-book")) return;
                openNotebook(book.id, book.name, book.currentPage || 1);
            });
            
            // Delete confirmation
            const deleteBtn = card.querySelector(".btn-delete-book");
            deleteBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const id = deleteBtn.getAttribute("data-id");
                const name = deleteBtn.getAttribute("data-name");
                
                if (confirm(`Are you sure you want to delete the notebook "${name}"? This deletes all 365 pages forever.`)) {
                    try {
                        await deleteBook(id);
                        showToast(`Notebook "${name}" deleted.`, "success");
                        loadBookshelf();
                    } catch (err) {
                        showToast(`Failed to delete: ${err.message}`, "error");
                    }
                }
            });
            
            shelfBooksContainer.appendChild(card);
        });
    } catch (err) {
        console.error("Load bookshelf error:", err);
        shelfBooksContainer.innerHTML = `<div class="error-text">Failed to load notebooks. Check database configurations.</div>`;
    }
}

/* ================= 2. NOTEBOOK HANDLERS ================= */
async function openNotebook(bookId, name, pageNum) {
    activeBookId = bookId;
    activeBookName = name;
    activePageNumber = pageNum;
    
    notebookTitle.innerText = name;
    pageDisplayCounter.innerText = `Page ${activePageNumber} of 365`;
    
    // Clear live transcription elements
    liveTranscriptBox.innerHTML = `<span class="placeholder-text">Live speech transcript preview will appear here...</span>`;
    
    // Initialize Renderer
    const canvasEl = document.getElementById("notebook-canvas");
    initRenderer(canvasEl);
    
    // Load page text
    setSaveStatus("saving", "Loading page...");
    try {
        const text = await getPageContent(activeBookId, activePageNumber);
        
        // Push values to renderer
        setRenderOptions({
            font: selectFont.value,
            fontSize: parseInt(inputFontSize.value),
            jitterLevel: parseInt(inputJitter.value),
            activeBookId: activeBookId,
            activePageNumber: activePageNumber
        });
        
        renderText(text, false); // Static draw
        setSaveStatus("saved", "All changes saved");
        showView("view-notebook");
    } catch (err) {
        console.error("Load page error:", err);
        showToast("Error loading page content.", "error");
        setSaveStatus("error", "Error loading page");
    }
}

async function turnPage(direction) {
    if (!activeBookId) return;
    
    // Prevent changing page during active page flip animation to avoid document race conditions
    const pageWrapper = document.querySelector(".canvas-3d-wrapper");
    if (pageWrapper.classList.contains("flip-forward") || pageWrapper.classList.contains("flip-backward")) return;
    
    // Stop recording first
    if (isMicActive()) {
        stopListening();
    }
    
    // Save current page immediately
    await saveActivePageData();
    
    if (direction === "next") {
        if (activePageNumber >= 365) {
            showToast("You have reached page 365! Create a new book.", "info");
            return;
        }
        
        pageWrapper.classList.add("flip-forward");
        setTimeout(async () => {
            activePageNumber++;
            await loadActivePage();
        }, 300);
        
        setTimeout(() => pageWrapper.classList.remove("flip-forward"), 600);
        
    } else {
        if (activePageNumber <= 1) return;
        
        pageWrapper.classList.add("flip-backward");
        setTimeout(async () => {
            activePageNumber--;
            await loadActivePage();
        }, 300);
        
        setTimeout(() => pageWrapper.classList.remove("flip-backward"), 600);
    }
}

async function loadActivePage() {
    pageDisplayCounter.innerText = `Page ${activePageNumber} of 365`;
    setSaveStatus("saving", "Loading page...");
    
    try {
        const text = await getPageContent(activeBookId, activePageNumber);
        setRenderOptions({ activePageNumber: activePageNumber });
        renderText(text, false);
        setSaveStatus("saved", "All changes saved");
        await updateCurrentPage(activeBookId, activePageNumber);
    } catch (err) {
        console.error("Failed to load page:", err);
        setSaveStatus("error", "Failed loading page");
    }
}

/**
 * Integrates Web Speech API and Canvas rendering queue.
 */
function setupSpeechRecognition() {
    btnToggleMic.addEventListener("click", () => {
        if (isMicActive()) {
            stopListening();
        } else {
            // Words final handler
            const onWordsAdded = (newWords) => {
                // Append text inside the canvas renderer
                appendText(newWords, handlePageOverflow);
                // Trigger auto-save
                triggerAutosave();
            };
            
            // Interim live results handler
            const onInterimResult = (interimText) => {
                if (interimText) {
                    liveTranscriptBox.innerHTML = `<span class="interim">${interimText}...</span>`;
                } else {
                    liveTranscriptBox.innerHTML = `<span class="placeholder-text">Listening...</span>`;
                }
            };
            
            // Listening state toggler
            const onStatusChange = (active, message) => {
                speechStatusText.innerText = message;
                if (active) {
                    btnToggleMic.classList.add("active");
                    btnToggleMic.querySelector("span").innerText = "Stop Dictation";
                    micStatusIndicator.className = "mic-indicator listening";
                } else {
                    btnToggleMic.classList.remove("active");
                    btnToggleMic.querySelector("span").innerText = "Start Dictation";
                    micStatusIndicator.className = "mic-indicator";
                }
            };
            
            startListening(onWordsAdded, onInterimResult, onStatusChange);
        }
    });
}

/**
 * Handles text that fills the page entirely.
 * Automatically saves, performs page-flip, increments counter, and resumes writing the overflow text.
 */
async function handlePageOverflow(remainingText) {
    console.log("Canvas full. Auto-paginating remaining words:", remainingText);
    
    // Save current completed page text
    await saveActivePageData();
    
    if (activePageNumber >= 365) {
        stopListening();
        showToast("Notebook is full (page 365 reached)!", "warning");
        return;
    }
    
    // Animate page flip
    const pageWrapper = document.querySelector(".canvas-3d-wrapper");
    pageWrapper.classList.add("flip-forward");
    
    setTimeout(async () => {
        activePageNumber++;
        pageDisplayCounter.innerText = `Page ${activePageNumber} of 365`;
        
        // Reset page elements on canvas
        clearPage();
        setRenderOptions({ activePageNumber: activePageNumber });
        
        // Fetch any existing content (should be blank for a new page, but pulls if there was text)
        const existingText = await getPageContent(activeBookId, activePageNumber);
        const nextText = existingText ? (existingText + " " + remainingText) : remainingText;
        
        // Write text progressively onto the new page
        renderText(nextText, true, handlePageOverflow);
        
        // Save initial state
        await saveActivePageData();
        await updateCurrentPage(activeBookId, activePageNumber);
    }, 300);
    
    setTimeout(() => pageWrapper.classList.remove("flip-forward"), 600);
}

/* ================= 3. CORE UI EVENT BINDINGS ================= */
function setupEventListeners() {
    // Auth Toggles
    document.getElementById("to-signup").addEventListener("click", (e) => {
        e.preventDefault();
        formLogin.classList.add("hidden");
        formSignup.classList.remove("hidden");
    });
    
    document.getElementById("to-login").addEventListener("click", (e) => {
        e.preventDefault();
        formSignup.classList.add("hidden");
        formLogin.classList.remove("hidden");
    });
    
    // Google Sign In
    document.getElementById("btn-google-login").addEventListener("click", async () => {
        try {
            await loginWithGoogle();
            showToast("Successfully logged in with Google!", "success");
        } catch (err) {
            console.error("Google Auth error:", err);
            showToast(err.message, "error");
        }
    });
    
    // Login Submit
    formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value.trim();
        const pass = document.getElementById("login-password").value;
        
        try {
            await loginUser(email, pass);
            showToast("Successfully logged in!", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    });

    // Signup Submit
    formSignup.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("signup-email").value.trim();
        const pass = document.getElementById("signup-password").value;
        
        if (pass.length < 6) {
            showToast("Password must be at least 6 characters.", "error");
            return;
        }
        
        try {
            await registerUser(email, pass);
            showToast("Registration completed!", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    });
    
    // Logout
    btnLogout.addEventListener("click", async () => {
        try {
            await logoutUser();
            showToast("Logged out successfully.", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    });

    // Shelf & Navigation controls
    btnBackShelf.addEventListener("click", async () => {
        if (isMicActive()) {
            stopListening();
        }
        await saveActivePageData();
        activeBookId = null;
        showView("view-shelf");
        loadBookshelf();
    });
    
    cardNewBook.addEventListener("click", () => {
        formCreateBook.reset();
        showModal(modalCreateBook);
    });
    
    // Close Modals
    document.getElementById("btn-close-create-book").addEventListener("click", () => closeModal(modalCreateBook));
    document.getElementById("btn-cancel-create-book").addEventListener("click", () => closeModal(modalCreateBook));
    
    // Create Book Submission
    formCreateBook.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("input-book-name").value.trim();
        if (!name) return;
        
        try {
            const newId = await createBook(name);
            closeModal(modalCreateBook);
            showToast("Notebook created!", "success");
            openNotebook(newId, name, 1);
        } catch (err) {
            showToast(err.message, "error");
        }
    });

    // Firebase Config triggers
    document.getElementById("btn-show-config").addEventListener("click", () => {
        showModal(modalConfig);
    });
    document.getElementById("btn-close-config").addEventListener("click", () => {
        closeModal(modalConfig);
    });
    
    document.getElementById("btn-save-config").addEventListener("click", () => {
        saveFirebaseConfigUI();
    });
    
    document.getElementById("btn-clear-config").addEventListener("click", () => {
        if (confirm("Clear local Firebase configuration?")) {
            localStorage.removeItem('firebase_config');
            showToast("Local configuration cleared! Reloading page...", "success");
            setTimeout(() => location.reload(), 1000);
        }
    });

    // Canvas Settings adjustments
    selectFont.addEventListener("change", () => {
        setRenderOptions({ font: selectFont.value });
    });
    
    inputFontSize.addEventListener("input", () => {
        const size = parseInt(inputFontSize.value);
        valFontSize.innerText = `${size}px`;
        setRenderOptions({ fontSize: size });
    });
    
    inputJitter.addEventListener("input", () => {
        const value = parseInt(inputJitter.value);
        const mapping = { 0: "None", 1: "Low", 2: "Medium", 3: "High" };
        valJitter.innerText = mapping[value] || "Medium";
        setRenderOptions({ jitterLevel: value });
    });

    // Navigation buttons
    btnPrevPage.addEventListener("click", () => turnPage("prev"));
    btnNextPage.addEventListener("click", () => turnPage("next"));
    
    // Erase page
    btnClearPage.addEventListener("click", () => {
        if (confirm("Are you sure you want to erase all handwriting on this page? This cannot be undone.")) {
            clearPage();
            saveActivePageData();
            showToast("Page erased.", "info");
        }
    });

    // Initialize speech integration
    setupSpeechRecognition();
}

/**
 * Extracts, sanitizes, and saves manual Firebase configurations entered in the UI.
 */
function saveFirebaseConfigUI() {
    const rawVal = document.getElementById("config-raw").value.trim();
    let configObj = null;

    if (rawVal) {
        try {
            // Convert standard Firebase Config snippet into parsable JSON
            let cleanJson = rawVal
                .replace(/(const|let|var)\s+\w+\s*=\s*/g, '')
                .replace(/console\.log\(.*\);?/g, '')
                .replace(/firebase\.initializeApp\(.*\);?/g, '')
                .replace(/;/g, '')
                .replace(/(\s*?{\s*?)/g, ' { ')
                .replace(/(\w+)\s*:/g, '"$1":')
                .replace(/'/g, '"');
            
            cleanJson = cleanJson.replace(/,(\s*?[}\]])/g, '$1');
            configObj = JSON.parse(cleanJson);
        } catch(e) {
            console.error("Raw paste parsing failed, falling back to manual inputs.", e);
            showToast("Failed to parse configurations automatically. Please fill form manually.", "error");
            return;
        }
    } else {
        // Collect manual inputs
        configObj = {
            apiKey: document.getElementById("config-api-key").value.trim(),
            authDomain: document.getElementById("config-auth-domain").value.trim(),
            projectId: document.getElementById("config-project-id").value.trim(),
            storageBucket: document.getElementById("config-storage-bucket").value.trim(),
            messagingSenderId: document.getElementById("config-sender-id").value.trim(),
            appId: document.getElementById("config-app-id").value.trim()
        };
    }

    if (configObj && configObj.apiKey && configObj.projectId) {
        localStorage.setItem('firebase_config', JSON.stringify(configObj));
        showToast("Firebase Config saved! Reloading application...", "success");
        setTimeout(() => location.reload(), 1200);
    } else {
        showToast("Configurations are missing critical values (apiKey or projectId).", "error");
    }
}

/**
 * Escapes HTML characters to prevent XSS injection.
 */
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
