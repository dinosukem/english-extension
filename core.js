(function (root) {
  "use strict";
  const PartOfSpeech = Object.freeze({
    NOUN: "noun",
    VERB: "verb",
    ADJECTIVE: "adj",
    ADVERB: "adv",
    PRONOUN: "pronoun",
    PREPOSITION: "preposition",
    CONJUNCTION: "conjunction",
    INTERJECTION: "interjection",
    DETERMINER: "determiner",
    NUMERAL: "numeral",
    PHRASE: "phrase",
    OTHER: "other",
  });
  const RuntimeMessage = Object.freeze({
    GET_WORDS: "GET_WORDS",
    GET_STATE: "GET_STATE",
    SAVE_ENTRY: "SAVE_ENTRY",
    UPDATE_ENTRY: "UPDATE_ENTRY",
    DELETE_ENTRY: "DELETE_ENTRY",
    IMPORT_WORDS: "IMPORT_WORDS",
    ENABLE_SITE: "ENABLE_SITE",
    DISABLE_SITE: "DISABLE_SITE",
    GET_PAGE_WORDS: "GET_PAGE_WORDS",
    SHOW_ENTRY: "SHOW_ENTRY",
    OPEN_QUICK_ADD: "OPEN_QUICK_ADD",
    CLEANUP_SITE: "CLEANUP_SITE",
    PERMISSIONS_CHANGED: "PERMISSIONS_CHANGED",
    WORDS_UPDATED: "WORDS_UPDATED",
  });
  const POS_VALUES = Object.freeze(Object.values(PartOfSpeech));
  const POS_LABELS = Object.freeze({
    [PartOfSpeech.NOUN]: "Danh từ",
    [PartOfSpeech.VERB]: "Động từ",
    [PartOfSpeech.ADJECTIVE]: "Tính từ",
    [PartOfSpeech.ADVERB]: "Trạng từ",
    [PartOfSpeech.PRONOUN]: "Đại từ",
    [PartOfSpeech.PREPOSITION]: "Giới từ",
    [PartOfSpeech.CONJUNCTION]: "Liên từ",
    [PartOfSpeech.INTERJECTION]: "Thán từ",
    [PartOfSpeech.DETERMINER]: "Từ hạn định",
    [PartOfSpeech.NUMERAL]: "Số từ",
    [PartOfSpeech.PHRASE]: "Cụm từ",
    [PartOfSpeech.OTHER]: "Khác",
  });
  const POS_SELECT_LABELS = Object.freeze({
    [PartOfSpeech.NOUN]: "n - noun (Danh từ)",
    [PartOfSpeech.VERB]: "v - verb (Động từ)",
    [PartOfSpeech.ADJECTIVE]: "adj - adjective (Tính từ)",
    [PartOfSpeech.ADVERB]: "adv - adverb (Trạng từ)",
    [PartOfSpeech.PRONOUN]: "pron - pronoun (Đại từ)",
    [PartOfSpeech.PREPOSITION]: "prep - preposition (Giới từ)",
    [PartOfSpeech.CONJUNCTION]: "conj - conjunction (Liên từ)",
    [PartOfSpeech.INTERJECTION]: "interj - interjection (Thán từ)",
    [PartOfSpeech.DETERMINER]: "det - determiner (Từ hạn định)",
    [PartOfSpeech.NUMERAL]: "num - numeral (Số từ)",
    [PartOfSpeech.PHRASE]: "phr - phrase (Cụm từ)",
    [PartOfSpeech.OTHER]: "other (Khác)",
  });
  const normalize = (value) =>
    String(value).normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  const senseKey = (sense) =>
    `${sense.pos}\u0000${String(sense.meaningVi).normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()}`;
  function cleanEntry(entry) {
    if (
      !entry ||
      typeof entry.term !== "string" ||
      !Array.isArray(entry.senses)
    )
      throw new Error("Mục từ không hợp lệ.");
    const term = entry.term.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!term || term.length > 120 || !/[\p{L}\p{N}]/u.test(term))
      throw new Error("Từ/cụm từ phải có chữ hoặc số và tối đa 120 ký tự.");
    if (!entry.senses.length || entry.senses.length > 50)
      throw new Error("Mỗi mục cần từ 1 đến 50 nghĩa.");
    const senses = entry.senses.map((sense) => {
      if (
        !sense ||
        !POS_VALUES.includes(sense.pos) ||
        typeof sense.meaningVi !== "string"
      )
        throw new Error("Loại từ hoặc nghĩa không hợp lệ.");
      const meaningVi = sense.meaningVi
        .normalize("NFKC")
        .trim()
        .replace(/\s+/gu, " ");
      if (!meaningVi || meaningVi.length > 500)
        throw new Error(
          "Nghĩa tiếng Việt phải có nội dung và tối đa 500 ký tự.",
        );
      return { pos: sense.pos, meaningVi };
    });
    return { term, senses };
  }
  function mergeEntries(current, incoming) {
    const result = current.map(cleanEntry);
    const byTerm = new Map(
      result.map((entry) => [normalize(entry.term), entry]),
    );
    let addedEntries = 0,
      addedSenses = 0,
      duplicates = 0;
    for (const raw of incoming) {
      const entry = cleanEntry(raw),
        key = normalize(entry.term);
      let target = byTerm.get(key);
      if (!target) {
        target = { term: entry.term, senses: [] };
        byTerm.set(key, target);
        result.push(target);
        addedEntries++;
      }
      const seen = new Set(target.senses.map(senseKey));
      for (const sense of entry.senses) {
        const key = senseKey(sense);
        if (seen.has(key)) {
          duplicates++;
          continue;
        }
        seen.add(key);
        target.senses.push(sense);
        addedSenses++;
      }
    }
    return { entries: result, addedEntries, addedSenses, duplicates };
  }
  function parseImport(value) {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (
      !parsed ||
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length > 100000
    )
      throw new Error("JSON không đúng định dạng từ vựng phiên bản 1.");
    return parsed.entries.map(cleanEntry);
  }
  const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  function thirdPersonSingular(term) {
    const separator = term.indexOf(" ");
    const verb = separator < 0 ? term : term.slice(0, separator);
    const rest = separator < 0 ? "" : term.slice(separator);
    const irregular = { be: "is", do: "does", have: "has" };
    let inflected = irregular[verb];
    if (!inflected) {
      if (/[^aeiou]y$/u.test(verb)) inflected = `${verb.slice(0, -1)}ies`;
      else if (/(?:s|x|z|ch|sh|o)$/u.test(verb)) inflected = `${verb}es`;
      else inflected = `${verb}s`;
    }
    return `${inflected}${rest}`;
  }
  function pluralizeNoun(term) {
    const separator = term.lastIndexOf(" ");
    const prefix = separator < 0 ? "" : term.slice(0, separator + 1);
    const noun = separator < 0 ? term : term.slice(separator + 1);
    let plural;
    if (/[^aeiou]y$/u.test(noun)) plural = `${noun.slice(0, -1)}ies`;
    else if (/(?:s|x|z|ch|sh)$/u.test(noun)) plural = `${noun}es`;
    else plural = `${noun}s`;
    return `${prefix}${plural}`;
  }
  function doublesFinalConsonant(verb) {
    // shortcut: stress is not stored; extend this list for other stressed multisyllable verbs.
    return (
      /^[^aeiou]*[aeiou][^aeiouwxy]$/u.test(verb) ||
      /^(?:admit|begin|commit|control|defer|equip|forget|incur|occur|omit|permit|prefer|quit|refer|regret|submit|transfer)$/u.test(
        verb,
      )
    );
  }
  function presentParticiple(term) {
    const separator = term.indexOf(" ");
    const verb = separator < 0 ? term : term.slice(0, separator);
    const rest = separator < 0 ? "" : term.slice(separator);
    let stem = verb;
    if (/ie$/u.test(verb)) stem = `${verb.slice(0, -2)}y`;
    else if (
      /e$/u.test(verb) &&
      !/(?:ee|oe|ye)$/u.test(verb) &&
      verb !== "be" &&
      verb !== "singe"
    )
      stem = verb.slice(0, -1);
    else if (/ic$/u.test(verb)) stem = `${verb}k`;
    else if (doublesFinalConsonant(verb)) stem = `${verb}${verb.slice(-1)}`;
    return `${stem}ing${rest}`;
  }
  const IRREGULAR_PAST_FORMS = {
    be: ["was", "were", "been"],
    become: ["became", "become"],
    begin: ["began", "begun"],
    bend: ["bent"],
    bet: ["bet"],
    bite: ["bit", "bitten"],
    blow: ["blew", "blown"],
    break: ["broke", "broken"],
    bring: ["brought"],
    build: ["built"],
    buy: ["bought"],
    catch: ["caught"],
    choose: ["chose", "chosen"],
    come: ["came", "come"],
    cost: ["cost"],
    cut: ["cut"],
    deal: ["dealt"],
    dig: ["dug"],
    do: ["did", "done"],
    draw: ["drew", "drawn"],
    dream: ["dreamed", "dreamt"],
    drink: ["drank", "drunk"],
    drive: ["drove", "driven"],
    eat: ["ate", "eaten"],
    fall: ["fell", "fallen"],
    feed: ["fed"],
    feel: ["felt"],
    fight: ["fought"],
    find: ["found"],
    fly: ["flew", "flown"],
    forget: ["forgot", "forgotten"],
    forgive: ["forgave", "forgiven"],
    freeze: ["froze", "frozen"],
    get: ["got", "gotten"],
    give: ["gave", "given"],
    go: ["went", "gone"],
    grow: ["grew", "grown"],
    hang: ["hung", "hanged"],
    have: ["had"],
    hear: ["heard"],
    hide: ["hid", "hidden"],
    hit: ["hit"],
    hold: ["held"],
    hurt: ["hurt"],
    keep: ["kept"],
    know: ["knew", "known"],
    lay: ["laid"],
    lead: ["led"],
    learn: ["learned", "learnt"],
    leave: ["left"],
    lend: ["lent"],
    let: ["let"],
    lie: ["lay", "lain", "lied"],
    light: ["lit", "lighted"],
    lose: ["lost"],
    make: ["made"],
    mean: ["meant"],
    meet: ["met"],
    pay: ["paid"],
    put: ["put"],
    quit: ["quit", "quitted"],
    read: ["read"],
    ride: ["rode", "ridden"],
    ring: ["rang", "rung"],
    rise: ["rose", "risen"],
    run: ["ran", "run"],
    say: ["said"],
    see: ["saw", "seen"],
    sell: ["sold"],
    send: ["sent"],
    set: ["set"],
    shake: ["shook", "shaken"],
    shine: ["shone", "shined"],
    shoot: ["shot"],
    show: ["showed", "shown"],
    shut: ["shut"],
    sing: ["sang", "sung"],
    sink: ["sank", "sunk"],
    sit: ["sat"],
    sleep: ["slept"],
    speak: ["spoke", "spoken"],
    spend: ["spent"],
    stand: ["stood"],
    steal: ["stole", "stolen"],
    stick: ["stuck"],
    strike: ["struck", "stricken"],
    swim: ["swam", "swum"],
    take: ["took", "taken"],
    teach: ["taught"],
    tear: ["tore", "torn"],
    tell: ["told"],
    think: ["thought"],
    throw: ["threw", "thrown"],
    understand: ["understood"],
    wake: ["woke", "woken", "waked"],
    wear: ["wore", "worn"],
    win: ["won"],
    write: ["wrote", "written"],
  };
  function pastForms(term) {
    const separator = term.indexOf(" ");
    const verb = separator < 0 ? term : term.slice(0, separator);
    const rest = separator < 0 ? "" : term.slice(separator);
    if (Object.hasOwn(IRREGULAR_PAST_FORMS, verb))
      return IRREGULAR_PAST_FORMS[verb].map((form) => `${form}${rest}`);
    let form;
    if (/e$/u.test(verb)) form = `${verb}d`;
    else if (/[^aeiou]y$/u.test(verb)) form = `${verb.slice(0, -1)}ied`;
    else if (/ic$/u.test(verb)) form = `${verb}ked`;
    else if (doublesFinalConsonant(verb)) form = `${verb}${verb.slice(-1)}ed`;
    else form = `${verb}ed`;
    return [`${form}${rest}`];
  }
  function compileEntryLookup(entries) {
    const lookup = new Map();
    for (const entry of entries) lookup.set(normalize(entry.term), entry);
    for (const entry of entries) {
      const term = normalize(entry.term);
      const inflectedForms = new Set();
      for (const sense of entry.senses) {
        if (sense.pos === PartOfSpeech.VERB) {
          inflectedForms.add(thirdPersonSingular(term));
          inflectedForms.add(presentParticiple(term));
          for (const form of pastForms(term)) inflectedForms.add(form);
        }
        if (sense.pos === PartOfSpeech.NOUN)
          inflectedForms.add(pluralizeNoun(term));
      }
      for (const form of inflectedForms)
        if (!lookup.has(form)) lookup.set(form, entry);
    }
    return lookup;
  }
  function compileMatcher(entries) {
    const patterns = [
      ...new Set([...compileEntryLookup(entries).keys()].filter(Boolean)),
    ]
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .map((term) => term.split(" ").map(escapeRegex).join("\\s+"));
    return patterns.length
      ? new RegExp(
          `(?<![\\p{L}\\p{N}_])(?:${patterns.join("|")})(?![\\p{L}\\p{N}_])`,
          "giu",
        )
      : null;
  }
  function findMatches(
    text,
    entries,
    matcher = compileMatcher(entries),
    lookup = compileEntryLookup(entries),
  ) {
    if (!matcher) return [];
    matcher.lastIndex = 0;
    const matches = [];
    let match;
    while ((match = matcher.exec(text))) {
      const entry = lookup.get(normalize(match[0]));
      if (entry)
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          entry,
        });
    }
    return matches;
  }
  function parseSite(url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return null;
      return {
        key: `${parsed.protocol}//${parsed.hostname}`,
        pattern: `${parsed.protocol}//${parsed.hostname}/*`,
      };
    } catch {
      return null;
    }
  }
  const api = {
    PartOfSpeech,
    RuntimeMessage,
    POS_VALUES,
    POS_LABELS,
    POS_SELECT_LABELS,
    normalize,
    cleanEntry,
    mergeEntries,
    parseImport,
    compileMatcher,
    compileEntryLookup,
    findMatches,
    parseSite,
  };
  root.VocabularyCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
