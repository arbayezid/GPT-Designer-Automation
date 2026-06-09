

export function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

export function sendTabMessage(
tabId,
message)
{
  return chrome.tabs.sendMessage(tabId, message);
}