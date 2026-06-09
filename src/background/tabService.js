import { CHATGPT_BASE_URL } from '../shared/constants';
import { wait } from '../shared/async';

export class TabService {
  async openFreshChatGptTab() {
    const tab = await chrome.tabs.create({ url: CHATGPT_BASE_URL, active: true });
    if (!tab.id) throw new Error('Chrome did not return a ChatGPT tab id.');
    await this.waitForTabComplete(tab.id);
    await wait(2500);
    return tab;
  }

  async waitForTabComplete(tabId, timeoutMs = 60_000) {
    const current = await chrome.tabs.get(tabId);
    if (current.status === 'complete') return;

    await new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Timed out waiting for ChatGPT tab to load.'));
      }, timeoutMs);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') return;
        globalThis.clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }
}