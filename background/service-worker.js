/**
 * DOM Review — Service Worker (Background)
 * Handles message relay between popup and content scripts.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('DOM Review extension installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_REVIEWS') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { sendResponse(null); return; }
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('dom-review-data');
          return el ? el.textContent : null;
        }
      }).then(([result]) => {
        sendResponse(result?.result ?? null);
      }).catch(() => sendResponse(null));
    });
    return true; // async response
  }

  if (message.type === 'GET_REVIEW_COUNT') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { sendResponse(0); return; }
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('dom-review-data');
          if (!el) return 0;
          try { return JSON.parse(el.textContent).reviews.length; }
          catch { return 0; }
        }
      }).then(([result]) => {
        sendResponse(result?.result ?? 0);
      }).catch(() => sendResponse(0));
    });
    return true;
  }
});
