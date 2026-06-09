import { arrayBufferToBase64, base64ToArrayBuffer } from '../shared/base64';

import { getErrorMessage } from '../shared/async';


import {
  GOOGLE_SHEETS_MIME,
  DRIVE_FOLDER_MIME,
  existingFolderQuery,
  filesInFolderQuery,
  isImageFile,
  isPromptSheetFile,
  setFoldersQuery } from
'./driveQueries';












const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'files(id,name,mimeType,size,modifiedTime),nextPageToken';

export class DriveClient {
  constructor(auth) {this.auth = auth;}

  async listSets(inputFolderId) {
    const folders = await this.listFiles({
      q: setFoldersQuery(inputFolderId),
      orderBy: 'name_natural',
      fields: FILE_FIELDS
    });

    const sets = await Promise.all(
      folders.map(async (folder) => {
        const files = await this.listFiles({
          q: filesInFolderQuery(folder.id),
          orderBy: 'name_natural',
          fields: FILE_FIELDS
        });

        const imageFiles = files.filter(isImageFile);
        const promptFile = files.find(isPromptSheetFile) ?? null;

        return {
          id: folder.id,
          name: folder.name,
          imageFiles,
          promptFile
        };
      })
    );

    return sets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async downloadFile(file) {
    const url =
    file.mimeType === GOOGLE_SHEETS_MIME ?
    `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=text/csv` :
    `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`;

    const response = await this.fetchWithAuth(url);
    const dataBase64 = arrayBufferToBase64(await response.arrayBuffer());

    return {
      ...file,
      mimeType: file.mimeType === GOOGLE_SHEETS_MIME ? 'text/csv' : file.mimeType,
      name: file.mimeType === GOOGLE_SHEETS_MIME ? `${file.name}.csv` : file.name,
      dataBase64
    };
  }

  async createOrFindFolder(parentId, folderName) {
    const existing = await this.listFiles({
      q: existingFolderQuery(parentId, folderName),
      fields: FILE_FIELDS,
      pageSize: '1'
    });

    if (existing[0]) return existing[0];

    const response = await this.fetchWithAuth(`${DRIVE_API}/files?fields=id,name,mimeType`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: DRIVE_FOLDER_MIME,
        parents: [parentId]
      })
    });

    const created = await response.json();
    return created;
  }

  async uploadFile(parentId, file) {
    const boundary = `gpt_designer_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const metadata = {
      name: file.name,
      mimeType: file.mimeType,
      parents: [parentId]
    };

    const body = new Blob(
      [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n',
      `--${boundary}\r\n`,
      `Content-Type: ${file.mimeType}\r\n\r\n`,
      base64ToArrayBuffer(file.dataBase64),
      `\r\n--${boundary}--`],

      { type: `multipart/related; boundary=${boundary}` }
    );

    const response = await this.fetchWithAuth(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      }
    );

    return await response.json();
  }

  async listFiles(params) {
    const files = [];
    let pageToken;

    do {
      const search = new URLSearchParams({
        spaces: 'drive',
        pageSize: '100',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        ...params
      });
      if (pageToken) search.set('pageToken', pageToken);

      const response = await this.fetchWithAuth(`${DRIVE_API}/files?${search.toString()}`);
      const data = await response.json();
      files.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    return files;
  }

  async fetchWithAuth(url, init = {}) {
    let token = await this.auth.getAccessToken();
    let response = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      await this.auth.clearCachedToken?.(token);
      token = await this.auth.getAccessToken(true);
      response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${token}`
        }
      });
    }

    if (!response.ok) {
      const text = await response.text().catch((error) => getErrorMessage(error));
      throw new Error(`Drive request failed (${response.status}): ${text}`);
    }

    return response;
  }
}