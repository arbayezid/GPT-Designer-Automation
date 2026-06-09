






export const chatGptSelectors = {
  composer: 'form, [data-testid="composer"], div:has(#prompt-textarea)',
  fileInput: 'input[type="file"][multiple], input[type="file"]',
  promptBox: '#prompt-textarea',
  sendButton: 'button[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]',
  stopButton: 'button[data-testid="stop-button"], button[aria-label="Stop streaming"]',
  uploadedImageTile:
  'button[aria-label="Open image: User uploaded image"] img[src*="/backend-api/estuary/content"]',
  assistantTurn: 'section[data-turn="assistant"][data-testid^="conversation-turn"]',
  generatedImage: 'img[alt="Generated image"][src*="/backend-api/estuary/content"]',
  responseActionGroup: '[aria-label="Response actions"][role="group"]',
  responseActionButton: [
  'button[data-testid="copy-turn-action-button"]',
  'button[aria-label="Copy response"]',
  'button[data-testid="good-image-turn-action-button"]',
  'button[data-testid="bad-image-turn-action-button"]',
  'button[aria-label="Like this image"]',
  'button[aria-label="Dislike this image"]',
  'button[aria-label="More actions"]'].
  join(', '),
  modelSelectorButton: 'button.__composer-pill[aria-haspopup="menu"]',
  openMenu: '[data-radix-menu-content][role="menu"][data-state="open"]',
  instantModelItem: '[role="menuitemradio"][data-testid="model-switcher-gpt-5-5"]',
  thinkingModelItem:
  '[role="menuitemradio"][data-testid="model-switcher-gpt-5-5-thinking"]',
  thinkingEffortButton:
  'button[data-model-picker-thinking-effort-action="true"][data-testid="model-switcher-gpt-5-5-thinking-thinking-effort"], button[data-model-picker-thinking-effort-action="true"][aria-label="Effort"]',
  menuRadioItem: '[role="menuitemradio"]'
};

export function findComposer(root = document) {
  return root.querySelector(chatGptSelectors.composer);
}

export function findFileInput(root = document) {
  return root.querySelector(chatGptSelectors.fileInput);
}

export function findPromptBox(root = document) {
  return root.querySelector(chatGptSelectors.promptBox);
}

export function findSendButton(root = document) {
  return root.querySelector(chatGptSelectors.sendButton);
}

export function findModelSelectorButton(root = document) {
  const buttons = Array.from(
    root.querySelectorAll(chatGptSelectors.modelSelectorButton)
  ).filter(isUsableMenuElement);

  return buttons.filter((button) => normalizeMenuText(button.textContent).length > 0).at(-1) ?? null;
}

export function getCurrentModelSelectorLabel(root = document) {
  const button = findModelSelectorButton(root);
  const text = normalizeMenuText(button?.textContent);
  return text || null;
}

export function findOpenModelItem(
mode,
root = document)
{
  const selector =
  mode === 'instant' ? chatGptSelectors.instantModelItem : chatGptSelectors.thinkingModelItem;
  const item = findVisibleElement(selector, root);
  if (item) return item;

  const expected = mode === 'instant' ? 'Instant' : 'Thinking';
  const items = Array.from(
    root.querySelectorAll(chatGptSelectors.menuRadioItem)
  ).filter(isUsableMenuElement);

  return items.find((candidate) => normalizeMenuText(candidate.textContent).startsWith(expected)) ?? null;
}

export function findOpenThinkingEffortButton(
root = document)
{
  return root.querySelector(chatGptSelectors.thinkingEffortButton);
}

export function findOpenThinkingEffortItem(
effort,
root = document)
{
  const expected = effortToLabel(effort);
  const items = Array.from(
    root.querySelectorAll(chatGptSelectors.menuRadioItem)
  ).filter(isUsableMenuElement);

  return (
    items.find((item) => normalizeMenuText(item.textContent) === expected) ??
    items.find((item) => normalizeMenuText(item.textContent).includes(expected)) ??
    null);

}

export function isMenuItemChecked(item) {
  return (
    item?.getAttribute('aria-checked') === 'true' ||
    item?.getAttribute('data-state') === 'checked');

}

export function getAssistantTurns(root = document) {
  return Array.from(root.querySelectorAll(chatGptSelectors.assistantTurn));
}

export function getLatestAssistantTurn(root = document) {
  const turns = getAssistantTurns(root);
  return turns.length > 0 ? turns[turns.length - 1] : null;
}

export function getUploadedImageTileCount(root = document) {
  return root.querySelectorAll(chatGptSelectors.uploadedImageTile).length;
}

export function isStreaming(root = document) {
  return Array.from(root.querySelectorAll(chatGptSelectors.stopButton)).some(
    isVisible
  );
}

export function getGeneratedImagesFromTurn(turn) {
  if (!turn) return [];

  const byKey = new Map();
  const images = Array.from(
    turn.querySelectorAll(chatGptSelectors.generatedImage)
  );

  for (const image of images) {
    const src = image.currentSrc || image.src;
    if (!src) continue;

    const fileId = extractEstuaryFileId(src) ?? src;
    if (!byKey.has(fileId)) {
      byKey.set(fileId, { src, fileId });
    }
  }

  return [...byKey.values()];
}

export function hasResponseActionButtons(turn) {
  if (!turn) return false;

  const actionGroup = turn.querySelector(chatGptSelectors.responseActionGroup);
  const buttons = Array.from(
    turn.querySelectorAll(chatGptSelectors.responseActionButton)
  );

  return !!actionGroup || buttons.some((button) => !button.disabled);
}

export function extractEstuaryFileId(src) {
  try {
    const url = new URL(src, window.location.origin);
    return url.searchParams.get('id');
  } catch {
    const match = src.match(/[?&]id=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

export function isVisible(element) {
  const htmlElement = element;
  const style = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || '1') !== 0 &&
    rect.width > 0 &&
    rect.height > 0);

}

export function effortToLabel(effort) {
  if (effort === 'light') return 'Light';
  if (effort === 'standard') return 'Standard';
  if (effort === 'heavy') return 'Heavy';
  return 'Extended';
}

function findVisibleElement(
selector,
root = document)
{
  return Array.from(root.querySelectorAll(selector)).find(isUsableMenuElement) ?? null;
}

function normalizeMenuText(value) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function isUsableMenuElement(element) {
  const htmlElement = element;
  const style = window.getComputedStyle(htmlElement);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity || '1') !== 0);

}