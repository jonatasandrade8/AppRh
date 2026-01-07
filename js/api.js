/**
 * API Adapter for Google Apps Script Backend
 * Replaces firebase.js functionality
 */

// --- CONFIGURATION ---
// IMPORTANT: Replace this URL with your deployed Web App URL
const API_URL = "https://script.google.com/macros/s/AKfycbxE0ZCN9zYZ4HQKEIZDFzDqu2X62PGfjFFBSzZz_OGafuXiGl1w25ERFykpemz5ZFzA2A/exec";

export const appId = 'rh-enterprise-v3';

// --- AUTH MOCK ---
// Apps Script doesn't handle auth continuously like Firebase. 
// We'll manage a simple session state here or just allow anonymous calls.
export const auth = { currentUser: { uid: 'anon' } };

export async function signInAnonymously() {
    return { user: { uid: 'anon' } };
}

export function onAuthStateChanged(authInstance, callback) {
    // Immediately trigger with a fake user to simulate logged-in state
    setTimeout(() => callback({ uid: 'anon' }), 500);
}

// --- FIRESTORE MOCK ---
export const db = {}; // Placeholder

// Helpers for query construction
export function collection(db, ...pathSegments) {
    // Flatten hierarchy: 'artifacts', appId, 'public', 'data', 'employees' -> 'employees'
    // We just take the last segment as the sheet name
    const sheetName = pathSegments[pathSegments.length - 1];
    return { type: 'collection', name: sheetName };
}

export function doc(db, ...pathSegments) {
    // If odd number of segments after db, last is ID, prev is collection
    // pathSegments: artifacts, appId, public, data, employees, '123'
    const id = pathSegments[pathSegments.length - 1];
    const coll = pathSegments[pathSegments.length - 2];
    return { type: 'doc', collection: coll, id: id };
}

// QUERY & WHERE
// We will process basic filters client-side or pass supported ones to server
export function query(collRef, ...constraints) {
    return { ...collRef, constraints };
}

export function where(field, op, value) {
    return { type: 'where', field, op, value };
}

export function orderBy(field, dir) {
    return { type: 'orderBy', field, dir };
}

// READ
export async function getDocs(queryObj) {
    const url = new URL(API_URL);
    url.searchParams.append('action', 'read');
    url.searchParams.append('collection', queryObj.name);

    // Pass simple filters if needed (optimization)
    if (queryObj.constraints) {
        queryObj.constraints.forEach(c => {
            if (c.type === 'where') {
                url.searchParams.append(c.field, c.value);
            }
        });
    }

    try {
        const res = await fetch(url);
        const json = await res.json();

        if (json.status === 'error') throw new Error(json.message);

        // Filter locally for unsupported ops or complex queries
        let data = json.data;

        // Parse JSON fields (like storeIds, location)
        data = data.map(d => {
            // Auto-parse known JSON fields
            ['storeIds', 'location'].forEach(k => {
                if (d[k] && typeof d[k] === 'string' && (d[k].startsWith('[') || d[k].startsWith('{'))) {
                    try { d[k] = JSON.parse(d[k]); } catch (e) { }
                }
            });
            return d;
        });

        if (queryObj.constraints) {
            queryObj.constraints.forEach(c => {
                if (c.type === 'where' && c.op === '==') {
                    // Already handled by server param if simple, but double check doesn't hurt OR needed if param ignored
                    data = data.filter(d => d[c.field] == c.value);
                }
                // Handle sorted/others if needed
            });
        }

        return {
            empty: data.length === 0,
            docs: data.map(d => ({
                id: d.id,
                data: () => d
            }))
        };
    } catch (e) {
        console.error("API Read Error:", e);
        return { empty: true, docs: [] };
    }
}

// WRITE
export async function addDoc(collRef, data) {
    const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(data)
    }); // We need to send action/collection via query params for doPost too often, or body?
    // GS doPost can read params too. Let's try mixed.

    // Actually, sending everything in a structured POST body is cleaner, 
    // but my Generic Handler uses params for routing.
    // Let's stick to the URL params for routing + Body for data.

    const url = new URL(API_URL);
    url.searchParams.append('action', 'create');
    url.searchParams.append('collection', collRef.name);

    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain to avoid OPTIONS preflight issues sometimes
        body: JSON.stringify(data)
    });

    const json = await r.json();
    if (json.status === 'error') throw new Error(json.message);

    return { id: json.data.id }; // Return ref-like object
}

export async function updateDoc(docRef, data) {
    const url = new URL(API_URL);
    url.searchParams.append('action', 'update');
    url.searchParams.append('collection', docRef.collection);
    url.searchParams.append('id', docRef.id);

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data)
    });
}

export async function deleteDoc(docRef) {
    const url = new URL(API_URL);
    url.searchParams.append('action', 'delete');
    url.searchParams.append('collection', docRef.collection);
    url.searchParams.append('id', docRef.id);

    await fetch(url, { method: 'POST' });
}

export async function setDoc(docRef, data) {
    // Treated as update or create with specific ID? 
    // For simplicity, we'll try update, if fails or specific logic needed...
    // But setDoc in firebase usually overwrites.
    // My GS `updateData` merges. 
    // Let's just alias to updateDoc for now as we don't strictly partial update often.
    return updateDoc(docRef, data);
}

// TIMESTAMP HELPERS
export function serverTimestamp() {
    return new Date().toISOString();
}

// For reports, we need Date objects often.
// The app expects timestamp.toDate()
export { };
