import { fetchFirebaseConfig, initFirebase, isFirebaseInitialized } from "./firebase-init.js?v=1.6";
import { loginUser, registerUser, logoutUser, observeAuthState, getCurrentUser, loginWithGoogle } from "./auth.js?v=1.6";
import { createBook, getUserBooks, deleteBook, getPageContent, savePageContent, updateCurrentPage, renameBook } from "./db.js?v=1.6";
import { startListening, stopListening, isMicActive, isSpeechSupported } from "./speech.js?v=1.6";
import { initRenderer, setRenderOptions, renderText, appendText, clearPage, getPageText, renderPageStatic } from "./renderer.js?v=1.6";
import { showToast, hashString, debounce } from "./utils.js?v=1.6";

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
                        <button class="spine-delete-btn" title="Delete notebook">×</button>
                        <button class="spine-rename-btn" title="Rename notebook">✎</button>
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
        
        // Step 1: Closed book zooms on screen, then swings cover open
        setTimeout(() => {
            overlay.classList.add("opening");
        }, 550);
        
        // Step 2: Swap back workspace view and hide overlay
        setTimeout(async () => {
            showView("view-notebook");
            await loadActivePage();
            
            // Fade out the overlay
            overlay.classList.remove("active-overlay");
            setTimeout(() => {
                overlay.classList.add("hidden");
                overlay.classList.remove("opening");
            }, 400);
        }, 1350);
        
    } else {
        // Fallback if elements not found
        showView("view-notebook");
        await loadActivePage();
    }
}

async function turnPage(direction) {
    if (!activeBookId) return;
    
    const bookSpread = document.getElementById("notebook-book-spread");
    if (bookSpread && (bookSpread.classList.contains("flip-forward") || bookSpread.classList.contains("flip-backward"))) return;
    
    if (isMicActive()) {
        stopListening();
    }
    
    await saveActivePageData();
    
    const currentLeft = activePageNumber % 2 === 1 ? activePageNumber : activePageNumber - 1;
    
    if (direction === "next") {
        const targetPage = currentLeft + 2;
        if (targetPage > 365) {
            showToast("You have reached the end of the notebook!", "info");
            return;
        }
        
        if (bookSpread) bookSpread.classList.add("flip-forward");
        setTimeout(async () => {
            activePageNumber = targetPage;
            await loadActivePage();
        }, 300);
        setTimeout(() => {
            if (bookSpread) bookSpread.classList.remove("flip-forward");
        }, 600);
    } else {
        const targetPage = currentLeft - 2;
        if (targetPage < 1) return;
        
        if (bookSpread) bookSpread.classList.add("flip-backward");
        setTimeout(async () => {
            activePageNumber = targetPage;
            await loadActivePage();
        }, 300);
        setTimeout(() => {
            if (bookSpread) bookSpread.classList.remove("flip-backward");
        }, 600);
    }
}

async function goToPage(targetPage) {
    if (!activeBookId) return;
    
    const bookSpread = document.getElementById("notebook-book-spread");
    if (bookSpread && (bookSpread.classList.contains("flip-forward") || bookSpread.classList.contains("flip-backward"))) return;
    
    if (isMicActive()) {
        stopListening();
    }
    
    await saveActivePageData();
    
    const direction = targetPage > activePageNumber ? "forward" : "backward";
    
    if (direction === "forward") {
        if (bookSpread) bookSpread.classList.add("flip-forward");
        setTimeout(async () => {
            activePageNumber = targetPage;
            await loadActivePage();
        }, 300);
        setTimeout(() => {
            if (bookSpread) bookSpread.classList.remove("flip-forward");
        }, 600);
    } else {
        if (bookSpread) bookSpread.classList.add("flip-backward");
        setTimeout(async () => {
            activePageNumber = targetPage;
            await loadActivePage();
        }, 300);
        setTimeout(() => {
            if (bookSpread) bookSpread.classList.remove("flip-backward");
        }, 600);
    }
}

async function loadActivePage() {
    const leftPageNum = activePageNumber % 2 === 1 ? activePageNumber : activePageNumber - 1;
    const rightPageNum = leftPageNum + 1;
    
    pageDisplayCounter.innerText = `Pages ${leftPageNum}-${rightPageNum} of 365`;
    setSaveStatus("saving", "Loading pages...");
    
    try {
        const [leftText, rightText] = await Promise.all([
            getPageContent(activeBookId, leftPageNum),
            getPageContent(activeBookId, rightPageNum)
        ]);
        
        const canvasLeft = document.getElementById("notebook-canvas-left");
        const canvasRight = document.getElementById("notebook-canvas-right");
        
        if (activePageNumber === leftPageNum) {
            initRenderer(canvasLeft);
            setRenderOptions({ 
                activePageNumber: leftPageNum,
                font: selectFont.value,
                fontSize: parseInt(inputFontSize.value),
                jitterLevel: parseInt(inputJitter.value),
                activeBookId: activeBookId
            });
            renderText(leftText, false);
            
            renderPageStatic(canvasRight, rightText, rightPageNum, {
                font: selectFont.value,
                fontSize: parseInt(inputFontSize.value),
                jitterLevel: parseInt(inputJitter.value)
            });
        } else {
            initRenderer(canvasRight);
            setRenderOptions({ 
                activePageNumber: rightPageNum,
                font: selectFont.value,
                fontSize: parseInt(inputFontSize.value),
                jitterLevel: parseInt(inputJitter.value),
                activeBookId: activeBookId
            });
            renderText(rightText, false);
            
            renderPageStatic(canvasLeft, leftText, leftPageNum, {
                font: selectFont.value,
                fontSize: parseInt(inputFontSize.value),
                jitterLevel: parseInt(inputJitter.value)
            });
        }
        
        const containerLeft = document.getElementById("page-container-left");
        const containerRight = document.getElementById("page-container-right");
        if (containerLeft && containerRight) {
            if (activePageNumber === leftPageNum) {
                containerLeft.classList.remove("inactive-page-mobile");
                containerRight.classList.add("inactive-page-mobile");
            } else {
                containerRight.classList.remove("inactive-page-mobile");
                containerLeft.classList.add("inactive-page-mobile");
            }
        }
        
        setSaveStatus("saved", "All changes saved");
        await updateCurrentPage(activeBookId, activePageNumber);
    } catch (err) {
        console.error("Failed to load page spread:", err);
        setSaveStatus("error", "Failed loading pages");
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
 * Automatically saves, transitions from Left to Right page, or flips the book spread forward.
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
    
    const canvasLeft = document.getElementById("notebook-canvas-left");
    const canvasRight = document.getElementById("notebook-canvas-right");
    const containerLeft = document.getElementById("page-container-left");
    const containerRight = document.getElementById("page-container-right");
    
    const isLeftPageActive = activePageNumber % 2 === 1;
    
    if (isLeftPageActive) {
        // Left page was active, overflow to the right page on the same spread
        const leftText = getPageText();
        activePageNumber++; // Now even (right page)
        
        // Render left page statically
        renderPageStatic(canvasLeft, leftText, activePageNumber - 1, {
            font: selectFont.value,
            fontSize: parseInt(inputFontSize.value),
            jitterLevel: parseInt(inputJitter.value)
        });
        
        // Target right page as active animating canvas
        initRenderer(canvasRight);
        setRenderOptions({ 
            activePageNumber: activePageNumber,
            font: selectFont.value,
            fontSize: parseInt(inputFontSize.value),
            jitterLevel: parseInt(inputJitter.value),
            activeBookId: activeBookId
        });
        
        // Fetch any existing content for right page
        const rightText = await getPageContent(activeBookId, activePageNumber);
        const nextText = rightText ? (rightText + " " + remainingText) : remainingText;
        
        // Start writing text progressively onto right page
        renderText(nextText, true, handlePageOverflow);
        
        // Sync UI counters and mobile visibility classes
        pageDisplayCounter.innerText = `Pages ${activePageNumber - 1}-${activePageNumber} of 365`;
        if (containerLeft && containerRight) {
            containerRight.classList.remove("inactive-page-mobile");
            containerLeft.classList.add("inactive-page-mobile");
        }
        
        await saveActivePageData();
        await updateCurrentPage(activeBookId, activePageNumber);
    } else {
        // Right page was active, we must flip to the next double spread (left page of next spread)
        const bookSpread = document.getElementById("notebook-book-spread");
        if (bookSpread) {
            bookSpread.classList.add("flip-forward");
        }
        
        setTimeout(async () => {
            activePageNumber++; // Now odd (left page of next spread)
            const leftPageNum = activePageNumber;
            const rightPageNum = leftPageNum + 1;
            
            pageDisplayCounter.innerText = `Pages ${leftPageNum}-${rightPageNum} of 365`;
            
            // Clear right page content and render left page canvas
            initRenderer(canvasLeft);
            setRenderOptions({ 
                activePageNumber: leftPageNum,
                font: selectFont.value,
                fontSize: parseInt(inputFontSize.value),
                jitterLevel: parseInt(inputJitter.value),
                activeBookId: activeBookId
            });
            
            // Fetch contents for new spread
            const [leftText, rightText] = await Promise.all([
                getPageContent(activeBookId, leftPageNum),
                getPageContent(activeBookId, rightPageNum)
            ]);
            
            const nextText = leftText ? (leftText + " " + remainingText) : remainingText;
            
            // Start animating left page
            renderText(nextText, true, handlePageOverflow);
            
            // Render right page statically
            renderPageStatic(canvasRight, rightText, rightPageNum, {
                font: selectFont.value,
                fontSize: parseInt(inputFontSize.value),
                jitterLevel: parseInt(inputJitter.value)
            });
            
            // Sync mobile visibility
            if (containerLeft && containerRight) {
                containerLeft.classList.remove("inactive-page-mobile");
                containerRight.classList.add("inactive-page-mobile");
            }
            
            await saveActivePageData();
            await updateCurrentPage(activeBookId, activePageNumber);
        }, 300);
        
        setTimeout(() => {
            if (bookSpread) {
                bookSpread.classList.remove("flip-forward");
            }
        }, 600);
    }
}

/* ================= 3. CORE UI EVENT BINDINGS ================= */
function setupEventListeners() {
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
    
    // Page counter click (Go to specific page)
    pageDisplayCounter.addEventListener("click", () => {
        const userInput = prompt(`Go to page (1-365):`, activePageNumber);
        if (userInput) {
            const targetPage = parseInt(userInput);
            if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= 365) {
                if (targetPage === activePageNumber) return;
                goToPage(targetPage);
            } else {
                showToast("Please enter a valid page number between 1 and 365.", "error");
            }
        }
    });

    // Tap page left/right sides to turn page
    const pageWrapper = document.querySelector(".canvas-3d-wrapper");
    pageWrapper.addEventListener("click", (e) => {
        const rect = pageWrapper.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        
        // Left 45% = previous, Right 55% = next, middle 10% ignored
        if (clickX < width * 0.45) {
            turnPage("prev");
        } else if (clickX > width * 0.55) {
            turnPage("next");
        }
    });

    // Rename notebook by clicking the title in the workspace header
    notebookTitle.addEventListener("click", () => {
        modalMode = "rename";
        activeRenameBookId = activeBookId;
        document.getElementById("modal-create-title").innerText = "Rename Notebook";
        document.getElementById("btn-submit-create-book").innerText = "Rename Book";
        document.getElementById("input-book-name").value = activeBookName;
        showModal(modalCreateBook);
    });
    
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
