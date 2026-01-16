
import { startDexie, testStartDexie } from '/universal-dexie-starter';

await testStartDexie();
await testStartDexie("fake");
await testStartDexie("named");


function astDB() {

        const db = new Dexie("astdb");

        db.version(1).stores({
            // High-level metadata about a file
            files: '++fId, &fileName', 

            // Represents a snapshot of a file at a point in time
            fileVersions: '++fvId, fId, fileHash, time', 

            // D-R-Y: Content storage. 
            // If two versions have the same function, they point to the same fnId.
            functions: '++fnId, &funcHash, functionName',

            // The actual AST Nodes/Tokens
            // Indexed by fvId for fast loading of a single file's tree
            tokens: '++tokId, fvId, type, name, [fvId+type]', 

            // Hierarchical tracking
            scopes: '++scId, fvId, parentScId, [fvId+parentScId]',

            // Mapping table: Connects tokens to scopes and tracks their order
            // index is crucial for regenerating the code or "structural" diffing
            scopeNodes: '++snId, scId, tokId, index',

            // Global Search Index: find where names are used across the whole DB
            declarations: '++dId, name, fvId, tokId'
        });
}


function getTokens(code) {

    const comments = [];
    const tokens = [];
    const config = {
        ecmaVersion: 2020, // Support modern JS syntax
        sourceType: "module",
        onComment: comments,
        onToken : tokens,
        locations:true,
        range : true,
    };

    let ast;
    try {
        ast = acorn.parse(code, config);
    } catch (e) {
        if (editor && e.loc) {

            const range = new Range(e.loc.line - 1, 0, e.loc.line, 0);
            const session = clearMarkersAndGetSession(editor);
            session.addMarker(range, "ace-diff-error", e.message); // or "text" for precise spans
            editor.moveCursorTo(e.loc.line - 1, e.loc.column);
        }

        throw e;
    }

    

}


const is = /./.test;
const isIdentifier = is.bind(/Identifier/);
const isMemberExpression = is.bind(/MemberExpression/);
const isFunctionDeclaration = is.bind(/FunctionDeclaration/);
const isVariableDeclaration = is.bind(/VariableDeclaration/);

const isExpressionStatement = is.bind(/ExpressionStatement/);
const isCallExpression = is.bind(/CallExpression/);

const isArrowFunctionExpression = is.bind(/ArrowFunctionExpression/);
const isFunctionExpression = is.bind(/FunctionExpression/);

const isFunctionOrArrowExpression = is.bind(/FunctionExpression|ArrowFunctionExpression/);


let sumId = 1;
const getNextSummaryId = () => `sum_id_${sumId++}`;
const clickIds = new Map();


const modeList = ace.require("ace/ext/modelist");

const Range = ace.require("ace/range").Range;

function highlightDiffRegions(editor, regions, className) {

    const session = clearMarkersAndGetSession(editor);
    const doc = session.getDocument();


    regions.forEach(node => {
        if (!node) return;

        // Convert Acorn linear character offsets to Ace Row/Col
        const start = doc.indexToPosition(node.start);
        const end = doc.indexToPosition(node.end);

        const range = new Range(start.row, start.column, end.row, end.column);
        session.addMarker(range, className, "text"); // or "text" for precise spans
    });
}

function clearMarkersAndGetSession(editor) {
    const session = editor.getSession();
    const markers = session.getMarkers(); // Returns an object of marker IDs

    for (const id in markers) {
        // Ace has some default markers (like for the cursor/selection)
        // We only want to remove the ones we added (ace-diff-added/removed)
        const clazz = markers[id].clazz;
        if (/ace-diff-(added|removed|error)/.test(clazz)) {
            session.removeMarker(id);
        }
    }

    return session;
}


function updateEditor (editor, code, filename, needTheme, onEdits) {


    if (!/undefined/.test(typeof onEdits)) editor.setReadOnly(onEdits === false);



    if (/string/.test(typeof code)) {
        editor.setValue(code);
        editor.gotoLine(1);
    }

    const session = editor.getSession();

    if (/string/.test(typeof filename)) {
        const modeObject = modeList.getModeForPath(filename);
        if (session.getMode() !== modeObject.mode) {
            session.setMode(modeObject.mode);
        }
    }
    if (/string/.test(typeof needTheme)) {
        if (editor.getTheme() !== needTheme) {
            editor.setTheme(needTheme);
        }
    }

    if (/function/.test(typeof onEdits)) {
        editor.on("change", () => {
            onEdits(editor, editor.getValue());
        });
    }


}



function generateSummaryHTML(report) {
    if (!report || report.length === 0) return `<div class="diff-item status-unchanged">No changes detected.</div>`;

    let html = '<div class="diff-summary-container">';

    report.forEach(edit => {
        const type = edit.type;
        const item = edit.item || {};
        const key = item.key || edit.key || "Statement";


        // Grab the summary from the node (we ensure it exists in the next step)
        const summary = item.node ? (item.node.summary || "") : "";
        const summaryId = item.node.summaryId;

        if (type === 'UNCHANGED') return;

        clickIds.set(summaryId, edit);

        html += `
            <div class="diff-item status-${type.toLowerCase()}" id="${summaryId}" onclick="summaryLineClick('${summaryId}');" >
                <span class="diff-item-type">${type}</span>
                <span class="identity-label">${key}</span>
                <span class="summary-source">${summary}</span>
            </div>
        `;

        if (type === 'MODIFIED' && edit.subDiff) {
            html += `<div class="sub-diff-container">
                        ${generateSummaryHTML(edit.subDiff)}
                     </div>`;
        }
    });

    html += '</div>';


    return html;
}

document.addEventListener(window.MSG_NAME, (e) => {

    const opts = {
        ...e.detail,
        editorA: ace.edit("code-display-ace"),
        editorB: ace.edit("code-display-ace-b")
    };

    const onEdits = (editor, codeB) => {
        diffFilesFromSource({ ...opts, codeB });
    };

    updateEditor(opts.editorA, opts.codeA, opts.filenameA, "ace/theme/cobalt", false);
    updateEditor(opts.editorB, opts.codeB, opts.filenameB, "ace/theme/chaos", onEdits);


    diffFilesFromSource(opts);
});
const config = {
    ecmaVersion: 2020, // Support modern JS syntax
    sourceType: "module"
};

const outputDiv = document.getElementById("output-div");




async function diffFilesFromSource({
    filenameA,
    filenameB,
    codeA,
    codeB,
    editorA,
    editorB
}) {


    try {
        // Parse the code into an AST

        const report = await getDiffReport(codeA, codeB, editorA, editorB);
        const { removed, added, modified } = flattenReport(report);
        // Apply markers to all depths


        highlightDiffRegions(editorA, removed, "ace-diff-removed");
        highlightDiffRegions(editorB, added, "ace-diff-added");

        // Highlight modified regions in both editors
        highlightDiffRegions(editorA, modified.map(m => m.nodeA), "ace-diff-modified");
        highlightDiffRegions(editorB, modified.map(m => m.nodeB), "ace-diff-modified");



        // Clear and Update Summary
        clickIds.clear();
        outputDiv.innerHTML = `
            <div style="padding:10px; border-bottom:1px solid #333; background:#1a1a2e;">
                <h3 style="margin:0; font-size:1rem; color:#60a5fa;">Structural Diff Summary</h3>
            </div>
            ${generateSummaryHTML(report)}
        `;

        window.summaryLineClick = (id) => {
            const edit = clickIds.get(id);
            if (!edit) return;

            // Determine target based on type
            // REMOVED -> Focus Editor A
            // ADDED/MODIFIED -> Focus Editor B (or both)
            const isRemoved = edit.type === "REMOVED";
            const targetEditor = isRemoved ? editorA : editorB;
            const node = edit.item.node;

            if (node && typeof node.start === 'number') {
                const session = targetEditor.getSession();
                const doc = session.getDocument();

                // Convert Acorn indices to Ace Position
                const startPos = doc.indexToPosition(node.start);
                const endPos = doc.indexToPosition(node.end);

                // Create the Range object
                const range = new Range(startPos.row, startPos.column, endPos.row, endPos.column);

                // Scroll to and select
                targetEditor.focus();
                targetEditor.scrollToLine(startPos.row, true, true, () => { });
                targetEditor.getSelection().setRange(range);
            }
        };


        window.summaryLineClick = (id) => {
            const edit = clickIds.get(id);
            if (!edit) return;

            const selectInEditor = (editor, node) => {
                if (!node || typeof node.start !== 'number') return;
                const session = editor.getSession();
                const startPos = session.getDocument().indexToPosition(node.start);
                const endPos = session.getDocument().indexToPosition(node.end);
                const range = new Range(startPos.row, startPos.column, endPos.row, endPos.column);

                editor.scrollToLine(startPos.row, true, true, () => { });
                editor.getSelection().setRange(range);
            };

            if (edit.type === "MODIFIED") {
                // Highlight Editor A (Old) AND Editor B (New)
                selectInEditor(editorA, edit.item.node);
                selectInEditor(editorB, edit.matchNode);
                editorB.focus(); // Focus the active editor
            } else if (edit.type === "REMOVED") {
                selectInEditor(editorA, edit.item.node);
                editorA.focus();
            } else if (edit.type === "ADDED") {
                selectInEditor(editorB, edit.item.node);
                editorB.focus();
            }
        };

    } catch (err) {

        clickIds.clear();
        outputDiv.innerHTML = `<H1>Parsing Error:  <span style="color:red;">${err}</span> </H1`;
    }

}

// Helper to strip location data so hashes stay the same even if code moves
function sanitizeNode(node) {
    return JSON.stringify(node, (key, value) => {
        if (/start|end|loc/.test(key)) return undefined;
        return value;
    });
}

function getCalleeName(node) {
    if (isIdentifier(node.type)) return node.name;
    if (isMemberExpression(node.type)) {
        const object = getCalleeName(node.object);
        const property = getCalleeName(node.property);
        return `${object}.${property}`;
    }
    return 'anonymous';
}

async function sha256Digest(text) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).toBase64({ alphabet: 'base64url', omitPadding: true });
}


async function categorizeAndHash(code, editor) {
    let ast;
    try {
        ast = acorn.parse(code, config);
    } catch (e) {
        if (editor && e.loc) {

            const range = new Range(e.loc.line - 1, 0, e.loc.line, 0);
            const session = clearMarkersAndGetSession(editor);
            session.addMarker(range, "ace-diff-error", e.message); // or "text" for precise spans
            editor.moveCursorTo(e.loc.line - 1, e.loc.column);
        }

        throw e;
    }
    const hoisted = new Map(); // Name -> Hash
    const sequential = [];    // Array of { type, key, hash }

    for (let index = 0; index < ast.body.length; index++) {
        const node = ast.body[index];

        // 1. Calculate hash on the CLEAN node
        const structuralContent = sanitizeNode(node);
        const hash = await sha256Digest(structuralContent);

        // 2. Attach summary AFTER hashing (or store it in the sequential object)
        const { summary, summaryId } = getNodeSummary(node, code);

        sequential.push({
            key: getIdentity(node) || node.type,
            hash,
            index,
            node: { ...node, summary, summaryId } // Clone with summary for the UI
        });
    }


    return { hoisted, sequential };
}

function diffSequences(arrA, arrB) {
    const n = arrA.length;
    const m = arrB.length;
    const lcsMatrix = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    // 1. Build the LCS Matrix
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (arrA[i - 1].hash === arrB[j - 1].hash) {
                lcsMatrix[i][j] = lcsMatrix[i - 1][j - 1] + 1;
            } else {
                lcsMatrix[i][j] = Math.max(lcsMatrix[i - 1][j], lcsMatrix[i][j - 1]);
            }
        }
    }

    // 2. Backtrack to find the edits
    let i = n, j = m;
    const edits = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && arrA[i - 1].hash === arrB[j - 1].hash) {
            edits.unshift({ type: 'UNCHANGED', item: arrA[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || lcsMatrix[i][j - 1] >= lcsMatrix[i - 1][j])) {
            edits.unshift({ type: 'ADDED', item: arrB[j - 1] });
            j--;
        } else {
            edits.unshift({ type: 'REMOVED', item: arrA[i - 1] });
            i--;
        }
    }
    return edits;
}

async function fullDiff(codeA, codeB, editorA, editorB) {

    const log = [];
    const console = { log: function () { log.push([...arguments].join(' ')) } };

    // we pass in the editor to add any parse error locations
    const dataA = await categorizeAndHash(codeA, editorA);
    const dataB = await categorizeAndHash(codeB, editorB);

    console.log("--- HOISTED FUNCTIONS (Order Independent) ---");
    const allFuncs = new Set([...dataA.hoisted.keys(), ...dataB.hoisted.keys()]);
    allFuncs.forEach(name => {
        const hashA = dataA.hoisted.get(name);
        const hashB = dataB.hoisted.get(name);
        if (!hashA) console.log(`[ADDED] Function: ${name}`);
        else if (!hashB) console.log(`[REMOVED] Function: ${name}`);
        else if (hashA !== hashB) console.log(`[CHANGED] Function: ${name}`);
    });

    console.log("\n--- SEQUENTIAL CODE (Order Dependent) ---");
    const maxLen = Math.max(dataA.sequential.length, dataB.sequential.length);
    for (let i = 0; i < maxLen; i++) {
        const itemA = dataA.sequential[i];
        const itemB = dataB.sequential[i];

        if (!itemA) {
            console.log(`[POS ${i}] ADDED: ${itemB.key}`);
        } else if (!itemB) {
            console.log(`[POS ${i}] REMOVED: ${itemA.key}`);
        } else if (itemA.hash !== itemB.hash) {
            // If the hash is different, something at this execution step changed
            console.log(`[POS ${i}] CHANGED: ${itemA.key} (Logic or Order shift)`);
        }
    }

    console.log("\n--- SEQUENTIAL CODE (Shift-Aware) ---");
    const sequentialEdits = diffSequences(dataA.sequential, dataB.sequential);

    sequentialEdits.forEach(edit => {
        const { type, item } = edit;
        const label = `[${type}]`.padEnd(12);
        console.log(`${label} ${item.key}`);
    });

    return {
        allFuncs: [...allFuncs],
        log
    };
}


function getIdentity(node) {
    if (isFunctionDeclaration(node.type)) return `func:${node.id.name}`;
    if (isVariableDeclaration(node.type)) return `var:${node.declarations[0].id.name}`;
    if (isExpressionStatement(node.type) && isCallExpression(node.expression.type)) {
        const callee = getCalleeName(node.expression.callee);
        const firstArg = node.expression.arguments[0];
        const route = (firstArg && firstArg.type === 'Literal') ? firstArg.value : 'init';
        return `call:${callee}(${route})`;
    }
    return null;
}

async function getDiffReport(codeA, codeB, editorA, editorB) {
    // Step A: Parse and Categorize (from our previous step)
    const dataA = await categorizeAndHash(codeA, editorA);
    const dataB = await categorizeAndHash(codeB, editorB);

    // Step B: Run the raw LCS diff on the sequential parts
    const rawEdits = diffSequences(dataA.sequential, dataB.sequential);

    // Step C: Run analyzeDiff to turn "Add/Remove" pairs into "MODIFIED"
    const analyzedReport = await analyzeDiff(rawEdits, codeA, codeB);

    return analyzedReport;
}

function flattenReport(report, removed = [], added = [], modified = []) {
    report.forEach(edit => {
        if (edit.type === 'REMOVED') removed.push(edit.item.node);
        if (edit.type === 'ADDED') added.push(edit.item.node);
        if (edit.type === 'MODIFIED') {
            // Track the pair: old node (A) and the first node of subDiff or the match
            modified.push({ nodeA: edit.item.node, nodeB: edit.matchNode });
            if (edit.subDiff) flattenReport(edit.subDiff, removed, added, modified);
        }
    });
    return { removed, added, modified };
}

// Update analyzeDiff to include the matchNode in the report
async function analyzeDiff(edits, codeA, codeB) {
    const finalReport = [];
    const addedPool = edits.filter(e => e.type === 'ADDED');

    for (const edit of edits) {
        if (edit.type === 'UNCHANGED') {
            finalReport.push(edit);
            continue;
        }

        if (edit.type === 'REMOVED') {
            const identity = getIdentity(edit.item.node);
            const matchIndex = addedPool.findIndex(a => getIdentity(a.item.node) === identity);

            if (matchIndex !== -1) {
                const match = addedPool[matchIndex];
                finalReport.push({
                    type: 'MODIFIED',
                    item: edit.item,
                    matchNode: match.item.node, // Store the corresponding node in Editor B
                    subDiff: await drillDown(edit.item.node, match.item.node, codeA, codeB)
                });
                addedPool.splice(matchIndex, 1);
            } else {
                finalReport.push(edit);
            }
        }
    }
    addedPool.forEach(a => finalReport.push(a));
    return finalReport;
}


async function sanitizeAndHash(node) {
    const structuralContent = JSON.stringify(node, (key, value) => {
        // Remove location metadata so identical code at different lines matches
        if (/start|end|loc|range/.test(key)) {
            return undefined;
        }
        return value;
    });
    // Use btoa with URI encoding to handle potential unicode characters safely
    return sha256Digest(structuralContent);
}




function getNodeSummary(node, code) {
    if (!node || !code) return { summary: "", summaryId: getNextSummaryId() };
    try {
        let raw = code.substring(node.start, node.end);
        if (raw.length < 0) raw = code.substring(node.start);
        // Clean up: remove newlines/extra spaces to keep it on one line
        let clean = raw.replace(/\s+/g, ' ').trim();
        const max = 60;
        if (clean.length > max) {
            clean = clean.substring(0, 27) + "..." + clean.substring(clean.length - 27);
        }
        return { summary: clean, summaryId: getNextSummaryId() };
    } catch (e) {
        return { summary: node.type || "", summaryId: getNextSummaryId() };
    }
}
async function drillDown(oldNode, newNode, codeA, codeB) {
    const getStatements = (n) => {
        if (isFunctionDeclaration(n.type)) return n.body.body;
        if (isExpressionStatement(n.type)) {
            const callback = n.expression.arguments.find(arg => isFunctionOrArrowExpression(arg.type));
            return callback ? callback.body.body : [];
        }
        return [];
    };

    // Note: We need to pass the codes down to get the source text for summaries
    const oldStatements = await Promise.all(getStatements(oldNode).map(async (s) => {
        const { summary, summaryId } = getNodeSummary(s, codeA);
        return {
            hash: await sanitizeAndHash(s),
            key: s.type,
            node: { ...s, summary, summaryId } // Attach summary here for the sub-report
        };
    }));

    const newStatements = await Promise.all(getStatements(newNode).map(async (s) => {
        const { summary, summaryId } = getNodeSummary(s, codeB);
        s.summary = summary;
        s.summaryId = summaryId;
        return { hash: await sanitizeAndHash(s), key: s.type, node: s };
    }));

    return diffSequences(oldStatements, newStatements);
}

async function simulateDiffMessageEvent() {
    const filenameA = "/sampleA.js";
    const filenameB = "/sampleB.js";

    const codeA = await (await fetch(filenameA)).text();
    const codeB = await (await fetch(filenameB)).text();

    document.dispatchEvent(
        new CustomEvent(window.MSG_NAME, {
            detail: {
                filenameA: filenameA.split("/").pop(),
                filenameB: filenameB.split("/").pop(),
                codeA,
                codeB,
            }
        }));
}

function setupResizers() {
    const wrapper = document.getElementById('editor-wrapper');
    const leftEditor = document.getElementById('code-display-ace');
    const resizerV = document.getElementById('resizer-v');
    const resizerH = document.getElementById('resizer-h');
    const outputDiv = document.getElementById('output-div');

    // Vertical Resizer (Left vs Right)
    resizerV.addEventListener('mousedown', (e) => {
        document.addEventListener('mousemove', resizeV);
        document.addEventListener('mouseup', () => document.removeEventListener('mousemove', resizeV));
    });

    function resizeV(e) {
        const percent = (e.pageX / window.innerWidth) * 100;
        leftEditor.style.flex = `0 0 ${percent}%`;
        // Force Ace to refresh
        ace.edit("code-display-ace").resize();
        ace.edit("code-display-ace-b").resize();
    }

    // Horizontal Resizer (Editors vs Log)
    resizerH.addEventListener('mousedown', (e) => {
        document.addEventListener('mousemove', resizeH);
        document.addEventListener('mouseup', () => document.removeEventListener('mousemove', resizeH));
    });

    function resizeH(e) {
        const editorHeight = e.pageY;
        wrapper.style.height = `${editorHeight}px`;
        wrapper.style.flex = 'none';
        // Force Ace to refresh
        ace.edit("code-display-ace").resize();
        ace.edit("code-display-ace-b").resize();
    }
}

// Call this inside your window load listener
window.addEventListener('load', () => {
    setupResizers();
    simulateDiffMessageEvent();
});



