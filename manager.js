"use strict";
const byId = (id) => document.getElementById(id),
  send = (message) => browser.runtime.sendMessage(message);
let entries = [],
  editingTerm = null;
function showStatus(id, text, error = false) {
  const node = byId(id);
  node.textContent = text;
  node.classList.toggle("error", error);
}
function senseRow(sense = { pos: "noun", meaningVi: "" }) {
  const row = document.createElement("div");
  row.className = "sense-editor";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Loại từ");
  for (const pos of VocabularyCore.POS_VALUES)
    select.add(new Option(VocabularyCore.POS_SELECT_LABELS[pos], pos));
  select.value = sense.pos;
  const input = document.createElement("input");
  input.placeholder = "Nghĩa tiếng Việt";
  input.maxLength = 500;
  input.required = true;
  input.value = sense.meaningVi;
  input.setAttribute("aria-label", "Nghĩa tiếng Việt");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-sense";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Xóa nghĩa");
  remove.addEventListener("click", () => {
    if (byId("senses").children.length > 1) row.remove();
    else input.value = "";
  });
  row.append(select, input, remove);
  return row;
}
function resetForm() {
  editingTerm = null;
  byId("entry-form").reset();
  byId("term").readOnly = false;
  byId("senses").replaceChildren(senseRow());
  byId("form-title").textContent = "Thêm từ";
  byId("cancel-edit").hidden = true;
}
function editEntry(entry) {
  editingTerm = entry.term;
  byId("term").value = entry.term;
  byId("term").readOnly = true;
  byId("senses").replaceChildren(...entry.senses.map(senseRow));
  byId("form-title").textContent = "Sửa từ";
  byId("cancel-edit").hidden = false;
  byId("form-status").textContent = "";
  byId("term").focus();
}
function actionButton(label, className, paths, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-action " + className;
  button.setAttribute("aria-label", label);
  button.title = label;
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  for (const pathData of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    icon.append(path);
  }
  button.append(icon);
  button.addEventListener("click", onClick);
  return button;
}
function render() {
  const query = VocabularyCore.normalize(byId("search").value),
    list = byId("entries");
  list.replaceChildren();
  const filtered = entries.filter(
    (entry) =>
      !query ||
      VocabularyCore.normalize(entry.term).includes(query) ||
      entry.senses.some((sense) =>
        VocabularyCore.normalize(sense.meaningVi).includes(query),
      ),
  );
  byId("summary").textContent =
    `${entries.length} mục từ · ${filtered.length} đang hiển thị`;
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "muted empty-state";
    empty.textContent = entries.length
      ? "Không tìm thấy kết quả."
      : "Chưa có từ. Thêm từ đầu tiên ở khung bên cạnh.";
    list.append(empty);
    return;
  }
  for (const entry of filtered) {
    const card = document.createElement("article");
    card.className = "entry-item";
    const heading = document.createElement("div");
    heading.className = "entry-heading";
    const senses = document.createElement("div");
    senses.className = "entry-senses";
    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const edit = actionButton(
      "Sửa từ",
      "edit-action",
      ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"],
      () => editEntry(entry),
    );
    const del = actionButton(
      "Xóa từ",
      "delete-action",
      ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6", "M14 11v6"],
      async () => {
        if (!confirm(`Xóa “${entry.term}” khỏi danh sách từ vựng?`)) return;
        try {
          const result = await send({
            type: VocabularyCore.RuntimeMessage.DELETE_ENTRY,
            term: entry.term,
          });
          entries = result.entries;
          if (editingTerm === entry.term) resetForm();
          render();
        } catch (error) {
          showStatus(
            "page-status",
            error.message || "Không xóa được từ.",
            true,
          );
        }
      },
    );
    actions.append(edit, del);
    heading.append(senses, actions);
    card.append(heading);
    for (const sense of entry.senses) {
      const line = document.createElement("div");
      line.className = "sense-display";
      const title = document.createElement("h3");
      title.className = "vocabulary-heading";
      const term = document.createElement("span");
      term.textContent = entry.term;
      const tag = document.createElement("span");
      tag.className = "pos-tag pos-tag-" + sense.pos;
      tag.textContent = VocabularyCore.POS_LABELS[sense.pos];
      const meaning = document.createElement("span");
      meaning.className = "vocabulary-meaning";
      meaning.textContent = sense.meaningVi;
      title.append(term, tag);
      line.append(title, meaning);
      senses.append(line);
    }
    list.append(card);
  }
}
async function load() {
  const result = await send({
    type: VocabularyCore.RuntimeMessage.GET_WORDS,
  });
  entries = result.entries || [];
  render();
}
byId("add-sense").addEventListener("click", () =>
  byId("senses").append(senseRow()),
);
byId("cancel-edit").addEventListener("click", resetForm);
byId("search").addEventListener("input", render);
byId("entry-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const entry = VocabularyCore.cleanEntry({
      term: byId("term").value,
      senses: [...byId("senses").children].map((row) => ({
        pos: row.querySelector("select").value,
        meaningVi: row.querySelector("input").value,
      })),
    });
    const result = editingTerm
      ? await send({
          type: VocabularyCore.RuntimeMessage.UPDATE_ENTRY,
          oldTerm: editingTerm,
          entry,
        })
      : await send({
          type: VocabularyCore.RuntimeMessage.SAVE_ENTRY,
          entry,
        });
    entries = result.entries;
    render();
    resetForm();
    showStatus("form-status", "Đã lưu từ vựng.");
  } catch (error) {
    showStatus("form-status", error.message || "Không thể lưu từ.", true);
  }
});
byId("export").addEventListener("click", () => {
  const file = new Blob(
    [JSON.stringify({ schemaVersion: 1, entries }, null, 2)],
    { type: "application/json" },
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "tu-vung-anh-viet.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
byId("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("File lớn hơn giới hạn 10 MB.");
    const result = await send({
      type: VocabularyCore.RuntimeMessage.IMPORT_WORDS,
      json: await file.text(),
    });
    entries = result.entries;
    render();
    showStatus(
      "page-status",
      `Đã nhập: ${result.addedEntries} mục mới, ${result.addedSenses} nghĩa mới, ${result.duplicates} nghĩa trùng.`,
    );
  } catch (error) {
    showStatus("page-status", error.message || "Không nhập được file.", true);
  }
});
const selectedTerm = new URLSearchParams(location.search).get("term");
if (selectedTerm) byId("term").value = selectedTerm;
load()
  .then(() => {
    if (selectedTerm) byId("term").focus();
  })
  .catch((error) =>
    showStatus(
      "page-status",
      error.message || "Không tải được danh sách.",
      true,
    ),
  );
