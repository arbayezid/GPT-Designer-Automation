import { describe, expect, it } from 'vitest';
import {
  existingFolderQuery,
  filesInFolderQuery,
  isImageFile,
  isPromptSheetFile,
  setFoldersQuery } from
'../src/drive/driveQueries';

describe('drive queries', () => {
  it('builds set folder query under the input folder', () => {
    expect(setFoldersQuery('input-folder')).toContain("'input-folder' in parents");
    expect(setFoldersQuery('input-folder')).toContain("mimeType = 'application/vnd.google-apps.folder'");
    expect(setFoldersQuery('input-folder')).toContain("name contains 'SET-'");
  });

  it('escapes folder names in exact folder query', () => {
    expect(existingFolderQuery('parent', "SET-1 user's")).toContain("name = 'SET-1 user\\'s'");
  });

  it('builds files-in-folder query', () => {
    expect(filesInFolderQuery('set-id')).toBe("'set-id' in parents and trashed = false");
  });

  it('classifies image and prompt files', () => {
    expect(isImageFile({ id: '1', name: 'a.png', mimeType: 'image/png' })).toBe(true);
    expect(isPromptSheetFile({ id: '2', name: 'prompts.xlsx', mimeType: 'application/octet-stream' })).toBe(
      true
    );
    expect(isPromptSheetFile({ id: '3', name: 'notes.txt', mimeType: 'text/plain' })).toBe(false);
  });
});