/**
 * Lokaler Speicher im Browser (IndexedDB). Anders als localStorage
 * (ca. 5 MB) reicht der Platz auch für viele Einträge mit Fotos.
 */

const DB_NAME = "peter_diary";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB ist nicht verfügbar"));
        return;
      }

      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("IndexedDB ist blockiert"));
    });

    // Nach einem Fehler beim nächsten Mal neu versuchen
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }

  return dbPromise;
}

class LocalStore {
  async get(key: string): Promise<unknown> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async set(key: string, value: unknown): Promise<void> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");

      transaction.objectStore(STORE).put(value, key);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export default new LocalStore();
