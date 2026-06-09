export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function base64ToArrayBuffer(base64) {
  const bytes = base64ToUint8Array(base64);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

export function base64ToBlob(base64, mimeType) {
  return new Blob([base64ToArrayBuffer(base64)], { type: mimeType });
}