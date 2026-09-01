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
import { getFirebaseDb } from "./firebase-init.js?v=5.1";
import { getCurrentUser } from "./auth.js?v=5.1";

/**
 * Creates a new notebook document in Firestore.
 * Each book starts on Page 1 and has a maximum of 365 pages.
 * @param {string} name Title of the notebook
 * @returns {Promise<string>} The new document ID (bookId)
 */
export async function createBook(name, slotIndex = 0) {
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
 * Fetches all notebooks belonging to the currently logged in user.
 * @returns {Promise<Array>} Array of book objects containing id and fields
 */
export async function getUserBooks() {
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

    // Sort by creation date descending on the client-side to bypass database index requirements
    books.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt.seconds || 0) : 0;
        const timeB = b.createdAt ? (b.createdAt.seconds || 0) : 0;
        return timeB - timeA;
    });

    return books;
}

/**
 * Deletes a notebook and its subcollection contents from Firestore.
 * @param {string} bookId Document ID of the notebook
 * @returns {Promise<void>}
 */
export async function deleteBook(bookId) {
    const db = getFirebaseDb();
    
    // Delete main notebook document
    await deleteDoc(doc(db, "books", bookId));

    // Note: Deleting a collection/subcollection in Firestore client SDK doesn't automatically 
    // delete all nested subcollection documents (you normally delete them individually).
    // We will clean up the pages subcollection as well when listing or simply delete the pages 
    // we query. Since user only deletes, we can delete the pages document keys.
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
 * @param {string} bookId 
 * @param {number} pageNumber 
 * @returns {Promise<string>} Text content of the page, or empty string if it doesn't exist
 */
export async function getPageContent(bookId, pageNumber) {
    const db = getFirebaseDb();
    const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
    const pageSnapshot = await getDoc(pageDocRef);
    
    if (pageSnapshot.exists()) {
        return pageSnapshot.data().textContent || "";
    }
    return "";
}

/**
 * Saves/Autosaves text content for a specific page.
 * @param {string} bookId 
 * @param {number} pageNumber 
 * @param {string} textContent 
 * @returns {Promise<void>}
 */
export async function savePageContent(bookId, pageNumber, textContent) {
    const db = getFirebaseDb();
    
    // Save to the pages subcollection
    const pageDocRef = doc(db, "books", bookId, "pages", pageNumber.toString());
    await setDoc(pageDocRef, {
        textContent: textContent,
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Update current page progress on the main book document
    const bookDocRef = doc(db, "books", bookId);
    await updateDoc(bookDocRef, {
        currentPage: pageNumber,
        lastWriteAt: serverTimestamp()
    });
}

/**
 * Updates the last opened page reference in the database.
 * @param {string} bookId 
 * @param {number} pageNumber 
 */
export async function updateCurrentPage(bookId, pageNumber) {
    const db = getFirebaseDb();
    const bookDocRef = doc(db, "books", bookId);
    await updateDoc(bookDocRef, {
        currentPage: pageNumber
    });
}

/**
 * Renames an existing notebook document in Firestore.
 * @param {string} bookId 
 * @param {string} newName 
 * @returns {Promise<void>}
 */
export async function renameBook(bookId, newName) {
    const db = getFirebaseDb();
    const bookDocRef = doc(db, "books", bookId);
    await updateDoc(bookDocRef, {
        name: newName
    });
}
