

export class Logger {
  constructor(storage) {this.storage = storage;}

  async info(message) {
    console.info(`[GPT Designer] ${message}`);
    await this.storage.appendLog('info', message);
  }

  async warn(message) {
    console.warn(`[GPT Designer] ${message}`);
    await this.storage.appendLog('warn', message);
  }

  async error(message) {
    console.error(`[GPT Designer] ${message}`);
    await this.storage.appendLog('error', message);
  }
}