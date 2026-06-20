function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag] || tag));
}

document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('archive-list');
  const searchBox = document.getElementById('search-box');
  let fullArchives = [];

  function renderHTML(archivesToRender) {
    if (archivesToRender.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No tabs found. Your workspace is perfectly clean.</div>`;
      return;
    }

    const grouped = {};
    archivesToRender.forEach(item => {
      if (!grouped[item.date]) grouped[item.date] = {};
      if (!grouped[item.date][item.domain]) grouped[item.date][item.domain] = [];
      grouped[item.date][item.domain].push(item);
    });

    let html = '';
    for (const [date, domains] of Object.entries(grouped)) {
      html += `
      <div class="date-card">
        <div class="date-header-row">
          <div class="date-title">${escapeHTML(date)}</div>
          <div class="actions-right">
            <button class="btn btn-export btn-download-txt" data-date="${escapeHTML(date)}">↓ Export .txt</button>
            <button class="btn btn-restore-day" data-date="${escapeHTML(date)}">Restore Day</button>
            <button class="btn btn-delete btn-delete-day" data-date="${escapeHTML(date)}">Delete</button>
          </div>
        </div>`;

      for (const [domain, items] of Object.entries(domains)) {
        html += `
        <div class="domain-group">
          <div class="domain-header-row">
            <div class="domain-title">${escapeHTML(domain)} <span style="opacity:0.5;">(${items.length})</span></div>
            <div class="actions-right">
              <button class="btn btn-restore-domain" data-date="${escapeHTML(date)}" data-domain="${escapeHTML(domain)}">Restore</button>
              <button class="btn btn-delete btn-delete-domain" data-date="${escapeHTML(date)}" data-domain="${escapeHTML(domain)}">Delete</button>
            </div>
          </div>
          <div class="tab-grid">`;
          
        items.forEach(item => {
          html += `
            <div class="tab-item">
              <div class="tab-info">
                <a href="${escapeHTML(item.url)}" target="_blank" class="tab-title">${escapeHTML(item.title)}</a>
                <span class="tab-url">${escapeHTML(item.url)}</span>
              </div>
              <div class="tab-actions">
                <button class="btn btn-restore-single" data-id="${item.id}" data-url="${escapeHTML(item.url)}">Restore</button>
                <button class="btn btn-delete btn-icon btn-delete-single" data-id="${item.id}" title="Remove tab">✕</button>
              </div>
            </div>`;
        });
        html += `</div></div>`; 
      }
      html += `</div>`; 
    }
    listEl.innerHTML = html;
    attachEventListeners();
  }

  function loadAndRender() {
    chrome.storage.local.get({ archives: [] }, (res) => {
      fullArchives = res.archives;
      
      // Preserve search filter on reload
      const term = searchBox.value.toLowerCase();
      if (term) {
        renderHTML(fullArchives.filter(item => item.title.toLowerCase().includes(term) || item.url.toLowerCase().includes(term)));
      } else {
        renderHTML(fullArchives);
      }
    });
  }

  // Initial load
  loadAndRender();

  // 🌟 LIVE-RELOAD UPGRADE: Refresh instantly when Vault tab is opened/focused
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadAndRender();
    }
  });

  searchBox.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = fullArchives.filter(item => item.title.toLowerCase().includes(term) || item.url.toLowerCase().includes(term));
    renderHTML(filtered);
  });

  function attachEventListeners() {
    document.querySelectorAll('.btn-restore-single').forEach(btn => btn.addEventListener('click', (e) => {
      const id = parseFloat(e.target.getAttribute('data-id'));
      chrome.tabs.create({ url: e.target.getAttribute('data-url'), active: false });
      removeItems([id]);
    }));
    document.querySelectorAll('.btn-restore-domain').forEach(btn => btn.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date');
      const domain = e.target.getAttribute('data-domain');
      const itemsToRestore = fullArchives.filter(a => a.date === date && a.domain === domain);
      itemsToRestore.forEach(item => chrome.tabs.create({ url: item.url, active: false }));
      removeItems(itemsToRestore.map(i => i.id));
    }));
    document.querySelectorAll('.btn-restore-day').forEach(btn => btn.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date');
      const itemsToRestore = fullArchives.filter(a => a.date === date);
      itemsToRestore.forEach(item => chrome.tabs.create({ url: item.url, active: false }));
      removeItems(itemsToRestore.map(i => i.id));
    }));

    document.querySelectorAll('.btn-delete-single').forEach(btn => btn.addEventListener('click', (e) => {
      const id = parseFloat(e.target.getAttribute('data-id'));
      removeItems([id]);
    }));
    document.querySelectorAll('.btn-delete-domain').forEach(btn => btn.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date');
      const domain = e.target.getAttribute('data-domain');
      removeItems(fullArchives.filter(a => a.date === date && a.domain === domain).map(i => i.id));
    }));
    document.querySelectorAll('.btn-delete-day').forEach(btn => btn.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date');
      removeItems(fullArchives.filter(a => a.date === date).map(i => i.id));
    }));
    
    document.querySelectorAll('.btn-download-txt').forEach(btn => btn.addEventListener('click', (e) => {
      const date = e.target.getAttribute('data-date');
      const itemsToExport = fullArchives.filter(a => a.date === date);
      let txtContent = `Stac Tab Vault - Archive for ${date}\n=========================================\n\n`;
      itemsToExport.forEach(item => txtContent += `[${item.domain}]\nTitle: ${item.title}\nURL: ${item.url}\n\n`);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txtContent], { type: 'text/plain' }));
      a.download = `StacTab_Archive_${date.replace(/[^a-z0-9]/gi, '_')}.txt`;
      a.click();
    }));
  }

  function removeItems(idsToRemove) {
    fullArchives = fullArchives.filter(a => !idsToRemove.includes(a.id));
    chrome.storage.local.set({ archives: fullArchives }, () => {
      loadAndRender();
    });
  }
});
