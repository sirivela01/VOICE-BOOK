import { fetchFirebaseConfig, initFirebase, isFirebaseInitialized } from "./firebase-init.js?v=57.0";
import { loginUser, registerUser, logoutUser, observeAuthState, getCurrentUser, loginWithGoogle } from "./auth.js?v=570.0";
import { createBook, getUserBooks, deleteBook, getPageContent, getPageData, savePageContent, updateCurrentPage, renameBook, getBookFilledPages } from "./db.js?v=54.0";
import { startListening, stopListening, isMicActive, isSpeechSupported, setSpeechLanguage } from "./speech.js?v=210.0";

import { initRenderer, setRenderOptions, renderText, appendText, clearPage, getPageText, getPlainText, updateFromPlainText, renderPageStatic, setPageFocus, setCursorIndex, findClosestCharIndex, applyFontToSelection, eraseStrokesNearPoint } from "./renderer.js?v=190.0";
import { showToast, hashString, debounce, safeLocalStorageGet, safeLocalStorageSet, getTodayFormattedDate } from "./utils.js?v=54.0";

// Session App State
let activeBookId = null;
let activeBookName = "";
let activePageNumber = 1;
const bookColors = ["navy", "maroon", "forest", "plum"];

// DOM elements
let viewAuth, viewShelf, viewNotebook;
let btnLogout, btnBackShelf;
let bookcaseContainer, btnAddRow;
let targetSlotIndex = 0;
let modalMode = "create"; // "create" or "rename"
let activeRenameBookId = null;
let selectFont, inputFontSize, inputJitter, valFontSize, valJitter;
let btnToggleMic, micStatusIndicator, speechStatusText, liveTranscriptBox;
let btnPrevPage, btnNextPage, btnClearPage, pageDisplayCounter, notebookTitle;
let modalConfig, modalCreateBook, formCreateBook, directCanvasEditor, directDateEditor;
let btnTogglePencil, pencilBtnLabel, selectPencilWidth;
let btnToggleEraser, eraserBtnLabel, btnUndoStroke, btnClearDrawings;
let modalExportPdf, btnExportPdf, btnGeneratePdf, btnCancelExportPdf, btnCloseExportPdf, inputPdfRange, pdfCustomRangeWrapper, pdfProgressStatus, pdfBookTitleName, pdfCurrentPageNum, radioPdfOptions;

let isDrawingMode = false;
let isEraserMode = false;
let isMouseDown = false;
let currentStroke = null;
let pageStrokes = [];
let currentPencilWidth = 4;
let lastSelectionStart = -1;
let lastSelectionEnd = -1;

function stripColorTags(text) {
    if (!text) return "";
    return text.replace(/\[color:#[0-9a-fA-F]{6}\]/g, "").replace(/\[\/color\]/g, "");
}

/**
 * Main initialization entrypoint
 */
async function initAppMain() {
    // Start Title Splash Screen Timer (Auto-dismisses in 1 second)
    initSplashScreen();

    // Auto-Version Checker & Service Worker Update System
    initAutoVersionChecker();

    // Global Error & Promise Rejection Shield (Zero-Error Architecture)
    window.addEventListener("error", (event) => {
        console.warn("Shielded global runtime error:", event.message);
        event.preventDefault();
    });

    window.addEventListener("unhandledrejection", (event) => {
        console.warn("Shielded unhandled promise rejection:", event.reason);
        event.preventDefault();
    });

    // Cache DOM Elements
    cacheElements();
    
    // Bind event handlers IMMEDIATELY at startup
    setupEventListeners();
    setupSpeechRecognition();

    // Check Speech Recognition capability
    if (!isSpeechSupported()) {
        showToast("Speech recognition is not supported in this browser. Handwriting by voice will not function.", "error");
    }

    // Try to auto-initialize Firebase
    try {
        const config = await fetchFirebaseConfig();
        if (config) {
            initFirebase(config);
        }
        setupAuthListener();
    } catch (e) {
        console.warn("Firebase init notice:", e);
        setupAuthListener();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAppMain);
} else {
    initAppMain();
}

function cacheElements() {
    viewAuth = document.getElementById("view-auth");
    viewShelf = document.getElementById("view-shelf");
    viewNotebook = document.getElementById("view-notebook");
    
    btnLogout = document.getElementById("btn-logout");
    btnBackShelf = document.getElementById("btn-back-shelf");
    bookcaseContainer = document.getElementById("bookcase-container");
    btnAddRow = document.getElementById("btn-add-row");
    
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
    directCanvasEditor = document.getElementById("direct-canvas-editor");
    directDateEditor = document.getElementById("direct-date-editor");
    
    btnTogglePencil = document.getElementById("btn-toggle-pencil");
    pencilBtnLabel = document.getElementById("pencil-btn-label");
    selectPencilWidth = document.getElementById("select-pencil-width");
    btnToggleEraser = document.getElementById("btn-toggle-eraser");
    eraserBtnLabel = document.getElementById("eraser-btn-label");
    btnUndoStroke = document.getElementById("btn-undo-stroke");
    btnClearDrawings = document.getElementById("btn-clear-drawings");

    modalExportPdf = document.getElementById("modal-export-pdf");
    btnExportPdf = document.getElementById("btn-export-pdf");
    btnGeneratePdf = document.getElementById("btn-generate-pdf");
    btnCancelExportPdf = document.getElementById("btn-cancel-export-pdf");
    btnCloseExportPdf = document.getElementById("btn-close-export-pdf");
    inputPdfRange = document.getElementById("input-pdf-range");
    pdfCustomRangeWrapper = document.getElementById("pdf-custom-range-wrapper");
    pdfProgressStatus = document.getElementById("pdf-progress-status");
    pdfBookTitleName = document.getElementById("pdf-book-title-name");
    pdfCurrentPageNum = document.getElementById("pdf-current-page-num");
    radioPdfOptions = document.querySelectorAll('input[name="pdf-page-option"]');
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
    
    // Capture snapshot of target book, target page, text, custom date, and drawings RIGHT NOW synchronously!
    const targetBookId = activeBookId;
    const targetPageNum = activePageNumber;
    const text = getPageText();
    const customDate = directDateEditor ? directDateEditor.value : "";
    const strokes = pageStrokes || [];
    
    // Save to local backup synchronously
    if (text) {
        localStorage.setItem(`backup_${targetBookId}_${targetPageNum}`, text);
    }
    if (customDate !== undefined) {
        localStorage.setItem(`date_${targetBookId}_${targetPageNum}`, customDate);
    }
    if (strokes) {
        localStorage.setItem(`drawings_${targetBookId}_${targetPageNum}`, JSON.stringify(strokes));
    }
    
    setSaveStatus("saving", "Saving progress...");
    try {
        await savePageContent(targetBookId, targetPageNum, text, customDate, strokes);
        // Clear local backup once successfully persisted to Firestore
        localStorage.removeItem(`backup_${targetBookId}_${targetPageNum}`);
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
    bookcaseContainer.innerHTML = `<div class="loading-text" style="color: white; padding: 2rem; text-align: center;">Loading your 3D bookshelf...</div>`;
    try {
        const books = await getUserBooks();
        bookcaseContainer.innerHTML = "";
        
        // Map books by slotIndex
        const booksMap = new Map();
        
        // Group books that already have a slot index
        books.forEach(book => {
            if (book.slotIndex !== undefined && book.slotIndex !== null) {
                booksMap.set(parseInt(book.slotIndex), book);
            }
        });
        
        // Auto-assign any legacy books that do not have a slot index to the first free slots
        let searchSlot = 0;
        books.forEach(book => {
            if (book.slotIndex === undefined || book.slotIndex === null) {
                while (booksMap.has(searchSlot)) {
                    searchSlot++;
                }
                book.slotIndex = searchSlot;
                booksMap.set(searchSlot, book);
            }
        });
        
        // Determine how many rows to render (minimum 5, or more if books require it or user added them)
        let savedRows = parseInt(localStorage.getItem("voice_book_shelf_rows") || "5");
        let maxSlot = 24; // 5 columns * 5 rows - 1
        booksMap.forEach((book, slot) => {
            if (slot > maxSlot) maxSlot = slot;
        });
        
        const requiredRows = Math.ceil((maxSlot + 1) / 5);
        const totalRows = Math.max(savedRows, requiredRows, 5);
        
        // Update localStorage if it grew due to database load
        if (totalRows > savedRows) {
            localStorage.setItem("voice_book_shelf_rows", totalRows.toString());
        }
        
        const spineColors = ["navy", "maroon", "forest", "plum", "leather", "teal", "gold"];
        
        for (let r = 0; r < totalRows; r++) {
            const shelfRow = document.createElement("div");
            shelfRow.className = "shelf-row";
            
            for (let c = 0; c < 5; c++) {
                const slotIndex = r * 5 + c;
                const cell = document.createElement("div");
                cell.className = "shelf-cell";
                
                if (booksMap.has(slotIndex)) {
                    const book = booksMap.get(slotIndex);
                    const colorIdx = hashString(book.id) % spineColors.length;
                    const spineColor = spineColors[colorIdx];
                    
                    const bookEl = document.createElement("div");
                    bookEl.className = `spine-book spine-${spineColor}`;
                    bookEl.setAttribute("data-id", book.id);
                    bookEl.setAttribute("data-slot", slotIndex);
                    bookEl.title = `Click to open "${book.name}" (Page ${book.currentPage || 1})`;
                    
                    bookEl.innerHTML = `
                        <div class="spine-gold-band gold-top"></div>
                        <div class="spine-title">${escapeHTML(book.name)}</div>
                        <button class="spine-delete-btn" title="Delete notebook">✕</button>
                        <button class="spine-rename-btn" title="Rename notebook"><svg viewBox="0 0 24 24" style="width: 13px; height: 13px; fill: #ffffff;"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                        <div class="spine-gold-band gold-bottom"></div>
                    `;
                    
                    // Click handler to open notebook
                    bookEl.addEventListener("click", (e) => {
                        if (e.target.closest(".spine-delete-btn") || e.target.closest(".spine-rename-btn")) return;
                        openNotebook(book.id, book.name, book.currentPage || 1);
                    });
                    
                    // Delete confirmation handler
                    const deleteBtn = bookEl.querySelector(".spine-delete-btn");
                    deleteBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete "${book.name}"? This deletes all 365 pages forever.`)) {
                            try {
                                await deleteBook(book.id);
                                showToast(`Notebook "${book.name}" deleted.`, "success");
                                loadBookshelf();
                            } catch (err) {
                                showToast(`Failed to delete: ${err.message}`, "error");
                            }
                        }
                    });
                    
                    // Rename handler
                    const renameBtn = bookEl.querySelector(".spine-rename-btn");
                    renameBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        modalMode = "rename";
                        activeRenameBookId = book.id;
                        document.getElementById("modal-create-title").innerText = "Rename Notebook";
                        document.getElementById("btn-submit-create-book").innerText = "Rename Book";
                        document.getElementById("input-book-name").value = book.name;
                        showModal(modalCreateBook);
                    });
                    
                    cell.appendChild(bookEl);
                } else {
                    // Empty placeholder book spine
                    const emptyEl = document.createElement("div");
                    emptyEl.className = "spine-book empty-slot";
                    emptyEl.title = "Click to create a new notebook in this slot";
                    emptyEl.innerHTML = `<div class="spine-add-icon">+</div>`;
                    
                    emptyEl.addEventListener("click", () => {
                        promptCreateBookAtSlot(slotIndex);
                    });
                    
                    cell.appendChild(emptyEl);
                }
                
                shelfRow.appendChild(cell);
            }
            bookcaseContainer.appendChild(shelfRow);
        }
        
        // Locking / unlocking the Add Row button
        const totalSlots = totalRows * 5;
        const filledSlots = booksMap.size;
        if (filledSlots >= totalSlots) {
            btnAddRow.disabled = false;
            btnAddRow.classList.remove("disabled-locked");
            btnAddRow.title = "Click to add a new shelf row (5 slots)";
        } else {
            btnAddRow.disabled = true;
            btnAddRow.classList.add("disabled-locked");
            btnAddRow.title = `Locked! Fill all current ${totalSlots} slots to unlock (currently ${filledSlots}/${totalSlots} filled)`;
        }
        
    } catch (err) {
        console.error("Load bookshelf error:", err);
        bookcaseContainer.innerHTML = `<div class="error-text" style="color: var(--danger); padding: 2rem; text-align: center;">Failed to load notebooks. Check database configurations.</div>`;
    }
}

function promptCreateBookAtSlot(slotIndex) {
    modalMode = "create";
    targetSlotIndex = slotIndex;
    document.getElementById("modal-create-title").innerText = "Create New Notebook";
    document.getElementById("btn-submit-create-book").innerText = "Create Book";
    formCreateBook.reset();
    showModal(modalCreateBook);
}

/* ================= 2. NOTEBOOK HANDLERS ================= */
async function openNotebook(bookId, name, pageNum) {
    activeBookId = bookId;
    activeBookName = name;
    activePageNumber = pageNum;
    
    notebookTitle.innerText = name;
    
    // Restore fixed handwriting style for this book / session
    const savedFont = safeLocalStorageGet(`book_font_${bookId}`, safeLocalStorageGet("saved_handwriting_font", "Homemade Apple"));
    if (selectFont) {
        selectFont.value = savedFont;
    }
    setRenderOptions({ font: savedFont });

    // Clear live transcription elements
    liveTranscriptBox.innerHTML = `<span class="placeholder-text">Live speech transcript preview will appear here...</span>`;
    
    setSaveStatus("saving", "Loading page...");
    
    // Color palettes for 3D book cover
    const colorsMap = {
        navy: "linear-gradient(135deg, #2a4066 0%, #16243d 100%)",
        maroon: "linear-gradient(135deg, #6c2a2a 0%, #441717 100%)",
        forest: "linear-gradient(135deg, #224f33 0%, #112d1b 100%)",
        plum: "linear-gradient(135deg, #56275e 0%, #35153b 100%)",
        leather: "linear-gradient(135deg, #724729 0%, #4a2b16 100%)",
        teal: "linear-gradient(135deg, #1b4d54 0%, #0c2b30 100%)",
        gold: "linear-gradient(135deg, #88702b 0%, #5c4a16 100%)"
    };
    const backColorsMap = {
        navy: "linear-gradient(135deg, #1d2c47 0%, #0f1a2b 100%)",
        maroon: "linear-gradient(135deg, #4d1d1d 0%, #2e0f0f 100%)",
        forest: "linear-gradient(135deg, #183824 0%, #0d1f13 100%)",
        plum: "linear-gradient(135deg, #3d1c42 0%, #250d29 100%)",
        leather: "linear-gradient(135deg, #52331c 0%, #301e10 100%)",
        teal: "linear-gradient(135deg, #13393e 0%, #0a1f22 100%)",
        gold: "linear-gradient(135deg, #604f1e 0%, #3b3012 100%)"
    };
    
    // Determine spine color index based on book ID
    const spineColors = ["navy", "maroon", "forest", "plum", "leather", "teal", "gold"];
    const colorIdx = hashString(bookId) % spineColors.length;
    const bookColor = spineColors[colorIdx];
    
    // Apply matching colored background to the workspace undercover border
    const undercoverEl = document.getElementById("notebook-undercover");
    if (undercoverEl) {
        undercoverEl.style.background = colorsMap[bookColor];
    }
    
    // 3D Closed Book Opening Animation Overlay Sequence
    const overlay = document.getElementById("book-opening-overlay");
    const coverFront = document.getElementById("anim-book-cover-front");
    const coverBack = document.getElementById("anim-book-cover-back");
    const animTitle = document.getElementById("anim-book-title");
    
    if (overlay && coverFront && coverBack && animTitle) {
        animTitle.innerText = name;
        coverFront.style.background = colorsMap[bookColor];
        coverBack.style.background = backColorsMap[bookColor];
        
        // Reset classes and show overlay
        overlay.classList.remove("hidden", "active-overlay", "opening");
        void overlay.offsetWidth; // Force Reflow
        overlay.classList.add("active-overlay");
        
        // Step 1: 3D book zoom & cover swing (800ms)
        setTimeout(() => {
            overlay.classList.add("opening");
        }, 800);
        
        // Step 2: Swap back workspace view and hide overlay (2.2 seconds total duration)
        setTimeout(async () => {
            showView("view-notebook");
            await loadActivePage();
            
            // Smooth fade out of overlay
            overlay.classList.remove("active-overlay");
            setTimeout(() => {
                overlay.classList.add("hidden");
                overlay.classList.remove("opening");
            }, 600);
        }, 2200);
        
    } else {
        // Fallback if elements not found
        showView("view-notebook");
        await loadActivePage();
    }
}

async function turnPage(direction) {
    if (!activeBookId) return;
    
    const paperWrapper = document.getElementById("notebook-paper-wrapper");
    if (paperWrapper && (paperWrapper.classList.contains("flip-forward") || paperWrapper.classList.contains("flip-backward"))) return;
    
    if (isMicActive()) {
        stopListening();
    }
    
    await saveActivePageData();
    
    if (direction === "next") {
        if (activePageNumber >= 365) {
            showToast("You have reached the end of the notebook!", "info");
            return;
        }
        const targetPage = activePageNumber + 1;
        if (paperWrapper) paperWrapper.classList.add("flip-forward");
        setTimeout(async () => {
            activePageNumber = targetPage;
            await loadActivePage();
        }, 250);
        setTimeout(() => {
            if (paperWrapper) paperWrapper.classList.remove("flip-forward");
        }, 500);
    } else {
        if (activePageNumber <= 1) return;
        const targetPage = activePageNumber - 1;
        if (paperWrapper) paperWrapper.classList.add("flip-backward");
        setTimeout(async () => {
            activePageNumber = targetPage;
            await loadActivePage();
        }, 250);
        setTimeout(() => {
            if (paperWrapper) paperWrapper.classList.remove("flip-backward");
        }, 500);
    }
}

async function goToPage(targetPage) {
    if (!activeBookId) return;
    
    const paperWrapper = document.getElementById("notebook-paper-wrapper");
    if (paperWrapper && (paperWrapper.classList.contains("flip-forward") || paperWrapper.classList.contains("flip-backward"))) return;
    
    if (isMicActive()) {
        stopListening();
    }
    
    await saveActivePageData();
    
    const direction = targetPage > activePageNumber ? "forward" : "backward";
    
    if (paperWrapper) paperWrapper.classList.add(direction === "forward" ? "flip-forward" : "flip-backward");
    setTimeout(async () => {
        activePageNumber = targetPage;
        await loadActivePage();
    }, 250);
    setTimeout(() => {
        if (paperWrapper) paperWrapper.classList.remove("flip-forward", "flip-backward");
    }, 500);
}

async function loadActivePage() {
    pageDisplayCounter.innerText = `Page ${activePageNumber} of 365`;
    setSaveStatus("saving", "Loading page...");
    
    let pageText = "";
    let savedDate = "";
    let savedDrawings = [];
    try {
        const data = await getPageData(activeBookId, activePageNumber);
        pageText = data.textContent || "";
        savedDate = data.customDate || "";
        savedDrawings = data.drawings || [];
    } catch (err) {
        console.warn("getPageData failed, using local fallback:", err);
        pageText = localStorage.getItem(`guest_page_${activeBookId}_${activePageNumber}`) || "";
        savedDate = safeLocalStorageGet(`date_${activeBookId}_${activePageNumber}`, "");
        try {
            const raw = localStorage.getItem(`drawings_${activeBookId}_${activePageNumber}`);
            if (raw) savedDrawings = JSON.parse(raw);
        } catch (e) {}
    }
    
    pageStrokes = savedDrawings;
    
    try {
        // Restore local emergency backup if un-synced text exists
        const backupKey = `backup_${activeBookId}_${activePageNumber}`;
        const backupText = localStorage.getItem(backupKey);
        if (backupText && backupText.length > (pageText ? pageText.length : 0)) {
            pageText = backupText;
            await savePageContent(activeBookId, activePageNumber, pageText, savedDate, pageStrokes);
            localStorage.removeItem(backupKey);
        }

        const canvasEl = document.getElementById("notebook-canvas");
        const activeInkBtn = document.querySelector(".ink-btn.active");
        const currentInkColor = activeInkBtn ? activeInkBtn.getAttribute("data-color") : "#1d3d84";

        if (valFontSize && inputFontSize) valFontSize.innerText = `${inputFontSize.value}px`;
        if (valJitter && inputJitter) {
            const jitterMap = { 0: "None", 1: "Low", 2: "Medium", 3: "High" };
            valJitter.innerText = jitterMap[inputJitter.value] || "Medium";
        }

        initRenderer(canvasEl);
        setRenderOptions({ 
            activePageNumber: activePageNumber,
            font: selectFont.value,
            fontSize: parseInt(inputFontSize.value),
            jitterLevel: parseInt(inputJitter.value),
            activeBookId: activeBookId,
            inkColor: currentInkColor,
            customDate: savedDate,
            strokes: pageStrokes
        });
        renderText(pageText, false);
        if (directCanvasEditor) directCanvasEditor.value = getPlainText();
        if (directDateEditor) directDateEditor.value = savedDate;
        
        setSaveStatus("saved", "All changes saved");
        updateCurrentPage(activeBookId, activePageNumber);
    } catch (err) {
        console.error("Critical page initialization error:", err);
        setSaveStatus("error", "Offline mode active");
    }
}

let currentSpeechEngineMode = 'webspeech';

/**
 * Integrates Web Speech API Browser Live Dictation.
 */
function setupSpeechRecognition() {
    const selectSpeechLang = document.getElementById("select-speech-lang");
    const btnToggleMic = document.getElementById("btn-toggle-mic");

    if (selectSpeechLang) {
        setSpeechLanguage(selectSpeechLang.value);
        selectSpeechLang.addEventListener("change", (e) => {
            const lang = e.target.value;
            setSpeechLanguage(lang);
            showToast(`Accent set: ${selectSpeechLang.options[selectSpeechLang.selectedIndex].text}`, "info");
        });
    }

    // Direct Microphone Toggle Handler for Browser Live Dictation
    window.toggleDictationDirect = function() {
        const btnToggleMic = document.getElementById("btn-toggle-mic");
        const micStatusIndicator = document.getElementById("mic-status-indicator");
        const speechStatusText = document.getElementById("speech-status-text");
        const liveTranscriptBox = document.getElementById("live-transcript-box");

        if (isMicActive()) {
            stopListening();
        } else {
            const onWordsAdded = (newWords) => {
                appendText(newWords, handlePageOverflow);
                const directCanvasEditor = document.getElementById("direct-canvas-editor");
                if (directCanvasEditor) directCanvasEditor.value = getPlainText();
                triggerAutosave();
            };
            const onInterimResult = (interimText) => {
                if (liveTranscriptBox) {
                    if (interimText) {
                        liveTranscriptBox.innerHTML = `<span class="interim">${interimText}...</span>`;
                    } else {
                        liveTranscriptBox.innerHTML = `<span class="placeholder-text">Listening...</span>`;
                    }
                }
            };
            const onStatusChange = (active, message) => {
                if (speechStatusText) speechStatusText.innerText = message;
                if (active) {
                    if (btnToggleMic) {
                        btnToggleMic.classList.add("active");
                        const span = btnToggleMic.querySelector("span");
                        if (span) span.innerText = "Stop Live Dictation";
                    }
                    if (micStatusIndicator) micStatusIndicator.className = "mic-indicator listening";
                } else {
                    if (btnToggleMic) {
                        btnToggleMic.classList.remove("active");
                        const span = btnToggleMic.querySelector("span");
                        if (span) span.innerText = "Start Live Dictation";
                    }
                    if (micStatusIndicator) micStatusIndicator.className = "mic-indicator";
                    if (liveTranscriptBox) liveTranscriptBox.innerHTML = `<span class="placeholder-text">Live speech transcript preview will appear here...</span>`;
                }
            };
            startListening(onWordsAdded, onInterimResult, onStatusChange);
        }
    };

    if (btnToggleMic) {
        btnToggleMic.addEventListener("click", (e) => {
            window.toggleDictationDirect(e);
        });
    }
}

/**
 * Handles text that fills the page entirely.
 * Automatically saves, transitions from Left to Right page, or flips the book spread forward.
 */
async function handlePageOverflow(remainingText) {
    console.log("Canvas full. Auto-paginating remaining words:", remainingText);
    
    await saveActivePageData();
    
    if (activePageNumber >= 365) {
        stopListening();
        showToast("Notebook is full (page 365 reached)!", "warning");
        return;
    }
    
    activePageNumber++;
    const wrapper = document.getElementById("notebook-paper-wrapper");
    if (wrapper) wrapper.classList.add("flip-forward");
    
    setTimeout(async () => {
        const canvasEl = document.getElementById("notebook-canvas");
        initRenderer(canvasEl);
        setRenderOptions({ 
            activePageNumber: activePageNumber,
            font: selectFont.value,
            fontSize: parseInt(inputFontSize.value),
            jitterLevel: parseInt(inputJitter.value),
            activeBookId: activeBookId
        });
        
        const existingText = await getPageContent(activeBookId, activePageNumber);
        const nextText = existingText ? (existingText + " " + remainingText) : remainingText;
        renderText(nextText, true, handlePageOverflow);
        
        pageDisplayCounter.innerText = `Page ${activePageNumber} of 365`;
        await saveActivePageData();
        await updateCurrentPage(activeBookId, activePageNumber);
    }, 250);
    
    setTimeout(() => {
        if (wrapper) wrapper.classList.remove("flip-forward");
    }, 500);
}

/* ================= 3. CORE UI EVENT BINDINGS ================= */
function setupEventListeners() {
    // Fullscreen Mode Toggle & Automatic Interaction Trigger
    const toggleFullscreenMode = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
            const doc = document.documentElement;
            const request = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.mozRequestFullScreen || doc.msRequestFullscreen;
            if (request) {
                request.call(doc).then(() => {
                    safeLocalStorageSet("voice_book_fullscreen", "true");
                    updateFullscreenUI(true);
                }).catch(() => {});
            }
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exit) {
                exit.call(document).then(() => {
                    safeLocalStorageSet("voice_book_fullscreen", "false");
                    updateFullscreenUI(false);
                }).catch(() => {});
            }
        }
    };

    const updateFullscreenUI = (isFS) => {
        const btns = document.querySelectorAll(".btn-fullscreen-toggle, .btn-fullscreen-toggle-notebook");
        btns.forEach(btn => {
            const span = btn.querySelector(".fullscreen-btn-text");
            if (span) span.textContent = isFS ? "Exit Fullscreen" : "Fullscreen";
            btn.setAttribute("title", isFS ? "Exit Fullscreen Mode" : "Enter Fullscreen Mode");
        });
    };

    const btnFullscreen = document.getElementById("btn-toggle-fullscreen");
    const btnFullscreenNotebook = document.getElementById("btn-toggle-fullscreen-notebook");
    if (btnFullscreen) btnFullscreen.addEventListener("click", toggleFullscreenMode);
    if (btnFullscreenNotebook) btnFullscreenNotebook.addEventListener("click", toggleFullscreenMode);

    document.addEventListener("fullscreenchange", () => {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        updateFullscreenUI(isFS);
    });

    // Auto-enter fullscreen on first user interaction (click / tap)
    let hasAutoTriggeredFullscreen = false;
    const triggerAutoFullscreenOnInteraction = () => {
        if (hasAutoTriggeredFullscreen) return;
        hasAutoTriggeredFullscreen = true;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            toggleFullscreenMode();
        }
    };

    document.addEventListener("click", triggerAutoFullscreenOnInteraction, { once: true });
    document.addEventListener("touchstart", triggerAutoFullscreenOnInteraction, { once: true });

    // Google Sign In
    let isGoogleLoginPending = false;
    const btnGoogleLogin = document.getElementById("btn-google-login");
    if (btnGoogleLogin) {
        btnGoogleLogin.addEventListener("click", async () => {
            if (isGoogleLoginPending) return;

            try {
                isGoogleLoginPending = true;
                btnGoogleLogin.disabled = true;
                const result = await loginWithGoogle();
                if (result && result.success && result.user) {
                    showToast(`Signed in successfully as ${result.user.email}!`, "success");
                } else if (result && result.error) {
                    showToast(`Google Sign-In: ${result.error}`, "error");
                } else if (result && result.pendingRedirect) {
                    showToast("Opening Google Sign-In...", "info");
                }
            } catch (err) {
                console.warn("Google Auth notice:", err);
                showToast("Google Sign-In failed. Please try again.", "error");
            } finally {
                isGoogleLoginPending = false;
                btnGoogleLogin.disabled = false;
            }
        });
    }


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
    
    btnAddRow.addEventListener("click", () => {
        let savedRows = parseInt(localStorage.getItem("voice_book_shelf_rows") || "5");
        savedRows++;
        localStorage.setItem("voice_book_shelf_rows", savedRows.toString());
        loadBookshelf();
        showToast("New shelf row added!", "info");
    });
    
    // Close Modals
    document.getElementById("btn-close-create-book").addEventListener("click", () => closeModal(modalCreateBook));
    document.getElementById("btn-cancel-create-book").addEventListener("click", () => closeModal(modalCreateBook));
    
    // Create/Rename Book Submission
    formCreateBook.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = document.getElementById("input-book-name").value.trim();
        if (!name) return;
        
        if (modalMode === "create") {
            try {
                const newId = await createBook(name, targetSlotIndex);
                closeModal(modalCreateBook);
                showToast("Notebook created!", "success");
                openNotebook(newId, name, 1);
            } catch (err) {
                showToast(err.message, "error");
            }
        } else {
            try {
                await renameBook(activeRenameBookId, name);
                closeModal(modalCreateBook);
                showToast("Notebook renamed successfully!", "success");
                
                // Update workspace title if active notebook is renamed
                if (activeBookId === activeRenameBookId) {
                    activeBookName = name;
                    notebookTitle.innerText = name;
                }
                
                loadBookshelf();
            } catch (err) {
                showToast(`Failed to rename: ${err.message}`, "error");
            }
        }
    });

    // Rename notebook directly by clicking notebook title in sidebar
    if (notebookTitle) {
        notebookTitle.addEventListener("click", () => {
            if (!activeBookId) return;
            modalMode = "rename";
            activeRenameBookId = activeBookId;
            document.getElementById("modal-create-title").innerText = "Rename Notebook";
            document.getElementById("btn-submit-create-book").innerText = "Rename Book";
            document.getElementById("input-book-name").value = activeBookName || notebookTitle.innerText;
            showModal(modalCreateBook);
        });
    }

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
    
    const btnAutoFillConfig = document.getElementById("btn-autofill-config");
    if (btnAutoFillConfig) {
        btnAutoFillConfig.addEventListener("click", () => {
            const rawBox = document.getElementById("config-raw");
            if (rawBox) {
                rawBox.value = `const firebaseConfig = {
  apiKey: "AIzaSyDe7EPi-p6b5gnWFTucVC2Mz-LVJTHiI4",
  authDomain: "voice-book-5e5f0.firebaseapp.com",
  projectId: "voice-book-5e5f0",
  storageBucket: "voice-book-5e5f0.firebasestorage.app",
  messagingSenderId: "684418710763",
  appId: "1:684418710763:web:297972050bcab51a4092ae"
};`;
            }
            document.getElementById("config-api-key").value = "AIzaSyDe7EPi-p6b5gnWFTucVC2Mz-LVJTHiI4";
            document.getElementById("config-auth-domain").value = "voice-book-5e5f0.firebaseapp.com";
            document.getElementById("config-project-id").value = "voice-book-5e5f0";
            document.getElementById("config-storage-bucket").value = "voice-book-5e5f0.firebasestorage.app";
            document.getElementById("config-sender-id").value = "684418710763";
            document.getElementById("config-app-id").value = "1:684418710763:web:297972050bcab51a4092ae";
            showToast("Auto-filled VoiceBook credentials! Click Save Config.", "info");
        });
    }

    document.getElementById("btn-clear-config").addEventListener("click", () => {
        if (confirm("Clear local Firebase configuration?")) {
            localStorage.removeItem('firebase_config');
            showToast("Local configuration cleared! Reloading page...", "success");
            setTimeout(() => location.reload(), 1000);
        }
    });

    // Canvas Settings adjustments
    selectFont.addEventListener("change", () => {
        const chosenFont = selectFont.value;

        setRenderOptions({ font: chosenFont });
        applyFontToSelection(chosenFont);

        safeLocalStorageSet("saved_handwriting_font", chosenFont);
        if (activeBookId) {
            safeLocalStorageSet(`book_font_${activeBookId}`, chosenFont);
        }
        triggerAutosave();

        showToast(`Handwriting style updated to '${chosenFont}' for the entire page!`, "info");
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

    // Ink Color Picker listener
    const inkButtons = document.querySelectorAll(".ink-btn");
    inkButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            inkButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const color = btn.getAttribute("data-color");
            localStorage.setItem("voice_book_ink_color", color);
            setRenderOptions({ inkColor: color });
        });
    });

    // Restore saved ink color on load
    const savedInkColor = localStorage.getItem("voice_book_ink_color");
    if (savedInkColor) {
        const targetBtn = document.querySelector(`.ink-btn[data-color="${savedInkColor}"]`);
        if (targetBtn) {
            inkButtons.forEach(b => b.classList.remove("active"));
            targetBtn.classList.add("active");
            setRenderOptions({ inkColor: savedInkColor });
        }
    }

    // Navigation buttons
    btnPrevPage.addEventListener("click", () => turnPage("prev"));
    btnNextPage.addEventListener("click", () => turnPage("next"));
    
    // Page counter click -> Turn page to next page
    if (pageDisplayCounter) {
        pageDisplayCounter.addEventListener("click", () => {
            turnPage("next");
        });
    }



    // Rename notebook by clicking the title in the workspace header
    notebookTitle.addEventListener("click", () => {
        modalMode = "rename";
        activeRenameBookId = activeBookId;
        document.getElementById("modal-create-title").innerText = "Rename Notebook";
        document.getElementById("btn-submit-create-book").innerText = "Rename Book";
        document.getElementById("input-book-name").value = activeBookName;
        showModal(modalCreateBook);
    });
    
    // Direct On-Page Keyboard Editor typing, cursor tracking & click-to-position listeners
    if (directCanvasEditor) {
        const syncCursor = () => {
            const cPos = directCanvasEditor.selectionStart;
            setCursorIndex(cPos);
            if (directCanvasEditor.selectionStart !== null && directCanvasEditor.selectionEnd !== null) {
                if (directCanvasEditor.selectionEnd > directCanvasEditor.selectionStart) {
                    lastSelectionStart = directCanvasEditor.selectionStart;
                    lastSelectionEnd = directCanvasEditor.selectionEnd;
                }
            }
        };

        directCanvasEditor.addEventListener("input", () => {
            const typedText = directCanvasEditor.value;
            updateFromPlainText(typedText);
            syncCursor();
            triggerAutosave();
        });

        directCanvasEditor.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (!e.shiftKey) {
                    // Plain Enter key: block newline creation
                    e.preventDefault();
                    return;
                }

                // Shift + Enter: Insert newline \n explicitly and position cursor on next line
                e.preventDefault();
                const start = directCanvasEditor.selectionStart;
                const end = directCanvasEditor.selectionEnd;
                const val = directCanvasEditor.value;

                directCanvasEditor.value = val.substring(0, start) + "\n" + val.substring(end);
                directCanvasEditor.selectionStart = directCanvasEditor.selectionEnd = start + 1;

                updateFromPlainText(directCanvasEditor.value);
                syncCursor();
                triggerAutosave();
            }
        });

        directCanvasEditor.addEventListener("keyup", syncCursor);
        directCanvasEditor.addEventListener("mouseup", syncCursor);
        directCanvasEditor.addEventListener("selectionchange", syncCursor);

        directCanvasEditor.addEventListener("focus", () => {
            const wrapper = document.getElementById("notebook-paper-wrapper");
            if (wrapper) wrapper.classList.add("is-editing");
            syncCursor();
            setPageFocus(true, directCanvasEditor.selectionStart);
        });

        directCanvasEditor.addEventListener("blur", () => {
            const wrapper = document.getElementById("notebook-paper-wrapper");
            if (wrapper) wrapper.classList.remove("is-editing");
            setPageFocus(false);
        });
    }

    if (directDateEditor) {
        directDateEditor.addEventListener("input", () => {
            const typedDate = directDateEditor.value;
            safeLocalStorageSet(`date_${activeBookId}_${activePageNumber}`, typedDate);
            setRenderOptions({ customDate: typedDate });
            triggerAutosave();
        });

        directDateEditor.addEventListener("focus", () => {
            const wrapper = document.getElementById("notebook-paper-wrapper");
            if (wrapper) wrapper.classList.add("is-editing");
        });

        directDateEditor.addEventListener("blur", () => {
            const wrapper = document.getElementById("notebook-paper-wrapper");
            if (wrapper) wrapper.classList.remove("is-editing");
        });
    }

    if (btnTogglePencil) {
        btnTogglePencil.addEventListener("click", () => {
            isDrawingMode = !isDrawingMode;
            const paperWrapper = document.getElementById("notebook-paper-wrapper");
            if (isDrawingMode) {
                isEraserMode = false;
                if (btnToggleEraser) btnToggleEraser.classList.remove("active");
                btnTogglePencil.classList.add("active");
                if (pencilBtnLabel) pencilBtnLabel.innerText = "Pencil (ON)";
                if (paperWrapper) {
                    paperWrapper.classList.remove("is-erasing");
                    paperWrapper.classList.add("is-drawing");
                }
                showToast("Pencil Mode Activated. Draw anywhere on paper!", "info");
            } else {
                btnTogglePencil.classList.remove("active");
                if (pencilBtnLabel) pencilBtnLabel.innerText = "Pencil";
                if (paperWrapper) paperWrapper.classList.remove("is-drawing");
                showToast("Text Typing Mode Activated.", "info");
            }
        });
    }

    if (btnToggleEraser) {
        btnToggleEraser.addEventListener("click", () => {
            isEraserMode = !isEraserMode;
            const paperWrapper = document.getElementById("notebook-paper-wrapper");
            if (isEraserMode) {
                isDrawingMode = false;
                if (btnTogglePencil) btnTogglePencil.classList.remove("active");
                if (pencilBtnLabel) pencilBtnLabel.innerText = "Pencil";
                btnToggleEraser.classList.add("active");
                if (paperWrapper) {
                    paperWrapper.classList.remove("is-drawing");
                    paperWrapper.classList.add("is-erasing");
                }
                showToast("Eraser Mode Activated. Drag over pencil lines to erase!", "info");
            } else {
                btnToggleEraser.classList.remove("active");
                if (paperWrapper) paperWrapper.classList.remove("is-erasing");
                showToast("Eraser Deactivated.", "info");
            }
        });
    }

    if (btnUndoStroke) {
        btnUndoStroke.addEventListener("click", () => {
            if (!pageStrokes || pageStrokes.length === 0) {
                showToast("No pencil lines to undo!", "info");
                return;
            }
            pageStrokes.pop();
            setRenderOptions({ strokes: pageStrokes });
            triggerAutosave();
            showToast("Undo last pencil stroke.", "info");
        });
    }

    if (btnClearDrawings) {
        btnClearDrawings.addEventListener("click", () => {
            if (!pageStrokes || pageStrokes.length === 0) {
                showToast("No pencil marks on this page!", "info");
                return;
            }
            if (confirm("Are you sure you want to clear all pencil drawings on this page? Text will not be touched.")) {
                pageStrokes = [];
                setRenderOptions({ strokes: pageStrokes });
                triggerAutosave();
                showToast("Pencil drawings cleared.", "info");
            }
        });
    }

    if (selectPencilWidth) {
        selectPencilWidth.addEventListener("change", () => {
            currentPencilWidth = parseInt(selectPencilWidth.value) || 2;
        });
    }

    // Clicking paper wrapper or canvas calculates exact click position and sets caret or opens Header prompts
    const canvasWrapper = document.getElementById("notebook-paper-wrapper");
    if (canvasWrapper) {
        const getCanvasCoords = (e) => {
            const canvasEl = document.getElementById("notebook-canvas");
            if (!canvasEl) return { x: 0, y: 0 };
            const rect = canvasEl.getBoundingClientRect();
            const scaleX = 800 / rect.width;
            const scaleY = 1000 / rect.height;
            const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
            return {
                x: Math.round((clientX - rect.left) * scaleX),
                y: Math.round((clientY - rect.top) * scaleY)
            };
        };

        const performErase = (e) => {
            if (!isEraserMode || !pageStrokes || pageStrokes.length === 0) return;
            const pt = getCanvasCoords(e);
            const { updatedStrokes, erasedCount } = eraseStrokesNearPoint(pageStrokes, pt.x, pt.y, 25);
            if (erasedCount > 0) {
                pageStrokes = updatedStrokes;
                setRenderOptions({ strokes: pageStrokes });
            }
        };

        const startStroke = (e) => {
            if (isEraserMode) {
                e.preventDefault();
                isMouseDown = true;
                performErase(e);
                return;
            }
            if (!isDrawingMode) return;
            e.preventDefault();
            const activeInkBtn = document.querySelector(".ink-btn.active");
            const currentInkColor = activeInkBtn ? activeInkBtn.getAttribute("data-color") : "#1d3d84";
            const pt = getCanvasCoords(e);
            
            currentStroke = {
                color: currentInkColor,
                width: currentPencilWidth,
                points: [pt]
            };
            pageStrokes.push(currentStroke);
            isMouseDown = true;
            setRenderOptions({ strokes: pageStrokes });
        };

        const moveStroke = (e) => {
            if (isEraserMode && isMouseDown) {
                e.preventDefault();
                performErase(e);
                return;
            }
            if (!isDrawingMode || !isMouseDown || !currentStroke) return;
            e.preventDefault();
            const pt = getCanvasCoords(e);
            currentStroke.points.push(pt);
            setRenderOptions({ strokes: pageStrokes });
        };

        const endStroke = (e) => {
            if (isEraserMode && isMouseDown) {
                isMouseDown = false;
                triggerAutosave();
                return;
            }
            if (!isDrawingMode || !isMouseDown) return;
            isMouseDown = false;
            currentStroke = null;
            triggerAutosave();
        };

        canvasWrapper.addEventListener("mousedown", startStroke);
        canvasWrapper.addEventListener("mousemove", moveStroke);
        canvasWrapper.addEventListener("mouseup", endStroke);
        canvasWrapper.addEventListener("mouseleave", endStroke);

        canvasWrapper.addEventListener("touchstart", startStroke, { passive: false });
        canvasWrapper.addEventListener("touchmove", moveStroke, { passive: false });
        canvasWrapper.addEventListener("touchend", endStroke);
        canvasWrapper.addEventListener("touchcancel", endStroke);

        canvasWrapper.addEventListener("click", (e) => {
            if (isDrawingMode || isEraserMode) return;
            const canvasEl = document.getElementById("notebook-canvas");
            if (!canvasEl) return;

            const rect = canvasEl.getBoundingClientRect();
            const scaleX = 800 / rect.width;
            const scaleY = 1000 / rect.height;
            const clickX = (e.clientX - rect.left) * scaleX;
            const clickY = (e.clientY - rect.top) * scaleY;

            // Check if user clicked inside top-right Header Box (x: 580..790, y: 10..55)
            if (clickY >= 10 && clickY <= 55 && clickX >= 580 && clickX <= 790) {
                if (clickX >= 665) {
                    // Clicked on DATE section -> Focus direct on-page date input
                    if (directDateEditor) {
                        directDateEditor.focus();
                        directDateEditor.setSelectionRange(directDateEditor.value.length, directDateEditor.value.length);
                    }
                } else {
                    // Clicked on PAGE section -> Turn page to next page
                    turnPage("next");
                }
                return;
            }

            if (!directCanvasEditor) return;
            directCanvasEditor.focus();

            const closestIdx = findClosestCharIndex(clickX, clickY);
            if (closestIdx >= 0) {
                directCanvasEditor.setSelectionRange(closestIdx, closestIdx);
                setCursorIndex(closestIdx);
            }
        });
    }

    // Erase page
    btnClearPage.addEventListener("click", () => {
        if (confirm("Are you sure you want to erase all handwriting and drawings on this page? This cannot be undone.")) {
            clearPage();
            pageStrokes = [];
            setRenderOptions({ strokes: pageStrokes });
            if (directCanvasEditor) directCanvasEditor.value = "";
            saveActivePageData();
            showToast("Page erased.", "info");
        }
    });

    // PDF Export Listeners
    const pdfTriggers = document.querySelectorAll(".btn-export-pdf-trigger, #btn-export-pdf");
    pdfTriggers.forEach(btn => {
        btn.addEventListener("click", () => {
            if (!activeBookId) return;
            if (pdfBookTitleName) pdfBookTitleName.textContent = activeBookName || "Notebook";
            if (pdfCurrentPageNum) pdfCurrentPageNum.textContent = `Page ${activePageNumber}`;
            
            const currentRadio = document.querySelector('input[name="pdf-page-option"][value="current"]');
            if (currentRadio) currentRadio.checked = true;
            
            if (pdfCustomRangeWrapper) pdfCustomRangeWrapper.style.display = "none";
            if (pdfProgressStatus) {
                pdfProgressStatus.style.display = "none";
                pdfProgressStatus.textContent = "Rendering PDF pages...";
            }
            if (btnGeneratePdf) {
                btnGeneratePdf.disabled = false;
                btnGeneratePdf.textContent = "Download PDF";
            }
            if (inputPdfRange) inputPdfRange.value = "";
            
            showModal(modalExportPdf);
        });
    });

    if (radioPdfOptions) {
        radioPdfOptions.forEach(radio => {
            radio.addEventListener("change", (e) => {
                if (pdfCustomRangeWrapper) {
                    if (e.target.value === "custom") {
                        pdfCustomRangeWrapper.style.display = "block";
                        if (inputPdfRange) inputPdfRange.focus();
                    } else {
                        pdfCustomRangeWrapper.style.display = "none";
                    }
                }
            });
        });
    }

    if (btnCancelExportPdf) {
        btnCancelExportPdf.addEventListener("click", () => closeModal(modalExportPdf));
    }

    if (btnCloseExportPdf) {
        btnCloseExportPdf.addEventListener("click", () => closeModal(modalExportPdf));
    }

    if (btnGeneratePdf) {
        btnGeneratePdf.addEventListener("click", handleGeneratePdf);
    }

    // Initialize speech integration
    setupSpeechRecognition();
}

/**
 * Parses user input page range strings like "1, 2, 5-10" into sorted unique page numbers.
 */
function parsePageRange(rangeStr, maxPages = 365) {
    if (!rangeStr || !rangeStr.trim()) return [];
    const pagesSet = new Set();
    const parts = rangeStr.split(",");

    for (let part of parts) {
        part = part.trim();
        if (!part) continue;

        if (part.includes("-")) {
            const range = part.split("-");
            if (range.length === 2) {
                const start = parseInt(range[0].trim(), 10);
                const end = parseInt(range[1].trim(), 10);
                if (!isNaN(start) && !isNaN(end)) {
                    const min = Math.max(1, Math.min(start, end));
                    const max = Math.min(maxPages, Math.max(start, end));
                    for (let p = min; p <= max; p++) {
                        pagesSet.add(p);
                    }
                }
            }
        } else {
            const pNum = parseInt(part, 10);
            if (!isNaN(pNum) && pNum >= 1 && pNum <= maxPages) {
                pagesSet.add(pNum);
            }
        }
    }

    return Array.from(pagesSet).sort((a, b) => a - b);
}

/**
 * Handles generating multi-page PDF document containing offscreen-rendered notebook pages.
 */
async function handleGeneratePdf() {
    if (!activeBookId) return;

    const selectedOption = document.querySelector('input[name="pdf-page-option"]:checked')?.value || "current";
    let targetPages = [];

    if (selectedOption === "current") {
        targetPages = [activePageNumber];
    } else if (selectedOption === "filled") {
        if (pdfProgressStatus) {
            pdfProgressStatus.style.display = "block";
            pdfProgressStatus.textContent = "Scanning notebook for pages with content...";
        }
        targetPages = await getBookFilledPages(activeBookId);
        if (targetPages.length === 0) {
            showToast("No pages with content or drawings found. Exporting current page.", "info");
            targetPages = [activePageNumber];
        }
    } else if (selectedOption === "custom") {
        const rawRange = inputPdfRange ? inputPdfRange.value : "";
        targetPages = parsePageRange(rawRange, 365);
        if (targetPages.length === 0) {
            showToast("Please enter a valid page range (e.g. 1, 2, 5-10)", "error");
            return;
        }
    }

    if (pdfProgressStatus) {
        pdfProgressStatus.style.display = "block";
        pdfProgressStatus.textContent = `Preparing PDF (${targetPages.length} page${targetPages.length > 1 ? 's' : ''})...`;
    }
    if (btnGeneratePdf) {
        btnGeneratePdf.disabled = true;
        btnGeneratePdf.textContent = "Generating PDF...";
    }

    try {
        const jsPDF = window.jspdf ? window.jspdf.jsPDF : null;
        if (!jsPDF) {
            showToast("PDF generator library not loaded. Please refresh the page.", "error");
            if (pdfProgressStatus) pdfProgressStatus.style.display = "none";
            if (btnGeneratePdf) {
                btnGeneratePdf.disabled = false;
                btnGeneratePdf.textContent = "Download PDF";
            }
            return;
        }

        const doc = new jsPDF({
            orientation: "portrait",
            unit: "pt",
            format: [800, 1000]
        });

        const offscreenCanvas = document.createElement("canvas");

        const font = selectFont ? selectFont.value : "Homemade Apple";
        const fontSize = inputFontSize ? parseInt(inputFontSize.value, 10) : 15;
        const jitterLevel = inputJitter ? parseInt(inputJitter.value, 10) : 2;

        for (let i = 0; i < targetPages.length; i++) {
            const pNum = targetPages[i];
            if (pdfProgressStatus) {
                pdfProgressStatus.textContent = `Rendering page ${i + 1} of ${targetPages.length} (Page ${pNum})...`;
            }
            
            await new Promise(r => setTimeout(r, 15));

            const pageData = await getPageData(activeBookId, pNum);

            renderPageStatic(offscreenCanvas, pageData.textContent, pNum, {
                customDate: pageData.customDate,
                strokes: pageData.drawings,
                font: font,
                fontSize: fontSize,
                jitterLevel: jitterLevel
            });

            const imgData = offscreenCanvas.toDataURL("image/png");

            if (i > 0) {
                doc.addPage([800, 1000], "portrait");
            }
            doc.addImage(imgData, "PNG", 0, 0, 800, 1000);
        }

        const safeTitle = (activeBookName || "Notebook").replace(/[^a-zA-Z0-9_-]/g, "_");
        doc.save(`${safeTitle}_Pages.pdf`);

        showToast(`Exported ${targetPages.length} page(s) to PDF successfully!`, "success");
        closeModal(modalExportPdf);

    } catch (err) {
        console.error("PDF export error:", err);
        showToast("An error occurred while generating the PDF.", "error");
    } finally {
        if (pdfProgressStatus) pdfProgressStatus.style.display = "none";
        if (btnGeneratePdf) {
            btnGeneratePdf.disabled = false;
            btnGeneratePdf.textContent = "Download PDF";
        }
    }
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

// Emergency backup handler if tab/browser is closed abruptly
window.addEventListener("beforeunload", () => {
    if (activeBookId && activePageNumber) {
        const text = getPageText();
        if (text) {
            localStorage.setItem(`backup_${activeBookId}_${activePageNumber}`, text);
            savePageContent(activeBookId, activePageNumber, text);
        }
    }
});

/* ================= 1-SECOND FAST TITLE SPLASH SCREEN TIMER ================= */
function initSplashScreen() {
    const splashOverlay = document.getElementById("splash-screen-overlay");
    if (!splashOverlay) return;

    const DURATION_MS = 1000; // 1 Second
    let isDismissed = false;

    const dismissSplash = () => {
        if (isDismissed) return;
        isDismissed = true;
        splashOverlay.classList.add("fade-out");
        setTimeout(() => {
            if (splashOverlay && splashOverlay.parentNode) {
                splashOverlay.parentNode.removeChild(splashOverlay);
            }
        }, 300);
    };

    // Click anywhere on splash screen to enter immediately
    splashOverlay.addEventListener("click", dismissSplash);

    // Auto fade-out after 1 second
    setTimeout(dismissSplash, DURATION_MS);
}

/* ================= AUTOMATIC SILENT REAL-TIME VERSION UPDATER ================= */
function initAutoVersionChecker() {
    let currentVersion = localStorage.getItem("voice_book_app_version");

    const silentAutoUpdate = (newVer) => {
        if (newVer) {
            localStorage.setItem("voice_book_app_version", newVer);
        }
        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach(name => caches.delete(name));
            });
        }
        console.log("Silent auto-update applying new version:", newVer);
        window.location.reload(true);
    };

    // Check version endpoint on load and every 25 seconds
    const checkVersion = async () => {
        try {
            const res = await fetch("/api/version?t=" + Date.now());
            if (res.ok) {
                const data = await res.json();
                if (data && data.version) {
                    if (!currentVersion) {
                        localStorage.setItem("voice_book_app_version", data.version);
                        currentVersion = data.version;
                    } else if (currentVersion !== data.version) {
                        console.log(`New version detected on Render (${currentVersion} -> ${data.version}). Updating automatically...`);
                        silentAutoUpdate(data.version);
                    }
                }
            }
        } catch (e) {}
    };

    setTimeout(checkVersion, 1000);
    setInterval(checkVersion, 25000);

    // Listen to Service Worker updates
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            silentAutoUpdate();
                        }
                    });
                }
            });
        }).catch(() => {});
    }
}

