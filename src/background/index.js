import { Logger } from '../core/logger';
import { StorageService } from '../core/storage';
import { DriveClient } from '../drive/driveClient';
import { ServiceAccountAuthService } from '../drive/serviceAccountAuth';
import { LocalFileProvider } from '../local/localFileProvider';

import { getErrorMessage } from '../shared/async';
import { TabService } from './tabService';
import { AutomationOrchestrator } from '../workflow/automationOrchestrator';

const storage = new StorageService();
const logger = new Logger(storage);
const auth = new ServiceAccountAuthService();
const drive = new DriveClient(auth);
const local = new LocalFileProvider();
const tabs = new TabService();
const orchestrator = new AutomationOrchestrator(
  storage,
  logger,
  {
    drive,
    local
  },
  tabs
);

chrome.runtime.onInstalled.addListener(() => {
  void logger.info('GPT Designer extension installed.');
});

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    void handleMessage(message).
    then((data) => sendResponse({ ok: true, data })).
    catch((error) =>
    sendResponse({
      ok: false,
      error: getErrorMessage(error)
    })
    );

    return true;
  }
);

async function handleMessage(message) {
  switch (message.type) {
    case 'GET_STATUS':
      return storage.getStatus();

    case 'SAVE_SETTINGS':
      await storage.saveSettings(message.settings);
      await logger.info('Settings saved.');
      return storage.getStatus();

    case 'LIST_SETS':
      return orchestrator.listSets();

    case 'START_JOB':
      await orchestrator.start(message.setId, message.processAllSets);
      return storage.getStatus();

    case 'STOP_JOB':
      await orchestrator.stop();
      return storage.getStatus();

    case 'CLEAR_LOGS':
      await storage.clearLogs();
      return storage.getStatus();

    default:
      throw new Error(`Unsupported runtime message: ${message.type}`);
  }
}