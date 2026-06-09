import { DEFAULT_SETTINGS, IDLE_JOB, MAX_STATUS_LOGS, STORAGE_KEYS } from '../shared/constants';














import { createId } from '../shared/async';

export class StorageService {
  async getSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
    const rawSettings = stored[STORAGE_KEYS.settings];
    const settings = normalizeSettings(rawSettings);

    if (shouldPersistSettingsMigration(rawSettings, settings)) {
      await this.saveSettings(settings);
    }

    return settings;
  }

  async saveSettings(settings) {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: normalizeSettings(settings) });
  }

  async getJob() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
    return {
      ...IDLE_JOB,
      ...stored[STORAGE_KEYS.job]
    };
  }

  async saveJob(job) {
    await chrome.storage.local.set({ [STORAGE_KEYS.job]: job });
  }

  async patchJob(patch) {
    const next = {
      ...(await this.getJob()),
      ...patch
    };
    await this.saveJob(next);
    return next;
  }

  async setPhase(phase, patch = {}) {
    return this.patchJob({ phase, ...patch });
  }

  async getSets() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.sets);
    return stored[STORAGE_KEYS.sets] ?? [];
  }

  async saveSets(sets) {
    await chrome.storage.local.set({ [STORAGE_KEYS.sets]: sets });
  }

  async getLogs() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.logs);
    return stored[STORAGE_KEYS.logs] ?? [];
  }

  async appendLog(level, message) {
    const logs = await this.getLogs();
    const next = [
    ...logs,
    {
      id: createId('log'),
      timestamp: Date.now(),
      level,
      message
    }].
    slice(-MAX_STATUS_LOGS);
    await chrome.storage.local.set({ [STORAGE_KEYS.logs]: next });
  }

  async clearLogs() {
    await chrome.storage.local.set({ [STORAGE_KEYS.logs]: [] });
  }

  async getStatus() {
    const [settings, job, sets, logs] = await Promise.all([
    this.getSettings(),
    this.getJob(),
    this.getSets(),
    this.getLogs()]
    );

    return { settings, job, sets, logs };
  }
}

function normalizeSettings(value) {
  const record = asRecord(value);
  const legacyDrive = mergeDriveSettings(record, DEFAULT_SETTINGS.drive);
  const drive = mergeDriveSettings(record?.drive, legacyDrive);
  const local = mergeLocalSettings(record?.local, DEFAULT_SETTINGS.local);
  const chatgpt = mergeChatGptSettings(record?.chatgpt, DEFAULT_SETTINGS.chatgpt);

  return {
    mode: readStorageMode(record?.mode) ?? DEFAULT_SETTINGS.mode,
    inputFolderId: drive.inputFolderId,
    outputFolderId: drive.outputFolderId,
    drive,
    local,
    chatgpt
  };
}

function shouldPersistSettingsMigration(value, normalized) {
  if (value === undefined) {
    return false;
  }

  const record = asRecord(value);
  if (!record) {
    return true;
  }

  return (
    readStorageMode(record.mode) !== normalized.mode ||
    !hasDriveSettings(record.drive) ||
    !hasLocalSettings(record.local) ||
    !hasChatGptSettings(record.chatgpt) ||
    readString(record, 'inputFolderId') !== normalized.inputFolderId ||
    readString(record, 'outputFolderId') !== normalized.outputFolderId);

}

function mergeDriveSettings(value, fallback) {
  const record = asRecord(value);

  return {
    inputFolderId: readString(record, 'inputFolderId') ?? fallback.inputFolderId,
    outputFolderId: readString(record, 'outputFolderId') ?? fallback.outputFolderId
  };
}

function mergeLocalSettings(value, fallback) {
  const record = asRecord(value);

  return {
    inputDirectoryName: readString(record, 'inputDirectoryName') ?? fallback.inputDirectoryName,
    outputDirectoryName: readString(record, 'outputDirectoryName') ?? fallback.outputDirectoryName
  };
}

function mergeChatGptSettings(value, fallback) {
  const record = asRecord(value);

  return {
    model: readChatGptModel(record?.model || record?.mode) ?? fallback.model,
    thinkingEffort: readChatGptThinkingEffort(record?.thinkingEffort) ?? fallback.thinkingEffort
  };
}

function hasDriveSettings(value) {
  const record = asRecord(value);
  return typeof record?.inputFolderId === 'string' && typeof record.outputFolderId === 'string';
}

function hasLocalSettings(value) {
  const record = asRecord(value);
  return typeof record?.inputDirectoryName === 'string' && typeof record.outputDirectoryName === 'string';
}

function hasChatGptSettings(value) {
  const record = asRecord(value);
  return (
    readChatGptModel(record?.model || record?.mode) !== undefined &&
    readChatGptThinkingEffort(record?.thinkingEffort) !== undefined);

}

function readStorageMode(value) {
  return value === 'drive' || value === 'local' ? value : undefined;
}

function readChatGptModel(value) {
  return value === 'instant' || value === 'thinking' ? value : undefined;
}

function readChatGptThinkingEffort(value) {
  return value === 'light' || value === 'standard' || value === 'extended' || value === 'heavy' ?
  value :
  undefined;
}

function readString(record, key) {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function asRecord(value) {
  return typeof value === 'object' && value !== null ? value : undefined;
}