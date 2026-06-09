

export class GoogleAuthService {
  async getAccessToken(interactive = true) {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        const accessToken = typeof token === 'string' ? token : token?.token;

        if (!accessToken) {
          reject(new Error('Google OAuth did not return an access token.'));
          return;
        }

        resolve(accessToken);
      });
    });
  }

  async clearCachedToken(token) {
    return new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }
}