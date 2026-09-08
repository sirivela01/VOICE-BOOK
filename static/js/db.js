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
import { getFirebaseDb } from "./firebase-init.js?v=37.0";
import { getCurrentUser, isGuestMode } from "./auth.js?v=37.0";
import { isFirebaseInitialized } from "./firebase-init.js?v=37.0";

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

/**
 * Creates a new notebook document in Firestore or LocalStorage.
 */
export async function createBook(name, slotIndex = 0) {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";
    const db = getFirebaseDb();

    if (isGuestMode() || !isFirebaseInitialized() || !db) {
        const books = getUserLocalBooks(userId);
        const newBook = {
            id: "book_" + Date.now(),
            userId: userId,
            name: name,
            createdAt: { seconds: Date.now() / 1000 },
            currentPage: 1,
            maxPages: 365,
            slotIndex: slotIndex
        };
        books.unshift(newBook);
        saveUserLocalBooks(userId, books);
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
        console.warn("Firestore createBook notice, saving locally:", e);
        const books = getUserLocalBooks(userId);
        const newBook = {
            id: "book_" + Date.now(),
            userId: userId,
            name: name,
            createdAt: { seconds: Date.now() / 1000 },
            currentPage: 1,
            maxPages: 365,
            slotIndex: slotIndex
        };
        books.unshift(newBook);
        saveUserLocalBooks(userId, books);
        return newBook.id;
    }
}

/**
 * Fetches all notebooks belonging to the current user.
 */
export async function getUserBooks() {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";

    if (isGuestMode() || !isFirebaseInitialized()) {
        return getUserLocalBooks(userId);
    }

    try {
        const db = getFirebaseDb();
        if (!db) return getUserLocalBooks(userId);

        const q = query(
            collection(db, "books"),
            where("userId", "==", userId)
        );

        const querySnapshot = await getDocs(q);
        const books = [];
        querySnapshot.forEach((doc) => {
            books.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (books.length === 0) {
            return getUserLocalBooks(userId);
        }

        books.sort((a, b) => {
            const timeA = a.createdAt ? (a.createdAt.seconds || 0) : 0;
            const timeB = b.createdAt ? (b.createdAt.seconds || 0) : 0;
            return timeB - timeA;
        });

        return books;
    } catch (e) {
        console.warn("Firestore getUserBooks notice, using local books fallback:", e);
        return getUserLocalBooks(userId);
    }
}

/**
 * Deletes a notebook.
 */
export async function deleteBook(bookId) {
    const user = getCurrentUser();
    const userId = user ? user.uid : "guest_user";

    let books = getUserLocalBooks(userId);
    books = books.filter(b => b.id !== bookId);
    saveUserLocalBooks(userId, books);

    if (isGuestMode() || !isFirebaseInitialized()) return;

    try {
        const db = getFirebaseDb();
        if (!db) return;
        await deleteDoc(doc(db, "books", bookId));

        const pagesCol = collection(db, "books", bookId, "pages");
        const pagesSnapshot = await getDocs(pagesCol);
        const deletePromises = [];
        pagesSnapshot.forEach((pageDoc) => {
            deletePromises.push(deleteDoc(doc(db, "books", bookId, "pages", pageDoc.id)));
        });
        await Promise.all(deletePromises);
    } catch (e) {
        console.warn("Firestore deleteBook notice:", e);
    }
}

/**
 * Gets page content, custom date, and drawings for a specific page.
 */
export async function getPageData(bookId, pageNumber) {
    const localText = localStorage.getItem(`guest_page_${bookId}_${pageNumber}`) || "";
    const localDate = localStorage.getItem(`date_${bookId}_${pageNumber}`) || "";
    let localDrawings = [];
    try {
        const rawDrawings = localStorage.getItem(`drawings_${bookId}_${pageNumber}`);
        if (rawDrawings) localDrawings = JSON.parse(rawDrawings);
    } catch (e) {
        console.warn("Failed to parse local drawings:", e);
    }

    if (isGuestMode() || !isFirebaseInitialized()) {
        return { textContent: localText, customDate: localDate, drawings: localDrawings };
    }

    try {
        const db = getFirebaseDb();
        const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
        const pageSnapshot = await getDoc(pageDocRef);
        
        if (pageSnapshot.exists()) {
            const data = pageSnapshot.data();
            const cloudText = data.textContent !== undefined ? data.textContent : localText;
            const cloudDate = data.customDate !== undefined ? data.customDate : localDate;
            const cloudDrawings = data.drawings !== undefined ? data.drawings : localDrawings;

            if (cloudDate) {
                localStorage.setItem(`date_${bookId}_${pageNumber}`, cloudDate);
            }
            if (cloudDrawings && Array.isArray(cloudDrawings)) {
                localStorage.setItem(`drawings_${bookId}_${pageNumber}`, JSON.stringify(cloudDrawings));
            }

            return { textContent: cloudText, customDate: cloudDate, drawings: cloudDrawings };
        }
        return { textContent: localText, customDate: localDate, drawings: localDrawings };
    } catch (e) {
        console.warn("Firestore page read error, using local fallback:", e);
        return { textContent: localText, customDate: localDate, drawings: localDrawings };
    }
}

/**
 * Gets the text content of a specific page inside a book.
 */
export async function getPageContent(bookId, pageNumber) {
    const data = await getPageData(bookId, pageNumber);
    return data.textContent;
}

/**
 * Saves/Autosaves text content, custom date, and drawings for a specific page.
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

    if (isGuestMode() || !isFirebaseInitialized()) {
        const books = getLocalGuestBooks();
        const book = books.find(b => b.id === bookId);
        if (book) {
            book.currentPage = pageNumber;
            saveLocalGuestBooks(books);
        }
        return;
    }

    try {
        const db = getFirebaseDb();
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
        const bookDocRef = doc(db, "books", bookId);
        await updateDoc(bookDocRef, {
            currentPage: pageNumber
        });
    } catch (e) {
        console.warn("Firestore updateCurrentPage error:", e);
    }
}

/**
 * Renames an existing notebook document.
 */
export async function renameBook(bookId, newName) {
    if (isGuestMode() || !isFirebaseInitialized()) {
        const books = getLocalGuestBooks();
        const book = books.find(b => b.id === bookId);
        if (book) {
            book.name = newName;
            saveLocalGuestBooks(books);
        }
        return;
    }

    const db = getFirebaseDb();
    const bookDocRef = doc(db, "books", bookId);
    await updateDoc(bookDocRef, {
        name: newName
    });
}
