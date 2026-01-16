/**
 * Universal Dexie Loader
 * Handles Browser, Node.js, and In-Memory (Mock) environments seamlessly.
 */

let fakeindexedDBHandler = null;
const dynImportlibCache = new Map();

/**
 * Internal helper to handle dynamic imports with caching.
 * Prevents redundant overhead when toggling multiple database instances.
 */
const dynImport = async (libPath) => {
    if (!dynImportlibCache.has(libPath)) {
        dynImportlibCache.set(libPath, await import(libPath));
    }
    return dynImportlibCache.get(libPath);
};

/**
 * Secondary IndexDB Handler for Express.
 * Locates the physical path of fake-indexeddb assets for browser-side mocks.
 */
async function get_fakeindexedDBHandler() {
    if (!fakeindexedDBHandler) {
        const { fileURLToPath } = await import('node:url');
        const { dirname, join, resolve } = await import('node:path');
        const { promises: fs } = await import('node:fs');

        // Resolve the entry point and back out to find the build directory
        const resolvedUrl = import.meta.resolve("fake-indexeddb");
        const dir = join(dirname(fileURLToPath(resolvedUrl)), "build/esm");

        fakeindexedDBHandler = async (baseurl) => {
            const fspath = resolve(dir, baseurl);
            if (fspath.startsWith(dir)) { // Simple path traversal guard
                try {
                    const stats = await fs.lstat(fspath);
                    if (stats.isFile()) return fspath;
                } catch (e) {
                    console.info("[Dexie Loader] bad url request:", e.message);
                }
            }
            return null;
        };
    }
    return fakeindexedDBHandler;
}

/**
 * Express Middleware.
 * 1. Serves this loader file itself to the client.
 * 2. Proxies fake-indexeddb requests so in-memory DBs work in the browser.
 */
export async function startDexieExpress(req, res, next) {
    if (req.method !== 'GET') return next();
    
    // Serve this script to the frontend
    if (req.url.endsWith("start-dexie.js")) {
        return res.sendFile(import.meta.filename);
    }

    // Match browser requests for the fake-indexeddb shim
    const baseurl = /fake\-indexeddb\/(.*)$/.exec(req.url);
    if (!baseurl) return next();

    const handler = fakeindexedDBHandler || (await get_fakeindexedDBHandler());
    if (handler) {
        const localfile = await handler(baseurl[1]);
        if (localfile) return res.sendFile(localfile);
    }
    return next();
}

/**
 * The Primary Entry Point.
 * @param {string} dbName - The name of your database.
 * @param {string|'fake'} databaseBasePath - Path for Node storage, or 'fake' for in-memory.
 * @param {object} extraOpts - Standard Dexie constructor options.
 */
export async function startDexie(dbName, databaseBasePath, extraOpts = {}) {
    const isNode = typeof process === 'object' && process.versions && process.versions.node;
    const fakeIt = databaseBasePath === 'fake';

    // 1. Resolve Dexie Source
    const { Dexie } = await dynImport(isNode ? "dexie" : "/static/dexie/dexie.mjs");

    let dexieOpts = {};

    if (fakeIt) {
        // Mode: In-Memory (Browser or Node)
        const { indexedDB, IDBKeyRange } = await dynImport(isNode ? "fake-indexeddb" : "/fake-indexeddb/index.js");
        dexieOpts = { indexedDB, IDBKeyRange };
    } else if (isNode) {
        // Mode: Persistent Node.js (SQLite Shim)
        const { promises: fs } = await dynImport("node:fs");
        const { resolve } = await dynImport("node:path");
        const setGlobalVars = (await dynImport("indexeddbshim")).default;

        const base = databaseBasePath || resolve("./.idb-data");
        await fs.mkdir(base, { recursive: true });

        const shim = {};
        setGlobalVars(shim, {
            checkOrigin: false,
            databaseBasePath: base 
        });

        dexieOpts = { indexedDB: shim.indexedDB, IDBKeyRange: shim.IDBKeyRange };
    } else {
        // Mode: Persistent Browser (IndexedDB)
        if (typeof databaseBasePath === 'string') {
            // Segregate DBs in the flat IDB namespace using pseudo-paths
            dbName = `${dbName}@${databaseBasePath}`;
        }
    }

    return new Dexie(dbName, { ...dexieOpts, ...extraOpts });
}