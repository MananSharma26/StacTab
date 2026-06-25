const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

function getSmartName(urlObj) {
  const host = urlObj.hostname.toLowerCase(); const path = urlObj.pathname.toLowerCase();
  if (host === 'gemini.google.com' || host === 'vertexaisearch.cloud.google.com') return 'Gemini';
  if (host === 'mail.google.com') return 'Gmail';
  if (host === 'meet.google.com') return 'Meet';
  if (host === 'calendar.google.com') return 'Calendar';
  if (host === 'drive.google.com') return 'Drive';
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return 'Sheets';
    if (path.startsWith('/document')) return 'Docs';
    if (path.startsWith('/presentation')) return 'Slides';
    if (path.startsWith('/forms')) return 'Forms';
    return 'Docs';
  }
  if (host === 'maps.google.com') return 'Maps';
  if (host === 'photos.google.com') return 'Photos';
  if (host === 'translate.google.com') return 'Translate';
  if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') return 'Web Store';
  if (host === 'support.google.com') return 'Google Support';
  if (host === 'news.google.com') return 'Google News';
  if (host === 'one.google.com') return 'Google One';
  if (host === 'accounts.google.com') return 'Google';
  if (host.endsWith('.google.com') || host === 'google.com') return 'Google';
  if (host.includes('github')) return 'GitHub';
  if (host.includes('looker')) return 'Looker';
  if (host.includes('jira') || host.includes('atlassian')) return 'Jira';
  if (host.includes('workday') || host.includes('myworkday')) return 'WD';
  if (host.includes('dynamics.com') || host.includes('d365')) return 'D365';
  let parts = host.replace(/^(www\.|app\.|eu\.|us\.|uk\.|api\.)/g, '').split('.');
  let name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const input = document.getElementById('name-input');
const confirmBtn = document.getElementById('btn-confirm');
const cancelBtn = document.getElementById('btn-cancel');

setTimeout(() => input.focus(), 50);

function doArchive() {
  const sessionName = input.value.trim() || new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Archiving…';

  chrome.storage.local.get(['pendingContextArchive', 'archives'], (res) => {
    const pending = res.pendingContextArchive || [];
    const existing = res.archives || [];

    const validTabs = pending.filter(t => { try { return new URL(t.url).protocol.startsWith('http'); } catch(e) { return false; } });
    if (validTabs.length === 0) { window.close(); return; }

    const newItems = validTabs.map(t => ({
      id: Date.now() + Math.random(),
      url: t.url,
      title: t.title || t.url,
      domain: getSmartName(new URL(t.url)),
      date: sessionName
    }));

    chrome.storage.local.set({
      archives: [...newItems, ...existing],
      lastArchive: { items: newItems, timestamp: Date.now() },
      pendingContextArchive: null
    }, () => {
      chrome.tabs.remove(validTabs.map(t => t.id), () => {
        const dashUrl = chrome.runtime.getURL('archive.html');
        chrome.tabs.query({ url: dashUrl }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
          } else {
            chrome.tabs.create({ url: dashUrl, pinned: true, index: 0 });
          }
          window.close();
        });
      });
    });
  });
}

confirmBtn.addEventListener('click', doArchive);
cancelBtn.addEventListener('click', () => {
  chrome.storage.local.remove('pendingContextArchive');
  window.close();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doArchive();
  if (e.key === 'Escape') {
    chrome.storage.local.remove('pendingContextArchive');
    window.close();
  }
});
