export function wait(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function waitUntil(
predicate,
options)
{
  const start = Date.now();
  const intervalMs = options.intervalMs ?? 250;

  while (Date.now() - start < options.timeoutMs) {
    if (await predicate()) return true;
    if (options.onTick) await options.onTick();
    await wait(intervalMs);
  }

  return false;
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}