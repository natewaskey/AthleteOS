/*
 * Video storage. Blobs live in IndexedDB (localStorage is far too small for video);
 * metadata lives in the main app state. Swap this module for cloud storage later.
 */
(function (root) {
  'use strict';

  const DB_NAME = 'athleteos-media';
  const STORE = 'videos';
  const POSES = 'poses'; // landmark frames for form analyses
  const urlCache = new Map();
  let dbPromise = null;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!root.indexedDB) return reject(new Error('IndexedDB is not available in this browser'));
        const req = root.indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = () => {
          for (const name of [STORE, POSES]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => (dbPromise = null));
    }
    return dbPromise;
  }

  function tx(mode, fn, store = STORE) {
    return db().then(
      (d) =>
        new Promise((resolve, reject) => {
          const t = d.transaction(store, mode);
          const req = fn(t.objectStore(store));
          t.oncomplete = () => resolve(req && req.result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error || new Error('Storage aborted (quota exceeded?)'));
        })
    );
  }

  const Media = {
    put(id, blob) {
      return tx('readwrite', (s) => s.put(blob, id));
    },
    get(id) {
      return tx('readonly', (s) => s.get(id));
    },
    remove(id) {
      const url = urlCache.get(id);
      if (url) URL.revokeObjectURL(url);
      urlCache.delete(id);
      return tx('readwrite', (s) => s.delete(id));
    },
    clear() {
      urlCache.forEach((u) => URL.revokeObjectURL(u));
      urlCache.clear();
      return Promise.all([tx('readwrite', (s) => s.clear()), tx('readwrite', (s) => s.clear(), POSES)]);
    },
    putPoses(id, data) {
      return tx('readwrite', (s) => s.put(data, id), POSES);
    },
    getPoses(id) {
      return tx('readonly', (s) => s.get(id), POSES);
    },
    removePoses(id) {
      return tx('readwrite', (s) => s.delete(id), POSES);
    },
    // Object URL for a stored video, cached so re-renders don't reload it. Null if missing.
    async url(id) {
      if (urlCache.has(id)) return urlCache.get(id);
      const blob = await Media.get(id);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      return url;
    },
  };

  root.Media = Media;
})(typeof window !== 'undefined' ? window : globalThis);
