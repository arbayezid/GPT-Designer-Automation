import { describe, expect, it } from 'vitest';
import { parseCsv, parsePromptCsv, rowsToPromptItems } from '../src/sheets/promptParser';

describe('prompt parser', () => {
  it('parses quoted CSV cells', () => {
    expect(
      parseCsv('prompt,notes\n"Create, a screen","ignored"\n"Second ""quoted"" prompt",x')
    ).toEqual([
    ['prompt', 'notes'],
    ['Create, a screen', 'ignored'],
    ['Second "quoted" prompt', 'x']]
    );
  });

  it('keeps unquoted single-column prompt rows intact', () => {
    expect(
      parsePromptCsv('prompt\nCreate a login screen, with email and password\nCreate dashboard')
    ).toEqual([
    {
      index: 1,
      label: 'Prompt-1',
      text: 'Create a login screen, with email and password'
    },
    { index: 2, label: 'Prompt-2', text: 'Create dashboard' }]
    );
  });

  it('supports quoted multiline prompts in single-column prompt files', () => {
    expect(
      parsePromptCsv(
        'prompt\n"Create a settings screen\nInclude profile, billing, and security sections"\nCreate dashboard'
      )
    ).toEqual([
    {
      index: 1,
      label: 'Prompt-1',
      text: 'Create a settings screen\nInclude profile, billing, and security sections'
    },
    { index: 2, label: 'Prompt-2', text: 'Create dashboard' }]
    );
  });

  it('keeps standard multi-column CSV prompt columns', () => {
    expect(
      parsePromptCsv('prompt,notes\n"Create, a screen","ignored"\nCreate dashboard,x')
    ).toEqual([
    { index: 1, label: 'Prompt-1', text: 'Create, a screen' },
    { index: 2, label: 'Prompt-2', text: 'Create dashboard' }]
    );
  });

  it('detects prompt headers with a UTF-8 BOM', () => {
    expect(parsePromptCsv('\uFEFFprompt,notes\nCreate dashboard,ignored')).toEqual([
    { index: 1, label: 'Prompt-1', text: 'Create dashboard' }]
    );
  });

  it('uses a prompt header column when present', () => {
    expect(
      rowsToPromptItems([
      ['id', 'prompt'],
      ['1', 'Create login screen'],
      ['2', 'Create dashboard']]
      )
    ).toEqual([
    { index: 1, label: 'Prompt-1', text: 'Create login screen' },
    { index: 2, label: 'Prompt-2', text: 'Create dashboard' }]
    );
  });

  it('uses the first non-empty cell when no prompt header exists', () => {
    expect(rowsToPromptItems([[''], ['First prompt'], [' ', 'Second prompt']])).toEqual([
    { index: 1, label: 'Prompt-1', text: 'First prompt' },
    { index: 2, label: 'Prompt-2', text: 'Second prompt' }]
    );
  });
});