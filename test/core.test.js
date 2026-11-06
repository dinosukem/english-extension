"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.js");
const entry = (term, pos = "noun", meaningVi = `nghĩa ${term}`) => ({
  term,
  senses: [{ pos, meaningVi }],
});

test("normalizes words and validates POS and non-empty meanings", () => {
  assert.equal(core.PartOfSpeech.NOUN, "noun");
  assert.equal(Object.isFrozen(core.PartOfSpeech), true);
  assert.equal(core.POS_VALUES.length, 12);
  assert.equal(
    core.POS_SELECT_LABELS[core.PartOfSpeech.NOUN],
    "n - noun (Danh từ)",
  );
  assert.equal(
    core.POS_SELECT_LABELS[core.PartOfSpeech.VERB],
    "v - verb (Động từ)",
  );
  assert.equal(core.normalize("  ＴＡＫＥ   OFF "), "take off");
  assert.deepEqual(
    core.cleanEntry(entry(" take\noff ", "phrase")).term,
    "take off",
  );
  assert.throws(() => core.cleanEntry(entry("word", "invalid")), /Loại từ/);
  assert.throws(
    () => core.cleanEntry(entry("word", "noun", "  ")),
    /Nghĩa tiếng Việt/,
  );
});

test("defines immutable, unique runtime message identifiers", () => {
  const identifiers = Object.values(core.RuntimeMessage);
  assert.equal(Object.isFrozen(core.RuntimeMessage), true);
  assert.equal(identifiers.length, new Set(identifiers).size);
  assert.ok(identifiers.includes(core.RuntimeMessage.SAVE_ENTRY));
  assert.ok(identifiers.includes(core.RuntimeMessage.OPEN_QUICK_ADD));
});

test("matches whole words case-insensitively and accepts phrase whitespace", () => {
  const entries = [entry("run"), entry("take off", "phrase")],
    matcher = core.compileMatcher(entries);
  assert.deepEqual(
    core
      .findMatches("Run outrun running; take\n  off!", entries, matcher)
      .map((match) => match.entry.term),
    ["run", "take off"],
  );
});

test("matches regular noun and verb inflections to their saved base term", () => {
  const entries = [entry("probe", "verb")];
  assert.deepEqual(
    core
      .findMatches("The probe probes open ports.", entries)
      .map((match) => match.entry.term),
    ["probe", "probe"],
  );
  assert.deepEqual(
    core
      .findMatches("The probe probes open ports.", [entry("probe", "noun")])
      .map((match) => match.entry.term),
    ["probe", "probe"],
  );
  assert.deepEqual(
    core
      .findMatches("Cities are visible.", [entry("city", "noun")])
      .map((match) => match.entry.term),
    ["city"],
  );
});

test("matches V-ing spellings to saved verbs and preserves match ranges", () => {
  for (const [base, form] of [
    ["work", "working"],
    ["make", "making"],
    ["probe", "probing"],
    ["die", "dying"],
    ["lie", "lying"],
    ["run", "running"],
    ["stop", "stopping"],
    ["sit", "sitting"],
    ["swim", "swimming"],
    ["begin", "beginning"],
    ["prefer", "preferring"],
    ["open", "opening"],
    ["visit", "visiting"],
    ["play", "playing"],
    ["fix", "fixing"],
    ["see", "seeing"],
    ["be", "being"],
    ["dye", "dyeing"],
    ["singe", "singeing"],
    ["panic", "panicking"],
    ["take off", "taking off"],
  ]) {
    const saved = entry(base, "verb");
    const text = `I am ${form.toUpperCase()} today.`;
    const matches = core.findMatches(text, [saved]);
    assert.equal(matches.length, 1, `${base} -> ${form}`);
    assert.equal(matches[0].entry, saved);
    assert.equal(
      text.slice(matches[0].start, matches[0].end),
      form.toUpperCase(),
    );
  }
});

test("V-ing matching respects POS, word boundaries, and explicitly saved terms", () => {
  const verb = entry("run", "verb");
  const explicit = entry("running", "noun");
  assert.equal(core.findMatches("running", [entry("run", "noun")]).length, 0);
  assert.equal(core.findMatches("outrunning runningly", [verb]).length, 0);
  assert.equal(
    core.findMatches("running", [verb, explicit])[0].entry,
    explicit,
  );
  assert.equal(
    core.findMatches("running", [explicit, verb])[0].entry,
    explicit,
  );
});

test("matches regular past tense spellings to saved verbs", () => {
  for (const [base, form] of [
    ["work", "worked"],
    ["make", "made"],
    ["probe", "probed"],
    ["try", "tried"],
    ["play", "played"],
    ["stop", "stopped"],
    ["prefer", "preferred"],
    ["open", "opened"],
    ["visit", "visited"],
    ["fix", "fixed"],
    ["panic", "panicked"],
    ["die", "died"],
  ]) {
    const saved = entry(base, "verb");
    const text = `Yesterday I ${form.toUpperCase()}.`;
    const matches = core.findMatches(text, [saved]);
    assert.equal(matches.length, 1, `${base} -> ${form}`);
    assert.equal(matches[0].entry, saved);
    assert.equal(
      text.slice(matches[0].start, matches[0].end),
      form.toUpperCase(),
    );
  }
});

test("matches irregular past and participle forms, including phrasal verbs", () => {
  for (const [base, forms] of [
    ["be", ["was", "were", "been"]],
    ["go", ["went", "gone"]],
    ["write", ["wrote", "written"]],
    ["run", ["ran"]],
    ["read", ["read"]],
    ["buy", ["bought"]],
    ["learn", ["learned", "learnt"]],
    ["take off", ["took off", "taken off"]],
  ]) {
    const saved = entry(base, "verb");
    const text = forms.join("; ");
    const matches = core.findMatches(text, [saved]);
    assert.deepEqual(
      matches.map((match) => text.slice(match.start, match.end)),
      forms,
    );
    assert.ok(matches.every((match) => match.entry === saved));
  }
});

test("past forms respect POS, boundaries, explicit entries, and irregular spellings", () => {
  const verb = entry("go", "verb");
  const explicit = entry("went", "other");
  assert.equal(core.findMatches("worked", [entry("work", "noun")]).length, 0);
  assert.equal(
    core.findMatches("outworked workedness", [entry("work", "verb")]).length,
    0,
  );
  assert.equal(core.findMatches("goed", [verb]).length, 0);
  assert.equal(core.findMatches("went", [verb, explicit])[0].entry, explicit);
  assert.equal(core.findMatches("went", [explicit, verb])[0].entry, explicit);
  assert.equal(
    core.findMatches("constructor", [entry("constructor", "verb")]).length,
    1,
  );
});

test("prefers the longest overlapping phrase and escapes punctuation", () => {
  const entries = [
    entry("take"),
    entry("take off", "phrase"),
    entry("look (up)", "phrase"),
  ];
  const found = core.findMatches("take off, then look (up).", entries);
  assert.deepEqual(
    found.map((match) => match.entry.term),
    ["take off", "look (up)"],
  );
});

test("merges senses case-insensitively without duplicating meanings", () => {
  const first = entry("Book", "noun", "a book");
  const merged = core.mergeEntries(
    [first],
    [entry("book", "noun", " a   book "), entry("BOOK", "verb", "đặt chỗ")],
  );
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].senses.length, 2);
  assert.deepEqual(
    [merged.addedEntries, merged.addedSenses, merged.duplicates],
    [0, 1, 1],
  );
});

test("validates the complete import and rejects unsupported schemas", () => {
  assert.throws(
    () => core.parseImport({ schemaVersion: 2, entries: [] }),
    /phiên bản 1/,
  );
  assert.throws(
    () =>
      core.parseImport({
        schemaVersion: 1,
        entries: [entry("good"), entry("bad", "unknown")],
      }),
    /Loại từ/,
  );
  assert.deepEqual(
    core
      .parseImport(
        JSON.stringify({ schemaVersion: 1, entries: [entry("valid")] }),
      )
      .map((item) => item.term),
    ["valid"],
  );
});

test("limits website permissions to HTTP or HTTPS host patterns", () => {
  assert.deepEqual(core.parseSite("https://news.example.com/story"), {
    key: "https://news.example.com",
    pattern: "https://news.example.com/*",
  });
  assert.equal(core.parseSite("about:config"), null);
});

test("scans a 20,000-word page against 1,000 saved terms", () => {
  const entries = Array.from({ length: 1000 }, (_, index) =>
    entry(`vocab${index}`),
  );
  const page = Array.from(
    { length: 20000 },
    (_, index) => `text vocab${index % 1000}`,
  ).join(" ");
  const matcher = core.compileMatcher(entries);
  assert.equal(core.findMatches(page, entries, matcher).length, 20000);
});
