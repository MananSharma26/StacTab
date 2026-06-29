const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

function getSmartName(urlObj) {
  const host = urlObj.hostname.toLowerCase(); const path = urlObj.pathname.toLowerCase();

  // --- Google properties (explicit, avoids fallback returning "Google" for everything) ---
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
  if (host === 'maps.google.com' || host === 'google.com/maps') return 'Maps';
  if (host === 'photos.google.com') return 'Photos';
  if (host === 'translate.google.com') return 'Translate';
  if (host === 'chromewebstore.google.com' || host === 'chrome.google.com') return 'Web Store';
  if (host === 'support.google.com') return 'Google Support';
  if (host === 'news.google.com') return 'Google News';
  if (host === 'one.google.com') return 'Google One';
  if (host === 'accounts.google.com') return null; // transient auth page — skip grouping
  // Any remaining *.google.com → Google (search, www, etc.)
  if (host.endsWith('.google.com') || host === 'google.com') return 'Google';

  // --- Other known services ---
  if (host.includes('github')) return 'GitHub';
  if (host.includes('looker')) return 'Looker';
  if (host.includes('jira') || host.includes('atlassian')) return 'Jira';
  if (host.includes('workday') || host.includes('myworkday')) return 'WD';
  if (host.includes('dynamics.com') || host.includes('d365')) return 'D365';

  // --- Generic fallback ---
  let parts = host.replace(/^(www\.|app\.|eu\.|us\.|uk\.|api\.)/g, '').split('.');
  let name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getColorForName(name) {
  const fixed = { 'Gemini': 'cyan' };
  if (fixed[name]) return fixed[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function updateBadge() {
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    chrome.action.setBadgeText({ text: String(tabs.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#8B5CF6' });
  });
}

// --- StacTab-created group tracking ---
// Stored as a Set of groupIds in chrome.storage.local under key 'stacGroupIds'
function getStacGroupIds(cb) {
  chrome.storage.local.get({ stacGroupIds: [] }, res => cb(new Set(res.stacGroupIds)));
}
function saveStacGroupIds(set) {
  chrome.storage.local.set({ stacGroupIds: [...set] });
}
function trackGroup(groupId) {
  getStacGroupIds(set => { set.add(groupId); saveStacGroupIds(set); });
}
function untrackGroup(groupId) {
  getStacGroupIds(set => { set.delete(groupId); saveStacGroupIds(set); });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.storage.local.get({ autoGroupEnabled: true, groupThreshold: 2 }, (res) => {
      const runGrouping = () => { if (res.autoGroupEnabled) autoGroupTabs(res.groupThreshold); };
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        chrome.tabGroups.get(tab.groupId, (group) => {
          if (chrome.runtime.lastError || !group) { runGrouping(); return; }
          try {
            const url = new URL(tab.url);
            if (!url.protocol.startsWith('http')) { runGrouping(); return; }
            const smartName = getSmartName(url);
            // null = transient page (e.g. accounts.google.com) — don't touch the group
            if (smartName === null) { return; }
            // Only ungroup if StacTab created this group and domain changed
            if (smartName && group.title !== smartName) {
              getStacGroupIds(set => {
                if (set.has(tab.groupId)) {
                  chrome.tabs.ungroup([tabId], runGrouping);
                } else {
                  // User/Chrome-saved group — leave it alone, just re-run grouping
                  runGrouping();
                }
              });
            } else { runGrouping(); }
          } catch(e) { runGrouping(); }
        });
      } else { runGrouping(); }
    });
    updateBadge();
  }
});

function cleanupSoloGroups() {
  getStacGroupIds(set => {
    if (set.size === 0) return;
    chrome.tabs.query({}, (tabs) => {
      set.forEach(groupId => {
        const remaining = tabs.filter(t => t.groupId === groupId);
        if (remaining.length === 1) {
          chrome.tabs.ungroup([remaining[0].id], () => {
            if (chrome.runtime.lastError) return;
            untrackGroup(groupId);
          });
        } else if (remaining.length === 0) {
          untrackGroup(groupId);
        }
      });
    });
  });
}

// Auto-ungroup StacTab groups that drop to 1 tab
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  updateBadge();
  cleanupSoloGroups();
});

// Also catch tabs being dragged out of a group
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if ('groupId' in changeInfo) cleanupSoloGroups();
});

chrome.tabs.onCreated.addListener(updateBadge);

// Fix Mac startup badge showing wrong count — Chrome restores tabs async on launch
chrome.runtime.onStartup.addListener(() => {
  setTimeout(updateBadge, 1500);
});

function autoGroupTabs(threshold = 2) {
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const groups = {};
    tabs.forEach(tab => {
      try {
        const url = new URL(tab.url);
        if (!url.protocol.startsWith('http')) return;
        const smartName = getSmartName(url);
        if (!smartName) return; // skip null (transient) domains
        if (!groups[smartName]) groups[smartName] = [];
        groups[smartName].push(tab);
      } catch (e) {}
    });

    for (const [name, domainTabs] of Object.entries(groups)) {
      if (domainTabs.length >= threshold) {
        const firstGroupId = domainTabs[0].groupId;
        const alreadyGrouped = domainTabs.every(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && t.groupId === firstGroupId);
        if (!alreadyGrouped) {
          const tabIds = domainTabs.map(t => t.id);
          chrome.tabs.group({ tabIds }, (groupId) => {
            if (chrome.runtime.lastError) return;
            chrome.tabGroups.update(groupId, { title: name, color: getColorForName(name) });
            trackGroup(groupId);
          });
        }
      }
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "dissolveGroups") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const groupedTabIds = tabs.filter(t => t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE).map(t => t.id);
      if (groupedTabIds.length > 0) {
        chrome.tabs.ungroup(groupedTabIds, () => {
          chrome.storage.local.set({ stacGroupIds: [] });
        });
      }
    });
  }
});

function openDashboard() {
    const dashUrl = chrome.runtime.getURL('archive.html');
    chrome.tabs.query({ url: dashUrl, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
        } else {
            chrome.tabs.create({ url: dashUrl, pinned: true, index: 0 });
        }
    });
}

function openNameSessionWindow(tabs) {
  if (!tabs || tabs.length === 0) return;
  tabs = tabs.filter(t => { try { return new URL(t.url).protocol.startsWith('http'); } catch(e) { return false; } });
  if (tabs.length === 0) {
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    setTimeout(() => updateBadge(), 1500);
    return;
  }
  const pending = tabs.map(t => ({ id: t.id, url: t.url, title: t.title || t.url }));
  chrome.storage.local.set({ pendingContextArchive: pending }, () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('name-session.html'),
      type: 'popup',
      width: 360,
      height: 200,
      focused: true
    });
  });
}

function archiveTabs(tabsToArchive) {
    if (!tabsToArchive || tabsToArchive.length === 0) return;
    tabsToArchive = tabsToArchive.filter(t => { try { return new URL(t.url).protocol.startsWith('http'); } catch(e) { return false; } });
    if (tabsToArchive.length === 0) {
      chrome.action.setBadgeText({ text: '✗' });
      chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      setTimeout(() => updateBadge(), 1500);
      return;
    }
    chrome.storage.local.get({ archives: [] }, (res) => {
      const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const newItems = tabsToArchive.map(t => ({
        id: Date.now() + Math.random(), url: t.url, title: t.title || t.url,
        domain: getSmartName(new URL(t.url)), date: dateStr
      }));
      chrome.storage.local.set({ archives: [...newItems, ...res.archives], lastArchive: { items: newItems, timestamp: Date.now() } }, () => {
        chrome.tabs.remove(tabsToArchive.map(t => t.id), () => {
          openDashboard();
        });
      });
    });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'organize-tabs') {
    chrome.storage.local.get({ groupThreshold: 2 }, (settings) => {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const groups = {};
        tabs.forEach(tab => {
          if (chrome.tabGroups && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) return;
          try {
            const url = new URL(tab.url);
            if (!url.protocol.startsWith('http')) return;
            const name = getSmartName(url);
            if (!name) return;
            if (!groups[name]) groups[name] = [];
            groups[name].push(tab.id);
          } catch(e) {}
        });
        for (const [name, tabIds] of Object.entries(groups)) {
          if (tabIds.length >= settings.groupThreshold) {
            chrome.tabs.group({ tabIds }, (groupId) => {
              if (chrome.runtime.lastError) return;
              chrome.tabGroups.update(groupId, { title: name });
              trackGroup(groupId);
            });
          }
        }
      });
    });
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ installDate: Date.now() });
  }
  chrome.contextMenus.create({
    id: "stac-parent",
    title: "Stac Tab",
    contexts: ["page", "selection", "link", "tab"]
  });
  chrome.contextMenus.create({ id: "arc-current-ctx", parentId: "stac-parent", title: "Archive Current Tab" });
  chrome.contextMenus.create({ id: "arc-all-ctx", parentId: "stac-parent", title: "Archive All Tabs" });
  chrome.contextMenus.create({ id: "arc-left-ctx", parentId: "stac-parent", title: "Archive Tabs to Left" });
  chrome.contextMenus.create({ id: "arc-right-ctx", parentId: "stac-parent", title: "Archive Tabs to Right" });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case "arc-current-ctx":
      archiveTabs([tab]);
      break;
    case "arc-all-ctx":
      chrome.tabs.query({ currentWindow: true }, tabs => openNameSessionWindow(tabs.filter(t => !t.url.includes('archive.html'))));
      break;
    case "arc-left-ctx":
      chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index < tab.index && !t.pinned && !t.url.includes('archive.html'))));
      break;
    case "arc-right-ctx":
      chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index > tab.index && !t.url.includes('archive.html'))));
      break;
  }
});
