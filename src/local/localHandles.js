export const LOCAL_DIRECTORY_HANDLE_KEYS = {
  input: 'input',
  output: 'output'
};


























const DB_NAME = 'gpt-designer-local-directories';
const DB_VERSION = 1;
const STORE_NAME = 'directoryHandles';

const LOCAL_DIRECTORY_HANDLE_KEY_VALUES = Object.values(LOCAL_DIRECTORY_HANDLE_KEYS);

const DEFAULT_PERMISSION_MODE_BY_KEY = {
  [LOCAL_DIRECTORY_HANDLE_KEYS.input]: 'read',
  [LOCAL_DIRECTORY_HANDLE_KEYS.output]: 'readwrite'
};

export function isLocalDirectoryHandleSupported() {
  return typeof indexedDB !== 'undefined' && typeof showDirectoryPicker === 'function';
}

export async function pickLocalDirectoryHandle(
key,
options = {})
{
  assertLocalDirectoryHandleKey(key);

  if (typeof showDirectoryPicker !== 'function') {
    throw new Error('File System Access directory picker is not available in this browser context.');
  }

  const handle = await showDirectoryPicker({
    ...options,
    mode: options.mode ?? DEFAULT_PERMISSION_MODE_BY_KEY[key]
  });

  await saveLocalDirectoryHandle(key, handle);
  return handle;
}

export async function pickAndStoreLocalDirectory(
kind,
store = new LocalDirectoryHandleStore(),
options = {})
{
  assertLocalDirectoryHandleKey(kind);

  if (typeof showDirectoryPicker !== 'function') {
    throw new Error('File System Access directory picker is not available in this browser context.');
  }

  const handle = await showDirectoryPicker({
    ...options,
    mode: options.mode ?? DEFAULT_PERMISSION_MODE_BY_KEY[kind]
  });

  await store.setRoot(kind, handle);
  return handle.name;
}

export class LocalDirectoryHandleStore {
  async setInputRoot(handle) {
    await this.setRoot(LOCAL_DIRECTORY_HANDLE_KEYS.input, handle);
  }

  async getInputRoot() {
    return this.getRoot(LOCAL_DIRECTORY_HANDLE_KEYS.input);
  }

  async setOutputRoot(handle) {
    await this.setRoot(LOCAL_DIRECTORY_HANDLE_KEYS.output, handle);
  }

  async getOutputRoot() {
    return this.getRoot(LOCAL_DIRECTORY_HANDLE_KEYS.output);
  }

  async setRoot(kind, handle) {
    await saveLocalDirectoryHandle(kind, handle);
  }

  async getRoot(kind) {
    return getLocalDirectoryHandle(kind);
  }

  async clearRoot(kind) {
    await removeLocalDirectoryHandle(kind);
  }

  async clear() {
    await clearLocalDirectoryHandles();
  }

  async getDisplayName(kind) {
    return getLocalDirectoryHandleDisplayName(kind);
  }

  async hasPermission(
  kind,
  mode)
  {
    return hasLocalDirectoryPermission(kind, mode);
  }

  async requestPermission(
  kind,
  mode)
  {
    return requestLocalDirectoryPermission(kind, mode);
  }
}

export async function saveLocalDirectoryHandle(
key,
handle)
{
  assertLocalDirectoryHandleKey(key);
  assertDirectoryHandle(handle);

  await withDirectoryHandleStore('readwrite', async (store) => {
    await requestToPromise(
      store.put(
        {
          kind: key,
          name: handle.name,
          handle,
          updatedAt: Date.now()
        }
      )
    );
  });
}

export async function getLocalDirectoryHandle(
key)
{
  assertLocalDirectoryHandleKey(key);

  const stored = await withDirectoryHandleStore('readonly', (store) => {
    return requestToPromise(store.get(key));
  });

  if (isStoredDirectoryHandleRecord(stored)) return stored.handle;
  if (isDirectoryHandle(stored)) return stored;
  return null;
}

export async function removeLocalDirectoryHandle(key) {
  assertLocalDirectoryHandleKey(key);

  await withDirectoryHandleStore('readwrite', async (store) => {
    await requestToPromise(store.delete(key));
  });
}

export async function clearLocalDirectoryHandles() {
  await withDirectoryHandleStore('readwrite', async (store) => {
    await requestToPromise(store.clear());
  });
}

export async function getLocalDirectoryHandleDisplayName(
key)
{
  const handle = await getLocalDirectoryHandle(key);
  return handle?.name ?? null;
}

export async function getLocalDirectoryHandleDisplayNames()

{
  const [input, output] = await Promise.all([
  getLocalDirectoryHandle(LOCAL_DIRECTORY_HANDLE_KEYS.input),
  getLocalDirectoryHandle(LOCAL_DIRECTORY_HANDLE_KEYS.output)]
  );

  return {
    [LOCAL_DIRECTORY_HANDLE_KEYS.input]: input?.name ?? null,
    [LOCAL_DIRECTORY_HANDLE_KEYS.output]: output?.name ?? null
  };
}

export async function queryLocalDirectoryPermission(
reference,
mode)
{
  const handle = await resolveLocalDirectoryHandle(reference);
  if (!handle) return 'denied';
  if (typeof handle.queryPermission !== 'function') return 'prompt';

  return handle.queryPermission({ mode: mode ?? defaultPermissionMode(reference) });
}

export async function requestLocalDirectoryPermission(
reference,
mode)
{
  const handle = await resolveLocalDirectoryHandle(reference);
  if (!handle) return 'denied';

  const descriptor = { mode: mode ?? defaultPermissionMode(reference) };
  if (typeof handle.queryPermission === 'function') {
    const requested = await handle.queryPermission(descriptor);
    if (requested === 'granted') return requested;
  }

  if (typeof handle.requestPermission !== 'function') return 'prompt';

  return handle.requestPermission(descriptor);
}

export async function hasLocalDirectoryPermission(
reference,
mode)
{
  return (await queryLocalDirectoryPermission(reference, mode)) === 'granted';
}

function defaultPermissionMode(
reference)
{
  return typeof reference === 'string' ? DEFAULT_PERMISSION_MODE_BY_KEY[reference] : 'read';
}

async function resolveLocalDirectoryHandle(
reference)
{
  if (isDirectoryHandle(reference)) return reference;
  return getLocalDirectoryHandle(reference);
}

async function withDirectoryHandleStore(
mode,
action)
{
  const db = await openDirectoryHandleDb();

  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const transactionDone = transactionToPromise(transaction);
    const result = await action(transaction.objectStore(STORE_NAME));
    await transactionDone;
    return result;
  } finally {
    db.close();
  }
}

async function openDirectoryHandleDb() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available in this browser context.');
  }

  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'kind' });
    }
  };

  return requestToPromise(request);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function assertLocalDirectoryHandleKey(key) {
  if (!LOCAL_DIRECTORY_HANDLE_KEY_VALUES.includes(key)) {
    throw new Error(`Unknown local directory handle key: ${key}`);
  }
}

function assertDirectoryHandle(handle) {
  if (!isDirectoryHandle(handle)) {
    throw new Error('Expected a File System Access directory handle.');
  }
}

function isStoredDirectoryHandleRecord(value) {
  if (!isObject(value)) return false;
  return (
    typeof value.name === 'string' &&
    LOCAL_DIRECTORY_HANDLE_KEY_VALUES.includes(value.kind) &&
    isDirectoryHandle(value.handle));

}

function isDirectoryHandle(value) {
  if (!isObject(value)) return false;
  return value.kind === 'directory' && typeof value.name === 'string';
}

function isObject(value) {
  return typeof value === 'object' && value !== null;
}