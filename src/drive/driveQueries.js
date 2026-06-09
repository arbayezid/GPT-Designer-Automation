

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GOOGLE_SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';

export function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function parentFolderQuery(folderId) {
  return `'${escapeDriveQueryValue(folderId)}' in parents and trashed = false`;
}

export function setFoldersQuery(inputFolderId) {
  return [
  parentFolderQuery(inputFolderId),
  `mimeType = '${DRIVE_FOLDER_MIME}'`,
  `name contains 'SET-'`].
  join(' and ');
}

export function filesInFolderQuery(folderId) {
  return parentFolderQuery(folderId);
}

export function existingFolderQuery(parentId, folderName) {
  return [
  parentFolderQuery(parentId),
  `mimeType = '${DRIVE_FOLDER_MIME}'`,
  `name = '${escapeDriveQueryValue(folderName)}'`].
  join(' and ');
}

export function isImageFile(file) {
  return file.mimeType.startsWith('image/');
}

export function isPromptSheetFile(file) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.csv') ||
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.mimeType === 'text/csv' ||
    file.mimeType === 'application/vnd.ms-excel' ||
    file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimeType === GOOGLE_SHEETS_MIME);

}