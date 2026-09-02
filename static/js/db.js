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
import { getFirebaseDb } from "./firebase-init.js?v=14.0";
import { getCurrentUser } from "./auth.js?v=14.0";

import { isGuestMode } from "./auth.js?v=14.0";
import { isFirebaseInitialized } from "./firebase-init.js?v=14.0";

// Helper for local guest storage
function getLocalGuestBooks() {
    try {
        const data = localStorage.getItem("guest_books");
        if (data) return JSON.parse(data);
    } catch (e) {}
    // Default initial guest book
    const defaultBooks = [{
        id: "book_physics_default",
        userId: "guest_user",
        name: "physics",
        createdAt: { seconds: Date.now() / 1000 },
        currentPage: 1,
        maxPages: 365,
        slotIndex: 0
    }];
    localStorage.setItem("guest_books", JSON.stringify(defaultBooks));
    return defaultBooks;
}

function saveLocalGuestBooks(books) {
    localStorage.setItem("guest_books", JSON.stringify(books));
}

/**
 * Creates a new notebook document in Firestore or LocalStorage.
 */
export async function createBook(name, slotIndex = 0) {
    if (isGuestMode() || !isFirebaseInitialized()) {
        const books = getLocalGuestBooks();
        const newBook = {
            id: "guest_book_" + Date.now(),
            userId: "guest_user",
            name: name,
            createdAt: { seconds: Date.now() / 1000 },
            currentPage: 1,
            maxPages: 365,
            slotIndex: slotIndex
        };
        books.unshift(newBook);
        saveLocalGuestBooks(books);
        return newBook.id;
    }

    const db = getFirebaseDb();
    const user = getCurrentUser();
    if (!user) throw new Error("User must be authenticated to create a notebook.");

    const bookData = {
        userId: user.uid,
        name: name,
        createdAt: serverTimestamp(),
        currentPage: 1,
        maxPages: 365,
        slotIndex: slotIndex
    };

    const docRef = await addDoc(collection(db, "books"), bookData);
    return docRef.id;
}

/**
 * Fetches all notebooks belonging to the current user.
 */
export async function getUserBooks() {
    if (isGuestMode() || !isFirebaseInitialized()) {
        return getLocalGuestBooks();
    }

    const db = getFirebaseDb();
    const user = getCurrentUser();
    if (!user) throw new Error("User must be authenticated to fetch notebooks.");

    const q = query(
        collection(db, "books"),
        where("userId", "==", user.uid)
    );

    const querySnapshot = await getDocs(q);
    const books = [];
    querySnapshot.forEach((doc) => {
        books.push({
            id: doc.id,
            ...doc.data()
        });
    });

    books.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds || 0) : 0;
        const timeB = b.createdAt ? (b.createdAt.seconds || 0) : 0;
        return timeB - timeA;
    });

    return books;
}

/**
 * Deletes a notebook.
 */
export async function deleteBook(bookId) {
    if (isGuestMode() || !isFirebaseInitialized()) {
        let books = getLocalGuestBooks();
        books = books.filter(b => b.id !== bookId);
        saveLocalGuestBooks(books);
        return;
    }

    const db = getFirebaseDb();
    await deleteDoc(doc(db, "books", bookId));

    const pagesCol = collection(db, "books", bookId, "pages");
    const pagesSnapshot = await getDocs(pagesCol);
    const deletePromises = [];
    pagesSnapshot.forEach((pageDoc) => {
        deletePromises.push(deleteDoc(doc(db, "books", bookId, "pages", pageDoc.id)));
    });
    await Promise.all(deletePromises);
}

/**
 * Gets the text content of a specific page inside a book.
 */
export async function getPageContent(bookId, pageNumber) {
    const localFallback = localStorage.getItem(`guest_page_${bookId}_${pageNumber}`) || "";
    if (isGuestMode() || !isFirebaseInitialized()) {
        return localFallback;
    }

    try {
        const db = getFirebaseDb();
        const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
        const pageSnapshot = await getDoc(pageDocRef);
        
        if (pageSnapshot.exists()) {
            const cloudText = pageSnapshot.data().textContent || "";
            if (cloudText) return cloudText;
        }
        return localFallback;
    } catch (e) {
        console.warn("Firestore page read error, using local fallback:", e);
        return localFallback;
    }
}

/**
 * Saves/Autosaves text content for a specific page.
 */
export async function savePageContent(bookId, pageNumber, textContent) {
    // ALWAYS save to local backup first so user text is never lost!
    localStorage.setItem(`guest_page_${bookId}_${pageNumber}`, textContent);

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
        await setDoc(pageDocRef, {
            textContent: textContent,
            updatedAt: serverTimestamp()
        }, { merge: true });

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
