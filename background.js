"use strict";

const WORDS_KEY = "vocabulary",
  SITES_KEY = "enabledSites",
  SCRIPT_ID = "vocabulary-highlighter";
let writeQueue = Promise.resolve();
async function getWords() {
  const stored = await browser.storage.local.get(WORDS_KEY);
  return Array.isArray(stored[WORDS_KEY]) ? stored[WORDS_KEY] : [];
}
function queueWrite(work) {
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => {});
  return next;
}
async function getSites() {
  const stored = await browser.storage.local.get(SITES_KEY);
  return stored[SITES_KEY] && typeof stored[SITES_KEY] === "object"
    ? stored[SITES_KEY]
    : {};
}
async function refreshRegistrations() {
  try {
    await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {}
  const sites = await getSites();
  const granted = await browser.permissions.getAll();
  const allowed = new Set(granted.origins),
    matches = [];
  for (const [key, site] of Object.entries(sites)) {
    if (!site || !allowed.has(site.pattern)) delete sites[key];
    else matches.push(site.pattern);
  }
  await browser.storage.local.set({ [SITES_KEY]: sites });
  if (matches.length)
    await browser.scripting.registerContentScripts([
      {
        id: SCRIPT_ID,
        matches: [...new Set(matches)],
        js: ["core.js", "content.js"],
        css: ["content.css"],
        runAt: "document_idle",
        persistAcrossSessions: true,
        allFrames: false,
      },
    ]);
}
async function messageAllTabs(message) {
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => Number.isInteger(tab.id))
      .map((tab) => browser.tabs.sendMessage(tab.id, message)),
  );
}
async function persistWords(entries) {
  await browser.storage.local.set({ [WORDS_KEY]: entries });
  await messageAllTabs({
    type: VocabularyCore.RuntimeMessage.WORDS_UPDATED,
    entries,
  });
}
async function applyToCurrentTab(tabId) {
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"],
  });
  await browser.scripting.executeScript({
    target: { tabId },
    files: ["core.js", "content.js"],
  });
}
async function applyToEnabledTabs() {
  const [tabs, sites] = await Promise.all([browser.tabs.query({}), getSites()]);
  await Promise.allSettled(
    tabs
      .filter((tab) => {
        const site = VocabularyCore.parseSite(tab.url || "");
        return (
          Number.isInteger(tab.id) &&
          tab.status === "complete" &&
          site &&
          sites[site.key]
        );
      })
      .map((tab) => applyToCurrentTab(tab.id)),
  );
}
async function applyToEnabledTab(tabId, url) {
  const site = VocabularyCore.parseSite(url || "");
  if (!site || !(await getSites())[site.key]) return;
  await applyToCurrentTab(tabId);
}
async function refreshAndApply() {
  await refreshRegistrations();
  await applyToEnabledTabs();
}

browser.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== "string") return undefined;
  if (message.type === VocabularyCore.RuntimeMessage.GET_WORDS)
    return getWords().then((entries) => ({ entries }));
  if (message.type === VocabularyCore.RuntimeMessage.GET_STATE)
    return Promise.all([getWords(), getSites()]).then(([entries, sites]) => ({
      entries,
      sites,
    }));
  if (message.type === VocabularyCore.RuntimeMessage.SAVE_ENTRY)
    return queueWrite(async () => {
      const merged = VocabularyCore.mergeEntries(await getWords(), [
        message.entry,
      ]);
      await persistWords(merged.entries);
      return {
        ...merged,
        entry: merged.entries.find(
          (item) =>
            VocabularyCore.normalize(item.term) ===
            VocabularyCore.normalize(message.entry.term),
        ),
      };
    });
  if (message.type === VocabularyCore.RuntimeMessage.UPDATE_ENTRY)
    return queueWrite(async () => {
      const entry = VocabularyCore.cleanEntry(message.entry);
      const entries = await getWords(),
        index = entries.findIndex(
          (item) =>
            VocabularyCore.normalize(item.term) ===
            VocabularyCore.normalize(message.oldTerm),
        );
      if (index < 0) throw new Error("Không tìm thấy mục từ cần sửa.");
      entries[index] = entry;
      const merged = VocabularyCore.mergeEntries([], entries);
      await persistWords(merged.entries);
      return { entries: merged.entries };
    });
  if (message.type === VocabularyCore.RuntimeMessage.DELETE_ENTRY)
    return queueWrite(async () => {
      const entries = (await getWords()).filter(
        (entry) =>
          VocabularyCore.normalize(entry.term) !==
          VocabularyCore.normalize(message.term),
      );
      await persistWords(entries);
      return { entries };
    });
  if (message.type === VocabularyCore.RuntimeMessage.IMPORT_WORDS)
    return queueWrite(async () => {
      const incoming = VocabularyCore.parseImport(message.json);
      const merged = VocabularyCore.mergeEntries(await getWords(), incoming);
      await persistWords(merged.entries);
      return merged;
    });
  if (message.type === VocabularyCore.RuntimeMessage.ENABLE_SITE)
    return enableSite(message.tabId, message.url);
  if (message.type === VocabularyCore.RuntimeMessage.DISABLE_SITE)
    return disableSite(message.url);
  return undefined;
});

async function enableSite(tabId, url) {
  const site = VocabularyCore.parseSite(url);
  if (!site)
    throw new Error("Website này không hỗ trợ. Hãy mở trang HTTP hoặc HTTPS.");
  if (!(await browser.permissions.contains({ origins: [site.pattern] })))
    throw new Error("Bạn chưa cấp quyền cho website.");
  const sites = await getSites();
  sites[site.key] = site;
  await browser.storage.local.set({ [SITES_KEY]: sites });
  await refreshRegistrations();
  await applyToCurrentTab(tabId);
  return { enabled: true, site };
}
async function disableSite(url) {
  const site = VocabularyCore.parseSite(url);
  if (!site) throw new Error("Website này không hỗ trợ.");
  const sites = await getSites();
  delete sites[site.key];
  await browser.storage.local.set({ [SITES_KEY]: sites });
  await refreshRegistrations();
  await messageAllTabs({
    type: VocabularyCore.RuntimeMessage.CLEANUP_SITE,
    siteKey: site.key,
  });
  await browser.permissions.remove({ origins: [site.pattern] });
  return { enabled: false, site };
}

browser.runtime.onInstalled.addListener(() =>
  refreshAndApply().catch(console.error),
);
browser.runtime.onStartup.addListener(() =>
  refreshAndApply().catch(console.error),
);
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete")
    applyToEnabledTab(tabId, tab.url).catch(() => {});
});
browser.permissions.onRemoved.addListener((removed) =>
  queueWrite(async () => {
    const sites = await getSites();
    const removedSites = [];
    for (const [key, site] of Object.entries(sites))
      if (removed.origins.includes(site.pattern)) {
        removedSites.push(key);
        delete sites[key];
      }
    await browser.storage.local.set({ [SITES_KEY]: sites });
    await refreshRegistrations();
    await messageAllTabs({
      type: VocabularyCore.RuntimeMessage.PERMISSIONS_CHANGED,
      siteKeys: removedSites,
    });
  }).catch(console.error),
);
browser.menus
  .remove("save-vocabulary-selection")
  .catch(() => {})
  .then(() =>
    browser.menus.create({
      id: "save-vocabulary-selection",
      title: "Thêm vào từ vựng Anh–Việt",
      contexts: ["selection"],
    }),
  )
  .catch(console.error);
browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-vocabulary-selection" || !info.selectionText)
    return;
  const term = info.selectionText.trim().slice(0, 120);
  try {
    if (!Number.isInteger(tab?.id)) throw new Error("Không có tab hiện tại.");
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["core.js", "quick-add.js"],
    });
    await browser.tabs.sendMessage(tab.id, {
      type: VocabularyCore.RuntimeMessage.OPEN_QUICK_ADD,
      term,
    });
  } catch (error) {
    console.warn("Không thể mở form thêm từ ngay trên trang.", error);
    browser.tabs.create({
      url: browser.runtime.getURL(
        `manager.html?term=${encodeURIComponent(term)}`,
      ),
    });
  }
});
