import {
  CHATGPT_READY_TIMEOUT_MS,
  CHATGPT_RESPONSE_TIMEOUT_MS,
  CHATGPT_UPLOAD_TIMEOUT_MS } from
'../../shared/constants';
import { base64ToArrayBuffer, blobToBase64 } from '../../shared/base64';
import { getErrorMessage, wait, waitUntil } from '../../shared/async';









import {
  findComposer,
  findFileInput,
  findModelSelectorButton,
  findOpenModelItem,
  findOpenThinkingEffortButton,
  findOpenThinkingEffortItem,
  findPromptBox,
  findSendButton,
  getCurrentModelSelectorLabel,
  getGeneratedImagesFromTurn,
  getLatestAssistantTurn,
  getUploadedImageTileCount,
  hasResponseActionButtons,
  isMenuItemChecked,
  isStreaming } from
'./selectors';






class ChatGptOperationCancelledError extends Error {
  constructor() {
    super('Automation stopped by user.');
  }
}

export class ChatGptAutomation {
  activeOperation = null;

  cancelActiveOperation() {
    if (!this.activeOperation) return { cancelled: false };

    this.activeOperation.cancelled = true;
    this.activeOperation.controller.abort();
    return { cancelled: true };
  }

  async ensureMode(request) {
    const operation = this.createActiveOperation();

    try {
      const ready = await this.waitForComposerReady(operation);
      if (!ready) throw new Error('ChatGPT composer was not ready.');

      if (request.mode === 'instant') {
        await this.ensureInstantMode(operation);
      } else {
        await this.ensureThinkingMode(request.thinkingEffort, operation);
      }

      return {
        success: true,
        selectedLabel: getCurrentModelSelectorLabel()
      };
    } catch (error) {
      return {
        success: false,
        selectedLabel: getCurrentModelSelectorLabel(),
        error: getErrorMessage(error)
      };
    } finally {
      this.clearActiveOperation(operation);
    }
  }

  async sendPrompt(request) {
    const operation = this.createActiveOperation();

    try {
      const ready = await this.waitForComposerReady(operation);
      if (!ready) throw new Error('ChatGPT composer was not ready.');

      const baselineTurn = getLatestAssistantTurn();
      const baselineUploadedTiles = getUploadedImageTileCount();

      if (request.files.length > 0) {
        await this.attachFiles(request.files, baselineUploadedTiles, operation);
      }

      await this.typePrompt(request.prompt, operation);

      const sendButtonReady = await waitUntil(
        () => {
          this.assertNotCancelled(operation);
          const button = findSendButton();
          return !!button && !button.disabled;
        },
        { timeoutMs: CHATGPT_READY_TIMEOUT_MS, onTick: () => this.assertNotCancelled(operation) }
      );

      if (!sendButtonReady) throw new Error('ChatGPT send button did not become enabled.');

      this.assertNotCancelled(operation);
      findSendButton()?.click();

      const response = await this.waitForResponseComplete(
        baselineTurn,
        request.expectedImageCount ?? 0,
        operation
      );
      return {
        success: true,
        turnId: response.turnId,
        imageCount: response.imageCount
      };
    } catch (error) {
      return {
        success: false,
        turnId: null,
        imageCount: 0,
        error: getErrorMessage(error)
      };
    } finally {
      this.clearActiveOperation(operation);
    }
  }

  async extractLatestImages(promptIndex) {
    const operation = this.createActiveOperation();

    try {
      const latestTurn = getLatestAssistantTurn();
      const imageRefs = getGeneratedImagesFromTurn(latestTurn);
      const images = [];

      for (let i = 0; i < imageRefs.length; i += 1) {
        this.assertNotCancelled(operation);
        const ref = imageRefs[i];
        const response = await fetch(ref.src, {
          credentials: 'include',
          signal: operation.controller.signal
        });
        if (!response.ok) {
          throw new Error(`Could not fetch generated image ${ref.fileId}: ${response.status}`);
        }

        this.assertNotCancelled(operation);
        const blob = await response.blob();
        const mimeType = blob.type || 'image/png';
        const extension = extensionForMime(mimeType);

        images.push({
          name: `prompt-${promptIndex}-image-${i + 1}.${extension}`,
          mimeType,
          dataBase64: await blobToBase64(blob),
          sourceUrl: ref.src,
          fileId: ref.fileId,
          promptIndex
        });
      }

      return { success: true, images };
    } catch (error) {
      return {
        success: false,
        images: [],
        error: getErrorMessage(error)
      };
    } finally {
      this.clearActiveOperation(operation);
    }
  }

  async waitForComposerReady(operation) {
    return waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return !!findComposer() && !!findPromptBox();
      },
      { timeoutMs: CHATGPT_READY_TIMEOUT_MS, onTick: () => this.assertNotCancelled(operation) }
    );
  }

  async ensureInstantMode(operation) {
    if (getCurrentModelSelectorLabel()?.toLowerCase() === 'instant') return;

    await this.openModelMenu(operation);
    const instantItem = findOpenModelItem('instant');
    if (!instantItem) throw new Error('ChatGPT Instant mode option was not found.');

    if (!isMenuItemChecked(instantItem)) {
      this.clickMenuElement(instantItem, operation);
    }

    const verified = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return getCurrentModelSelectorLabel()?.toLowerCase() === 'instant';
      },
      { timeoutMs: CHATGPT_READY_TIMEOUT_MS, intervalMs: 300, onTick: () => this.assertNotCancelled(operation) }
    );

    if (!verified) throw new Error('ChatGPT Instant mode could not be verified.');
  }

  async ensureThinkingMode(
  effort,
  operation)
  {
    const expectedLabel = this.effortLabel(effort);

    await this.openModelMenu(operation);
    let thinkingItem = findOpenModelItem('thinking');
    if (!thinkingItem) throw new Error('ChatGPT Thinking mode option was not found.');

    if (!isMenuItemChecked(thinkingItem)) {
      this.clickMenuElement(thinkingItem, operation);
      await wait(400);
    }

    const thinkingSelected = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        const selectedThinkingItem = findOpenModelItem('thinking');
        const selectorLabel = getCurrentModelSelectorLabel()?.toLowerCase();
        return (
          isMenuItemChecked(selectedThinkingItem) ||
          selectorLabel === expectedLabel.toLowerCase());

      },
      {
        timeoutMs: CHATGPT_READY_TIMEOUT_MS,
        intervalMs: 300,
        onTick: () => this.assertNotCancelled(operation)
      }
    );

    if (!thinkingSelected) throw new Error('ChatGPT Thinking mode could not be selected.');

    await this.openModelMenu(operation);
    thinkingItem = findOpenModelItem('thinking');
    if (!thinkingItem) throw new Error('ChatGPT Thinking mode option was not available.');

    const effortButton = await this.waitForThinkingEffortButton(operation);
    this.clickMenuElement(effortButton, operation);

    const effortItemReady = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return !!findOpenThinkingEffortItem(effort);
      },
      { timeoutMs: CHATGPT_READY_TIMEOUT_MS, intervalMs: 250, onTick: () => this.assertNotCancelled(operation) }
    );

    if (!effortItemReady) throw new Error(`ChatGPT ${expectedLabel} effort option was not found.`);

    const effortItem = findOpenThinkingEffortItem(effort);
    if (!effortItem) throw new Error(`ChatGPT ${expectedLabel} effort option was unavailable.`);

    if (!isMenuItemChecked(effortItem)) {
      this.clickMenuElement(effortItem, operation);
    }

    const verified = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return getCurrentModelSelectorLabel()?.toLowerCase() === expectedLabel.toLowerCase();
      },
      { timeoutMs: CHATGPT_READY_TIMEOUT_MS, intervalMs: 300, onTick: () => this.assertNotCancelled(operation) }
    );

    if (!verified) throw new Error(`ChatGPT Thinking ${expectedLabel} mode could not be verified.`);
  }

  async openModelMenu(operation) {
    if (findOpenModelItem('instant') || findOpenModelItem('thinking')) return;

    const button = findModelSelectorButton();
    if (!button) throw new Error('ChatGPT model selector was not found.');

    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.focus();

    const attempts = [
    () => this.clickMenuElement(button, operation),
    () => this.pressMenuKey(button, 'ArrowDown', operation),
    () => this.pressMenuKey(button, 'Enter', operation),
    () => this.pressMenuKey(button, ' ', operation)];


    for (const attempt of attempts) {
      this.assertNotCancelled(operation);
      attempt();
      if (await this.waitForModelMenuOpen(operation, 1500)) return;
    }

    throw new Error(
      `ChatGPT model menu did not open from selector "${getCurrentModelSelectorLabel() ?? 'unknown'}".`
    );
  }

  async waitForModelMenuOpen(
  operation,
  timeoutMs)
  {
    return waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return !!findOpenModelItem('instant') || !!findOpenModelItem('thinking');
      },
      {
        timeoutMs,
        intervalMs: 150,
        onTick: () => this.assertNotCancelled(operation)
      }
    );
  }

  async waitForThinkingEffortButton(
  operation)
  {
    const ready = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return !!findOpenThinkingEffortButton();
      },
      { timeoutMs: CHATGPT_READY_TIMEOUT_MS, intervalMs: 250, onTick: () => this.assertNotCancelled(operation) }
    );

    if (!ready) throw new Error('ChatGPT Thinking effort control was not found.');

    const button = findOpenThinkingEffortButton();
    if (!button) throw new Error('ChatGPT Thinking effort control was unavailable.');
    return button;
  }

  clickMenuElement(element, operation) {
    this.assertNotCancelled(operation);
    element.focus();

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const mouseOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    };
    const pointerOptions = {
      ...mouseOptions,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    };

    element.dispatchEvent(new PointerEvent('pointerover', pointerOptions));
    element.dispatchEvent(new PointerEvent('pointerenter', pointerOptions));
    element.dispatchEvent(new MouseEvent('mouseover', mouseOptions));
    element.dispatchEvent(new MouseEvent('mouseenter', mouseOptions));
    element.dispatchEvent(new PointerEvent('pointerdown', pointerOptions));
    element.dispatchEvent(new MouseEvent('mousedown', mouseOptions));
    element.dispatchEvent(new PointerEvent('pointerup', { ...pointerOptions, buttons: 0 }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...mouseOptions, buttons: 0 }));
    element.click();
  }

  pressMenuKey(
  element,
  key,
  operation)
  {
    this.assertNotCancelled(operation);
    element.focus();

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
      code: key === ' ' ? 'Space' : key
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));
  }

  effortLabel(effort) {
    if (effort === 'light') return 'Light';
    if (effort === 'standard') return 'Standard';
    if (effort === 'heavy') return 'Heavy';
    return 'Extended';
  }

  async attachFiles(
  files,
  baselineUploadedTiles,
  operation)
  {
    this.assertNotCancelled(operation);
    const input = findFileInput();
    if (!input) throw new Error('ChatGPT file input was not found.');

    const transfer = new DataTransfer();
    for (const file of files) {
      transfer.items.add(
        new File([base64ToArrayBuffer(file.dataBase64)], file.name, { type: file.mimeType })
      );
    }

    try {
      input.files = transfer.files;
    } catch {
      Object.defineProperty(input, 'files', {
        value: transfer.files,
        configurable: true
      });
    }

    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));

    const uploaded = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        return getUploadedImageTileCount() >= baselineUploadedTiles + files.length;
      },
      {
        timeoutMs: CHATGPT_UPLOAD_TIMEOUT_MS,
        intervalMs: 500,
        onTick: () => this.assertNotCancelled(operation)
      }
    );

    if (!uploaded) {
      throw new Error(
        `Only ${getUploadedImageTileCount() - baselineUploadedTiles}/${files.length} files uploaded.`
      );
    }
  }

  async typePrompt(text, operation) {
    this.assertNotCancelled(operation);
    const promptBox = findPromptBox();
    if (!promptBox) throw new Error('ChatGPT prompt box was not found.');

    promptBox.focus();
    await wait(100);
    this.assertNotCancelled(operation);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptBox);
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.execCommand('delete');
    document.execCommand('insertText', false, text);

    await wait(100);
    const currentText = (promptBox.innerText || promptBox.textContent || '').trim();

    if (!currentText.includes(text.slice(0, Math.min(20, text.length)))) {
      promptBox.textContent = text;
    }

    promptBox.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      })
    );
    promptBox.dispatchEvent(new Event('change', { bubbles: true }));
    this.assertNotCancelled(operation);
  }

  async waitForResponseComplete(
  baselineTurn,
  expectedImageCount,
  operation)
  {
    let lastSignature = '';
    let stableCount = 0;
    let latestTurn = null;
    const startedAt = Date.now();
    const minimumImageCount = Math.max(0, expectedImageCount);

    const started = await waitUntil(
      () => {
        this.assertNotCancelled(operation);
        latestTurn = getLatestAssistantTurn();
        return !!latestTurn && latestTurn !== baselineTurn;
      },
      { timeoutMs: 30_000, intervalMs: 250, onTick: () => this.assertNotCancelled(operation) }
    );

    if (!started) throw new Error('ChatGPT response did not start.');

    while (Date.now() - startedAt < CHATGPT_RESPONSE_TIMEOUT_MS) {
      this.assertNotCancelled(operation);
      latestTurn = getLatestAssistantTurn();
      const images = getGeneratedImagesFromTurn(latestTurn);
      const actionsReady = hasResponseActionButtons(latestTurn);
      const signature = images.map((image) => image.fileId).join('|');
      const bodyText = document.body.textContent || '';

      if (/you['\u2019]ve reached your message limit/i.test(bodyText)) {
        throw new Error('ChatGPT message limit reached.');
      }

      if (!isStreaming()) {
        if (signature === lastSignature) {
          stableCount += 1;
        } else {
          stableCount = 0;
          lastSignature = signature;
        }

        if (
        stableCount >= 4 &&
        actionsReady && (
        images.length >= minimumImageCount ||
        minimumImageCount === 0 && Date.now() - startedAt > 5_000))
        {
          return {
            turnId: latestTurn?.getAttribute('data-turn-id') ?? null,
            imageCount: images.length
          };
        }
      } else {
        stableCount = 0;
        lastSignature = signature;
      }

      await wait(500);
    }

    throw new Error('Timed out waiting for ChatGPT response.');
  }

  createActiveOperation() {
    const operation = {
      cancelled: false,
      controller: new AbortController()
    };
    this.activeOperation = operation;
    return operation;
  }

  clearActiveOperation(operation) {
    if (this.activeOperation === operation) {
      this.activeOperation = null;
    }
  }

  assertNotCancelled(operation) {
    if (operation.cancelled || operation.controller.signal.aborted) {
      throw new ChatGptOperationCancelledError();
    }
  }
}

function extensionForMime(mimeType) {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  return 'png';
}