function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, tag => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[tag] || tag));
}

function getSmartName(urlObj) {
  const host = urlObj.hostname.toLowerCase(); const path = urlObj.pathname.toLowerCase();
  if (host === 'vertexaisearch.cloud.google.com' || host === 'gemini.google.com') return 'Gemini';
  if (host === 'meet.google.com') return 'Meet';
  if (host === 'mail.google.com') return 'Gmail';
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return 'Sheets';
    if (path.startsWith('/document')) return 'Docs';
    if (path.startsWith('/presentation')) return 'Slides';
    if (path.startsWith('/forms')) return 'Forms';
    return 'Docs';
  }
  if (host === 'drive.google.com') return 'Drive';
  if (host === 'calendar.google.com') return 'Calendar';
  if (host.includes('github')) return 'GitHub';
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

  function groupColorToCss(color) {
    const map = { grey: '#9aa0a6', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#1e8e3e', pink: '#e91e8c', purple: '#9334e6', cyan: '#007b83', orange: '#fa7b17' };
    return map[color] || '#9aa0a6';
  }

  function loadGroupButtons() {
    chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }, (groups) => {
      const section = document.getElementById('groups-section');
      const list = document.getElementById('groups-list');
      if (!groups || groups.length === 0) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      list.innerHTML = groups.map(g => `
        <div class="group-row">
          <button class="arc-group-btn" data-group-id="${escapeHTML(g.id)}" title="Archive this group">
            <span class="group-dot" style="background:${groupColorToCss(g.color)};"></span>
            ${escapeHTML(g.title || 'Unnamed Group')}
          </button>
          <button class="split-group-btn" data-group-id="${escapeHTML(g.id)}" title="Split to new window">Split</button>
        </div>
      `).join('');
      document.querySelectorAll('.arc-group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const groupId = parseInt(btn.dataset.groupId);
          chrome.tabs.query({ currentWindow: true, groupId }, tabs => archiveTabs(tabs));
        });
      });
      document.querySelectorAll('.split-group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const groupId = parseInt(btn.dataset.groupId);
          chrome.tabs.query({ currentWindow: true, groupId }, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            chrome.windows.create({ tabId: tabs[0].id, focused: true }, (newWin) => {
              if (chrome.runtime.lastError || !newWin) return;
              const remaining = tabs.slice(1);
              remaining.forEach(t => {
                chrome.tabs.move(t.id, { windowId: newWin.id, index: -1 }, () => {
                  if (chrome.runtime.lastError) { /* tab may have closed */ }
                });
              });
            });
          });
        });
      });
    });
  }

  loadGroupButtons();

  const toggleAuto = document.getElementById('toggle-auto');
  chrome.storage.local.get({ autoGroupEnabled: true }, (res) => { toggleAuto.checked = res.autoGroupEnabled; });
  toggleAuto.addEventListener('change', () => {
    const isEnabled = toggleAuto.checked;
    chrome.storage.local.set({ autoGroupEnabled: isEnabled }, () => {
      if (!isEnabled) chrome.runtime.sendMessage({ action: "dissolveGroups" });
    });
  });

  const threshBtns = document.querySelectorAll('.thresh-btn');
  chrome.storage.local.get({ groupThreshold: 2 }, (res) => {
    threshBtns.forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.val) === res.groupThreshold));
  });
  threshBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.val);
      chrome.storage.local.set({ groupThreshold: val });
      threshBtns.forEach(b => b.classList.toggle('active', b === btn));
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
            <div class="search-item" data-id="${escapeHTML(t.id)}" data-window="${escapeHTML(t.windowId)}">
              <div class="search-item-title">${escapeHTML(t.title || t.url)}</div>
              <div class="search-item-url">${escapeHTML(t.url)}</div>
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
    chrome.storage.local.get({ groupThreshold: 2 }, (settings) => {
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
          if (tabIds.length >= settings.groupThreshold) {
            chrome.tabs.group({ tabIds: tabIds }, (groupId) => { chrome.tabGroups.update(groupId, { title: name }); });
          }
        }
      });
    });
  });

  document.getElementById('btn-sleep').addEventListener('click', () => chrome.tabs.query({ currentWindow: true, active: false }, tabs => tabs.forEach(t => { if (!t.discarded) chrome.tabs.discard(t.id); })));
  document.getElementById('btn-dupes').addEventListener('click', () => chrome.tabs.query({ currentWindow: true }, tabs => { const seen = new Set(); const dupes = []; tabs.forEach(t => seen.has(t.url) ? dupes.push(t.id) : seen.add(t.url)); chrome.tabs.remove(dupes); }));
  document.getElementById('btn-merge').addEventListener('click', () => {
    chrome.windows.getCurrent((currentWin) => {
      chrome.tabs.query({}, (allTabs) => {
        const tabsToMove = allTabs.filter(t => t.windowId !== currentWin.id && !t.pinned);
        if (tabsToMove.length === 0) return;
        tabsToMove.forEach(t => {
          chrome.tabs.move(t.id, { windowId: currentWin.id, index: -1 }, () => {
            if (chrome.runtime.lastError) { /* tab may have closed */ }
          });
        });
      });
    });
  });

  function showSessionModal(onConfirm) {
    const modal = document.getElementById('session-modal');
    const input = document.getElementById('session-name-input');
    const confirmBtn = document.getElementById('session-confirm');
    const cancelBtn = document.getElementById('session-cancel');
    input.value = '';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    function confirm() { modal.style.display = 'none'; onConfirm(input.value.trim() || null); cleanup(); }
    function cancel() { modal.style.display = 'none'; cleanup(); }
    function onKey(e) { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }
    confirmBtn.addEventListener('click', confirm, { once: true });
    cancelBtn.addEventListener('click', cancel, { once: true });
    input.addEventListener('keydown', onKey);
    function cleanup() { input.removeEventListener('keydown', onKey); }
  }

  function archiveTabs(tabsToArchive, sessionName = null) {
    tabsToArchive = tabsToArchive.filter(t => { try { return new URL(t.url).protocol.startsWith('http'); } catch(e) { return false; } });
    if (tabsToArchive.length === 0) return;
    chrome.storage.local.get({ archives: [] }, (res) => {
      const dateStr = sessionName || new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const newItems = tabsToArchive.map(t => ({
        id: Date.now() + Math.random(), url: t.url, title: t.title || t.url,
        domain: getSmartName(new URL(t.url)), date: dateStr
      }));
      chrome.storage.local.set({ archives: [...newItems, ...res.archives], lastArchive: { items: newItems, timestamp: Date.now() } }, () => {
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
      document.getElementById('arc-all').addEventListener('click', () => {
        showSessionModal((sessionName) => {
          chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => !t.url.includes('archive.html')), sessionName));
        });
      });
      document.getElementById('arc-left').addEventListener('click', () => { chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index < activeTab.index && !t.pinned && !t.url.includes('archive.html')))); });
      document.getElementById('arc-right').addEventListener('click', () => { chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index > activeTab.index && !t.url.includes('archive.html')))); });
    }
  });

  const btnDashboard = document.getElementById('btn-dashboard');
  if(btnDashboard) {
      btnDashboard.addEventListener('click', openDashboard);
  }
});
