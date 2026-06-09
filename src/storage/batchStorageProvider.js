














export const LOCAL_INPUT_ROOT_ID = '__local_input_root__';
export const LOCAL_OUTPUT_ROOT_ID = '__local_output_root__';

export function getInputRootId(settings) {
  return settings.mode === 'drive' ? settings.drive.inputFolderId.trim() : LOCAL_INPUT_ROOT_ID;
}

export function getOutputRootId(settings) {
  return settings.mode === 'drive' ? settings.drive.outputFolderId.trim() : LOCAL_OUTPUT_ROOT_ID;
}

export function assertStorageConfigured(settings) {
  if (settings.mode === 'drive') {
    if (!settings.drive.inputFolderId.trim() || !settings.drive.outputFolderId.trim()) {
      throw new Error('Both Drive input and output folder IDs are required.');
    }
    return;
  }

  if (!settings.local.inputDirectoryName || !settings.local.outputDirectoryName) {
    throw new Error('Both local input and output folders must be selected.');
  }
}