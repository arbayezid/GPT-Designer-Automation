import { arrayBufferToBase64, base64ToArrayBuffer } from '../shared/base64';

import {
  LocalDirectoryHandleStore } from


'./localHandles';

export { LocalDirectoryHandleStore };


export const LOCAL_FOLDER_MIME = 'application/vnd.gpt-designer.folder';
export const LOCAL_INPUT_ROOT_ID = 'local://input';
export const LOCAL_OUTPUT_ROOT_ID = 'local://output';



















const LOCAL_ID_PREFIX = 'local://';
const INVALID_WINDOWS_SEGMENT_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const RESERVED_WINDOWS_BASENAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_WINDOWS_SEGMENT_LENGTH = 255;

const MIME_BY_EXTENSION = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  csv: 'text/csv',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jfif: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

export class LocalFileProvider {
  constructor(
  handleStore = new LocalDirectoryHandleStore())
  {this.handleStore = handleStore;}

  async listSets(inputRootId = LOCAL_INPUT_ROOT_ID) {
    const rootId = parseLocalIdOrDefault(inputRootId, 'input');

    try {
      const root = await this.getRootHandle(rootId.root, 'read');
      const entries = await listDirectoryEntries(root);
      const setDirectories = entries.
      filter((entry) => entry.kind === 'directory').
      filter((entry) => entry.name.toUpperCase().startsWith('SET-')).
      sort(compareHandlesByName);

      const sets = await Promise.all(
        setDirectories.map(async (directory) => {
          const directoryPath = [directory.name];
          const files = (await listDirectoryEntries(directory)).
          filter((entry) => entry.kind === 'file').
          sort(compareHandlesByName);

          const fileMetas = await Promise.all(
            files.map((fileHandle) =>
            fileToMeta('input', [...directoryPath, fileHandle.name], fileHandle)
            )
          );
          const imageFiles = fileMetas.filter(isImageFile);
          const promptFile = fileMetas.find(isPromptFile) ?? null;

          return {
            id: buildLocalId('input', directoryPath),
            name: directory.name,
            imageFiles,
            promptFile
          };
        })
      );

      return sets.sort((a, b) => compareNames(a.name, b.name));
    } catch (error) {
      throw normalizeLocalAccessError(error, rootId.root, 'read');
    }
  }

  async downloadFile(file) {
    const fileId = parseLocalId(file.id);

    try {
      const root = await this.getRootHandle(fileId.root, 'read');
      const fileHandle = await resolveFileHandle(root, fileId.path);
      const fileBlob = await fileHandle.getFile();
      const dataBase64 = arrayBufferToBase64(await fileBlob.arrayBuffer());

      return {
        ...file,
        name: fileBlob.name,
        mimeType: inferMimeType(fileBlob.name, fileBlob.type || file.mimeType),
        size: String(fileBlob.size),
        modifiedTime: new Date(fileBlob.lastModified).toISOString(),
        dataBase64
      };
    } catch (error) {
      throw normalizeLocalAccessError(error, fileId.root, 'read');
    }
  }

  async createOrFindFolder(parentId, folderName) {
    const parent = parseLocalIdOrDefault(parentId, 'output');

    try {
      const parentHandle = await this.resolveDirectory(parent, 'readwrite');
      const safeName = sanitizeWindowsPathSegment(folderName, 'Folder');
      const directory = await parentHandle.getDirectoryHandle(safeName, { create: true });

      return directoryToMeta(parent.root, [...parent.path, directory.name], directory);
    } catch (error) {
      throw normalizeLocalAccessError(error, parent.root, 'readwrite');
    }
  }

  async uploadFile(parentId, file) {
    const parent = parseLocalIdOrDefault(parentId, 'output');

    try {
      const parentHandle = await this.resolveDirectory(parent, 'readwrite');
      const safeName = await findAvailableFileName(
        parentHandle,
        sanitizeWindowsFilename(file.name, 'file')
      );
      const fileHandle = await parentHandle.getFileHandle(safeName, { create: true });
      const writable = await fileHandle.createWritable();

      await writable.write(base64ToArrayBuffer(file.dataBase64));
      await writable.close();

      return fileToMeta(parent.root, [...parent.path, safeName], fileHandle, file.mimeType);
    } catch (error) {
      throw normalizeLocalAccessError(error, parent.root, 'readwrite');
    }
  }

  async resolveDirectory(
  id,
  mode)
  {
    const root = await this.getRootHandle(id.root, mode);
    return resolveDirectoryHandle(root, id.path);
  }

  async getRootHandle(
  root,
  mode)
  {
    const handle = await this.handleStore.getRoot(root);
    if (!handle) throw new Error(`Local ${root} directory has not been selected.`);

    await ensurePermission(handle, mode);
    return handle;
  }
}

export function inferMimeType(name, fallback = 'application/octet-stream') {
  const normalizedFallback = fallback.trim();
  if (normalizedFallback && normalizedFallback !== 'application/octet-stream')
  return normalizedFallback;

  const extension = name.toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (!extension) return normalizedFallback || 'application/octet-stream';

  return MIME_BY_EXTENSION[extension] ?? (normalizedFallback || 'application/octet-stream');
}

export function sanitizeWindowsPathSegment(segment, fallback = 'untitled') {
  const safeFallback = fallback.trim() || 'untitled';
  let sanitized = replaceInvalidWindowsSegmentChars(segment.normalize('NFC')).trim();
  sanitized = sanitized.replace(/[. ]+$/g, '');

  if (!sanitized || sanitized === '.' || sanitized === '..') sanitized = safeFallback;
  if (isReservedWindowsName(sanitized)) sanitized = `_${sanitized}`;

  return truncateWindowsSegment(sanitized, safeFallback);
}

export function sanitizeWindowsFilename(filename, fallback = 'file') {
  return sanitizeWindowsPathSegment(filename, fallback);
}

function isImageFile(file) {
  return file.mimeType.startsWith('image/');
}

function isPromptFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.csv') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.mimeType === 'text/csv' ||
    file.mimeType === 'application/vnd.ms-excel' ||
    file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

}

async function listDirectoryEntries(
directory)
{
  const entries = directory.entries;
  if (!entries) throw new Error('Directory iteration is not available in this browser.');

  const handles = [];
  for await (const [, handle] of entries.call(directory)) {
    handles.push(handle);
  }

  return handles;
}

async function resolveDirectoryHandle(
root,
path)
{
  let current = root;
  for (const segment of path) {
    current = await current.getDirectoryHandle(segment);
  }
  return current;
}

async function resolveFileHandle(
root,
path)
{
  if (path.length === 0) throw new Error('Local file id does not include a file path.');

  const parent = await resolveDirectoryHandle(root, path.slice(0, -1));
  return parent.getFileHandle(path[path.length - 1]);
}

async function fileToMeta(
root,
path,
fileHandle,
mimeTypeHint)
{
  const file = await fileHandle.getFile();

  return {
    id: buildLocalId(root, path),
    name: file.name,
    mimeType: inferMimeType(file.name, file.type || mimeTypeHint),
    size: String(file.size),
    modifiedTime: new Date(file.lastModified).toISOString()
  };
}

function directoryToMeta(
root,
path,
directory)
{
  return {
    id: buildLocalId(root, path),
    name: directory.name,
    mimeType: LOCAL_FOLDER_MIME
  };
}

async function findAvailableFileName(
directory,
desiredName)
{
  const { baseName, extension } = splitFilename(desiredName);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? '' : ` (${attempt})`;
    const maxBaseLength = Math.max(
      1,
      MAX_WINDOWS_SEGMENT_LENGTH - suffix.length - extension.length
    );
    const candidate = `${baseName.slice(0, maxBaseLength)}${suffix}${extension}`;

    if (await canWriteNewFile(directory, candidate)) return candidate;
  }

  throw new Error(`Could not find an available filename for ${desiredName}.`);
}

async function canWriteNewFile(
directory,
name)
{
  try {
    await directory.getFileHandle(name);
    return false;
  } catch (error) {
    if (isDomError(error, 'NotFoundError')) return true;
    if (isDomError(error, 'TypeMismatchError')) return false;
    throw error;
  }
}

async function ensurePermission(handle, mode) {
  const permissionHandle = handle;
  if (!permissionHandle.queryPermission) return;

  const descriptor = { mode };
  const current = await queryHandlePermission(permissionHandle, descriptor);
  if (current === 'unsupported') return;
  if (current === 'granted') return;

  if (current === 'denied') throw buildLocalPermissionError(mode);
  // The popup owns interactive permission prompts. MV3 background workers can
  // see "prompt" for stored handles even when the popup just re-granted them,
  // so let the actual file operation decide instead of prompting here.
}

async function queryHandlePermission(
handle,
descriptor)
{
  try {
    return (await handle.queryPermission?.(descriptor)) ?? 'unsupported';
  } catch (error) {
    if (descriptor.mode === 'readwrite' && isUnsupportedPermissionQuery(error)) {
      return 'unsupported';
    }

    throw error;
  }
}

function normalizeLocalAccessError(
error,
root,
mode)
{
  if (isLocalPermissionFailure(error)) return buildLocalPermissionError(mode, root);
  return error;
}

function buildLocalPermissionError(mode, root) {
  const target =
  root === 'input' ?
  'input folder' :
  root === 'output' ?
  'output folder' :
  mode === 'readwrite' ?
  'output folder' :
  'input folder';
  const access = mode === 'readwrite' ? 'write' : 'read';

  return new Error(
    `Local ${target} ${access} permission is not active. Open GPT Designer, choose the ${target} again, and allow ${access} access.`
  );
}

function isLocalPermissionFailure(error) {
  return isDomError(error, 'NotAllowedError') || isDomError(error, 'SecurityError');
}

function isUnsupportedPermissionQuery(error) {
  if (!(error instanceof Error)) return false;

  return (
    error instanceof TypeError ||
    /readwrite|permission|unsupported|not available/i.test(error.message));

}

function compareHandlesByName(a, b) {
  return compareNames(a.name, b.name);
}

function compareNames(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function splitFilename(name) {
  const extensionStart = name.lastIndexOf('.');
  if (extensionStart <= 0) return { baseName: name, extension: '' };

  return {
    baseName: name.slice(0, extensionStart),
    extension: name.slice(extensionStart)
  };
}

function truncateWindowsSegment(segment, fallback) {
  if (segment.length <= MAX_WINDOWS_SEGMENT_LENGTH) return segment;

  const { baseName, extension } = splitFilename(segment);
  const maxBaseLength = Math.max(1, MAX_WINDOWS_SEGMENT_LENGTH - extension.length);
  const truncated = `${baseName.slice(0, maxBaseLength)}${extension}`;
  return truncated.replace(/[. ]+$/g, '') || fallback;
}

function isReservedWindowsName(segment) {
  const baseName = segment.split('.')[0];
  return RESERVED_WINDOWS_BASENAMES.test(baseName);
}

function replaceInvalidWindowsSegmentChars(value) {
  let sanitized = '';

  for (const char of value) {
    sanitized += char.charCodeAt(0) <= 31 || INVALID_WINDOWS_SEGMENT_CHARS.has(char) ? '_' : char;
  }

  return sanitized;
}

function buildLocalId(root, path) {
  if (path.length === 0) return `${LOCAL_ID_PREFIX}${root}`;
  return `${LOCAL_ID_PREFIX}${root}/${path.map(encodeURIComponent).join('/')}`;
}

function parseLocalId(id) {
  if (!id.startsWith(LOCAL_ID_PREFIX)) throw new Error(`Invalid local file id: ${id}`);

  const value = id.slice(LOCAL_ID_PREFIX.length);
  const [root, ...encodedPath] = value.split('/');
  if (root !== 'input' && root !== 'output') throw new Error(`Invalid local file root: ${root}`);

  return {
    root,
    path: encodedPath.filter(Boolean).map(decodeURIComponent)
  };
}

function parseLocalIdOrDefault(id, defaultRoot) {
  if (!id || !id.startsWith(LOCAL_ID_PREFIX)) return { root: defaultRoot, path: [] };
  return parseLocalId(id);
}

function isDomError(error, name) {
  return error instanceof DOMException ?
  error.name === name :
  error instanceof Error && error.name === name;
}