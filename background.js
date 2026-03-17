chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "download") {
    const bytes = new TextEncoder().encode(msg.content);
    // Chunked encoding avoids stack overflow for large job descriptions
    let b64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      b64 += btoa(String.fromCharCode(...bytes.slice(i, i + chunkSize)));
    }
    const dataUrl = "data:text/markdown;base64," + b64;
    chrome.downloads.download({ url: dataUrl, filename: msg.filename, saveAs: false });
    sendResponse({});
    return true;
  }
});
