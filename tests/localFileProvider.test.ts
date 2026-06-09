import { describe, expect, it } from 'vitest';
import {
  LOCAL_OUTPUT_ROOT_ID,
  LocalFileProvider,
  inferMimeType,
  sanitizeWindowsFilename,
  sanitizeWindowsPathSegment,
  type LocalDirectoryHandleStoreLike,
  type LocalRootKind,
} from '../src/local/localFileProvider';
import { arrayBufferToBase64 } from '../src/shared/base64';

type FakeHandle = FakeDirectoryHandle | FakeFileHandle;

class FakeDirectoryHandle implements Partial<FileSystemDirectoryHandle> {
  readonly kind = 'directory' as const;
  readonly entriesByName = new Map<string, FakeHandle>();
  private permissionQuery:
    | ((descriptor: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>)
    | null = null;

  constructor(readonly name: string) {}

  setPermissionQuery(
    query: (descriptor: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>,
  ): void {
    this.permissionQuery = query;
  }

  addDirectory(name: string): FakeDirectoryHandle {
    const directory = new FakeDirectoryHandle(name);
    this.entriesByName.set(name, directory);
    return directory;
  }

  addFile(name: string, content: string | Uint8Array, type = ''): FakeFileHandle {
    const file = new FakeFileHandle(name, content, type);
    this.entriesByName.set(name, file);
    return file;
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, handle] of this.entriesByName) {
      yield [name, asFileSystemHandle(handle)];
    }
  }

  async getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.entriesByName.get(name);
    if (existing instanceof FakeDirectoryHandle) return asDirectoryHandle(existing);
    if (existing) throw namedError('TypeMismatchError', `${name} is not a directory.`);
    if (!options?.create) throw namedError('NotFoundError', `${name} was not found.`);

    return asDirectoryHandle(this.addDirectory(name));
  }

  async getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions,
  ): Promise<FileSystemFileHandle> {
    const existing = this.entriesByName.get(name);
    if (existing instanceof FakeFileHandle) return asFileHandle(existing);
    if (existing) throw namedError('TypeMismatchError', `${name} is not a file.`);
    if (!options?.create) throw namedError('NotFoundError', `${name} was not found.`);

    return asFileHandle(this.addFile(name, new Uint8Array()));
  }

  async queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
    if (!this.permissionQuery) return 'granted';
    return this.permissionQuery(descriptor ?? {});
  }
}

class FakeFileHandle implements Partial<FileSystemFileHandle> {
  readonly kind = 'file' as const;
  private bytes: Uint8Array<ArrayBuffer>;
  private lastModified = Date.now();

  constructor(
    readonly name: string,
    content: string | Uint8Array,
    private readonly type: string,
  ) {
    this.bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : copyBytes(content);
  }

  async getFile(): Promise<File> {
    return new File([this.bytes], this.name, {
      type: this.type,
      lastModified: this.lastModified,
    });
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    return {
      write: async (chunk: unknown) => {
        if (chunk instanceof ArrayBuffer) {
          this.bytes = new Uint8Array(chunk);
        } else if (ArrayBuffer.isView(chunk)) {
          this.bytes = copyBytes(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
        } else if (typeof chunk === 'string') {
          this.bytes = new TextEncoder().encode(chunk);
        } else {
          throw new Error('Unsupported fake write chunk.');
        }
        this.lastModified = Date.now();
      },
      close: async () => undefined,
    } as FileSystemWritableFileStream;
  }
}

class FakeHandleStore implements LocalDirectoryHandleStoreLike {
  constructor(
    private readonly inputRoot: FileSystemDirectoryHandle,
    private readonly outputRoot: FileSystemDirectoryHandle,
  ) {}

  async setRoot(kind: LocalRootKind, handle: FileSystemDirectoryHandle): Promise<void> {
    void kind;
    void handle;
    return undefined;
  }

  async getRoot(kind: LocalRootKind): Promise<FileSystemDirectoryHandle> {
    return kind === 'input' ? this.inputRoot : this.outputRoot;
  }
}

describe('LocalFileProvider', () => {
  it('lists SET-* directories with inferred image and prompt files', async () => {
    const input = new FakeDirectoryHandle('input');
    input.addDirectory('notes').addFile('ignored.png', 'ignored');
    const set2 = input.addDirectory('SET-2');
    set2.addFile('reference.webp', 'webp-bytes');
    set2.addFile('prompts.xlsx', new Uint8Array([1, 2, 3]));
    const set1 = input.addDirectory('SET-1');
    set1.addFile('reference.jpg', 'jpg-bytes');
    set1.addFile('prompts.csv', 'prompt\nCreate screen');

    const provider = new LocalFileProvider(
      new FakeHandleStore(
        asDirectoryHandle(input),
        asDirectoryHandle(new FakeDirectoryHandle('output')),
      ),
    );

    const sets = await provider.listSets();

    expect(sets.map((set) => set.name)).toEqual(['SET-1', 'SET-2']);
    expect(sets[0].imageFiles).toMatchObject([{ name: 'reference.jpg', mimeType: 'image/jpeg' }]);
    expect(sets[0].promptFile).toMatchObject({ name: 'prompts.csv', mimeType: 'text/csv' });
    expect(sets[1].promptFile).toMatchObject({
      name: 'prompts.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  });

  it('downloads local file content as base64', async () => {
    const input = new FakeDirectoryHandle('input');
    const set1 = input.addDirectory('SET-1');
    set1.addFile('prompts.csv', 'prompt\nCreate screen');

    const provider = new LocalFileProvider(
      new FakeHandleStore(
        asDirectoryHandle(input),
        asDirectoryHandle(new FakeDirectoryHandle('output')),
      ),
    );
    const sets = await provider.listSets();
    const promptFile = sets[0].promptFile;

    expect(promptFile).not.toBeNull();
    const downloaded = await provider.downloadFile(promptFile!);

    expect(downloaded.dataBase64).toBe(
      base64FromBytes(new TextEncoder().encode('prompt\nCreate screen')),
    );
    expect(downloaded.mimeType).toBe('text/csv');
  });

  it('sanitizes output folders and auto-suffixes file write collisions', async () => {
    const output = new FakeDirectoryHandle('output');
    const provider = new LocalFileProvider(
      new FakeHandleStore(
        asDirectoryHandle(new FakeDirectoryHandle('input')),
        asDirectoryHandle(output),
      ),
    );

    const setFolder = await provider.createOrFindFolder(LOCAL_OUTPUT_ROOT_ID, 'SET:1*');
    const promptFolder = await provider.createOrFindFolder(setFolder.id, 'Prompt-1');
    const promptHandle = await output
      .getDirectoryHandle('SET_1_')
      .then((directory) => directory.getDirectoryHandle('Prompt-1'));

    await promptHandle.getFileHandle('result.png', { create: true });
    const uploaded = await provider.uploadFile(promptFolder.id, {
      name: 'result.png',
      mimeType: 'image/png',
      dataBase64: base64FromBytes(new Uint8Array([1, 2, 3])),
    });

    expect(setFolder).toMatchObject({ name: 'SET_1_' });
    expect(uploaded).toMatchObject({ name: 'result (1).png', mimeType: 'image/png' });
    await expect(promptHandle.getFileHandle('result (1).png')).resolves.toMatchObject({
      name: 'result (1).png',
    });
  });

  it('writes output when readwrite permission query is unsupported', async () => {
    const output = new FakeDirectoryHandle('output');
    output.setPermissionQuery(async (descriptor) => {
      if (descriptor.mode === 'readwrite') {
        throw new TypeError('readwrite permission is not available in this context.');
      }

      return 'granted';
    });
    const provider = new LocalFileProvider(
      new FakeHandleStore(
        asDirectoryHandle(new FakeDirectoryHandle('input')),
        asDirectoryHandle(output),
      ),
    );

    const uploaded = await provider.uploadFile(LOCAL_OUTPUT_ROOT_ID, {
      name: 'result.png',
      mimeType: 'image/png',
      dataBase64: base64FromBytes(new Uint8Array([1, 2, 3])),
    });

    expect(uploaded).toMatchObject({ name: 'result.png', mimeType: 'image/png' });
    await expect(output.getFileHandle('result.png')).resolves.toMatchObject({
      name: 'result.png',
    });
  });

  it('sanitizes Windows path segments and infers common MIME types', () => {
    expect(sanitizeWindowsPathSegment('CON')).toBe('_CON');
    expect(sanitizeWindowsFilename('bad<name>?.png')).toBe('bad_name__.png');
    expect(sanitizeWindowsFilename('trailing. ')).toBe('trailing');
    expect(inferMimeType('reference.avif')).toBe('image/avif');
    expect(inferMimeType('unknown.bin')).toBe('application/octet-stream');
  });
});

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function asFileSystemHandle(handle: FakeHandle): FileSystemHandle {
  return handle as unknown as FileSystemHandle;
}

function asDirectoryHandle(handle: FakeDirectoryHandle): FileSystemDirectoryHandle {
  return handle as unknown as FileSystemDirectoryHandle;
}

function asFileHandle(handle: FakeFileHandle): FileSystemFileHandle {
  return handle as unknown as FileSystemFileHandle;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function base64FromBytes(bytes: Uint8Array): string {
  return arrayBufferToBase64(copyBytes(bytes).buffer);
}
