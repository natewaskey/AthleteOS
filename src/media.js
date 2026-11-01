/*
 * Video storage. Blobs live in IndexedDB (localStorage is far too small for video);
 * metadata lives in the main app state. Analyses shared with the coach are also copied to cloud
 * storage (Cloud.uploadMedia) so they can be replayed on another device.
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
    async getPoses(id) {
      const local = await tx('readonly', (s) => s.get(id), POSES);
      if (local) return local;
      const blob = await fromCloud('poses', id);
      if (!blob) return local;
      try {
        const data = JSON.parse(await blob.text());
        Media.putPoses(id, data).catch(() => {});
        return data;
      } catch {
        return local;
      }
    },
    /*
     * Upload an analysis's video and pose data so the coach (or the athlete on another device) can replay it.
     * Returns { video, poses } cloud paths for the fields that were uploaded.
     */
    async share(an) {
      const Cloud = root.Cloud;
      if (!Cloud || !Cloud.team || !Cloud.team()) return null;
      const out = { ...(an.cloud || {}) };
      if (an.videoId && !out.video) {
        const blob = await Media.get(an.videoId);
        if (blob) {
          const ext = /mp4/.test(blob.type) ? 'mp4' : /webm/.test(blob.type) ? 'webm' : 'mov';
          out.video = await Cloud.uploadMedia(Cloud.mediaPath(an.athleteId, `${an.videoId}.${ext}`), blob, blob.type || 'video/mp4');
        }
      }
      if (!out.poses) {
        const poses = await tx('readonly', (s) => s.get(an.id), POSES);
        if (poses) out.poses = await Cloud.uploadMedia(Cloud.mediaPath(an.athleteId, `${an.id}.poses.json`), JSON.stringify(poses), 'application/json');
      }
      return out;
    },
    removePoses(id) {
      return tx('readwrite', (s) => s.delete(id), POSES);
    },
    // Where a video or pose file lives in the cloud, if it was shared: set by the app. (kind, id) -> path | null
    cloudPath: () => null,
    // Object URL for a stored video, cached so re-renders don't reload it. Falls back to the cloud copy
    // (a coach watching an athlete's shared set on their own device). Null if missing.
    async url(id) {
      if (urlCache.has(id)) return urlCache.get(id);
      let blob = await Media.get(id);
      if (!blob) blob = await fromCloud('video', id, (b) => Media.put(id, b));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(id, url);
      return url;
    },
  };

  const pending = new Map();
  function fromCloud(kind, id, keep) {
    const path = Media.cloudPath(kind, id);
    if (!path || !root.Cloud || !root.Cloud.downloadMedia) return Promise.resolve(null);
    const k = `${kind}:${id}`;
    if (!pending.has(k))
      pending.set(
        k,
        root.Cloud.downloadMedia(path)
          .then((b) => {
            if (b && keep) keep(b).catch(() => {});
            return b;
          })
          .catch(() => null)
          .finally(() => setTimeout(() => pending.delete(k), 5000))
      );
    return pending.get(k);
  }

  root.Media = Media;
})(typeof window !== 'undefined' ? window : globalThis);
