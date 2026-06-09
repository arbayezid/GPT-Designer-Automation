import { ChatGptAutomation } from './chatgpt/chatGptAutomation';


const automation = new ChatGptAutomation();

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (
    message.type !== 'CHATGPT_ENSURE_MODE' &&
    message.type !== 'CHATGPT_SEND_PROMPT' &&
    message.type !== 'CHATGPT_EXTRACT_IMAGES' &&
    message.type !== 'CHATGPT_CANCEL_ACTIVE')
    {
      return false;
    }

    void handleMessage(message).
    then((data) => sendResponse({ ok: true, data })).
    catch((error) =>
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown content script error'
    })
    );

    return true;
  }
);

async function handleMessage(message) {
  switch (message.type) {
    case 'CHATGPT_ENSURE_MODE':
      return automation.ensureMode(message.payload);
    case 'CHATGPT_SEND_PROMPT':
      return automation.sendPrompt(message.payload);
    case 'CHATGPT_EXTRACT_IMAGES':
      return automation.extractLatestImages(message.payload.promptIndex);
    case 'CHATGPT_CANCEL_ACTIVE':
      return automation.cancelActiveOperation();
    default:
      throw new Error(`Unsupported content message: ${message.type}`);
  }
}