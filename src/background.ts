chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchThreadsData') {
    fetch(request.url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': navigator.userAgent
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.text();
    })
    .then(html => {
      sendResponse({ html });
    })
    .catch(error => {
      console.error('Background fetch error:', error);
      sendResponse({ error: error.message });
    });
    
    return true; // Keep the message channel open for async response
  }
});

console.log('ThreadForge background script loaded');
