# ChatGPT Platform Selectors And Code Blocks

Source files scanned:

- `manifest.json`
- `src/core/registry/platformConfigs.ts`
- `src/platforms/index.ts`
- `src/platforms/chatgpt/index.ts`
- `src/platforms/chatgpt/chatgpt.config.ts`
- `src/platforms/chatgpt/ChatgptSelectors.ts`
- `src/platforms/chatgpt/ChatgptAdapter.ts`
- `src/platforms/chatgpt/ChatgptUIController.ts`
- `src/platforms/chatgpt/ChatgptResponseParser.ts`
- `src/background/handlers/TabHandler.ts`
- `src/popup/PopupController.ts`

Compiled `dist` files, `node_modules`, shared base classes, and non-ChatGPT platform code are excluded.

## Manifest URL Matches

```json
"host_permissions": [
  "https://chat.openai.com/*",
  "https://chatgpt.com/*"
]
```

```json
"content_scripts": [
  {
    "matches": [
      "https://chat.openai.com/*",
      "https://chatgpt.com/*"
    ],
    "js": ["content/content-loader.js"],
    "run_at": "document_end",
    "all_frames": false
  }
]
```

## Shared ChatGPT Platform Config

```ts
export const CHATGPT_CONFIG: PlatformConfig = {
  id: 'chatgpt',
  name: 'ChatGPT',
  urlPattern: /^https:\/\/(chat\.openai\.com|chatgpt\.com)/,
  baseUrl: 'https://chatgpt.com',
  selectors: {
    input: [
      '#prompt-textarea',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
    ],
    submitButton: [
      'button#composer-submit-button[data-testid="send-button"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
    ],
    responseContainer: [
      '[data-message-author-role="assistant"]',
      '.markdown.prose',
    ],
    loadingIndicator: [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop streaming"]',
    ],
    newChatButton: [
      'a[data-testid="create-new-chat-button"]',
      'a[href="/"]',
    ],
    stopButton: [
      'button[data-testid="stop-button"]',
      'button[aria-label="Stop streaming"]',
    ],
  },
  features: {
    supportsSystemPrompt: true,
    supportsNewChat: true,
    supportsModelSelection: true,
    supportsStreaming: true,
    maxInputLength: 32000,
    responseTimeout: 300000,
  },
};
```

## ChatGPT Platform Config Module

```ts
export const chatgptSelectors: SelectorConfig = {
  input: [
    '#prompt-textarea',
    'div.ProseMirror[contenteditable="true"]',
    'div[contenteditable="true"]',
  ],
  submitButton: [
    'button#composer-submit-button[data-testid="send-button"]',
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
  ],
  responseContainer: [
    '[data-message-author-role="assistant"]',
    '.markdown.prose',
    '.text-message',
  ],
  loadingIndicator: [
    'button[data-testid="stop-button"]',
    'button[aria-label="Stop streaming"]',
  ],
  newChatButton: [
    'a[data-testid="create-new-chat-button"]',
    'a[href="/"]',
  ],
  stopButton: [
    'button[data-testid="stop-button"]',
    'button[aria-label="Stop streaming"]',
  ],
};

export const CHATGPT_RESPONSE_TIMEOUT = 300000;
export const CHATGPT_STABILITY_DELAY = 2000;
```

## Platform Import And Registration

```ts
import './chatgpt';
export * from './chatgpt';
```

```ts
export { ChatgptAdapter } from './ChatgptAdapter';
export { ChatgptSelectors } from './ChatgptSelectors';
export { ChatgptUIController } from './ChatgptUIController';
export { ChatgptResponseParser } from './ChatgptResponseParser';
export * from './chatgpt.config';

import { platformRegistry, CHATGPT_CONFIG } from '@/core/registry';
import { ChatgptAdapter } from './ChatgptAdapter';

platformRegistry.register('chatgpt', ChatgptAdapter, CHATGPT_CONFIG);
```

## Popup And Background Detection

```ts
const PLATFORM_NAMES: Record<string, string> = {
  chatgpt: 'ChatGPT',
};
```

```ts
const patterns: Record<string, RegExp> = {
  chatgpt: /^https:\/\/(chat\.openai\.com|chatgpt\.com)/,
};
```

```ts
if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) return 'chatgpt';
```

## ChatGPT Selector Manager

```ts
import { BaseSelectors } from '@/core/base';
import { chatgptSelectors } from './chatgpt.config';

export class ChatgptSelectors extends BaseSelectors {
  constructor() {
    super(chatgptSelectors);
  }

  protected isVisible(element: Element): boolean {
    const htmlElement = element as HTMLElement;
    const style = window.getComputedStyle(htmlElement);
    const rect = htmlElement.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0;
  }

  isElementVisible(element: Element): boolean {
    return this.isVisible(element);
  }

  findLatestAssistantMessage(): Element | null {
    const responses = document.querySelectorAll('[data-message-author-role="assistant"]');
    return responses.length > 0 ? responses[responses.length - 1] : null;
  }

  findLatestAssistantTurn(scope?: Element | null): Element | null {
    const target = scope || this.findLatestAssistantMessage();
    return target?.closest('section[data-turn="assistant"], [data-testid^="conversation-turn"]') || target || null;
  }

  findResponseCopyButton(scope?: Element | null): HTMLButtonElement | null {
    const root = this.findLatestAssistantTurn(scope);
    if (!root) return null;

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
      'button[data-testid="copy-turn-action-button"], button[aria-label="Copy response"]'
    ));

    for (let i = buttons.length - 1; i >= 0; i--) {
      const button = buttons[i];
      if (!button.disabled && this.isVisible(button)) return button;
    }

    return null;
  }

  findCodeBlockCopyButton(scope?: Element | null): HTMLButtonElement | null {
    const root = this.findLatestAssistantTurn(scope);
    if (!root) return null;

    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label="Copy"]'));
    for (let i = buttons.length - 1; i >= 0; i--) {
      const button = buttons[i];
      if (!button.disabled && this.isVisible(button)) return button;
    }

    return null;
  }

  findInputEditor(): Element | null {
    const selectors = [
      '#prompt-textarea',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input) {
        if ((input as HTMLElement).isContentEditable || input.tagName === 'TEXTAREA') {
          return input;
        }
      }
    }

    return this.find('input');
  }

  findSubmitButton(): Element | null {
    const selectors = [
      'button#composer-submit-button[data-testid="send-button"]',
      'button[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) {
        const style = window.getComputedStyle(button);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return button;
        }
      }
    }

    return this.find('submitButton');
  }

  findLatestResponse(): Element | null {
    const lastResponse = this.findLatestAssistantMessage();
    if (lastResponse) {
      const content = lastResponse.querySelector('.markdown.prose, .markdown');
      return content || lastResponse;
    }

    const baseResponses = this.findAll('responseContainer');
    return baseResponses.length > 0 ? baseResponses[baseResponses.length - 1] : null;
  }

  findNewChatButton(): Element | null {
    const selectors = [
      'a[data-testid="create-new-chat-button"]',
      'a[href="/"]',
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) {
        return button;
      }
    }

    return this.find('newChatButton');
  }

  isStreaming(): boolean {
    const testIdStopButton = document.querySelector('button[data-testid="stop-button"]');
    if (testIdStopButton && this.isVisible(testIdStopButton)) return true;

    const ariaStopButton = document.querySelector('button[aria-label="Stop streaming"]');
    if (ariaStopButton && this.isVisible(ariaStopButton)) return true;

    const composerButtons = document.querySelectorAll('form button, [id*="composer"] button');
    for (const btn of composerButtons) {
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
      if (label.includes('stop') && this.isVisible(btn)) return true;
    }

    return false;
  }

  hasStopButton(): boolean {
    return this.isStreaming();
  }

  isResponseGenerating(scope?: Element | null): boolean {
    const target = scope?.closest('[data-message-author-role="assistant"]') ||
      scope ||
      this.findLatestAssistantMessage() ||
      this.findLatestResponse();
    if (!target) return false;

    if (this.findResponseCopyButton(target)) return false;

    const lastNodeEls = target.querySelectorAll('[data-is-last-node]');
    for (const el of lastNodeEls) {
      const value = el.getAttribute('data-is-last-node');
      if (value === '' || value === 'false') return true;
    }
    return false;
  }
}
```

## ChatGPT Adapter Code

```ts
import { BasePlatformAdapter } from '@/core/base';
import { PlatformConfig, CollectionResult, DEFAULT_SETTINGS } from '@/types';
import { ChatgptSelectors } from './ChatgptSelectors';
import { ChatgptUIController } from './ChatgptUIController';
import { ChatgptResponseParser } from './ChatgptResponseParser';
import { CHATGPT_RESPONSE_TIMEOUT, CHATGPT_STABILITY_DELAY } from './chatgpt.config';
import { cancellableWait, wait } from '@/core/utils';
import { logger } from '@/core/services';

export class ChatgptAdapter extends BasePlatformAdapter {
  protected selectors: ChatgptSelectors;
  protected ui: ChatgptUIController;
  protected parser: ChatgptResponseParser;

  constructor(config: PlatformConfig) {
    super(config);
    this.selectors = new ChatgptSelectors();
    this.ui = new ChatgptUIController(this.selectors);
    this.parser = new ChatgptResponseParser(this.selectors);
  }

  async initialize(): Promise<void> {
    logger.info('Initializing ChatGPT adapter');
    await this.waitForPageReady(10000);
  }

  isOnPlatformPage(): boolean {
    return /chatgpt\.com|chat\.openai\.com/.test(window.location.href);
  }

  async waitForPageReady(timeout: number): Promise<boolean> {
    return this.ui.waitForInputReady(timeout);
  }

  async inputPrompt(text: string): Promise<void> {
    await this.ui.typeInInput(text);
  }

  async submitPrompt(): Promise<boolean> {
    const success = await this.ui.clickSubmit();
    if (success) {
      await wait(500);
      return true;
    }
    return this.createMessageLimitCooldownResult() !== null;
  }

  async waitForResponse(timeout: number = CHATGPT_RESPONSE_TIMEOUT): Promise<CollectionResult> {
    const startTime = Date.now();
    const { userSettings } = await chrome.storage.local.get('userSettings');
    const settings = { ...DEFAULT_SETTINGS, ...userSettings };
    const autoScroll = settings.autoScrollDuringGeneration;
    const effectiveTimeout = settings.waitUntilComplete ? Infinity : settings.responseTimeout;

    const initialRateLimit = this.createMessageLimitCooldownResult();
    if (initialRateLimit) return initialRateLimit;

    const streamingStarted = await this.waitForStreamingStart(10000);
    if (this.isStopRequested()) {
      logger.info('ChatGPT response wait cancelled before streaming settled');
      return this.createStoppedResult();
    }
    const postStartRateLimit = this.createMessageLimitCooldownResult();
    if (postStartRateLimit) return postStartRateLimit;

    if (!streamingStarted) {
      logger.warn('ChatGPT response did not start');
      return {
        success: false,
        error: 'ChatGPT response did not start',
        reason: 'NO_RESPONSE',
        timestamp: Date.now(),
      };
    }
    logger.info('Waiting for ChatGPT response to complete');

    let lastContentSnapshot = '';
    let contentStableCount = 0;
    const CONTENT_STABLE_THRESHOLD = 4;

    while (Date.now() - startTime < effectiveTimeout) {
      if (this.isStopRequested()) {
        logger.info('ChatGPT response wait cancelled');
        return this.createStoppedResult();
      }

      const rateLimit = this.createMessageLimitCooldownResult();
      if (rateLimit) return rateLimit;

      if (this.ui.dismissTooManyRequestsDialog()) {
        logger.warn('Closed ChatGPT Too many requests dialog');
        await wait(1000);
        continue;
      }

      const loading = this.ui.isLoading();
      const visibleStopButton = this.selectors.isStreaming();
      const latestResponseEl = this.parser.findLatestResponse();
      const latestContent = latestResponseEl?.textContent?.trim() || '';

      if (!visibleStopButton) {
        const responseEl = this.parser.findLatestResponse();
        if (responseEl && this.parser.isResponseComplete(responseEl)) {
          const completionSettleDelay = this.selectors.findResponseCopyButton(responseEl)
            ? 300
            : CHATGPT_STABILITY_DELAY;
          await wait(completionSettleDelay);
          if (!this.selectors.isStreaming()) {
            logger.info('ChatGPT response complete by DOM signal');
            break;
          }
        }

        const currentContent = responseEl?.textContent || '';
        if (currentContent.length > 0 && currentContent === lastContentSnapshot) {
          contentStableCount++;
          if (contentStableCount >= CONTENT_STABLE_THRESHOLD) {
            logger.info('Response content stable for 2s - treating as complete');
            break;
          }
        } else {
          contentStableCount = 0;
        }
        lastContentSnapshot = currentContent;
      } else {
        contentStableCount = 0;
        lastContentSnapshot = latestContent;
      }

      if (autoScroll) this.ui.scrollToBottom();
      if (await cancellableWait(500, () => this.isStopRequested())) {
        logger.info('ChatGPT response wait cancelled during poll delay');
        return this.createStoppedResult();
      }
    }

    if (this.isStopRequested()) {
      logger.info('ChatGPT response parsing skipped after stop');
      return this.createStoppedResult();
    }

    const responseEl = this.parser.findLatestResponse();
    if (!responseEl) {
      const rateLimit = this.createMessageLimitCooldownResult();
      if (rateLimit) return rateLimit;

      logger.warn('ChatGPT response wait finished but no response element was found');
      return {
        success: false,
        error: 'No response found',
        reason: 'NO_RESPONSE',
        timestamp: Date.now(),
      };
    }

    const parsed = this.parser.parseResponse(responseEl, {
      extractCodeBlockOnly: settings.extractCodeBlockOnly,
      expectedFormat: settings.expectedOutputFormat,
    });
    if (!parsed.success) {
      const copied = await this.parseFromCopyFallback(responseEl, settings);
      if (copied) {
        logger.info(`Parsed ChatGPT response from copy fallback: textLength=${copied.data?.rawText?.length || 0}`);
        return copied;
      }
    }
    logger.info(`Parsed ChatGPT response: success=${parsed.success}, textLength=${parsed.data?.rawText?.length || 0}`);
    return parsed;
  }

  async startNewChat(): Promise<void> {
    const newChatButton = document.querySelector('a[data-testid="create-new-chat-button"]') ||
                          document.querySelector('a[href="/"]');

    if (newChatButton) {
      (newChatButton as HTMLElement).click();
      await wait(2000);
    } else {
      window.location.href = 'https://chatgpt.com';
      await wait(3000);
    }

    await this.waitForPageReady(10000);
  }

  async setSystemPrompt(prompt: string): Promise<boolean> {
    try {
      logger.info('Sending system prompt as first message');
      if (this.isStopRequested()) return false;

      const ready = await this.waitForPageReady(5000);
      if (!ready) {
        logger.error('Input not ready for system prompt');
        return false;
      }
      if (this.isStopRequested()) return false;

      await this.inputPrompt(prompt);
      if (this.isStopRequested()) return false;

      const submitted = await this.submitPrompt();
      if (this.isStopRequested()) return false;
      if (!submitted) {
        logger.error('Failed to submit system prompt');
        return false;
      }

      const response = await this.waitForResponse(this.config.features.responseTimeout);
      if (!response.success || this.isStopRequested()) return false;

      if (await cancellableWait(1000, () => this.isStopRequested())) return false;

      logger.info('System prompt sent successfully');
      return true;
    } catch (error) {
      logger.error('Error sending system prompt:', error);
      return false;
    }
  }

  private async waitForStreamingStart(timeout: number): Promise<boolean> {
    const startTime = Date.now();
    const baselineMessage = this.selectors.findLatestAssistantMessage();
    const baselineContent = baselineMessage?.textContent || '';
    const baselineHash = this.parser.getContentHash(baselineContent);
    const baselineResponseCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;

    while (Date.now() - startTime < timeout) {
      if (this.isStopRequested()) return false;

      if (this.createMessageLimitCooldownResult()) {
        return true;
      }

      if (this.ui.dismissTooManyRequestsDialog()) {
        logger.warn('Closed ChatGPT Too many requests dialog while waiting for streaming');
        await wait(1000);
        continue;
      }

      if (this.ui.isLoading()) return true;

      const latestMessage = this.selectors.findLatestAssistantMessage();
      const currentResponseCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
      const currentContent = latestMessage?.textContent || '';
      const currentHash = this.parser.getContentHash(currentContent);
      const hasNewAssistantTurn = !!latestMessage && latestMessage !== baselineMessage;
      const hasMoreAssistantTurns = currentResponseCount > baselineResponseCount;
      const hasChangedContent = currentContent.trim().length > 0 && currentHash !== baselineHash;
      const hasFinalCopyAction = !!latestMessage &&
        !!this.selectors.findResponseCopyButton(latestMessage) &&
        (hasNewAssistantTurn || hasMoreAssistantTurns || hasChangedContent);

      if (hasNewAssistantTurn || hasMoreAssistantTurns || hasChangedContent || hasFinalCopyAction) {
        logger.info('Streaming detected via content change');
        return true;
      }

      if (await cancellableWait(200, () => this.isStopRequested())) return false;
    }

    logger.warn('Streaming start not detected within timeout');
    return false;
  }

  private async parseFromCopyFallback(
    responseEl: Element,
    settings: typeof DEFAULT_SETTINGS
  ): Promise<CollectionResult | null> {
    const copiedText = await this.copyLatestResponseText(responseEl);
    if (!copiedText) return null;

    const synthetic = document.createElement('pre');
    synthetic.textContent = copiedText;

    const parsed = this.parser.parseResponse(synthetic, {
      extractCodeBlockOnly: settings.extractCodeBlockOnly,
      expectedFormat: settings.expectedOutputFormat,
    });

    return parsed.success ? parsed : null;
  }

  private async copyLatestResponseText(responseEl: Element): Promise<string | null> {
    const buttons = [
      this.selectors.findCodeBlockCopyButton(responseEl),
      this.selectors.findResponseCopyButton(responseEl),
    ].filter((button): button is HTMLButtonElement => !!button);

    if (buttons.length === 0 || !navigator.clipboard?.readText) return null;

    let previousText: string | null = null;
    try {
      previousText = await navigator.clipboard.readText();
    } catch {
      previousText = null;
    }

    for (const button of buttons) {
      try {
        button.click();
      } catch (error) {
        logger.warn('ChatGPT copy fallback click failed', error);
        continue;
      }

      const copied = await this.waitForClipboardText(previousText, 2000);
      if (copied) return copied;
    }

    return null;
  }

  private async waitForClipboardText(previousText: string | null, timeout: number): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.isStopRequested()) return null;

      try {
        const text = await navigator.clipboard.readText();
        if (text.trim().length > 0 && (previousText === null || text !== previousText)) {
          return text;
        }
      } catch {
        return null;
      }

      if (await cancellableWait(100, () => this.isStopRequested())) return null;
    }

    return null;
  }

  private createMessageLimitCooldownResult(): CollectionResult | null {
    const remainingMinutes = this.ui.getMessageLimitCooldownMinutes();
    if (remainingMinutes === null) return null;

    const durationMs = Math.max(60_000, remainingMinutes * 60_000);

    return {
      success: false,
      error: `ChatGPT message limit reached. Retry in ${remainingMinutes} minute(s).`,
      reason: 'RATE_LIMIT',
      cooldown: {
        source: 'chatgpt',
        remainingMinutes,
        durationMs,
        endsAt: Date.now() + durationMs,
      },
      timestamp: Date.now(),
    };
  }
}
```

## ChatGPT UI Controller Code

```ts
import { BaseUIController } from '@/core/base';
import { ChatgptSelectors } from './ChatgptSelectors';
import { wait } from '@/core/utils';

export class ChatgptUIController extends BaseUIController {
  protected selectors: ChatgptSelectors;

  constructor(selectors: ChatgptSelectors) {
    super(selectors);
    this.selectors = selectors;
  }

  async typeInInput(text: string): Promise<void> {
    let input: Element | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      input = this.selectors.findInputEditor();
      if (input) {
        const htmlInput = input as HTMLElement;
        if (htmlInput.isContentEditable || input.tagName === 'TEXTAREA') {
          htmlInput.focus();
          await wait(100);
          if (document.activeElement === htmlInput || htmlInput.contains(document.activeElement)) {
            break;
          }
        }
      }
      attempts++;
      await wait(300);
    }

    if (!input) {
      throw new Error('Input field not found after waiting');
    }

    const htmlInput = input as HTMLElement;

    htmlInput.focus();
    await wait(150);

    if (htmlInput.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection?.removeAllRanges();
      selection?.addRange(range);
      await wait(50);

      document.execCommand('delete', false);
      await wait(50);

      document.execCommand('insertText', false, text);
      await wait(150);

      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      await wait(100);
      const currentText = (input as HTMLElement).innerText || (input as HTMLElement).textContent || '';
      if (!currentText.includes(text.substring(0, Math.min(20, text.length)))) {
        (input as HTMLElement).innerHTML = `<p>${text}</p>`;
        input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
      }
    } else {
      const textarea = input as HTMLTextAreaElement;
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    await wait(200);
  }

  async clickSubmit(): Promise<boolean> {
    let button: Element | null = null;
    const startTime = Date.now();

    while (Date.now() - startTime < 2000) {
      button = this.selectors.findSubmitButton();
      if (button && !(button as HTMLButtonElement).disabled) {
        break;
      }
      await wait(100);
    }

    if (!button) {
      return false;
    }

    if ((button as HTMLButtonElement).disabled) {
      return false;
    }

    (button as HTMLElement).click();
    return true;
  }

  dismissTooManyRequestsDialog(): boolean {
    const dialog = Array.from(document.querySelectorAll('[role="dialog"]'))
      .find((element) => this.isVisible(element) && /too many requests/i.test(element.textContent || ''));

    if (!dialog) return false;

    const gotItButton = Array.from(dialog.querySelectorAll('button'))
      .find((button) => this.isVisible(button) && /^got it$/i.test((button.textContent || '').trim()));

    if (!gotItButton) return false;

    (gotItButton as HTMLElement).click();
    return true;
  }

  getMessageLimitCooldownMinutes(): number | null {
    const candidates = Array.from(document.querySelectorAll('aside, [role="alert"], [role="status"]'))
      .filter((element) => this.isVisible(element));

    for (const element of candidates) {
      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/you['\u2019]ve reached your message limit/i.test(text)) continue;

      const duration = this.parseCooldownMinutes(text);
      if (duration !== null) return duration;
    }

    return null;
  }

  async clickNewChat(): Promise<boolean> {
    const button = this.selectors.findNewChatButton();
    if (!button) {
      return false;
    }

    (button as HTMLElement).click();
    await wait(2000);
    return true;
  }

  isLoading(): boolean {
    if (this.selectors.isStreaming()) return true;
    if (this.selectors.isResponseGenerating(this.selectors.findLatestResponse())) return true;
    return false;
  }

  scrollToBottom(): void {
    const target = (() => {
      const responses = document.querySelectorAll('[data-message-author-role="assistant"]');
      return responses.length ? responses[responses.length - 1] : null;
    })() || (() => {
      const proseEls = document.querySelectorAll('.markdown.prose');
      return proseEls.length ? proseEls[proseEls.length - 1] : null;
    })();

    if (target) {
      const scrollable = this.findScrollableAncestor(target);
      if (scrollable) {
        scrollable.scrollTo({ top: scrollable.scrollHeight, behavior: 'smooth' });
        return;
      }
    }

    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  private findScrollableAncestor(el: Element): Element | null {
    let parent = el.parentElement;
    while (parent && parent !== document.documentElement) {
      const { overflowY } = window.getComputedStyle(parent);
      if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  private parseCooldownMinutes(text: string): number | null {
    const match = text.match(/try again in\s+(\d+)\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)\b/i);
    if (!match) return null;

    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const unit = match[2].toLowerCase();
    if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 60;
    if (unit.startsWith('second') || unit.startsWith('sec')) return Math.max(1, Math.ceil(amount / 60));
    return amount;
  }

  private isVisible(element: Element): boolean {
    const htmlElement = element as HTMLElement;
    const style = window.getComputedStyle(htmlElement);
    const rect = htmlElement.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }

  async waitForInputReady(timeout: number = 15000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const input = this.selectors.findInputEditor();
      if (input) {
        const htmlInput = input as HTMLElement;
        if (htmlInput.isContentEditable || input.tagName === 'TEXTAREA') {
          htmlInput.focus();
          await wait(50);
          if (document.activeElement === htmlInput || htmlInput.contains(document.activeElement)) {
            htmlInput.blur();
            return true;
          }
        }
      }
      await wait(300);
    }

    return false;
  }
}
```

## ChatGPT Response Parser And Code Block Extraction

```ts
import { BaseResponseParser } from '@/core/base';
import { logger } from '@/core/services';
import { ChatgptSelectors } from './ChatgptSelectors';

export class ChatgptResponseParser extends BaseResponseParser {
  private selectors: ChatgptSelectors;

  constructor(selectors: ChatgptSelectors) {
    super();
    this.selectors = selectors;
  }

  findLatestResponse(): Element | null {
    return this.selectors.findLatestResponse();
  }

  findTables(container: Element): Element[] {
    return Array.from(container.querySelectorAll('table'));
  }

  detectFormat(container: Element): 'table' | 'paragraph' | 'mixed' {
    const tables = this.findTables(container);
    const hasText = container.textContent && container.textContent.trim().length > 0;
    const hasTables = tables.length > 0;

    if (hasTables && hasText) {
      const tableText = tables.reduce((acc, t) => acc + (t.textContent || '').length, 0);
      const totalText = (container.textContent || '').length;

      if (totalText - tableText > 100) {
        return 'mixed';
      }
      return 'table';
    }

    if (hasTables) return 'table';
    return 'paragraph';
  }

  isResponseComplete(container: Element): boolean {
    if (this.selectors.isStreaming()) return false;

    const responseScope = container.closest('[data-message-author-role="assistant"]') || container;

    if (this.selectors.findResponseCopyButton(responseScope)) return true;

    const lastNodeEls = responseScope.querySelectorAll('[data-is-last-node]');
    for (const el of lastNodeEls) {
      const value = el.getAttribute('data-is-last-node');
      if (value === '' || value === 'false') return false;
    }

    const confirmedDone = responseScope.querySelector('[data-is-last-node="true"]');
    if (confirmedDone) return true;

    const sendButton = document.querySelector('button[data-testid="send-button"]');
    if (sendButton) {
      const style = window.getComputedStyle(sendButton);
      if (style.display !== 'none' && style.visibility !== 'hidden') return true;
    }

    return false;
  }

  private extractCodeText(root: Element): string {
    const codeRoot = root.querySelector('code') || root;
    const lines = codeRoot.querySelectorAll('.cm-line');

    if (lines.length > 0) {
      return Array.from(lines)
        .map((line) => line.textContent || '')
        .join('\n')
        .replace(/\u00a0/g, ' ')
        .trim();
    }

    let text = '';
    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as Element;
      if (element.tagName === 'BR') {
        text += '\n';
        return;
      }

      element.childNodes.forEach(walk);
    };

    codeRoot.childNodes.forEach(walk);
    return text.replace(/\u00a0/g, ' ').trim();
  }

  extractCodeBlocks(container: Element): { language: string; code: string }[] {
    const codeBlocks: { language: string; code: string }[] = [];
    const processedElements = new Set<Element>();

    const knownLanguages = /^(json|javascript|typescript|python|html|css|xml|sql|bash|sh|yaml|yml|markdown|text|csv|go|rust|java|c|cpp|csharp|ruby|php|swift|kotlin|plaintext|txt)$/i;

    container.querySelectorAll('.cm-editor').forEach((editor) => {
      const cmContent = editor.querySelector('.cm-content');
      let code = '';

      code = this.extractCodeText(cmContent || editor);

      if (!code.trim()) return;

      let language = 'text';
      const wrapper = editor.closest('[class*="border"]') || editor.parentElement?.parentElement?.parentElement;
      if (wrapper) {
        const candidates = wrapper.querySelectorAll('div, span');
        for (const el of candidates) {
          if (el.contains(editor)) continue;
          const text = (el.textContent || '').trim();
          if (text && knownLanguages.test(text)) {
            language = text.toLowerCase();
            break;
          }
        }
      }

      codeBlocks.push({ language, code: code.trim() });
      logger.debug(`Extracted ChatGPT CodeMirror block: language=${language}, chars=${code.trim().length}`);

      const parentPre = editor.closest('pre');
      if (parentPre) processedElements.add(parentPre);
      if (cmContent) processedElements.add(cmContent);
    });

    container.querySelectorAll('pre code').forEach((codeEl) => {
      const parentPre = codeEl.closest('pre');
      const parentCmContent = codeEl.closest('.cm-content');
      if ((parentPre && processedElements.has(parentPre)) ||
          (parentCmContent && processedElements.has(parentCmContent))) return;
      if (codeEl.closest('.cm-editor')) return;

      const languageMatch = codeEl.className.match(/language-(\w+)/);
      const language = languageMatch ? languageMatch[1] : 'text';

      codeBlocks.push({
        language,
        code: this.extractCodeText(codeEl),
      });
    });

    if (codeBlocks.length === 0) {
      logger.debug('No ChatGPT code blocks extracted from latest response');
    }

    return codeBlocks;
  }
}
```
