import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../src/core/storage';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../src/shared/constants';

describe('storage settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns default provider settings when none are stored', async () => {
    const { set } = stubChromeStorage();

    await expect(new StorageService().getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    expect(set).not.toHaveBeenCalled();
  });

  it('migrates legacy Drive settings into provider settings', async () => {
    const { set } = stubChromeStorage({
      [STORAGE_KEYS.settings]: {
        inputFolderId: 'input-folder',
        outputFolderId: 'output-folder'
      }
    });

    const settings = await new StorageService().getSettings();

    expect(settings).toEqual({
      ...DEFAULT_SETTINGS,
      inputFolderId: 'input-folder',
      outputFolderId: 'output-folder',
      drive: {
        inputFolderId: 'input-folder',
        outputFolderId: 'output-folder'
      }
    });
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.settings]: settings });
  });

  it('keeps compatibility Drive fields synchronized from nested settings', async () => {
    const { set } = stubChromeStorage({
      [STORAGE_KEYS.settings]: {
        mode: 'local',
        inputFolderId: 'stale-input',
        outputFolderId: 'stale-output',
        drive: {
          inputFolderId: 'drive-input',
          outputFolderId: 'drive-output'
        },
        local: {
          inputDirectoryName: 'Input',
          outputDirectoryName: 'Output'
        }
      }
    });

    const settings = await new StorageService().getSettings();

    expect(settings).toEqual({
      mode: 'local',
      inputFolderId: 'drive-input',
      outputFolderId: 'drive-output',
      drive: {
        inputFolderId: 'drive-input',
        outputFolderId: 'drive-output'
      },
      local: {
        inputDirectoryName: 'Input',
        outputDirectoryName: 'Output'
      },
      chatgpt: DEFAULT_SETTINGS.chatgpt
    });
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.settings]: settings });
  });

  it('saves legacy Drive settings as provider settings', async () => {
    const { stored } = stubChromeStorage();

    await new StorageService().saveSettings({
      inputFolderId: 'input-folder',
      outputFolderId: 'output-folder'
    });

    expect(stored[STORAGE_KEYS.settings]).toEqual({
      ...DEFAULT_SETTINGS,
      inputFolderId: 'input-folder',
      outputFolderId: 'output-folder',
      drive: {
        inputFolderId: 'input-folder',
        outputFolderId: 'output-folder'
      }
    });
  });

  it('persists ChatGPT mode settings', async () => {
    const { stored } = stubChromeStorage();

    await new StorageService().saveSettings({
      ...DEFAULT_SETTINGS,
      chatgpt: {
        mode: 'instant',
        thinkingEffort: 'heavy'
      }
    });

    expect(stored[STORAGE_KEYS.settings]).toMatchObject({
      chatgpt: {
        mode: 'instant',
        thinkingEffort: 'heavy'
      }
    });
  });
});

function stubChromeStorage(initial = {})


{
  const stored = { ...initial };
  const set = vi.fn(async (items) => {
    Object.assign(stored, items);
  });

  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key) => ({ [key]: stored[key] })),
        set
      }
    }
  });

  return { stored, set };
}