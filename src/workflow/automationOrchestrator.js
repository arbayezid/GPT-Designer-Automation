

import { parsePromptFile } from '../sheets/promptParser';
import { sendTabMessage } from '../shared/runtime';
import {
  assertStorageConfigured,
  getInputRootId,
  getOutputRootId } from

'../storage/batchStorageProvider';












import { getErrorMessage, wait } from '../shared/async';

import { completeJob, createStartedJob, failJob, requestStop, stopJob } from './jobState';

class StopRequestedError extends Error {
  constructor() {
    super('Automation stopped by user.');
  }
}

export class AutomationOrchestrator {
  running = false;
  activeChatGptTabId = null;

  constructor(
  storage,
  logger,
  providers,
  tabs)
  {this.storage = storage;this.logger = logger;this.providers = providers;this.tabs = tabs;}

  async listSets() {
    const settings = await this.storage.getSettings();
    this.assertCanListSets(settings);

    await this.storage.setPhase('listing_sets');
    await this.logger.info(`Listing ${settings.mode} input sets.`);
    const provider = this.getProvider(settings);
    const sets = await provider.listSets(getInputRootId(settings));
    await this.storage.saveSets(sets);
    await this.storage.setPhase('idle');
    await this.logger.info(`Found ${sets.length} set(s).`);
    return sets;
  }

  async start(setId, processAllSets) {
    if (this.running) throw new Error('Automation is already running.');

    await this.storage.clearLogs();
    await this.storage.saveJob(createStartedJob(setId, processAllSets));
    this.running = true;

    void this.run(setId, processAllSets).finally(() => {
      this.running = false;
    });
  }

  async stop() {
    const job = await this.storage.getJob();
    await this.storage.saveJob(requestStop(job));
    await this.cancelActiveChatGptStep();
    await this.logger.warn('Stop requested. Cancelling the active ChatGPT step.');
  }

  async run(setId, processAllSets) {
    let job = await this.storage.getJob();

    try {
      const settings = await this.storage.getSettings();
      assertStorageConfigured(settings);
      const provider = this.getProvider(settings);

      await this.logger.info('Starting automation.');
      let sets = await this.storage.getSets();
      if (sets.length === 0) {
        sets = await this.listSets();
      }

      const targetSets = processAllSets ? sets : sets.filter((set) => set.id === setId);
      if (targetSets.length === 0) throw new Error('No matching set was selected.');

      for (const set of targetSets) {
        await this.assertNotStopped();
        await this.processSet(provider, getOutputRootId(settings), settings.chatgpt, set);
      }

      await this.assertNotStopped();
      job = await this.storage.getJob();
      await this.storage.saveJob(completeJob(job));
      await this.logger.info('Automation completed.');
    } catch (error) {
      job = await this.storage.getJob();

      if (error instanceof StopRequestedError) {
        await this.storage.saveJob(stopJob(job));
        await this.logger.warn('Automation stopped.');
        return;
      }

      const message = getErrorMessage(error);
      await this.storage.saveJob(failJob(job, message));
      await this.logger.error(message);
    }
  }

  async processSet(
  provider,
  outputFolderId,
  chatGptSettings,
  set)
  {
    if (!set.promptFile) throw new Error(`${set.name} does not contain a CSV/XLSX prompt file.`);
    if (set.imageFiles.length === 0)
    throw new Error(`${set.name} does not contain any reference images.`);

    await this.storage.patchJob({
      phase: 'reading_set',
      currentSetName: set.name,
      currentPromptIndex: null,
      totalPrompts: null
    });
    await this.logger.info(`Reading ${set.name}.`);

    const [promptFile, imageFiles] = await Promise.all([
    provider.downloadFile(set.promptFile),
    Promise.all(set.imageFiles.map((file) => provider.downloadFile(file)))]
    );
    const prompts = await parsePromptFile(promptFile);
    if (prompts.length === 0) throw new Error(`${set.name} prompt file did not contain prompts.`);

    const referenceFiles = imageFiles.map((file) => ({
      name: file.name,
      mimeType: file.mimeType,
      dataBase64: file.dataBase64
    }));

    const setOutputFolder = await provider.createOrFindFolder(outputFolderId, set.name);

    await this.storage.patchJob({
      phase: 'opening_chatgpt',
      totalPrompts: prompts.length
    });
    await this.logger.info(`Opening ChatGPT for ${set.name}.`);
    const tab = await this.tabs.openFreshChatGptTab();
    if (!tab.id) throw new Error('ChatGPT tab id was unavailable.');
    this.activeChatGptTabId = tab.id;

    try {
      await this.assertNotStopped();
      await this.storage.patchJob({ phase: 'configuring_chatgpt' });
      await this.logger.info(`Selecting ChatGPT ${formatChatGptSettings(chatGptSettings)}.`);
      const modeResult = await this.sendToChatGpt(tab.id, {
        type: 'CHATGPT_ENSURE_MODE',
        payload: chatGptSettings
      });

      if (!modeResult.success) {
        await this.assertNotStopped();
        throw new Error(modeResult.error ?? 'Could not select the requested ChatGPT mode.');
      }

      for (const prompt of prompts) {
        await this.assertNotStopped();
        await this.storage.patchJob({
          phase: 'sending_prompt',
          currentPromptIndex: prompt.index
        });
        await this.logger.info(`Sending ${set.name} prompt ${prompt.index}/${prompts.length}.`);
        await this.storage.patchJob({ phase: 'waiting_for_chatgpt' });

        const sendResult = await this.sendToChatGpt(tab.id, {
          type: 'CHATGPT_SEND_PROMPT',
          payload: {
            prompt: prompt.text,
            files: prompt.index === 1 ? referenceFiles : [],
            expectedImageCount: 1
          }
        });

        if (!sendResult.success) {
          await this.assertNotStopped();
          throw new Error(sendResult.error ?? `ChatGPT failed on prompt ${prompt.index}.`);
        }

        await this.assertNotStopped();
        await this.storage.patchJob({ phase: 'extracting_images' });
        const extractResult = await this.sendToChatGpt(tab.id, {
          type: 'CHATGPT_EXTRACT_IMAGES',
          payload: { promptIndex: prompt.index }
        });

        if (!extractResult.success) {
          await this.assertNotStopped();
          throw new Error(
            extractResult.error ?? `Could not extract prompt ${prompt.index} images.`
          );
        }

        await this.uploadGeneratedImages(
          provider,
          setOutputFolder.id,
          prompt.index,
          extractResult.images
        );
      }
    } finally {
      if (this.activeChatGptTabId === tab.id) {
        this.activeChatGptTabId = null;
      }
    }
  }

  async uploadGeneratedImages(
  provider,
  setOutputFolderId,
  promptIndex,
  images)
  {
    await this.assertNotStopped();
    await this.storage.patchJob({ phase: 'uploading_outputs' });
    const promptFolder = await provider.createOrFindFolder(
      setOutputFolderId,
      `Prompt-${promptIndex}`
    );

    if (images.length === 0) {
      await this.logger.warn(`No generated images found for Prompt-${promptIndex}.`);
      return;
    }

    for (const image of images) {
      await this.assertNotStopped();
      await provider.uploadFile(promptFolder.id, image);
    }

    await this.logger.info(`Uploaded ${images.length} image(s) for Prompt-${promptIndex}.`);
  }

  async sendToChatGpt(tabId, message) {
    let lastError = 'Could not contact ChatGPT content script.';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await this.assertNotStopped();
      try {
        const response = await sendTabMessage(tabId, message);
        if (!response.ok) throw new Error(response.error ?? lastError);
        return response.data;
      } catch (error) {
        lastError = getErrorMessage(error);
        await wait(500);
      }
    }

    throw new Error(lastError);
  }

  async assertNotStopped() {
    const job = await this.storage.getJob();
    if (job.stopRequested) throw new StopRequestedError();
  }

  async cancelActiveChatGptStep() {
    if (this.activeChatGptTabId === null) return;

    try {
      await sendTabMessage(this.activeChatGptTabId, {
        type: 'CHATGPT_CANCEL_ACTIVE'
      });
    } catch {

      // The job flag is still checked after the current extension step returns.
    }}

  getProvider(settings) {
    return this.providers[settings.mode];
  }

  assertCanListSets(settings) {
    if (settings.mode === 'drive' && !settings.drive.inputFolderId.trim()) {
      throw new Error('Drive input folder ID is required before listing sets.');
    }

    if (settings.mode === 'local' && !settings.local.inputDirectoryName) {
      throw new Error('Local input folder must be selected before listing sets.');
    }
  }
}

function formatChatGptSettings(settings) {
  const model = settings.model || settings.mode || 'instant';
  if (model === 'instant') return 'Instant mode';

  const effort =
  settings.thinkingEffort === 'light' ?
  'Light' :
  settings.thinkingEffort === 'standard' ?
  'Standard' :
  settings.thinkingEffort === 'heavy' ?
  'Heavy' :
  'Extended';

  return `Thinking ${effort} mode`;
}