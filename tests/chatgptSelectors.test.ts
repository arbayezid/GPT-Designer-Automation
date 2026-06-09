import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
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
  getAssistantTurns,
  getGeneratedImagesFromTurn,
  getLatestAssistantTurn,
  getUploadedImageTileCount,
  hasResponseActionButtons,
  isMenuItemChecked,
} from '../src/content/chatgpt/selectors';

describe('ChatGPT selectors', () => {
  const fixturePath = ['html-selectors.html', 'docs/html-selectors.html']
    .map((path) => resolve(process.cwd(), path))
    .find((path) => existsSync(path));
  if (!fixturePath) throw new Error('Missing html-selectors.html fixture.');
  const html = readFileSync(fixturePath, 'utf8');

  it('finds composer controls from captured HTML', () => {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/' });
    const root = dom.window.document;

    expect(findComposer(root)).not.toBeNull();
    expect(findFileInput(root)).not.toBeNull();
    expect(findPromptBox(root)).not.toBeNull();
    expect(findSendButton(root)).not.toBeNull();
    expect(getUploadedImageTileCount(root)).toBeGreaterThanOrEqual(2);
  });

  it('scopes generated image extraction to the latest assistant turn', () => {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/' });
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;

    const turns = getAssistantTurns(dom.window.document);
    const latest = getLatestAssistantTurn(dom.window.document);
    const images = getGeneratedImagesFromTurn(latest);

    expect(turns.length).toBeGreaterThanOrEqual(1);
    expect(latest?.getAttribute('data-turn')).toBe('assistant');
    expect(images.length).toBeGreaterThan(0);
    expect(new Set(images.map((image) => image.fileId)).size).toBe(images.length);
    expect(images[0].src).toContain('/backend-api/estuary/content');
    expect(hasResponseActionButtons(latest)).toBe(true);
  });

  it('detects assistant response actions as an output-ready signal', () => {
    const dom = new JSDOM(
      `<section data-turn="assistant" data-testid="conversation-turn-2">
        <div aria-label="Response actions" role="group" tabindex="-1">
          <button aria-label="Copy response" data-testid="copy-turn-action-button"></button>
          <button aria-label="Like this image" data-testid="good-image-turn-action-button"></button>
          <button aria-label="Dislike this image" data-testid="bad-image-turn-action-button"></button>
          <button aria-label="More actions" type="button"></button>
        </div>
      </section>`,
      { url: 'https://chatgpt.com/' },
    );

    expect(hasResponseActionButtons(dom.window.document)).toBe(true);
  });

  it('finds ChatGPT model and thinking effort controls from captured HTML', () => {
    const dom = new JSDOM(html, { url: 'https://chatgpt.com/' });
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;

    expect(findModelSelectorButton(dom.window.document)).not.toBeNull();
    expect(getCurrentModelSelectorLabel(dom.window.document)).toBe('Extended');
    expect(findOpenModelItem('instant', dom.window.document)?.textContent).toContain('Instant');
    expect(findOpenModelItem('thinking', dom.window.document)?.textContent).toContain('Thinking');
    expect(findOpenThinkingEffortButton(dom.window.document)).not.toBeNull();

    const extended = findOpenThinkingEffortItem('extended', dom.window.document);
    expect(extended?.textContent).toContain('Extended');
    expect(isMenuItemChecked(extended)).toBe(true);
  });

  it('accepts the response actions group when buttons are not present in captured HTML', () => {
    const dom = new JSDOM(
      `<section data-turn="assistant" data-testid="conversation-turn-2">
        <div aria-label="Response actions" role="group" tabindex="-1"></div>
      </section>`,
      { url: 'https://chatgpt.com/' },
    );

    expect(hasResponseActionButtons(dom.window.document)).toBe(true);
  });
});
