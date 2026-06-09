import './popup.css';
import {
  getLocalDirectoryHandleDisplayNames,
  isLocalDirectoryHandleSupported,
  LOCAL_DIRECTORY_HANDLE_KEYS,
  pickLocalDirectoryHandle,
  queryLocalDirectoryPermission,
  requestLocalDirectoryPermission } from


'../local/localHandles';
import { sendRuntimeMessage } from '../shared/runtime';

























const NO_LOCAL_FOLDER_LABEL = 'No folder selected';
const LOCAL_PERMISSION_CACHE_KEY = 'localDirectoryPermissionCache';
const CHATGPT_THINKING_EFFORT_LABELS = {
  light: 'Light',
  standard: 'Standard',
  extended: 'Extended',
  heavy: 'Heavy'
};

const modeDrive = getElement('modeDrive');
const modeLocal = getElement('modeLocal');
const driveModePanel = getElement('driveModePanel');
const localModePanel = getElement('localModePanel');
const chatGptSettings = getElement('chatGptSettings');
const chatGptModelSelect = getElement('chatGptModelSelect');
const thinkingEffortSelect = getElement('thinkingEffortSelect');
const chatGptModeStatus = getElement('chatGptModeStatus');
const inputFolderId = getElement('inputFolderId');
const outputFolderId = getElement('outputFolderId');
const pasteInputFolder = getElement('pasteInputFolder');
const pasteOutputFolder = getElement('pasteOutputFolder');
const chooseInputFolder = getElement('chooseInputFolder');
const chooseOutputFolder = getElement('chooseOutputFolder');
const localInputFolderName = getElement('localInputFolderName');
const localOutputFolderName = getElement('localOutputFolderName');
const localPermissionStatus = getElement('localPermissionStatus');
const localInputPermissionStatus = getElement('localInputPermissionStatus');
const localOutputPermissionStatus = getElement('localOutputPermissionStatus');
const saveSettings = getElement('saveSettings');
const listSets = getElement('listSets');
const startJob = getElement('startJob');
const stopJob = getElement('stopJob');
const setSelect = getElement('setSelect');
const phaseBadge = getElement('phaseBadge');
const phaseBadgeText = getElement('phaseBadgeText');
const currentStep = getElement('currentStep');
const logPanel = getElement('logPanel');
const logToggle = getElement('logToggle');
const logToggleLabel = getElement('logToggleLabel');
const logList = getElement('logList');
const clearLog = getElement('clearLog');
const oauthStatus = getElement('oauthStatus');
const themeToggle = getElement('themeToggle');
const extensionVersion = getElement('extensionVersion');

let latestSettings = createEmptySettings();
let latestStatus = null;
let driveFieldsDirty = false;
let chatGptModelDirty = false;
let localPermissionCache = createEmptyLocalPermissionCache();

modeDrive.addEventListener('change', () => {
  if (modeDrive.checked) void changeStorageMode('drive');
});

modeLocal.addEventListener('change', () => {
  if (modeLocal.checked) void changeStorageMode('local');
});

chatGptModelSelect.addEventListener('change', () => {
  void changeChatGptSettings();
});

thinkingEffortSelect.addEventListener('change', () => {
  void changeChatGptSettings();
});

inputFolderId.addEventListener('input', () => {
  driveFieldsDirty = true;
  updateActionButtons();
  resetSaveSettingsButton();
});

outputFolderId.addEventListener('input', () => {
  driveFieldsDirty = true;
  updateActionButtons();
  resetSaveSettingsButton();
});

pasteInputFolder.addEventListener('click', () => {
  void pasteDriveFolderId('input');
});

pasteOutputFolder.addEventListener('click', () => {
  void pasteDriveFolderId('output');
});

chooseInputFolder.addEventListener('click', () => {
  void chooseLocalDirectory('input');
});

chooseOutputFolder.addEventListener('click', () => {
  void chooseLocalDirectory('output');
});

function resetSaveSettingsButton() {
  saveSettings.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/></svg> Save';
  saveSettings.classList.remove('btn-saved');
}

saveSettings.addEventListener('click', () => {
  void runAction(async () => {
    await saveCurrentSettings();
    saveSettings.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3"/><path d="M8 21v-7h8v7"/></svg> Saved';
    saveSettings.classList.add('btn-saved');
  }, saveSettings);
});

listSets.addEventListener('click', () => {
  void runAction(async () => {
    await ensureLocalPermissionsForAction('list');
    const response = await sendRuntimeMessage({ type: 'LIST_SETS' });
    if (!response.ok) throw new Error(response.error);
    await refreshStatus();
    listSets.classList.add('btn-active');
  }, listSets);
});

startJob.addEventListener('click', () => {
  void runAction(async () => {
    await ensureLocalPermissionsForAction('start');
    const selected = setSelect.value;
    const processAllSets = selected === '__all__';
    const setId = processAllSets ? null : selected;
    const response = await sendRuntimeMessage({
      type: 'START_JOB',
      setId,
      processAllSets
    });
    if (!response.ok) throw new Error(response.error);
    await refreshStatus();
  });
});

stopJob.addEventListener('click', () => {
  void runAction(async () => {
    const response = await sendRuntimeMessage({ type: 'STOP_JOB' });
    if (!response.ok) throw new Error(response.error);
    await refreshStatus();
  });
});

logToggle.addEventListener('click', () => {
  setLogsExpanded(logToggle.getAttribute('aria-expanded') !== 'true');
});

themeToggle.addEventListener('click', () => {
  const current = getCurrentTheme();
  const next = current === 'light' ? 'dark' : 'light';
  setTheme(next);
  chrome.storage.local.set({ theme: next });
});

clearLog.addEventListener('click', () => {
  void runAction(async () => {
    const response = await sendRuntimeMessage({ type: 'CLEAR_LOGS' });
    if (!response.ok) throw new Error(response.error);
    if (response.data) renderStatus(response.data);
  });
});

void initialize();

async function initialize() {
  if (extensionVersion) {
    extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  const stored = await chrome.storage.local.get(['theme', LOCAL_PERMISSION_CACHE_KEY]);
  localPermissionCache = normalizeLocalPermissionCache(stored[LOCAL_PERMISSION_CACHE_KEY]);
  if (stored.theme === 'light' || stored.theme === 'dark') {
    setTheme(stored.theme);
  } else {
    setTheme(getCurrentTheme());
  }

  setLogsExpanded(true);
  setSelectedMode(latestSettings.mode);
  renderChatGptSettings(latestSettings.chatgpt);
  renderStoragePanels(latestSettings.mode);
  void renderDriveStatus();
  await hydrateLocalDisplayNamesFromHandles();
  updateActionButtons();
  await refreshStatus();
  globalThis.setInterval(() => {
    void refreshStatus();
  }, 1500);
}

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  const nextThemeLabel = theme === 'light' ? 'night' : 'day';
  const label = `Switch to ${nextThemeLabel} theme`;

  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}

async function refreshStatus() {
  const response = await sendRuntimeMessage({ type: 'GET_STATUS' });
  if (!response.ok || !response.data) {
    currentStep.textContent = response.error ?? 'Could not load status.';
    return;
  }

  renderStatus(response.data);
}

async function saveCurrentSettings() {
  const settings = readSettingsFromUi();
  const response = await sendRuntimeMessage({
    type: 'SAVE_SETTINGS',
    settings
  });
  if (!response.ok) throw new Error(response.error);

  latestSettings = settings;
  driveFieldsDirty = false;
  if (response.data) {
    renderStatus(response.data);
    return;
  }

  await refreshStatus();
}

async function changeStorageMode(mode) {
  setSelectedMode(mode);
  renderStoragePanels(mode);
  updateActionButtons();

  await runAction(async () => {
    await saveCurrentSettings();
  });
}

async function changeChatGptSettings() {
  chatGptModelDirty = true;
  renderChatGptSettings(readSettingsFromUi().chatgpt);
  updateActionButtons();

  await runAction(async () => {
    chatGptModelDirty = false;
    try {
      await saveCurrentSettings();
    } catch (err) {
      chatGptModelDirty = true;
      throw err;
    }
  });
}

async function chooseLocalDirectory(kind) {
  await runAction(async () => {
    const key = localDirectoryKey(kind);
    const mode = localPermissionMode(kind);
    const handle = await pickLocalDirectoryHandle(key, { mode });
    const permission = await requestLocalDirectoryPermission(handle, mode);
    await rememberLocalPermission(kind, handle.name, permission);
    if (permission !== 'granted') {
      throw new Error(localPermissionRequiredMessage(kind));
    }

    setLocalDirectoryName(kind, handle.name);
    setSelectedMode('local');
    renderStoragePanels('local');
    updateActionButtons();
    await saveCurrentSettings();
    await renderLocalPermissionStatus(readSettingsFromUi());
  });
}

async function pasteDriveFolderId(kind) {
  await runAction(async () => {
    if (!navigator.clipboard?.readText) {
      throw new Error('Clipboard text is unavailable.');
    }

    const value = (await navigator.clipboard.readText()).trim();
    if (!value) throw new Error('Clipboard is empty.');

    if (kind === 'input') {
      inputFolderId.value = value;
    } else {
      outputFolderId.value = value;
    }

    driveFieldsDirty = true;
    updateActionButtons();
  });
}

function renderStatus(status) {
  const settings = normalizeSettings(status.settings);

  latestStatus = status;
  latestSettings = settings;

  if (!shouldPreserveDriveFieldEdits()) {
    inputFolderId.value = settings.drive.inputFolderId;
    outputFolderId.value = settings.drive.outputFolderId;
  }

  setLocalDirectoryName('input', settings.local.inputDirectoryName);
  setLocalDirectoryName('output', settings.local.outputDirectoryName);
  setSelectedMode(settings.mode);
  if (!chatGptModelDirty) {
    renderChatGptSettings(settings.chatgpt);
  }

  renderStoragePanels(settings.mode);
  void renderDriveStatus();
  void renderLocalPermissionStatus(settings);
  phaseBadge.dataset.mode = settings.mode;
  phaseBadge.dataset.phase = status.job.phase;
  phaseBadgeText.textContent = capitalize(settings.mode);
  currentStep.textContent = buildCurrentStep(status, settings);

  renderSets(status.sets);
  renderLogs(status);
  updateActionButtons(status);
}

function renderSets(sets) {
  const selected = setSelect.value;
  setSelect.innerHTML = '';

  if (sets.length === 0) {
    setSelect.append(new Option('No sets loaded', ''));
    return;
  }

  setSelect.append(new Option('All sets', '__all__'));
  for (const set of sets) {
    const label = `${set.name} (${set.imageFiles.length} images${set.promptFile ? '' : ', no sheet'})`;
    setSelect.append(new Option(label, set.id));
  }

  if ([...setSelect.options].some((option) => option.value === selected)) {
    setSelect.value = selected;
  }
}

function shouldPreserveDriveFieldEdits() {
  return (
    driveFieldsDirty ||
    document.activeElement === inputFolderId ||
    document.activeElement === outputFolderId);

}

function renderLogs(status) {
  logList.innerHTML = '';

  const entries = status.logs.slice(-80).reverse();
  if (entries.length === 0) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'No log entries yet.';
    logList.append(item);
    return;
  }

  for (const entry of entries) {
    const item = document.createElement('li');
    item.className = entry.level;

    const marker = document.createElement('span');
    marker.className = 'log-marker';

    const time = document.createElement('time');
    time.className = 'log-time';
    time.dateTime = new Date(entry.timestamp).toISOString();
    time.textContent = new Date(entry.timestamp).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    });

    const message = document.createElement('span');
    message.className = 'log-message';
    message.textContent = entry.message;

    item.append(marker, time, message);
    logList.append(item);
  }
}

function setLogsExpanded(expanded) {
  logPanel.dataset.collapsed = expanded ? 'false' : 'true';
  logToggle.setAttribute('aria-expanded', String(expanded));
  logToggle.setAttribute('aria-label', expanded ? 'Collapse log' : 'Expand log');
  logToggleLabel.textContent = expanded ? 'Collapse' : 'Expand';
  logList.hidden = !expanded;
}

function buildCurrentStep(status, settings) {
  const { job } = status;
  if (job.error) return job.error;
  if (job.active && job.stopRequested) return 'Stop requested. Cancelling current step.';
  if (!job.active && job.phase === 'idle') return buildIdleStatus(settings);

  const parts = [job.phase.replace(/_/g, ' ')];
  if (job.currentSetName) parts.push(job.currentSetName);
  if (job.currentPromptIndex && job.totalPrompts) {
    parts.push(`${job.currentPromptIndex}/${job.totalPrompts}`);
  }

  return parts.join(' - ');
}

function buildIdleStatus(settings) {
  if (settings.mode === 'drive') {
    if (!settings.drive.inputFolderId.trim() && !settings.drive.outputFolderId.trim()) {
      return 'Configure Drive input and output folder IDs.';
    }
    if (!settings.drive.inputFolderId.trim()) return 'Configure the Drive input folder ID.';
    if (!settings.drive.outputFolderId.trim()) return 'Configure the Drive output folder ID.';
    return 'Ready in Drive mode.';
  }

  if (!settings.local.inputDirectoryName.trim() && !settings.local.outputDirectoryName.trim()) {
    return 'Select local input and output folders.';
  }
  if (!settings.local.inputDirectoryName.trim()) return 'Select a local input folder.';
  if (!settings.local.outputDirectoryName.trim()) return 'Select a local output folder.';
  return 'Ready in Local mode.';
}

async function renderDriveStatus() {
  try {
    const response = await fetch(chrome.runtime.getURL('drive-service-account.json'), {
      cache: 'no-store'
    });
    setPillStatus(
      oauthStatus,
      response.ok ? 'success' : 'error',
      response.ok ? 'Service account loaded' : 'Service account JSON missing'
    );
  } catch {
    setPillStatus(oauthStatus, 'error', 'Service account JSON missing');
  }
}

async function renderLocalPermissionStatus(settings) {
  if (!isLocalDirectoryHandleSupported()) {
    setPillStatus(localPermissionStatus, 'error', 'Picker unavailable');
    setPermissionStatus(localInputPermissionStatus, 'unavailable');
    setPermissionStatus(localOutputPermissionStatus, 'unavailable');
    return;
  }

  const [queriedInputPermission, queriedOutputPermission] = await Promise.all([
  queryLocalDirectoryPermission(LOCAL_DIRECTORY_HANDLE_KEYS.input, localPermissionMode('input')),
  queryLocalDirectoryPermission(
    LOCAL_DIRECTORY_HANDLE_KEYS.output,
    localPermissionMode('output')
  )]
  );
  const inputPermission = await resolveDisplayedLocalPermission(
    'input',
    settings.local.inputDirectoryName,
    queriedInputPermission
  );
  const outputPermission = await resolveDisplayedLocalPermission(
    'output',
    settings.local.outputDirectoryName,
    queriedOutputPermission
  );

  setPermissionStatus(localInputPermissionStatus, inputPermission);
  setPermissionStatus(localOutputPermissionStatus, outputPermission);

  if (!isModeConfigured({ ...settings, mode: 'local' })) {
    setPillStatus(localPermissionStatus, 'neutral', 'Folders required');
    return;
  }

  const granted = inputPermission === 'granted' && outputPermission === 'granted';
  setPillStatus(
    localPermissionStatus,
    granted ? 'success' : 'warning',
    granted ? 'Permission granted' : 'Permission required'
  );
}

function renderStoragePanels(mode) {
  driveModePanel.hidden = mode !== 'drive';
  localModePanel.hidden = mode !== 'local';
}

function renderChatGptSettings(settings) {
  chatGptModelSelect.value = settings.model;
  thinkingEffortSelect.value = settings.thinkingEffort;
  thinkingEffortSelect.disabled = settings.model !== 'thinking' || Boolean(latestStatus?.job.active);
  chatGptSettings.dataset.model = settings.model;
  setPillStatus(chatGptModeStatus, 'neutral', formatChatGptSettings(settings));
}

function updateActionButtons(status = latestStatus) {
  const active = status?.job.active ?? false;
  const settings = readSettingsFromUi();
  const configured = isModeConfigured(settings);
  const localMode = settings.mode === 'local';
  const localPickerAvailable = isLocalDirectoryHandleSupported();

  saveSettings.disabled = active;
  listSets.disabled = active || !configured;
  startJob.disabled = active || !configured || (status?.sets.length ?? 0) === 0;
  stopJob.disabled = !active || Boolean(status?.job.stopRequested);
  modeDrive.disabled = active;
  modeLocal.disabled = active;
  chatGptModelSelect.disabled = active;
  thinkingEffortSelect.disabled = active || settings.chatgpt.model !== 'thinking';
  inputFolderId.disabled = active || settings.mode !== 'drive';
  outputFolderId.disabled = active || settings.mode !== 'drive';
  chooseInputFolder.disabled = active || !localMode || !localPickerAvailable;
  chooseOutputFolder.disabled = active || !localMode || !localPickerAvailable;
  pasteInputFolder.disabled = active || settings.mode !== 'drive';
  pasteOutputFolder.disabled = active || settings.mode !== 'drive';
  clearLog.disabled = (status?.logs.length ?? 0) === 0;
}

function isModeConfigured(settings) {
  if (settings.mode === 'drive') {
    return Boolean(settings.drive.inputFolderId.trim() && settings.drive.outputFolderId.trim());
  }

  return Boolean(
    settings.local.inputDirectoryName.trim() && settings.local.outputDirectoryName.trim()
  );
}

function readSettingsFromUi() {
  const drive = {
    inputFolderId: inputFolderId.value.trim(),
    outputFolderId: outputFolderId.value.trim()
  };

  return {
    mode: getSelectedMode(),
    inputFolderId: drive.inputFolderId,
    outputFolderId: drive.outputFolderId,
    drive,
    local: {
      inputDirectoryName: getLocalDirectoryName('input'),
      outputDirectoryName: getLocalDirectoryName('output')
    },
    chatgpt: readChatGptSettingsFromUi()
  };
}

function readChatGptSettingsFromUi() {
  return {
    model: chatGptModelSelect.value,
    thinkingEffort: normalizeChatGptThinkingEffort(thinkingEffortSelect.value)
  };
}

function getSelectedMode() {
  return modeLocal.checked ? 'local' : 'drive';
}

function setSelectedMode(mode) {
  modeDrive.checked = mode === 'drive';
  modeLocal.checked = mode === 'local';
}

function getLocalDirectoryName(kind) {
  const element = kind === 'input' ? localInputFolderName : localOutputFolderName;
  return element.dataset.directoryName ?? '';
}

function setLocalDirectoryName(kind, name) {
  const element = kind === 'input' ? localInputFolderName : localOutputFolderName;
  element.dataset.directoryName = name;
  element.textContent = name || NO_LOCAL_FOLDER_LABEL;

  const btn = kind === 'input' ? chooseInputFolder : chooseOutputFolder;
  if (name && name !== NO_LOCAL_FOLDER_LABEL) {
    btn.textContent = 'Selected';
    btn.classList.add('selected');
  } else {
    btn.textContent = 'Select';
    btn.classList.remove('selected');
  }
}

async function hydrateLocalDisplayNamesFromHandles() {
  if (!isLocalDirectoryHandleSupported()) return;

  try {
    const names = await getLocalDirectoryHandleDisplayNames();
    if (!getLocalDirectoryName('input') && names.input) {
      setLocalDirectoryName('input', names.input);
    }
    if (!getLocalDirectoryName('output') && names.output) {
      setLocalDirectoryName('output', names.output);
    }
  } catch {
    localPermissionStatus.textContent = 'Permission required';
  }
}

function localDirectoryKey(kind) {
  return kind === 'input' ? LOCAL_DIRECTORY_HANDLE_KEYS.input : LOCAL_DIRECTORY_HANDLE_KEYS.output;
}

function localPermissionMode(kind) {
  return kind === 'input' ? 'read' : 'readwrite';
}

function formatChatGptSettings(settings) {
  if (settings.model === 'instant') return 'Instant';
  return `Thinking • ${CHATGPT_THINKING_EFFORT_LABELS[settings.thinkingEffort]}`;
}

function isThinkingModel(model) {
  return model === 'thinking';
}

function normalizeChatGptModel(value) {
  return value === 'instant' || value === 'thinking' ? value : 'instant';
}

function normalizeChatGptThinkingEffort(value) {
  return value === 'light' || value === 'standard' || value === 'extended' || value === 'heavy' ?
  value :
  'extended';
}

function formatPermissionStatus(permission) {
  if (permission === 'granted') return 'Permission granted';
  if (permission === 'prompt') return 'Permission prompt';
  return 'Permission not granted';
}

function setPermissionStatus(
element,
permission)
{
  element.dataset.status =
  permission === 'granted' ? 'success' : permission === 'unavailable' ? 'error' : 'warning';
  element.textContent =
  permission === 'unavailable' ? 'Unavailable' : formatPermissionStatus(permission);
}

function setPillStatus(
element,
status,
text)
{
  element.dataset.status = status;
  element.textContent = text;
}

async function ensureLocalPermissionsForAction(action) {
  const settings = readSettingsFromUi();
  if (settings.mode !== 'local') return;

  if (action === 'start') {
    const outputPermission = await requestAndRememberLocalPermission('output');
    if (outputPermission !== 'granted') {
      throw new Error(localPermissionRequiredMessage('output'));
    }
  }

  const inputPermission = await requestAndRememberLocalPermission('input');
  if (inputPermission !== 'granted') {
    throw new Error(localPermissionRequiredMessage('input'));
  }

  await renderLocalPermissionStatus(settings);
}

function localPermissionRequiredMessage(kind) {
  const target = kind === 'input' ? 'input folder' : 'output folder';
  const access = kind === 'input' ? 'read' : 'write';
  return `${capitalize(target)} ${access} permission was not granted. Choose the ${target} again and allow ${access} access.`;
}

async function requestAndRememberLocalPermission(
kind)
{
  const permission = await requestLocalDirectoryPermission(
    localDirectoryKey(kind),
    localPermissionMode(kind)
  );
  await rememberLocalPermission(kind, getLocalDirectoryName(kind), permission);
  return permission;
}

async function resolveDisplayedLocalPermission(
kind,
directoryName,
queriedPermission)
{
  if (queriedPermission === 'granted') {
    await rememberLocalPermission(kind, directoryName, queriedPermission);
    return queriedPermission;
  }

  const cached = localPermissionCache[kind];
  if (
  directoryName &&
  cached.directoryName === directoryName &&
  cached.permission === 'granted' &&
  queriedPermission === 'prompt')
  {
    return 'granted';
  }

  await rememberLocalPermission(kind, directoryName, queriedPermission);
  return queriedPermission;
}

async function rememberLocalPermission(
kind,
directoryName,
permission)
{
  localPermissionCache = {
    ...localPermissionCache,
    [kind]: {
      directoryName,
      permission,
      updatedAt: Date.now()
    }
  };
  await chrome.storage.local.set({ [LOCAL_PERMISSION_CACHE_KEY]: localPermissionCache });
}

function normalizeLocalPermissionCache(value) {
  const record = isRecord(value) ? value : {};
  return {
    input: normalizeCachedLocalPermission(record.input),
    output: normalizeCachedLocalPermission(record.output)
  };
}

function normalizeCachedLocalPermission(value) {
  const record = isRecord(value) ? value : {};
  const permission =
  record.permission === 'granted' ||
  record.permission === 'prompt' ||
  record.permission === 'denied' ?
  record.permission :
  'denied';

  return {
    directoryName: typeof record.directoryName === 'string' ? record.directoryName : '',
    permission,
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0
  };
}

function createEmptyLocalPermissionCache() {
  return {
    input: { directoryName: '', permission: 'denied', updatedAt: 0 },
    output: { directoryName: '', permission: 'denied', updatedAt: 0 }
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeSettings(
settings)
{
  const legacy = settings;
  const drive = {
    inputFolderId: legacy.drive?.inputFolderId ?? legacy.inputFolderId ?? '',
    outputFolderId: legacy.drive?.outputFolderId ?? legacy.outputFolderId ?? ''
  };
  const chatgpt = {
    model: normalizeChatGptModel(legacy.chatgpt?.model || legacy.chatgpt?.mode),
    thinkingEffort: normalizeChatGptThinkingEffort(legacy.chatgpt?.thinkingEffort)
  };

  return {
    mode: legacy.mode === 'local' ? 'local' : 'drive',
    inputFolderId: drive.inputFolderId,
    outputFolderId: drive.outputFolderId,
    drive,
    local: {
      inputDirectoryName: legacy.local?.inputDirectoryName ?? '',
      outputDirectoryName: legacy.local?.outputDirectoryName ?? ''
    },
    chatgpt
  };
}

function createEmptySettings() {
  return {
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
      model: 'instant',
      thinkingEffort: 'extended'
    }
  };
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

async function runAction(action, button) {
  if (button) button.classList.add('btn-loading');
  try {
    await action();
    if (button) flashButton(button, 'btn-success');
  } catch (error) {
    currentStep.textContent = error instanceof Error ? error.message : 'Action failed.';
    if (button) flashButton(button, 'btn-error');
  } finally {
    if (button) button.classList.remove('btn-loading');
  }
}

function flashButton(button, className) {
  button.classList.add(className);
  setTimeout(() => button.classList.remove(className), 1200);
}

function getElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element #${id}`);
  return element;
}