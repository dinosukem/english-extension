"use strict";
(() => {
  if (window.__englishVocabularyInitialized) return;
  window.__englishVocabularyInitialized = true;
  const HIGHLIGHT = "english-vocabulary-highlight";
  const BLOCKS =
    "p,li,blockquote,h1,h2,h3,h4,h5,h6,pre,td,th,dd,dt,figcaption,div,section,article,main,header,footer,aside";
  const SKIP =
    "script,style,noscript,template,textarea,input,select,option,code,pre,[contenteditable='true'],[contenteditable=''],[hidden],[aria-hidden='true'],#english-vocabulary-tooltip-host";
  const blocks = new Map();
  const MAX_BLOCK_TEXT = 50000;
  const MAX_HIGHLIGHTS = 10000;
  let scanVersion = 0;
  let stopped = false;
  let scanning = false;
  function checkpoint(version, budget) {
    if (version !== scanVersion || stopped) throw new Error("Scan cancelled");
    if (performance.now() < budget.until) return null;
    return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
      if (version !== scanVersion || stopped) throw new Error("Scan cancelled");
      budget.until = performance.now() + 8;
    });
  }
  let entries = [],
    matcher = null,
    entryLookup = new Map(),
    refreshTimer = 0,
    tooltipTimer = 0,
    visibleRecord = null,
    dismissedRecord = null;
  let nodeRanges = new WeakMap(),
    styleCache = new WeakMap();
  const host = document.createElement("div");
  host.id = "english-vocabulary-tooltip-host";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial}.tip{box-sizing:border-box;position:fixed;display:none;width:max-content;max-width:min(280px,calc(100vw - 24px));max-height:min(40vh,300px);overflow:auto;padding:8px 10px;border:1px solid #d8dde8;border-radius:9px;background:#fff;color:#182230;box-shadow:0 6px 20px #15243a30;font:12px/1.4 Ubuntu,system-ui,sans-serif;pointer-events:auto}.word{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:14px;font-weight:700;margin:0 0 5px}.sense{margin:0 0 8px}.sense:last-child{margin-bottom:0}.meaning{margin:0;font-style:italic}.pos{display:inline-flex;flex:none;align-items:center;padding:2px 7px;border:1px solid transparent;border-radius:999px;font-size:10px;font-weight:700;line-height:1.3}.pos-noun{border-color:#cfe0ff;background:#edf4ff;color:#285ca8}.pos-verb{border-color:#c9ebda;background:#eaf8f0;color:#247447}.pos-adj{border-color:#dfd1ff;background:#f3edff;color:#7044b7}.pos-adv{border-color:#bce8e5;background:#e7f8f7;color:#18746e}.pos-pronoun{border-color:#f4cfe4;background:#fff0f7;color:#a33e78}.pos-preposition{border-color:#f3ddb2;background:#fff7e8;color:#916214}.pos-conjunction{border-color:#d2dafb;background:#eef1ff;color:#4756a8}.pos-interjection{border-color:#f4cccc;background:#fff0ee;color:#b5483d}.pos-determiner{border-color:#d6e0ea;background:#f0f4f8;color:#526477}.pos-numeral{border-color:#c9e4f5;background:#eaf7ff;color:#28709a}.pos-phrase{border-color:#d9d2f4;background:#f2efff;color:#6650a0}.pos-other{border-color:#d8dde5;background:#f2f4f7;color:#596579}.tip:focus{outline:3px solid #4478d3;outline-offset:2px}`;
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.setAttribute("role", "tooltip");
  tip.tabIndex = -1;
  shadow.append(style, tip);
  (document.documentElement || document).append(host);
  function ignored(node) {
    if (
      !node.parentElement ||
      node.parentElement.closest(SKIP) ||
      node.parentElement.isContentEditable
    )
      return true;
    for (
      let element = node.parentElement;
      element && element !== document.documentElement;
      element = element.parentElement
    ) {
      let style = styleCache.get(element);
      if (!style) {
        style = getComputedStyle(element);
        styleCache.set(element, style);
      }
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse"
      )
        return true;
    }
    return false;
  }
  const getBlock = (node) =>
    node.parentElement.closest(BLOCKS) || document.body;
  async function registerRoot(root, groups, version, budget) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (ignored(root)) return;
      root = getBlock(root);
    }
    if (
      root.nodeType !== Node.ELEMENT_NODE &&
      root.nodeType !== Node.DOCUMENT_NODE
    )
      return;
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(SKIP)) return;
    if (
      root.nodeType === Node.ELEMENT_NODE &&
      root !== document.body &&
      !root.matches(BLOCKS)
    )
      root = root.closest(BLOCKS) || document.body;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE)
            return ignored(node)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT;
          if (node.matches(SKIP) || node.isContentEditable)
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );
    let node;
    while ((node = walker.nextNode())) {
      const pause = checkpoint(version, budget);
      if (pause) await pause;
      if (node.nodeType !== Node.TEXT_NODE && node.tagName !== "BR") continue;
      const block =
        node.nodeType === Node.TEXT_NODE
          ? getBlock(node)
          : node.parentElement.closest(BLOCKS) || document.body;
      if (!groups.has(block)) groups.set(block, []);
      groups
        .get(block)
        .push(node.nodeType === Node.TEXT_NODE ? node : { lineBreak: true });
    }
  }
  function normalizedRoots(roots) {
    const selected = new Set();
    for (let root of roots) {
      if (!root?.isConnected || root === host || host.contains(root)) continue;
      if (root.nodeType === Node.TEXT_NODE) root = getBlock(root);
      else if (root.nodeType === Node.ELEMENT_NODE) {
        if (root.matches(SKIP) || root.closest(SKIP)) continue;
        if (!root.matches(BLOCKS)) root = root.closest(BLOCKS) || document.body;
      } else continue;
      if (root) selected.add(root);
    }
    // Drop nested roots by walking ancestors rather than comparing every pair.
    return [...selected].filter((root) => {
      for (
        let parent = root.parentElement;
        parent;
        parent = parent.parentElement
      )
        if (selected.has(parent)) return false;
      return true;
    });
  }
  async function scanRoots(roots) {
    roots = normalizedRoots(roots);
    if (!roots.length || stopped) return;
    if (!matcher) {
      blocks.clear();
      nodeRanges = new WeakMap();
      CSS.highlights.delete(HIGHLIGHT);
      return;
    }
    const version = scanVersion;
    const budget = { until: performance.now() + 8, hits: 0 };
    const nextBlocks = new Map(blocks);
    styleCache = new WeakMap();
    const groups = new Map();
    for (const root of roots) await registerRoot(root, groups, version, budget);
    const rootSet = new Set(roots);
    for (const block of nextBlocks.keys()) {
      const pause = checkpoint(version, budget);
      if (pause) await pause;
      let affected = !block.isConnected;
      for (
        let parent = block;
        !affected && parent;
        parent = parent.parentElement
      )
        affected = rootSet.has(parent);
      if (affected) nextBlocks.delete(block);
    }
    for (const hits of nextBlocks.values()) budget.hits += hits.length;
    for (const [block, nodes] of groups) {
      nextBlocks.set(block, await scanBlock(block, nodes, version, budget));
      if (budget.hits >= MAX_HIGHLIGHTS) break;
    }
    await rebuildHighlight(nextBlocks, version, budget);
  }
  async function scanBlock(block, nodes, version, budget) {
    if (!block || !block.isConnected) {
      return [];
    }
    const segments = [];
    const chunks = [];
    let offset = 0;
    for (const node of nodes) {
      const pause = checkpoint(version, budget);
      if (pause) await pause;
      const chunk = (node.lineBreak ? "\n" : node.data).slice(
        0,
        MAX_BLOCK_TEXT - offset,
      );
      if (chunk.length) {
        segments.push({
          node: node.lineBreak ? null : node,
          start: offset,
          end: offset + chunk.length,
        });
        chunks.push(chunk);
        offset += chunk.length;
      }
      if (offset >= MAX_BLOCK_TEXT) break;
    }
    let text = chunks.join("");
    // Do not highlight a partial word at the safety limit.
    if (offset >= MAX_BLOCK_TEXT) text = text.replace(/[\p{L}\p{N}_]+$/u, "");
    const hits = [];
    const locate = (offset, end = false) => {
      let low = 0,
        high = segments.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1,
          part = segments[mid];
        if (offset < part.start || (end && offset === part.start))
          high = mid - 1;
        else if (offset > part.end || (!end && offset === part.end))
          low = mid + 1;
        else if (part.node) return { ...part, index: mid };
        else if (end) high = mid - 1;
        else low = mid + 1;
      }
      return null;
    };
    for (const match of VocabularyCore.findMatches(
      text,
      entries,
      matcher,
      entryLookup,
    )) {
      if (budget.hits >= MAX_HIGHLIGHTS) break;
      const pause = checkpoint(version, budget);
      if (pause) await pause;
      const first = locate(match.start),
        last = locate(match.end, true);
      if (!first || !last) continue;
      const range = document.createRange();
      range.setStart(first.node, match.start - first.start);
      range.setEnd(last.node, match.end - last.start);
      const hit = {
        range,
        entry: match.entry,
        start: match.start,
        end: match.end,
        segments: [],
      };
      hits.push(hit);
      budget.hits++;
      for (let index = first.index; index < segments.length; index++) {
        const part = segments[index];
        if (part.start >= match.end) break;
        const start = Math.max(match.start, part.start),
          end = Math.min(match.end, part.end);
        if (start < end && part.node) {
          const interval = {
            start: start - part.start,
            end: end - part.start,
            hit,
          };
          hit.segments.push({ node: part.node, interval });
        }
      }
    }
    return hits;
  }
  async function rebuildHighlight(nextBlocks, version, budget) {
    const highlight = new Highlight();
    const nextRanges = new WeakMap();
    for (const hits of nextBlocks.values()) {
      for (const hit of hits) {
        const pause = checkpoint(version, budget);
        if (pause) await pause;
        highlight.add(hit.range);
        for (const { node, interval } of hit.segments) {
          const values = nextRanges.get(node) || [];
          values.push(interval);
          nextRanges.set(node, values);
        }
      }
    }
    checkpoint(version, { until: Infinity });
    blocks.clear();
    for (const [block, hits] of nextBlocks) blocks.set(block, hits);
    nodeRanges = nextRanges;
    if (highlight.size) CSS.highlights.set(HIGHLIGHT, highlight);
    else CSS.highlights.delete(HIGHLIGHT);
  }
  const pendingRoots = new Set();
  function schedule(roots) {
    if (stopped) return;
    for (const root of normalizedRoots(roots)) pendingRoots.add(root);
    if (scanning || refreshTimer || !pendingRoots.size) return;
    refreshTimer = setTimeout(async () => {
      refreshTimer = 0;
      scanning = true;
      const rootsToScan = [...pendingRoots];
      pendingRoots.clear();
      try {
        await scanRoots(rootsToScan);
      } catch (error) {
        if (!stopped && error.message !== "Scan cancelled")
          console.error("Vocabulary scan failed", error);
      } finally {
        scanning = false;
        if (pendingRoots.size) schedule([]);
      }
    }, 100);
  }
  function tooltipContent(entry) {
    tip.replaceChildren();
    for (const sense of entry.senses) {
      const row = document.createElement("div");
      row.className = "sense";
      const word = document.createElement("p");
      word.className = "word";
      const term = document.createElement("span");
      term.textContent = entry.term;
      const pos = document.createElement("span");
      pos.className = `pos pos-${sense.pos}`;
      pos.textContent = VocabularyCore.POS_LABELS[sense.pos] || sense.pos;
      word.append(term, pos);
      const meaning = document.createElement("p");
      meaning.className = "meaning";
      meaning.textContent = sense.meaningVi;
      row.append(word, meaning);
      tip.append(row);
    }
  }
  function positionTip(x, y) {
    tip.style.display = "block";
    const rect = tip.getBoundingClientRect(),
      pad = 12;
    let left = x + 12,
      top = y + 16;
    if (left + rect.width > innerWidth - pad) left = x - rect.width - 12;
    if (top + rect.height > innerHeight - pad) top = y - rect.height - 14;
    tip.style.left = `${Math.max(pad, left)}px`;
    tip.style.top = `${Math.max(pad, top)}px`;
  }
  function showHit(hit, x, y) {
    clearTimeout(tooltipTimer);
    if (visibleRecord !== hit) tooltipContent(hit.entry);
    visibleRecord = hit;
    positionTip(x, y);
  }
  function visibleRect(hit) {
    return [...hit.range.getClientRects()].find(
      (rect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth,
    );
  }
  function hideTip(delay = 80) {
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tip.style.display = "none";
      visibleRecord = null;
    }, delay);
  }
  tip.addEventListener("pointerenter", () => clearTimeout(tooltipTimer));
  tip.addEventListener("pointerleave", () => hideTip());
  const inspectPointer = (event) => {
    if (event.composedPath().includes(host)) {
      clearTimeout(tooltipTimer);
      return;
    }
    const caret = document.caretPositionFromPoint?.(
      event.clientX,
      event.clientY,
    );
    if (!caret) {
      hideTip();
      return;
    }
    const intervals = nodeRanges.get(caret.offsetNode) || [];
    let low = 0,
      high = intervals.length - 1,
      found = null;
    while (low <= high) {
      const mid = (low + high) >> 1,
        item = intervals[mid];
      if (caret.offset < item.start) high = mid - 1;
      else if (caret.offset > item.end) low = mid + 1;
      else {
        found = item.hit;
        break;
      }
    }
    if (!found) {
      dismissedRecord = null;
      hideTip();
      return;
    }
    if (found === dismissedRecord) {
      hideTip();
      return;
    }
    const rects = [...found.range.getClientRects()];
    if (
      !rects.some(
        (rect) =>
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      )
    ) {
      hideTip();
      return;
    }
    showHit(found, event.clientX, event.clientY);
  };
  let pointerFrame = 0;
  let pointerEvent;
  const onPointerMove = (event) => {
    if (event.composedPath().includes(host)) {
      clearTimeout(tooltipTimer);
      cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      return;
    }
    pointerEvent = {
      clientX: event.clientX,
      clientY: event.clientY,
      composedPath: () => [],
    };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      inspectPointer(pointerEvent);
    });
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      dismissedRecord = visibleRecord;
      hideTip(0);
    }
  };
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("keydown", onKeyDown);
  let observer;

  function cleanup() {
    stopped = true;
    scanVersion++;
    clearTimeout(tooltipTimer);
    cancelAnimationFrame(pointerFrame);
    clearTimeout(refreshTimer);
    pendingRoots.clear();
    observer?.disconnect();
    blocks.clear();
    CSS.highlights.delete(HIGHLIGHT);
    host.remove();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("keydown", onKeyDown);
    browser.runtime.onMessage.removeListener(onMessage);
    window.__englishVocabularyInitialized = false;
  }
  const onMessage = (message) => {
    if (message.type === VocabularyCore.RuntimeMessage.WORDS_UPDATED) {
      entries = message.entries || [];
      matcher = VocabularyCore.compileMatcher(entries);
      entryLookup = VocabularyCore.compileEntryLookup(entries);
      scanVersion++;
      pendingRoots.clear();
      schedule([document.body]);
    }
    if (message.type === VocabularyCore.RuntimeMessage.GET_PAGE_WORDS) {
      const unique = new Map();
      for (const hits of blocks.values())
        for (const hit of hits)
          if (visibleRect(hit))
            unique.set(VocabularyCore.normalize(hit.entry.term), hit.entry);
      return Promise.resolve({ entries: [...unique.values()] });
    }
    if (message.type === VocabularyCore.RuntimeMessage.SHOW_ENTRY) {
      const matches = [...blocks.values()]
        .flat()
        .filter(
          (item) =>
            VocabularyCore.normalize(item.entry.term) ===
            VocabularyCore.normalize(message.term),
        );
      const hit = matches.find((item) => visibleRect(item)) || matches[0];
      if (hit) {
        let rect = visibleRect(hit);
        if (!rect) {
          rect = hit.range.getBoundingClientRect();
          window.scrollTo({
            top: window.scrollY + rect.top - innerHeight / 2,
            behavior: "smooth",
          });
        }
        showHit(
          hit,
          Math.max(12, rect.left + rect.width / 2),
          Math.max(12, rect.top + rect.height / 2),
        );
      }
    }
    const siteKey = VocabularyCore.parseSite(location.href)?.key;
    if (
      message.type === VocabularyCore.RuntimeMessage.CLEANUP_SITE &&
      siteKey === message.siteKey
    )
      cleanup();
    if (
      message.type === VocabularyCore.RuntimeMessage.PERMISSIONS_CHANGED &&
      message.siteKeys?.includes(siteKey)
    )
      cleanup();
  };
  browser.runtime.onMessage.addListener(onMessage);
  observer = new MutationObserver((mutations) => {
    const roots = new Set();
    for (const mutation of mutations) {
      if (mutation.target === host || host.contains(mutation.target)) continue;
      if (mutation.type === "attributes")
        roots.add(mutation.target.closest?.(BLOCKS) || document.body);
      else if (mutation.target.nodeType === Node.TEXT_NODE)
        roots.add(
          mutation.target.parentElement?.closest(BLOCKS) || document.body,
        );
      else if (mutation.type === "childList") {
        roots.add(mutation.target.closest?.(BLOCKS) || document.body);
      }
    }
    if (roots.size) schedule(roots);
  });
  async function start() {
    const state = await browser.runtime.sendMessage({
      type: VocabularyCore.RuntimeMessage.GET_STATE,
    });
    const site = VocabularyCore.parseSite(location.href);
    if (!site || !state.sites?.[site.key]) {
      cleanup();
      return;
    }
    entries = state.entries || [];
    matcher = VocabularyCore.compileMatcher(entries);
    entryLookup = VocabularyCore.compileEntryLookup(entries);
    schedule([document.body]);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "style", "class"],
    });
  }
  start().catch(() => cleanup());
})();
