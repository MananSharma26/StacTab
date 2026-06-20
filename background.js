const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];

function getSmartName(urlObj) {
  const host = urlObj.hostname.toLowerCase(); const path = urlObj.pathname.toLowerCase();
  if (host === 'vertexaisearch.cloud.google.com' || host === 'gemini.google.com') return 'Gemini';
  if (host === 'docs.google.com') {
    if (path.startsWith('/spreadsheets')) return 'Sheets';
    if (path.startsWith('/document')) return 'Docs';
    if (path.startsWith('/presentation')) return 'Slides';
    if (path.startsWith('/forms')) return 'Forms';
    return 'Docs';
  }
  if (host === 'drive.google.com') return 'Drive';
  if (host === 'calendar.google.com') return 'Calendar';
  if (host === 'meet.google.com') return 'Meet';
  if (host === 'mail.google.com') return 'Gmail';
  if (host.includes('looker')) return 'Looker';
  if (host.includes('jira') || host.includes('atlassian')) return 'Jira';
  if (host.includes('workday') || host.includes('myworkday')) return 'WD';
  if (host.includes('dynamics.com') || host.includes('d365')) return 'D365';
  if (host.includes('github')) return 'GitHub';

  let parts = host.replace(/^(www\.|app\.|eu\.|us\.|uk\.|api\.)/g, '').split('.');
  let name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getColorForName(name) {
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    chrome.storage.local.get({ autoGroupEnabled: true, groupThreshold: 2 }, (res) => {
      if (res.autoGroupEnabled) {
        autoGroupTabs(res.groupThreshold);
      }
    });
    updateBadge();
  }
});

chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);

function autoGroupTabs(threshold = 2) {
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const groups = {};
    tabs.forEach(tab => {
      try {
        const url = new URL(tab.url);
        if (!url.protocol.startsWith('http')) return;
        const smartName = getSmartName(url);
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
          chrome.tabs.group({ tabIds: tabIds }, (groupId) => {
            chrome.tabGroups.update(groupId, { title: name, color: getColorForName(name) });
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
        chrome.tabs.ungroup(groupedTabIds);
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

function archiveTabs(tabsToArchive) {
    if (!tabsToArchive || tabsToArchive.length === 0) return;
    tabsToArchive = tabsToArchive.filter(t => { try { return new URL(t.url).protocol.startsWith('http'); } catch(e) { return false; } });
    if (tabsToArchive.length === 0) return;
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

chrome.runtime.onInstalled.addListener(() => {
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
      chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => !t.url.includes('archive.html'))));
      break;
    case "arc-left-ctx":
      chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index < tab.index && !t.pinned && !t.url.includes('archive.html'))));
      break;
    case "arc-right-ctx":
      chrome.tabs.query({ currentWindow: true }, tabs => archiveTabs(tabs.filter(t => t.index > tab.index && !t.url.includes('archive.html'))));
      break;
  }
});
