















const SERVICE_ACCOUNT_PATH = 'drive-service-account.json';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export class ServiceAccountAuthService {
  cachedToken = null;
  credentials = null;
  signingKey = null;

  async getAccessToken(forceRefresh = false) {
    if (
    !forceRefresh &&
    this.cachedToken &&
    Date.now() < this.cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS)
    {
      return this.cachedToken.token;
    }

    const credentials = await this.getCredentials();
    const assertion = await this.createJwtAssertion(credentials);
    const tokenUri = credentials.token_uri || DEFAULT_TOKEN_URI;
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      })
    });

    const data = await response.json();
    if (!response.ok || !data.access_token) {
      const details = data.error_description || data.error || response.statusText;
      throw new Error(`Service account token request failed: ${details}`);
    }

    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000
    };
    return this.cachedToken.token;
  }

  async clearCachedToken(token) {
    if (this.cachedToken?.token === token) this.cachedToken = null;
  }

  async getCredentials() {
    if (this.credentials) return this.credentials;

    const response = await fetch(chrome.runtime.getURL(SERVICE_ACCOUNT_PATH), {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(
        `Missing ${SERVICE_ACCOUNT_PATH}. Place drive-service-account.json in the project root and run npm run build.`
      );
    }

    const value = await response.json();
    if (!value.client_email || !value.private_key) {
      throw new Error(`${SERVICE_ACCOUNT_PATH} must include client_email and private_key.`);
    }

    this.credentials = {
      client_email: value.client_email,
      private_key: value.private_key,
      token_uri: value.token_uri
    };
    return this.credentials;
  }

  async createJwtAssertion(credentials) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'RS256',
      typ: 'JWT'
    };
    const payload = {
      iss: credentials.client_email,
      scope: DRIVE_SCOPE,
      aud: credentials.token_uri || DEFAULT_TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + 3600
    };
    const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
    const key = await this.getSigningKey(credentials.private_key);
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(signingInput)
    );

    return `${signingInput}.${base64UrlArrayBuffer(signature)}`;
  }

  async getSigningKey(privateKeyPem) {
    if (this.signingKey) return this.signingKey;

    const keyData = pemToArrayBuffer(privateKeyPem);
    this.signingKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );
    return this.signingKey;
  }
}

function base64UrlJson(value) {
  return base64UrlString(JSON.stringify(value));
}

function base64UrlString(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return base64Url(btoa(binary));
}

function base64UrlArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return base64Url(btoa(binary));
}

function base64Url(value) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToArrayBuffer(pem) {
  const base64 = pem.
  replace(/-----BEGIN PRIVATE KEY-----/g, '').
  replace(/-----END PRIVATE KEY-----/g, '').
  replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}