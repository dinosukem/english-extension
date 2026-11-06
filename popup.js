"use strict";
const byId = (id) => document.getElementById(id);
for (const pos of VocabularyCore.POS_VALUES)
  byId("pos").add(new Option(VocabularyCore.POS_SELECT_LABELS[pos], pos));
let activeTab, activeSite;
const send = (message) => browser.runtime.sendMessage(message);
function showStatus(message, error = false) {
  const node = byId("status");
  node.textContent = message;
  node.classList.toggle("error", error);
}
async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  activeSite = VocabularyCore.parseSite(tab?.url || "");
  const name = byId("site-name"),
    hint = byId("site-hint"),
    toggle = byId("toggle-site");
  if (!activeSite) {
    name.textContent = "Trang này không hỗ trợ";
    hint.textContent = "Mở website HTTP hoặc HTTPS để bật highlight.";
    toggle.disabled = true;
  } else {
    name.textContent = new URL(activeSite.key).hostname;
    const saved = await browser.storage.local.get("enabledSites");
    const enabled = Boolean(saved.enabledSites?.[activeSite.key]);
    toggle.dataset.enabled = String(enabled);
    byId("toggle-label").textContent = enabled ? "Tắt" : "Bật";
    toggle.setAttribute(
      "aria-label",
      enabled
        ? "Tắt highlight trên website này"
        : "Bật highlight trên website này",
    );
    hint.textContent = enabled
      ? "Highlight đang bật trên website này."
      : "Chỉ bật khi bạn cho phép website.";
    toggle.disabled = false;
  }
  byId("term").focus();
  await loadPageWords();
}
async function loadPageWords() {
  const list = byId("page-list");
  try {
    const result = await browser.tabs.sendMessage(activeTab.id, {
      type: VocabularyCore.RuntimeMessage.GET_PAGE_WORDS,
    });
    const entries = result?.entries || [];
    byId("page-count").textContent = entries.length
      ? `${entries.length} mục`
      : "";
    list.replaceChildren();
    if (!entries.length) {
      list.innerHTML =
        '<p class="muted">Chưa tìm thấy từ đã lưu trên trang.</p>';
      return;
    }
    for (const entry of entries.slice(0, 30)) {
      const button = document.createElement("button");
      button.className = "word-item";
      button.type = "button";
      const senses = document.createElement("span");
      senses.className = "word-senses";
      for (const sense of entry.senses) {
        const row = document.createElement("span");
        row.className = "word-sense";
        const heading = document.createElement("span");
        heading.className = "vocabulary-heading";
        const strong = document.createElement("strong");
        strong.textContent = entry.term;
        const pos = document.createElement("span");
        pos.className = `pos-tag pos-tag-${sense.pos}`;
        pos.textContent = VocabularyCore.POS_LABELS[sense.pos];
        const meaning = document.createElement("span");
        meaning.className = "word-sense-meaning vocabulary-meaning";
        meaning.textContent = sense.meaningVi;
        heading.append(strong, pos);
        row.append(heading, meaning);
        senses.append(row);
      }
      button.append(senses);
      button.addEventListener("click", () =>
        browser.tabs.sendMessage(activeTab.id, {
          type: VocabularyCore.RuntimeMessage.SHOW_ENTRY,
          term: entry.term,
        }),
      );
      list.append(button);
    }
  } catch {
    byId("page-count").textContent = "";
    list.innerHTML =
      '<p class="muted">Bật website để xem các từ trên trang.</p>';
  }
}
byId("toggle-site").addEventListener("click", async () => {
  const button = byId("toggle-site");
  button.disabled = true;
  try {
    let result;
    if (button.dataset.enabled === "true")
      result = await send({
        type: VocabularyCore.RuntimeMessage.DISABLE_SITE,
        url: activeTab.url,
      });
    else {
      if (
        !(await browser.permissions.request({ origins: [activeSite.pattern] }))
      )
        throw new Error("Bạn chưa cấp quyền cho website.");
      result = await send({
        type: VocabularyCore.RuntimeMessage.ENABLE_SITE,
        tabId: activeTab.id,
        url: activeTab.url,
      });
    }
    button.dataset.enabled = String(result.enabled);
    byId("toggle-label").textContent = result.enabled ? "Tắt" : "Bật";
    button.setAttribute(
      "aria-label",
      result.enabled
        ? "Tắt highlight trên website này"
        : "Bật highlight trên website này",
    );
    byId("site-hint").textContent = result.enabled
      ? "Highlight đang bật trên website này."
      : "Highlight đã tắt.";
    await loadPageWords();
  } catch (error) {
    showStatus(error.message || "Không thể đổi trạng thái website.", true);
  } finally {
    button.disabled = false;
  }
});
byId("quick-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const entry = VocabularyCore.cleanEntry({
      term: byId("term").value,
      senses: [{ pos: byId("pos").value, meaningVi: byId("meaning").value }],
    });
    const result = await send({
      type: VocabularyCore.RuntimeMessage.SAVE_ENTRY,
      entry,
    });
    showStatus(result.addedSenses ? "Đã lưu từ vựng." : "Nghĩa này đã có sẵn.");
    event.currentTarget.reset();
    byId("pos").value = "noun";
    byId("term").focus();
    await loadPageWords();
  } catch (error) {
    showStatus(error.message || "Không thể lưu từ.", true);
  }
});
byId("manage").addEventListener("click", () =>
  browser.runtime.openOptionsPage(),
);
init().catch((error) =>
  showStatus(error.message || "Không thể mở extension.", true),
);
