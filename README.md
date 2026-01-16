# Universal Dexie Starter
A zero-config, environment-agnostic loader for **Dexie.js**. This utility allows you to write your database logic once and run it seamlessly across Node.js (SQLite), Browsers (IndexedDB), and Headless/Testing environments (In-Memory) without changing your code.

<img src="start-dexie.jpg" style="width:50vw;height:auto;">


## Key Features

- **Environment Parity:** One initialization function for Browser and Node.js.
- **Persistent Node.js Storage:** Automatically configures `indexeddbshim` backed by SQLite for server-side persistence.
- **In-Memory Mocks:** Toggle `fake-indexeddb` by simply passing `'fake'` as a path—perfect for unit tests.
- **Express Middleware:** Includes a built-in handler to serve required browser-side shims and the loader script itself.
- **Dynamic Imports:** Uses a cached dynamic import system to keep the footprint small and only load what is needed for the current environment.

## Installation

Ensure you have the package installed in your project:

```bash
# most recent version (tested,stable)
npm install --save github:jonathan-annett/universal-dexie-starter#d03b168322c935175c9aa8082db93b0df63253fa
```

To install the latest version, and test on posix systens (eg linux, mac os)
```bash

#make a folder and change to it
mkdir -p ~/test-dexie-starter 
cd ~/test-dexie-starter
#make sure you have a project package.json
npm init -y
# remove any previous version if you have done this before
npm list | grep universal-dexie-starter && npm remove universal-dexie-starter

#install latest
npm install --save github:jonathan-annett/universal-dexie-starter

cd ./node_modules/universal-dexie-starter
npm run test

```



## Usage

### 1. The Loader Function (`startDexie`)

The `startDexie` function detects your environment and returns a standard Dexie instance.

```javascript
//import { startDexie } from '/universal-dexie-starter';  // use this in the browser (when using the middleware)
import { startDexie } from 'universal-dexie-starter';     // use this in node.js

// --- Browser Mode ---
// Uses native IndexedDB.
const db = await startDexie("my-app-db");

// --- Node.js Persistent Mode ---
// Uses SQLite. Defaults to storing data in ./.idb-data
const serverDb = await startDexie("server-storage");

// --- Mock / Testing Mode ---
// Creates a sandboxed in-memory database (works in Node & Browser)
const testDb = await startDexie("test-run", "fake");

// Define your schema as usual
db.version(1).stores({
    records: '++index, &hash, data'
});
```

### 2. Express Integration

To allow browsers to use the "fake" in-memory mode or to easily distribute the loader script to the frontend, mount the middleware:

```javascript
import express from 'express';
import { startDexieExpress } from 'universal-dexie-starter';

const app = express();

// Serves start-dexie.js and proxies fake-indexeddb assets
app.use(startDexieExpress);

app.listen(3000);
```

## Technical Architecture

[Image of a diagram showing universal Dexie initialization across Node.js and Browser environments]

### ID Segregation in Browser
In a real browser, IndexedDB has a flat namespace. To prevent collisions when using pseudo-paths, this tool automatically renames databases using an `@` delimiter:
`dbName + "@" + databaseBasePath`

### API Reference

#### `startDexie(dbName, databaseBasePath, extraOpts)`

| Argument | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `dbName` | `string` | **Required** | The name of the database. |
| `databaseBasePath` | `string` | `undefined` | **Node:** Path to SQLite storage. **Browser:** Path prefix. **'fake'**: Triggers in-memory mode. |
| `extraOpts` | `object` | `{}` | Standard Dexie constructor options. |

## License

MIT
