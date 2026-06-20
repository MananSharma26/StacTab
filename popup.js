function getSmartName(urlObj) {
  const host = urlObj.hostname.toLowerCase(); const path = urlObj.pathname.toLowerCase();
  if (host === 'vertexaisearch.cloud.google.com' || host === 'gemini.google.com') return 'Gemini';
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return 'Sheets';
    if (path.startsWith('/document')) return 'Docs';
    if (path.startsWith('/presentation')) return 'Slides';
    return 'Docs';
  }
  if (host === 'drive.google.com') return 'Drive';
  if (host === 'calendar.google.com') return 'Calendar';
  if (host.includes('looker')) return 'Looker';
  if (host.includes('jira') || host.includes('atlassian')) return 'Jira';
  if (host.includes('workday') || host.includes('myworkday')) return 'WD';
  if (host.includes('dynamics.com') || host.includes('d365')) return 'D365';
  let parts = host.replace(/^(www\.|app\.|eu\.|us\.|uk\.|api\.)/g, '').split('.');
  let name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

document.addEventListener('DOMContentLoaded', function() {
  
  const logo = document.getElementById('brand-logo');
  if(logo) {
    logo.addEventListener('error', function() { this.style.display = 'none'; });
  }

  const toggleAuto = document.getElementById('toggle-auto');
  chrome.storage.local.get({ autoGroupEnabled: true }, (res) => { toggleAuto.checked = res.autoGroupEnabled; });
  toggleAuto.addEventListener('change', () => {
    const isEnabled = toggleAuto.checked;
    chrome.storage.local.set({ autoGroupEnabled: isEnabled }, () => {
      if (!isEnabled) chrome.runtime.sendMessage({ action: "dissolveGroups" });
    });
  });
  
  const searchInput = document.getElementById('live-search');
  const searchResults = document.getElementById('search-results');
  let openTabs = [];
  let selectedIndex = -1;

  if(searchInput) {
      searchInput.focus();
      chrome.tabs.query({ currentWindow: true }, (tabs) => { openTabs = tabs; });

      searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        selectedIndex = -1;
        if (!term) { searchResults.style.display = 'none'; return; }
        
        const matches = openTabs.filter(t => (t.title && t.title.toLowerCase().includes(term)) || (t.url && t.url.toLowerCase().includes(term)));
        
        if (matches.length > 0) {
          searchResults.style.display = 'block';
          searchResults.innerHTML = matches.map((t) => `
            <div class="search-item" data-id="${t.id}" data-window="${t.windowId}">
              <div class="search-item-title">${t.title || t.url}</div>
              <div class="search-item-url">${t.url}</div>
            </div>
          `).join('');
          
          document.querySelectorAll('.search-item').forEach(item => {
            item.addEventListener('click', function() {
              chrome.windows.update(parseInt(this.getAttribute('data-window')), { focused: true });
              chrome.tabs.update(parseInt(this.getAttribute('data-id')), { active: true });
            });
          });
        } else {
          searchResults.style.display = 'none';
        }
      });
      
      function updateSelection(items) {
        items.forEach((item, index) => {
          if (index === selectedIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
          } else {
            item.classList.remove('active');
          }
        });
      }

      searchInput.addEventListener('keydown', (e) => {
        const items = searchResults.querySelectorAll('.search-item');
        if (searchResults.style.display === 'none' || items.length === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % items.length;
          updateSelection(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          updateSelection(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex > -1) {
            items[selectedIndex].click();
          } else {
            items[0].click();
          }
        }
      });
  }

  document.getElementById('btn-sort').addEventListener('click', function() {
    chrome.tabs.query({ currentWindow: true }, function(tabs) {
      const groups = {};
      tabs.forEach(tab => {
        if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return; 
        try {
          const url = new URL(tab.url);
          if (!url.protocol.startsWith('http')) return; 
          const name = getSmartName(url);
          if (!groups[name]) groups[name] = [];
          groups[name].push(tab.id);
        } catch(e) {}
      });
      for (const [name, tabIds] of Object.entries(groups)) {
        if (tabIds.length > 1) { chrome.tabs.group({ tabIds: tabIds }, (groupId) => { chrome.tabGroups.update(groupId, { title: name }); }); }
      }
    });
  });

  document.getElementById('btn-sleep').addEventListener('click', () => chrome.tabs.query({ currentWindow: true, active: false }, tabs => tabs.forEach(t => { if (!t.discarded) chrome.tabs.discard(t.id); })));
  document.getElementById('btn-dupes').addEventListener('click', () => chrome.tabs.query({ currentWindow: true }, tabs => { const seen = new Set(); const dupes = []; tabs.forEach(t => seen.has(t.url) ? dupes.push(t.id) : seen.add(t.url)); chrome.tabs.remove(dupes); }));

  function archiveTabs(tabsToArchive) {
    if (tabsToArchive.length === 0) return;
    chrome.storage.local.get({ archives: [] }, (res) => {
      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const newItems = tabsToArchive.map(t => ({
        id: Date.now() + Math.random(), url: t.url, title: t.title || t.url,
        domain: getSmartName(new URL(t.url)), date: dateStr
      }));
      chrome.storage.local.set({ archives: [...newItems, ...res.archives] }, () => {
        chrome.tabs.remove(tabsToArchive.map(t => t.id));
        openDashboard();
      });
    });
  }

  function openDashboard() {
    const dashUrl = chrome.runtime.getURL('archive.html');
    chrome.tabs.query({ currentWindow: true }, tabs => {
      const existing = tabs.find(t => t.url === dashUrl);
      if (existing) { chrome.tabs.update(existing.id, { active: true }); } 
      else { chrome.tabs.create({ url: dashUrl, pinned: true, index: 0 }); }
    });
  }

  chrome.tabs.query({ currentWindow: true, active: true }, (activeTabs) => {
    const activeTab = activeTabs[0];
    if (activeTab) {
      document.getElementById('arc-current').addEventListener('click', () => archiveTabs([activeTab]));
      document.getElementById('arc-all').addEventListener('click', () => { chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => !t.url.includes('archive.html')))); });
      document.getElementById('arc-left').addEventListener('click', () => { chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index < activeTab.index && !t.pinned))); });
      document.getElementById('arc-right').addEventListener('click', () => { chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index > activeTab.index))); });
    }
  });

  const btnDashboard = document.getElementById('btn-dashboard');
  if(btnDashboard) {
      btnDashboard.addEventListener('click', openDashboard);
  }
});
