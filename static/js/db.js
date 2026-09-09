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
import { getCurrentUser, isGuestMode } from "./auth.js?v=46.0";
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
        { id: "book_math", userId: userId, name: "math", createdAt: { seconds: Date.now() / 1000 }, currentPage: 1, maxPages: 365, slotIndex: 0 },
        { id: "book_social", userId: userId, name: "social", createdAt: { seconds: Date.now() / 1000 - 10 }, currentPage: 1, maxPages: 365, slotIndex: 1 },
        { id: "book_physics", userId: userId, name: "physics", createdAt: { seconds: Date.now() / 1000 - 20 }, currentPage: 1, maxPages: 365, slotIndex: 2 },
        { id: "book_chemistry", userId: userId, name: "chemistry", createdAt: { seconds: Date.now() / 1000 - 30 }, currentPage: 1, maxPages: 365, slotIndex: 3 },
        { id: "book_genai", userId: userId, name: "Gen AI", createdAt: { seconds: Date.now() / 1000 - 40 }, currentPage: 1, maxPages: 365, slotIndex: 4 }
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
export async function createBook(rawName, slotIndex = 0) {
    const name = sanitizeInput(rawName, 100) || "Untitled Notebook";
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    const db = getFirebaseDb();

    // Always create locally first so user experience is instant
    const localBooks = getUserLocalBooks(userId);
    const newBook = {
        id: "book_" + Date.now(),
        userId: userId,
        name: name,
        createdAt: { seconds: Date.now() / 1000 },
        currentPage: 1,
        maxPages: 365,
        slotIndex: slotIndex
    };
    localBooks.unshift(newBook);
    saveUserLocalBooks(userId, localBooks);

    if (isGuestMode() || !isFirebaseInitialized() || !db) {
        return newBook.id;
    }

    try {
        const bookData = {
            userId: userId,
            name: name,
            createdAt: serverTimestamp(),
            currentPage: 1,
            maxPages: 365,
            slotIndex: slotIndex
        };
        const docRef = await addDoc(collection(db, "books"), bookData);
        return docRef.id;
    } catch (e) {
        console.warn("Firestore createBook notice, saved locally:", e);
        return newBook.id;
    }
}

/**
 * Fetches all books for the current authenticated user or local storage.
 */
export async function getUserBooks() {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
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
        snapshot.forEach(doc => {
            books.push({ id: doc.id, ...doc.data() });
        });
        
        if (books.length === 0) {
            return getUserLocalBooks(userId);
        }

        // Sort by slotIndex or createdAt
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
    const localContent = localStorage.getItem(`guest_page_${bookId}_${pageNumber}`);
    if (localContent !== null) return localContent;

    if (isGuestMode() || !isFirebaseInitialized()) return "";

    try {
        const db = getFirebaseDb();
        if (!db) return "";
        const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
        const docSnap = await getDoc(pageDocRef);
        if (docSnap.exists()) {
            return docSnap.data().textContent || "";
        }
    } catch (e) {
        console.warn("Firestore getPageContent notice:", e);
    }
    return "";
}

/**
 * Retrieves full data object for a single page (including custom date and drawings).
 */
export async function getPageData(bookId, pageNumber) {
    const localContent = localStorage.getItem(`guest_page_${bookId}_${pageNumber}`) || "";
    const localDate = localStorage.getItem(`date_${bookId}_${pageNumber}`) || "";
    let localDrawings = [];
    try {
        const raw = localStorage.getItem(`drawings_${bookId}_${pageNumber}`);
        if (raw) localDrawings = JSON.parse(raw);
    } catch (e) {}

    if (isGuestMode() || !isFirebaseInitialized()) {
        return {
            textContent: localContent,
            customDate: localDate,
            drawings: localDrawings
        };
    }

    try {
        const db = getFirebaseDb();
        if (!db) {
            return { textContent: localContent, customDate: localDate, drawings: localDrawings };
        }
        const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
        const docSnap = await getDoc(pageDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            return {
                textContent: data.textContent !== undefined ? data.textContent : localContent,
                customDate: data.customDate !== undefined ? data.customDate : localDate,
                drawings: data.drawings !== undefined ? data.drawings : localDrawings
            };
        }
    } catch (e) {
        console.warn("Firestore getPageData notice:", e);
    }
    
    return {
        textContent: localContent,
        customDate: localDate,
        drawings: localDrawings
    };
}

/**
 * Saves content, custom date, and freehand drawings for a single page.
 */
export async function savePageContent(bookId, pageNumber, textContent, customDate = null, drawings = null) {
    // ALWAYS save to local backup first so user data is never lost!
    localStorage.setItem(`guest_page_${bookId}_${pageNumber}`, textContent);
    if (customDate !== null && customDate !== undefined) {
        localStorage.setItem(`date_${bookId}_${pageNumber}`, customDate);
    }
    if (drawings !== null && drawings !== undefined) {
        localStorage.setItem(`drawings_${bookId}_${pageNumber}`, JSON.stringify(drawings));
    }

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
        await updateDoc(bookDocRef, {
            currentPage: pageNumber,
            lastWriteAt: serverTimestamp()
        });
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
