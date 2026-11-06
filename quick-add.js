"use strict";
(() => {
  const MESSAGE = VocabularyCore.RuntimeMessage;
  if (window.__englishVocabularyQuickAdd) return;
  window.__englishVocabularyQuickAdd = true;

  const host = document.createElement("div");
  host.id = "english-vocabulary-quick-add-host";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent =
    ":host{all:initial}.backdrop{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:18px;background:#101b2b66;font:14px/1.5 Ubuntu,system-ui,sans-serif;color:#182230}.backdrop[hidden]{display:none}.dialog{box-sizing:border-box;width:min(430px,100%);padding:22px;border:1px solid #e0e6ee;border-radius:16px;background:#fff;box-shadow:0 18px 60px #0d1b2e40}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px}.eyebrow{margin:0 0 4px;color:#59708c;font-size:10px;font-weight:750;letter-spacing:.13em}.title{margin:0;font-size:21px;line-height:1.25}.close{width:32px;height:32px;border:0;border-radius:8px;background:#f3f5f8;color:#536277;font:22px/1 Ubuntu,system-ui,sans-serif;cursor:pointer}.close:hover{background:#e9edf3}.field{display:grid;gap:6px;margin:12px 0;color:#536277;font-size:12px;font-weight:650}.field input,.field select{box-sizing:border-box;width:100%;height:40px;padding:8px 10px;border:1px solid #d8e0ea;border-radius:8px;background:#fff;color:#19283a;font:14px Ubuntu,system-ui,sans-serif}.field input:focus,.field select:focus,.button:focus-visible,.close:focus-visible{outline:3px solid #8db8ff;outline-offset:1px}.actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.button{min-height:38px;padding:8px 14px;border:1px solid #d9e1eb;border-radius:9px;background:#fff;color:#304159;font:700 13px Ubuntu,system-ui,sans-serif;cursor:pointer}.button.primary{border-color:transparent;background:#2469d8;color:#fff}.button.primary:hover{background:#1557bf}.button:disabled{cursor:wait;opacity:.6}.status{min-height:18px;margin:10px 0 0;color:#20724d;font-size:12px}.status.error{color:#b93838}@media(max-width:480px){.dialog{padding:18px}}";

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML =
    '<section class="dialog" role="dialog" aria-modal="true" aria-labelledby="quick-add-title"><div class="heading"><div><p class="eyebrow">TỪ VỰNG ANH – VIỆT</p><h2 class="title" id="quick-add-title">Thêm từ mới</h2></div><button class="close" type="button" aria-label="Đóng">×</button></div><form><label class="field">Từ hoặc cụm từ<input name="term" maxlength="120" required autocomplete="off"></label><label class="field">Loại từ<select name="pos"></select></label><label class="field">Nghĩa tiếng Việt<input name="meaning" maxlength="500" required autocomplete="off" placeholder="Nhập nghĩa tiếng Việt"></label><p class="status" role="status" aria-live="polite"></p><div class="actions"><button class="button cancel" type="button">Đóng</button><button class="button primary save" type="submit">Lưu nghĩa</button></div></form></section>';
  shadow.append(style, backdrop);
  (document.documentElement || document).append(host);

  const form = backdrop.querySelector("form");
  const termInput = form.elements.term;
  const posInput = form.elements.pos;
  const meaningInput = form.elements.meaning;
  const status = backdrop.querySelector(".status");
  const saveButton = backdrop.querySelector(".save");
  let previousFocus = null;

  for (const value of VocabularyCore.POS_VALUES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = VocabularyCore.POS_SELECT_LABELS[value];
    posInput.append(option);
  }

  function close() {
    backdrop.hidden = true;
    previousFocus?.focus?.();
  }

  function open(term) {
    previousFocus = document.activeElement;
    form.reset();
    termInput.value = String(term || "").slice(0, 120);
    status.textContent = "";
    status.classList.remove("error");
    saveButton.disabled = false;
    backdrop.hidden = false;
    termInput.focus();
    termInput.select();
  }

  backdrop.querySelector(".close").addEventListener("click", close);
  backdrop.querySelector(".cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (!backdrop.hidden && event.key === "Escape") close();
    },
    true,
  );
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    status.classList.remove("error");
    saveButton.disabled = true;
    try {
      const result = await browser.runtime.sendMessage({
        type: MESSAGE.SAVE_ENTRY,
        entry: {
          term: termInput.value,
          senses: [{ pos: posInput.value, meaningVi: meaningInput.value }],
        },
      });
      status.textContent = result.duplicates
        ? "Nghĩa này của “" +
          termInput.value.trim() +
          "” đã có trong danh sách."
        : "Đã lưu nghĩa cho “" +
          result.entry.term +
          "”. Bạn có thể nhập thêm nghĩa khác.";
      meaningInput.value = "";
      meaningInput.focus();
    } catch (error) {
      status.textContent = error.message || "Không thể lưu từ vựng.";
      status.classList.add("error");
    } finally {
      saveButton.disabled = false;
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE.OPEN_QUICK_ADD) return undefined;
    open(message.term);
    return Promise.resolve({ opened: true });
  });
})();
