

export const CHATGPT_BASE_URL = 'https://chatgpt.com/';
export const STORAGE_KEYS = {
  settings: 'driveSettings',
  job: 'automationJob',
  sets: 'driveSets',
  logs: 'automationLogs'
};

export const DEFAULT_SETTINGS = {
  mode: 'drive',
  inputFolderId: '',
  outputFolderId: '',
  drive: {
    inputFolderId: '',
    outputFolderId: ''
  },
  local: {
    inputDirectoryName: '',
    outputDirectoryName: ''
  },
  chatgpt: {
    model: 'thinking',
    thinkingEffort: 'extended'
  }
};

export const IDLE_JOB = {
  id: '',
  active: false,
  phase: 'idle',
  selectedSetId: null,
  processAllSets: false,
  stopRequested: false,
  currentSetName: null,
  currentPromptIndex: null,
  totalPrompts: null,
  startedAt: null,
  finishedAt: null,
  error: null
};

export const MAX_STATUS_LOGS = 200;
export const CHATGPT_RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;
export const CHATGPT_UPLOAD_TIMEOUT_MS = 90 * 1000;
export const CHATGPT_READY_TIMEOUT_MS = 30 * 1000;