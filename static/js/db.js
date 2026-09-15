import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    deleteDoc, 
    serverTimestamp,
    updateDoc
} from "firebase/firestore";
import { getFirebaseDb } from "./firebase-init.js?v=46.0";
import { getCurrentUser, isGuestMode } from "./auth.js?v=430.0";
import { isFirebaseInitialized } from "./firebase-init.js?v=46.0";
import { sanitizeInput } from "./utils.js?v=46.0";

// Helper for user local storage
function getUserLocalBooks(userId = "guest_user") {
    const storageKey = `user_books_${userId}`;
    try {
        const data = localStorage.getItem(storageKey);
        if (data) return JSON.parse(data);
    } catch (e) {}
    
    // Also check legacy "guest_books"
    try {
        const legacyData = localStorage.getItem("guest_books");
        if (legacyData) {
            const parsed = JSON.parse(legacyData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                localStorage.setItem(storageKey, JSON.stringify(parsed));
                return parsed;
            }
        }
    } catch (e) {}

    // Default initial 5 books
    const defaultBooks = [
        { id: "book_math", userId: userId, name: "math", createdAt: { seconds: Date.now() / 1000 }, currentPage: 1, maxPages: 100, slotIndex: 0 },
        { id: "book_social", userId: userId, name: "social", createdAt: { seconds: Date.now() / 1000 - 10 }, currentPage: 1, maxPages: 100, slotIndex: 1 },
        { id: "book_physics", userId: userId, name: "physics", createdAt: { seconds: Date.now() / 1000 - 20 }, currentPage: 1, maxPages: 100, slotIndex: 2 },
        { id: "book_chemistry", userId: userId, name: "chemistry", createdAt: { seconds: Date.now() / 1000 - 30 }, currentPage: 1, maxPages: 100, slotIndex: 3 },
        { id: "book_genai", userId: userId, name: "Gen AI", createdAt: { seconds: Date.now() / 1000 - 40 }, currentPage: 1, maxPages: 100, slotIndex: 4 }
    ];
    localStorage.setItem(storageKey, JSON.stringify(defaultBooks));
    return defaultBooks;
}

function saveUserLocalBooks(userId, books) {
    const storageKey = `user_books_${userId}`;
    localStorage.setItem(storageKey, JSON.stringify(books));
}

function getLocalGuestBooks() {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    return getUserLocalBooks(userId);
}

function saveLocalGuestBooks(books) {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    saveUserLocalBooks(userId, books);
}

/**
 * Creates a new notebook document in Firestore or LocalStorage.
 */
/**
 * Creates a new notebook document in Firestore and LocalStorage.
 */
export async function createBook(rawName, slotIndex = 0) {
    const name = sanitizeInput(rawName, 100) || "Untitled Notebook";
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    const userEmail = user ? user.email : "";
    const db = getFirebaseDb();

    // Deterministic book ID containing user ID and timestamp
    const bookId = "book_" + (userId || "guest") + "_" + Date.now();

    // Always save locally for immediate UI responsiveness
    const localBooks = getUserLocalBooks(userId);
    const newBook = {
        id: bookId,
        userId: userId,
        userEmail: userEmail,
        name: name,
        createdAt: { seconds: Date.now() / 1000 },
        currentPage: 1,
        maxPages: 100,
        slotIndex: slotIndex
    };
    localBooks.unshift(newBook);
    saveUserLocalBooks(userId, localBooks);

    if (isGuestMode() || !isFirebaseInitialized() || !db) {
        return bookId;
    }

    try {
        const bookData = {
            userId: userId,
            userEmail: userEmail,
            name: name,
            createdAt: serverTimestamp(),
            currentPage: 1,
            maxPages: 100,
            slotIndex: slotIndex
        };
        const bookDocRef = doc(db, "books", bookId);
        await setDoc(bookDocRef, bookData, { merge: true });
        return bookId;
    } catch (e) {
        console.warn("Firestore createBook notice, saved locally:", e);
        return bookId;
    }
}

/**
 * Fetches all books for the current authenticated user from Firestore or LocalStorage.
 */
export async function getUserBooks() {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    const userEmail = user ? user.email : "";
    const db = getFirebaseDb();

    if (isGuestMode() || !isFirebaseInitialized() || !db) {
        return getUserLocalBooks(userId);
    }

    try {
        const booksQuery = query(
            collection(db, "books"),
            where("userId", "==", userId)
        );
        const snapshot = await getDocs(booksQuery);
        const books = [];
        snapshot.forEach(docSnap => {
            books.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        if (books.length === 0) {
            // Seed local default books to Firestore for this new user so they sync across all systems
            const localBooks = getUserLocalBooks(userId);
            for (const b of localBooks) {
                try {
                    const bookDocRef = doc(db, "books", b.id);
                    await setDoc(bookDocRef, {
                        userId: userId,
                        userEmail: userEmail,
                        name: b.name,
                        createdAt: serverTimestamp(),
                        currentPage: b.currentPage || 1,
                        maxPages: 100,
                        slotIndex: b.slotIndex || 0
                    }, { merge: true });
                } catch (err) {}
            }
            return localBooks;
        }

        // Save cloud books to local cache
        saveUserLocalBooks(userId, books);

        // Sort by slotIndex
        books.sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0));
        return books;
    } catch (e) {
        console.warn("Firestore getUserBooks failed, fallback to local storage:", e);
        return getUserLocalBooks(userId);
    }
}

/**
 * Deletes a book and all its associated page sub-collections.
 */
export async function deleteBook(bookId) {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    const books = getUserLocalBooks(userId).filter(b => b.id !== bookId);
    saveUserLocalBooks(userId, books);

    if (isGuestMode() || !isFirebaseInitialized()) return;

    try {
        const db = getFirebaseDb();
        if (db) {
            const pagesRef = collection(db, "books", bookId, "pages");
            const pageDocs = await getDocs(pagesRef);
            const deletePromises = [];
            pageDocs.forEach(pageDoc => {
                deletePromises.push(deleteDoc(pageDoc.ref));
            });
            await Promise.all(deletePromises);

            const bookDocRef = doc(db, "books", bookId);
            await deleteDoc(bookDocRef);
        }
    } catch (e) {
        console.warn("Firestore deleteBook notice:", e);
    }
}

/**
 * Retrieves content for a single page.
 */
export async function getPageContent(bookId, pageNumber) {
    const data = await getPageData(bookId, pageNumber);
    return data ? data.textContent : "";
}

/**
 * Retrieves full data object for a single page (including custom date and drawings).
 */
export async function getPageData(bookId, pageNumber) {
    const localContent = localStorage.getItem(`guest_page_${bookId}_${pageNumber}`);
    const localDate = localStorage.getItem(`date_${bookId}_${pageNumber}`);
    let localDrawings = null;
    try {
        const raw = localStorage.getItem(`drawings_${bookId}_${pageNumber}`);
        if (raw) localDrawings = JSON.parse(raw);
    } catch (e) {}

    if (!isGuestMode() && isFirebaseInitialized()) {
        try {
            const db = getFirebaseDb();
            if (db) {
                const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
                const docSnap = await getDoc(pageDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const text = data.textContent !== undefined ? data.textContent : "";
                    const customDate = data.customDate !== undefined ? data.customDate : "";
                    const drawings = data.drawings !== undefined ? data.drawings : [];

                    // Cache to local storage for instant offline access
                    localStorage.setItem(`guest_page_${bookId}_${pageNumber}`, text);
                    if (customDate) localStorage.setItem(`date_${bookId}_${pageNumber}`, customDate);
                    if (drawings) localStorage.setItem(`drawings_${bookId}_${pageNumber}`, JSON.stringify(drawings));

                    return {
                        textContent: text,
                        customDate: customDate,
                        drawings: drawings
                    };
                }
            }
        } catch (e) {
            console.warn("Firestore getPageData notice:", e);
        }
    }
    
    return {
        textContent: localContent !== null ? localContent : "",
        customDate: localDate !== null ? localDate : "",
        drawings: localDrawings !== null ? localDrawings : []
    };
}

/**
 * Saves content, custom date, and freehand drawings for a single page.
 */
export async function savePageContent(bookId, pageNumber, textContent, customDate = null, drawings = null) {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";

    // 1. Save to local storage cache for instant user experience
    localStorage.setItem(`guest_page_${bookId}_${pageNumber}`, textContent);
    if (customDate !== null && customDate !== undefined) {
        localStorage.setItem(`date_${bookId}_${pageNumber}`, customDate);
    }
    if (drawings !== null && drawings !== undefined) {
        localStorage.setItem(`drawings_${bookId}_${pageNumber}`, JSON.stringify(drawings));
    }

    const books = getUserLocalBooks(userId);
    const book = books.find(b => b.id === bookId);
    if (book) {
        book.currentPage = pageNumber;
        saveUserLocalBooks(userId, books);
    }

    if (isGuestMode() || !isFirebaseInitialized()) return;

    // 2. Save to Firestore under books/{bookId}/pages/{pageNumber} for cross-device sync
    try {
        const db = getFirebaseDb();
        if (!db) return;
        const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
        const payload = {
            textContent: textContent,
            updatedAt: serverTimestamp()
        };
        if (customDate !== null && customDate !== undefined) {
            payload.customDate = customDate;
        }
        if (drawings !== null && drawings !== undefined) {
            payload.drawings = drawings;
        }
        await setDoc(pageDocRef, payload, { merge: true });

        const bookDocRef = doc(db, "books", bookId);
        await setDoc(bookDocRef, {
            currentPage: pageNumber,
            lastWriteAt: serverTimestamp()
        }, { merge: true });
    } catch (e) {
        console.warn("Firestore save failed, local copy preserved:", e);
    }
}

/**
 * Updates the last opened page reference.
 */
export async function updateCurrentPage(bookId, pageNumber) {
    const books = getLocalGuestBooks();
    const book = books.find(b => b.id === bookId);
    if (book) {
        book.currentPage = pageNumber;
        saveLocalGuestBooks(books);
    }

    if (isGuestMode() || !isFirebaseInitialized()) return;

    try {
        const db = getFirebaseDb();
        if (!db) return;
        const bookDocRef = doc(db, "books", bookId);
        await updateDoc(bookDocRef, {
            currentPage: pageNumber
        });
    } catch (e) {
        console.warn("Firestore updateCurrentPage error:", e);
    }
}

/**
 * Renames an existing notebook document in Local Storage and Firestore.
 */
export async function renameBook(bookId, rawNewName) {
    const newName = sanitizeInput(rawNewName, 100) || "Untitled Notebook";
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    
    // 1. Update in active user local storage
    const userBooks = getUserLocalBooks(userId);
    const uBook = userBooks.find(b => b.id === bookId);
    if (uBook) {
        uBook.name = newName;
        saveUserLocalBooks(userId, userBooks);
    }

    // 2. Update in default guest user local storage
    const guestBooks = getUserLocalBooks("guest_user");
    const gBook = guestBooks.find(b => b.id === bookId);
    if (gBook) {
        gBook.name = newName;
        saveUserLocalBooks("guest_user", guestBooks);
    }

    // 3. Update in Firestore with setDoc merge
    if (!isGuestMode() && isFirebaseInitialized()) {
        try {
            const db = getFirebaseDb();
            if (db) {
                const bookDocRef = doc(db, "books", bookId);
                await setDoc(bookDocRef, { 
                    name: newName,
                    userId: userId,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
        } catch (e) {
            console.warn("Firestore renameBook notice:", e);
        }
    }
}

/**
 * Scans all pages (1..100) for a book and returns list of page numbers containing text or drawings.
 */
export async function getBookFilledPages(bookId) {
    const filledPages = new Set();

    // 1. Scan LocalStorage for guest/cached page entries
    for (let i = 1; i <= 100; i++) {
        const text = localStorage.getItem(`guest_page_${bookId}_${i}`) || "";
        const cleanText = text.replace(/\[color:#[0-9a-fA-F]{6}\]/g, "").replace(/\[\/color\]/g, "").trim();
        let drawings = [];
        try {
            const raw = localStorage.getItem(`drawings_${bookId}_${i}`);
            if (raw) drawings = JSON.parse(raw);
        } catch(e) {}

        if (cleanText.length > 0 || (drawings && drawings.length > 0)) {
            filledPages.add(i);
        }
    }

    // 2. Scan Firestore pages sub-collection if initialized
    if (!isGuestMode() && isFirebaseInitialized()) {
        try {
            const db = getFirebaseDb();
            if (db) {
                const pagesRef = collection(db, "books", bookId, "pages");
                const docSnaps = await getDocs(pagesRef);
                docSnaps.forEach(docSnap => {
                    const pageNum = parseInt(docSnap.id, 10);
                    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= 100) {
                        const data = docSnap.data();
                        const text = (data.textContent || "").replace(/\[color:#[0-9a-fA-F]{6}\]/g, "").replace(/\[\/color\]/g, "").trim();
                        const drawings = data.drawings || [];
                        if (text.length > 0 || (drawings && drawings.length > 0)) {
                            filledPages.add(pageNum);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn("Firestore getBookFilledPages notice:", e);
        }
    }

    return Array.from(filledPages).sort((a, b) => a - b);
}

