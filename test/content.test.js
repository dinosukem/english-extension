"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../core.js");

function harness(count = 1000) {
  let visits = 0,
    yields = 0,
    time = 0;
  const timers = [];
  const element = (tagName = "DIV", parentElement = null) => ({
    nodeType: 1,
    tagName,
    parentElement,
    isConnected: true,
    children: [],
    style: {},
    matches: (selector) => selector.startsWith("p,li,"),
    closest(selector) {
      return selector.startsWith("p,li,") ? this : null;
    },
    contains(node) {
      for (; node; node = node.parentElement) if (node === this) return true;
      return false;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    attachShadow() {
      return element();
    },
    setAttribute() {},
    addEventListener() {},
    remove() {},
  });
  const body = element("BODY");
  const paragraph = element("P", body);
  const nodes = Array.from({ length: count }, () => ({
    nodeType: 3,
    parentElement: paragraph,
    data: "run ",
    length: 4,
    isConnected: true,
  }));
  const highlights = new Map();
  const context = {
    window: {},
    segmentVisits: 0,
    cancelAnimationFrame() {},
    location: { href: "https://example.com" },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 },
    NodeFilter: {
      SHOW_TEXT: 4,
      SHOW_ELEMENT: 1,
      FILTER_REJECT: 2,
      FILTER_ACCEPT: 1,
      FILTER_SKIP: 3,
    },
    document: {
      body,
      documentElement: element("HTML"),
      createElement: element,
      addEventListener() {},
      removeEventListener() {},
      createTreeWalker(root) {
        let i = 0;
        const list = nodes.filter((node) => root.contains(node));
        return {
          nextNode() {
            visits++;
            return list[i++] || null;
          },
        };
      },
      createRange() {
        return { setStart() {}, setEnd() {} };
      },
    },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    CSS: { highlights },
    Highlight: class extends Set {
      constructor(...ranges) {
        super(ranges);
      }
    },
    MutationObserver: class {
      constructor(callback) {
        context.mutate = callback;
      }
      disconnect() {}
      observe() {}
    },
    browser: {
      runtime: { onMessage: { addListener() {}, removeListener() {} } },
    },
    setTimeout(callback, delay) {
      if (delay === 0) {
        yields++;
        Promise.resolve().then(callback);
        return 1;
      }
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
    performance: { now: () => ++time },
    VocabularyCore: core,
  };
  const source = fs
    .readFileSync(require.resolve("../content.js"), "utf8")
    .replace(
      "const start = Math.max(match.start, part.start)",
      "globalThis.segmentVisits++; const start = Math.max(match.start, part.start)",
    )
    .replace(
      "  start().catch(() => cleanup());",
      `
      entries = [{term: "run", senses: [{pos: "verb", meaningVi: "chạy"}]}];
      matcher = VocabularyCore.compileMatcher(entries);
      entryLookup = VocabularyCore.compileEntryLookup(entries);
      globalThis.api = {scanRoots, schedule, cleanup, host, getBlocks: () => blocks, clearWords: () => {matcher = null;}};
    `,
    );
  vm.runInNewContext(source, context);
  return {
    context,
    body,
    paragraph,
    nodes,
    highlights,
    timers,
    visits: () => visits,
    yields: () => yields,
  };
}

test("overlapping mutation roots scan each text node once", async () => {
  const h = harness();
  await h.context.api.scanRoots([h.body, h.paragraph, h.nodes[0]]);
  assert.ok(
    h.visits() <= 1001,
    `visited ${h.visits()} nodes for 1000 text nodes`,
  );
  assert.equal(h.highlights.get("english-vocabulary-highlight").size, 1000);
});

test("large DOM scans yield to the browser before finishing", async () => {
  const h = harness();
  await h.context.api.scanRoots([h.body]);
  assert.ok(
    h.yields() > 0,
    "scan monopolized the main thread without yielding",
  );
});

test("range mapping visits only segments covered by each match", async () => {
  const h = harness(2000);
  await h.context.api.scanRoots([h.body]);
  assert.equal(h.context.segmentVisits, 2000);
});

test("mutation bursts are coalesced and ignore the tooltip host", async () => {
  const h = harness();
  h.context.mutate([{ type: "attributes", target: h.context.api.host }]);
  assert.equal(h.timers.length, 0);
  for (let i = 0; i < 20; i++)
    h.context.mutate([
      { type: "childList", target: h.paragraph, addedNodes: h.nodes },
    ]);
  assert.equal(h.timers.length, 1);
  await h.timers.shift()();
  assert.equal(h.visits(), 1001);
});

test("turning off the extension cancels an in-flight scan", async () => {
  const h = harness();
  const scanning = h.context.api.scanRoots([h.body]);
  h.context.api.cleanup();
  await assert.rejects(scanning, /Scan cancelled/);
  assert.equal(h.highlights.size, 0);
});

test("empty vocabulary avoids traversing the page", async () => {
  const h = harness();
  h.context.api.clearWords();
  await h.context.api.scanRoots([h.body]);
  assert.equal(h.visits(), 0);
});

test("extreme blocks respect the page highlight cap", async () => {
  const h = harness(1);
  h.nodes[0].data = "run ".repeat(30000);
  await h.context.api.scanRoots([h.body]);
  assert.equal(h.highlights.get("english-vocabulary-highlight").size, 10000);
});

test("editing one block preserves highlights in unrelated blocks", async () => {
  const h = harness(2);
  const second = { ...h.paragraph, children: [] };
  h.nodes[1].parentElement = second;
  await h.context.api.scanRoots([h.body]);
  assert.equal(h.highlights.get("english-vocabulary-highlight").size, 2);
  h.nodes[0].data = "nothing";
  await h.context.api.scanRoots([h.nodes[0]]);
  assert.equal(h.highlights.get("english-vocabulary-highlight").size, 1);
  assert.equal(h.context.api.getBlocks().get(second).length, 1);
});
