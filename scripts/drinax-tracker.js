const MODULE_ID = "drinax-tracker";

const FACTION_CATEGORIES = [
  { id: "drinax", label: "Kingdom of Drinax", color: "var(--gold)" },
  { id: "imperium", label: "Third Imperium", color: "var(--imperium)" },
  { id: "hierate", label: "Aslan Hierate", color: "var(--aslan)" },
  { id: "aslan_clan", label: "Aslan Clan", color: "var(--aslan)" },
  { id: "pirate", label: "Pirate Group", color: "var(--pirate)" },
  { id: "other", label: "Other Faction", color: "var(--other)" },
];

// Only these categories are singleton, nation-level polities that the
// Pirates of Drinax "Standing" mechanic applies to — individual Aslan
// clans and other factions don't track it.
const STANDING_CATEGORIES = ["imperium", "hierate"];

const DISPOSITIONS = [
  { id: "hostile", label: "Hostile", color: "var(--red)" },
  { id: "unfriendly", label: "Unfriendly", color: "var(--orange)" },
  { id: "neutral", label: "Neutral", color: "var(--slate)" },
  { id: "friendly", label: "Friendly", color: "var(--teal)" },
  { id: "allied", label: "Allied", color: "var(--gold)" },
];

const CONTACT_ROLES = [
  { id: "contact", label: "Contact", color: "var(--slate)" },
  { id: "ally", label: "Ally", color: "var(--teal)" },
  { id: "associate", label: "Associate", color: "var(--gold)" },
];

const ALLEGIANCE_SUGGESTIONS = ["Dr", "Im", "As", "Va", "Zh", "Cs", "Na"];

const WORLD_STATUS_SUGGESTIONS = [
  "Unsurveyed", "Contact made", "Under Drinax control", "Imperial territory",
  "Aslan territory", "Contested", "Pirate haven", "Client world", "Annexed"
];

// Pirates of Drinax world Relationship track, best to worst, with its
// associated Fence/Recruitment/Risk of Arrest/Risk of Spies/Protection
// effects (per the campaign's rules table). "—" means not available.
const WORLD_RELATIONSHIPS = [
  { id: "haven", label: "Haven", color: "var(--gold)", fence: "30%", recruitment: "3+", riskArrest: "—", riskSpies: "12+", protection: "3+" },
  { id: "friendly", label: "Friendly", color: "var(--teal)", fence: "25%", recruitment: "5+", riskArrest: "—", riskSpies: "12+", protection: "7+" },
  { id: "tolerant", label: "Tolerant", color: "var(--slate)", fence: "20%", recruitment: "7+", riskArrest: "12+", riskSpies: "10+", protection: "11+" },
  { id: "neutral", label: "Neutral", color: "var(--slate)", fence: "10%", recruitment: "9+", riskArrest: "12+", riskSpies: "10+", protection: "—" },
  { id: "suspicious", label: "Suspicious", color: "var(--orange)", fence: "10%", recruitment: "11+", riskArrest: "10+", riskSpies: "8+", protection: "—" },
  { id: "unfriendly", label: "Unfriendly", color: "var(--orange)", fence: "—", recruitment: "12+", riskArrest: "10+", riskSpies: "8+", protection: "—" },
  { id: "hostile", label: "Hostile", color: "var(--red)", fence: "—", recruitment: "—", riskArrest: "2+", riskSpies: "2+", protection: "—" },
];

function catInfo(id) { return FACTION_CATEGORIES.find(c => c.id === id) || FACTION_CATEGORIES[FACTION_CATEGORIES.length - 1]; }
function dispInfo(id) { return DISPOSITIONS.find(d => d.id === id) || DISPOSITIONS[2]; }
function roleInfo(id) { return CONTACT_ROLES.find(r => r.id === id) || CONTACT_ROLES[0]; }
function relInfo(id) { return WORLD_RELATIONSHIPS.find(r => r.id === id) || WORLD_RELATIONSHIPS[3]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) {
  return (s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function calcAV(soc) {
  if (soc === "" || soc === null || soc === undefined) return "";
  const n = Number(soc);
  return Number.isFinite(n) ? Math.pow(n, 3) : "";
}

// Best-effort SOC lookup across a few common Traveller-system data shapes.
// Different Foundry Traveller systems store characteristics differently, so
// this quietly leaves SOC blank for manual entry if none of the shapes match.
function guessActorSoc(actor) {
  try {
    const sys = actor.system || {};
    const candidates = [
      sys.characteristics?.soc?.value,
      sys.characteristics?.SOC?.value,
      sys.soc?.value,
      sys.attributes?.soc?.value,
    ];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  } catch (err) { /* best effort only */ }
  return "";
}

// Best-effort UWP lookup for a dropped world document. World-builder modules
// vary in how they store this, so this scans document flags for anything
// literally named "uwp" and otherwise leaves the field blank for manual entry.
function guessWorldUwp(doc) {
  try {
    for (const scope of Object.values(doc.flags || {})) {
      if (scope && typeof scope === "object") {
        for (const [key, value] of Object.entries(scope)) {
          if (/^uwp$/i.test(key) && typeof value === "string") return value;
        }
      }
    }
  } catch (err) { /* best effort only */ }
  return "";
}

function formatHex(hexX, hexY) {
  return String(hexX).padStart(2, "0") + String(hexY).padStart(2, "0");
}

// Looks up a world by name on travellermap.com (CORS-enabled public API),
// scoped to this campaign's milieu (1105). Since every world in this
// campaign is in the Trojan Reach sector, results from that sector are
// preferred exclusively when any exist, to avoid same-named worlds
// elsewhere in the OTU; otherwise falls back to showing all matches.
async function searchTravellerMap(query) {
  try {
    const res = await fetch(`https://travellermap.com/api/search?q=${encodeURIComponent(query)}&milieu=M1105`);
    if (!res.ok) return [];
    const json = await res.json();
    const items = json?.Results?.Items || [];
    let worlds = items
      .filter(it => it.World)
      .map(it => it.World)
      .map(w => ({ name: w.Name, sector: w.Sector, hex: formatHex(w.HexX, w.HexY), uwp: w.Uwp }));
    const reach = worlds.filter(w => w.sector === "Trojan Reach");
    if (reach.length) worlds = reach;
    return worlds.slice(0, 8);
  } catch (err) {
    console.warn("Drinax Tracker | Traveller Map lookup failed", err);
    return [];
  }
}

// Fetches the WorldAllegiance code (e.g. "ImDd", "AsT9", "NaHu") for a
// specific world from travellermap.com's Credits API, used to derive a
// world's controlling faction. Best-effort: returns "" on any failure.
async function fetchWorldAllegiance(sector, hex) {
  try {
    const res = await fetch(`https://travellermap.com/api/credits?sector=${encodeURIComponent(sector)}&hex=${encodeURIComponent(hex)}&milieu=M1105`);
    if (!res.ok) return "";
    const json = await res.json();
    return json?.WorldAllegiance || "";
  } catch (err) {
    console.warn("Drinax Tracker | Traveller Map allegiance lookup failed", err);
    return "";
  }
}

// Extended-hex digit per Traveller UWP convention: 0-9, then A=10, B=11, ...
function parseHexDigit(ch) {
  if (!ch) return null;
  if (/[0-9]/.test(ch)) return Number(ch);
  const n = ch.toUpperCase().charCodeAt(0) - 55; // 'A' (65) -> 10
  return Number.isFinite(n) && n >= 10 ? n : null;
}

// A UWP is Starport + 6 digits (Size, Atmosphere, Hydrographics,
// Population, Government, Law Level) + "-" + Tech Level, e.g. "A788899-C".
// Law Level is therefore the 7th character once the hyphen is removed.
function uwpLawLevel(uwp) {
  if (!uwp) return null;
  const clean = uwp.replace(/[^A-Za-z0-9]/g, "");
  if (clean.length < 7) return null;
  return parseHexDigit(clean[6]);
}

function lawLevelToRelationship(law) {
  if (law <= 2) return "tolerant";
  if (law <= 5) return "neutral";
  if (law <= 9) return "suspicious";
  if (law <= 11) return "unfriendly";
  return "hostile";
}

// Default Relationship for a newly-added world: Drinax and Theev are fixed
// narrative starting points; Aslan Hierate worlds start Unfriendly per the
// campaign; everything else derives from the UWP's Law Level.
function defaultWorldRelationship({ name, factionCategory, uwp }) {
  const n = (name || "").trim().toLowerCase();
  if (n === "drinax") return "haven";
  if (n === "theev") return "friendly";
  if (factionCategory === "hierate") return "unfriendly";
  const law = uwpLawLevel(uwp);
  if (law === null) return "neutral";
  return lawLevelToRelationship(law);
}

// Reads the campaign's in-fiction date from the mgt2e system's own Year/Day
// world settings (game.settings.get("mgt2e", "currentYear"/"currentDay")) —
// the same values its "/time" chat command reports, formatted the same way
// (YYYY-DDD) — so log entries carry the in-fiction date too.
function getCampaignDate() {
  try {
    const year = game.settings.get("mgt2e", "currentYear");
    let day = String(game.settings.get("mgt2e", "currentDay"));
    if (day.length === 1) day = "00" + day;
    else if (day.length === 2) day = "0" + day;
    return `${year}-${day}`;
  } catch (err) {
    return "";
  }
}

// A single incrementing integer for the current campaign day, built from the
// same mgt2e Year/Day settings as getCampaignDate(), so elapsed-day math
// (for Standing drift) can be done with plain subtraction across year
// boundaries. Assumes a 365-day campaign year, which matches how mgt2e's own
// Day field counts (no leap-year handling).
function gameDayIndex() {
  try {
    const year = Number(game.settings.get("mgt2e", "currentYear"));
    const day = Number(game.settings.get("mgt2e", "currentDay"));
    if (!Number.isFinite(year) || !Number.isFinite(day)) return null;
    return year * 365 + day;
  } catch (err) {
    return null;
  }
}

function defaultStandingBaseline(category) {
  if (category === "imperium") return 0;
  if (category === "hierate") return -5;
  return 0;
}

// Drifts a faction's Standing one point toward its baseline for every 30
// in-game days elapsed since the last change (manual or automatic), without
// overshooting the baseline. Mutates `faction` in place. Returns
// { touched, change } — touched means the bookkeeping field changed (so the
// caller should persist) even if no visible Standing change happened yet;
// change is { field, from, to } when Standing itself moved, else null.
function applyStandingDrift(faction) {
  if (!STANDING_CATEGORIES.includes(faction.category)) return { touched: false, change: null };
  if (typeof faction.standing !== "number") return { touched: false, change: null };
  const nowIdx = gameDayIndex();
  if (nowIdx === null) return { touched: false, change: null };

  if (typeof faction.standingUpdatedDay !== "number") {
    faction.standingUpdatedDay = nowIdx;
    return { touched: true, change: null };
  }

  const baseline = typeof faction.standingBaseline === "number" ? faction.standingBaseline : defaultStandingBaseline(faction.category);
  if (faction.standing === baseline) return { touched: false, change: null };

  const elapsed = nowIdx - faction.standingUpdatedDay;
  const steps = Math.floor(elapsed / 30);
  if (steps <= 0) return { touched: false, change: null };

  const direction = faction.standing < baseline ? 1 : -1;
  const maxSteps = Math.abs(baseline - faction.standing);
  const appliedSteps = Math.min(steps, maxSteps);
  const from = faction.standing;
  faction.standing += direction * appliedSteps;
  faction.standingUpdatedDay = (appliedSteps === steps) ? faction.standingUpdatedDay + steps * 30 : nowIdx;
  return { touched: true, change: { field: "Standing", from, to: faction.standing } };
}

function pushAutoLogEntry(data, entityName, changes) {
  data.log = data.log || [];
  data.log.unshift({
    id: uid(),
    realTime: new Date().toISOString(),
    gameDate: getCampaignDate(),
    entityType: "Faction",
    entityName,
    changes,
    reason: "Automatic drift toward baseline Standing (30 in-game days elapsed)."
  });
}

// Runs Standing drift across all factions in `data` (mutating it in place).
// Returns true if anything changed and the caller should persist `data`.
function runStandingDrift(data) {
  let dirty = false;
  (data.factions || []).forEach(f => {
    const result = applyStandingDrift(f);
    if (result.touched) dirty = true;
    if (result.change) pushAutoLogEntry(data, f.name, [result.change]);
  });
  return dirty;
}

// Re-reads the saved data, applies drift, and persists + refreshes any open
// tracker/entity windows — used when the mgt2e campaign date changes while
// nobody has the tracker open.
async function checkStandingDriftAndPersist() {
  if (!game.user.isGM) return;
  let data = game.settings.get(MODULE_ID, "data");
  if (!data) return;
  if (!runStandingDrift(data)) return;
  await game.settings.set(MODULE_ID, "data", data);
  refreshOpenWindows();
}

function seedData() {
  const drinaxFactionId = uid();
  return {
    factions: [
      { id: drinaxFactionId, category: "drinax", name: "The Kingdom of Drinax", disposition: "allied", contact: "", notes: "Edit this entry with your campaign’s current King and court details.", protected: true },
      { id: uid(), category: "imperium", name: "Third Imperium", disposition: "neutral", contact: "", notes: "Local Imperial presence bordering the Reach — note down the relevant subsector fleet or consulate here.", standing: 0, standingBaseline: 0, standingUpdatedDay: null, protected: true },
      { id: uid(), category: "hierate", name: "The Aslan Hierate", disposition: "neutral", contact: "", notes: "The Hierate as a whole — track its overall relationship with Drinax here. Individual clans go under Aslan Clan.", standing: -5, standingBaseline: -5, standingUpdatedDay: null, protected: true },
      { id: uid(), category: "aslan_clan", name: "Example Aslan Clan", disposition: "neutral", contact: "", notes: "Rename to an actual clan from your game and track its own territory ambitions here — add as many clans as you need.", protected: false },
      { id: uid(), category: "pirate", name: "Example Pirate Band", disposition: "unfriendly", contact: "", notes: "Rename to a rival or allied pirate crew from your campaign.", protected: false },
      { id: uid(), category: "other", name: "Example Other Faction", disposition: "neutral", contact: "", notes: "Use this category for corporations, local governments, or other groups.", protected: false },
    ],
    contacts: [
      { id: uid(), role: "ally", name: "Example Ally Contact", ac: "Dr", soc: 9, location: "", notes: "Rename to an NPC ally, informant, or associate from your campaign.", actorUuid: null },
    ],
    worlds: [
      { id: uid(), name: "Drinax", uwp: "", location: "", faction: drinaxFactionId, status: "Under Drinax control", tags: "homeworld", notes: "The throne world itself — fill in UWP and current condition.", sourceUuid: null, relationship: "haven" },
      { id: uid(), name: "Theev", uwp: "", location: "", faction: null, status: "", tags: "", notes: "", sourceUuid: null, relationship: "friendly" },
    ],
    pri: "",
    log: []
  };
}

// ---------------------------------------------------------------------------
// Shared helpers used by both DrinaxTrackerApp and DrinaxEntityWindow (data
// access, per-entity windows registry, rich-text notes).
// ---------------------------------------------------------------------------

// Per-entity windows (faction/contact/world), replacing the old in-window
// sliding drawer — each opens as its own real ApplicationV2 window, so an
// entity can be viewed/edited (and cross-referenced) independently of the
// main tracker window.
const entityWindows = new Map(); // `${type}:${id||"new"}` -> DrinaxEntityWindow

function entityWindowKey(type, id) { return `${type}:${id || "new"}`; }

function openEntityWindow(type, id, prefill) {
  const key = entityWindowKey(type, id);
  const existing = entityWindows.get(key);
  if (existing?.rendered) { existing.bringToFront(); return existing; }
  const win = new DrinaxEntityWindow(type, id, prefill);
  entityWindows.set(key, win);
  win.render(true);
  return win;
}

// Refreshes the main tracker window (re-reading settings into its own cached
// trackerState, the same way this file already did in a couple of places)
// plus every currently open entity window — call after ANY change to the
// shared data, from wherever that change happened.
function refreshOpenWindows() {
  const mainApp = game.modules.get(MODULE_ID)?.app;
  if (mainApp?.rendered) {
    const data = game.settings.get(MODULE_ID, "data");
    if (data) {
      mainApp.trackerState = {
        factions: data.factions || [],
        contacts: data.contacts || [],
        worlds: data.worlds || [],
        pri: data.pri ?? "",
        log: data.log || []
      };
      const priInput = mainApp.root?.querySelector("[data-dr-pri]");
      if (priInput) priInput.value = mainApp.trackerState.pri === "" ? "" : mainApp.trackerState.pri;
      mainApp._renderContent();
    }
  }
  for (const win of entityWindows.values()) {
    if (win.rendered) win._renderContent();
  }
}

function findEntity(type, id) {
  const data = game.settings.get(MODULE_ID, "data");
  if (!data) return null;
  const list = data[`${type}s`];
  return (list || []).find(x => x.id === id) || null;
}

function entityIcon(type) {
  return type === "faction" ? "fa-flag" : type === "contact" ? "fa-user" : "fa-globe";
}

function entityTypeLabel(type) {
  return type === "faction" ? "Faction" : type === "contact" ? "Contact" : "World";
}

// GM confirms, then removes the entity from settings data and closes/drops
// any window open on it. Shared by the card grid's own Delete button and the
// matching button inside an entity's own window.
async function deleteEntity(type, id) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Delete entry" },
    content: "<p>Delete this entry? This cannot be undone.</p>"
  });
  if (!ok) return false;
  const data = game.settings.get(MODULE_ID, "data") || seedData();
  if (type === "faction") {
    data.factions = (data.factions || []).filter(x => x.id !== id);
    (data.worlds || []).forEach(w => { if (w.faction === id) w.faction = null; });
  } else if (type === "contact") {
    data.contacts = (data.contacts || []).filter(x => x.id !== id);
  } else {
    data.worlds = (data.worlds || []).filter(x => x.id !== id);
    (data.contacts || []).forEach(c => { if (c.location === id) c.location = ""; });
  }
  await game.settings.set(MODULE_ID, "data", data);
  const key = entityWindowKey(type, id);
  const win = entityWindows.get(key);
  entityWindows.delete(key);
  if (win?.rendered) win.close();
  refreshOpenWindows();
  return true;
}

// Shows a small dialog asking for an optional reason, used when logging a
// change to AC, Disposition, PRI, or Standing.
async function promptReason(title, summary) {
  try {
    const reason = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `
        <div class="dr-field"><p class="dr-card-meta">${summary}</p></div>
        <div class="dr-field"><label>Reason (optional)</label><textarea id="dr-reason-input" rows="3"></textarea></div>
      `,
      ok: {
        label: "Log Change",
        callback: (event, button) => button.form.querySelector("#dr-reason-input").value.trim()
      },
      rejectClose: false
    });
    return reason || "";
  } catch (err) {
    return "";
  }
}

// Appends a log entry to `data.log` (mutating it — caller is responsible for
// persisting `data` afterward, same as every other write in this file).
async function logChange(data, entityType, entityName, changes) {
  if (!changes.length) return;
  const summary = changes.map(c => `${esc(c.field)}: ${esc(String(c.from))} &rarr; ${esc(String(c.to))}`).join("<br>");
  const reason = await promptReason(`Log reason — ${entityName}`, summary);
  data.log = data.log || [];
  data.log.unshift({
    id: uid(),
    realTime: new Date().toISOString(),
    gameDate: getCampaignDate(),
    entityType,
    entityName,
    changes,
    reason
  });
}

// Custom dropdown markup used in place of native <select>, since native
// select popups on this platform ignore our dark theme colors (Windows'
// combo-box chrome overrides author styling for both the closed box and,
// in some cases, the popup list). The hidden input keeps the same
// data-attribute the save methods already query, so nothing else changes.
function customSelectHtml(dataAttr, items, selected) {
  const selectedItem = items.find(it => it.value === (selected ?? ""));
  const label = selectedItem ? selectedItem.label : "";
  const opts = items.map(it => `<div class="dr-select-opt ${it.value === (selected ?? "") ? "selected" : ""}" data-dr-select-value="${esc(it.value)}">${esc(it.label)}</div>`).join("");
  return `
    <div class="dr-select">
      <button type="button" class="dr-select-btn" data-dr-select-toggle>${esc(label)}</button>
      <div class="dr-select-menu">${opts}</div>
      <input type="hidden" ${dataAttr} value="${esc(selected ?? "")}">
    </div>`;
}

function relationshipEffectsText(id) {
  const r = relInfo(id);
  return `Fence ${r.fence} &middot; Recruit ${r.recruitment} &middot; Arrest ${r.riskArrest} &middot; Spies ${r.riskSpies} &middot; Protect ${r.protection}`;
}

// Fully custom rich-text notes editor — NOT Foundry's own <prose-mirror>/
// ProseMirrorEditor. Both were tried and confirmed broken live (2026-09):
// the markup-only <prose-mirror> element wasn't even typeable, and
// ProseMirrorEditor.create()'s own dropdown menus (Format/Table/Font)
// rendered as inline content instead of floating popups, breaking the
// whole window's layout — and a defensive CSS fix aimed at Foundry's
// internal menu classes didn't help either. This trades Foundry's fancier
// editor chrome (tables, paragraph styles, a format-painter tool) for a
// small, plain `contenteditable` box with our own toolbar, fully under
// this module's own CSS — no more dependency on undocumented Foundry
// internals. `document.execCommand` is technically deprecated but still
// broadly supported in the Chromium/Electron environment Foundry runs in,
// and is by far the simplest way to implement bold/italic/underline/lists
// on a contenteditable element.
function notesToolbarHtml() {
  return `
    <div class="dr-notes-toolbar">
      <button type="button" class="dr-icon-btn" data-dr-fmt="bold" title="Bold"><b>B</b></button>
      <button type="button" class="dr-icon-btn" data-dr-fmt="italic" title="Italic"><i>I</i></button>
      <button type="button" class="dr-icon-btn" data-dr-fmt="underline" title="Underline"><u>U</u></button>
      <button type="button" class="dr-icon-btn" data-dr-fmt="insertUnorderedList" title="Bullet list">&bull; List</button>
      <button type="button" class="dr-icon-btn" data-dr-fmt="insertOrderedList" title="Numbered list">1. List</button>
      <button type="button" class="dr-icon-btn" data-dr-insert-hyperlink title="Insert hyperlink">Link</button>
      <button type="button" class="dr-icon-btn" data-dr-insert-image title="Insert image">Image</button>
      <button type="button" class="dr-icon-btn" data-dr-insert-link title="Link to another tracker entity">+ Entity Link&hellip;</button>
    </div>`;
}
function notesEditorHtml(notes) {
  return `${notesToolbarHtml()}<div class="dr-notes-editable" contenteditable="true" data-dr-notes-editable>${notesToEditableHtml(notes)}</div>`;
}

// Treats a notes string that already contains an HTML tag as rich HTML
// (this module's format going forward, written by the notes editor);
// anything else is legacy plain text from before notes were rich text,
// wrapped/escaped once so old notes containing literal "<"/">" don't get
// misread as markup.
function looksLikeHtml(s) {
  return /<[a-z][\s\S]*>/i.test(s || "");
}
function notesToEditableHtml(notes) {
  if (!notes) return "";
  return looksLikeHtml(notes) ? notes : `<p>${esc(notes)}</p>`;
}


// Built on ApplicationV2, not the deprecated v1 Application class (Foundry
// has deprecated Application/FormApplication/Dialog v1 as of v13 ahead of
// their eventual removal, so this targets the replacement API throughout).
// tracker.hbs has no Handlebars bindings (getData() previously returned
// {}) — it's rendered once as a static shell and everything inside is
// built via direct innerHTML from JS, exactly as before — so this uses a
// raw ApplicationV2 subclass (no HandlebarsApplicationMixin) with a custom
// _renderHTML that still renders that same .hbs file via the new
// foundry.applications.handlebars.renderTemplate, rather than porting its
// ~480 lines of markup into a JS template string.
class DrinaxTrackerApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "drinax-tracker-app",
    classes: ["drinax-tracker-window"],
    window: { title: "Pirates of Drinax Tracker", resizable: true },
    position: { width: 880, height: 680 }
  };

  constructor(options = {}) {
    super(options);
    this.trackerState = { factions: [], contacts: [], worlds: [], pri: "", log: [] };
    this.currentTab = "factions";
    this.activeFilter = "all";
    this.activeLocationFilter = "all";
  }

  async _renderHTML(context, options) {
    return foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/tracker.hbs`, {});
  }

  async _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  async _loadData() {
    let data = game.settings.get(MODULE_ID, "data");
    if (!data) {
      data = seedData();
      await game.settings.set(MODULE_ID, "data", data);
    }
    // One-time migration: pre-1.3.1 data used a single "aslan" category for
    // both the Hierate and individual clans; that was later split into
    // "hierate" and "aslan_clan". Treat any leftover "aslan" faction as the
    // Hierate, since that was the only entry ever seeded under the old id.
    let migrated = false;
    (data.factions || []).forEach(f => {
      if (f.category === "aslan") { f.category = "hierate"; migrated = true; }
    });
    // One-time migration: give any world saved before the Relationship track
    // existed a sensible starting value instead of leaving it blank.
    (data.worlds || []).forEach(w => {
      if (!w.relationship) {
        const faction = (data.factions || []).find(f => f.id === w.faction);
        w.relationship = defaultWorldRelationship({ name: w.name, factionCategory: faction?.category, uwp: w.uwp });
        migrated = true;
      }
    });
    // One-time migration: contacts saved before the Location field existed.
    (data.contacts || []).forEach(c => {
      if (c.location === undefined) { c.location = ""; migrated = true; }
    });
    const drifted = runStandingDrift(data);
    this.trackerState = {
      factions: data.factions || [],
      contacts: data.contacts || [],
      worlds: data.worlds || [],
      pri: data.pri ?? "",
      log: data.log || []
    };
    if (migrated || drifted) await this._saveData();
  }

  async _saveData() {
    await game.settings.set(MODULE_ID, "data", this.trackerState);
  }

  async _onRender(context, options) {
    const root = this.element.querySelector("#drinax-root");
    this.root = root;
    root.classList.toggle("dr-standard-look", standardLookEnabled());

    root.querySelectorAll("[data-dr-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.currentTab = btn.dataset.drTab;
        this.activeFilter = "all";
        this.activeLocationFilter = "all";
        root.querySelectorAll("[data-dr-tab]").forEach(b => b.classList.toggle("active", b === btn));
        root.querySelector("[data-dr-search]").value = "";
        root.querySelector("[data-dr-add]").style.display = this.currentTab === "log" ? "none" : "";
        this._renderContent();
      });
    });

    root.querySelector("[data-dr-search]").addEventListener("input", () => this._renderContent());
    root.querySelector("[data-dr-add]").addEventListener("click", () => {
      const type = this.currentTab === "factions" ? "faction" : this.currentTab === "contacts" ? "contact" : "world";
      openEntityWindow(type, null);
    });

    const priInput = root.querySelector("[data-dr-pri]");
    priInput.addEventListener("change", async () => {
      const prev = this.trackerState.pri;
      const next = priInput.value === "" ? "" : Number(priInput.value);
      this.trackerState.pri = next;
      await this._saveData();
      if (prev !== next) await this._logChange("PRI", "Piracy Response Indicator", [{ field: "PRI", from: prev === "" ? "—" : prev, to: next === "" ? "—" : next }]);
    });
    const bumpPri = async (delta) => {
      const prev = priInput.value === "" ? 0 : Number(priInput.value);
      const next = prev + delta;
      this.trackerState.pri = next;
      priInput.value = next;
      await this._saveData();
      await this._logChange("PRI", "Piracy Response Indicator", [{ field: "PRI", from: prev, to: next }]);
    };
    root.querySelector("[data-dr-pri-inc]").addEventListener("click", () => bumpPri(1));
    root.querySelector("[data-dr-pri-dec]").addEventListener("click", () => bumpPri(-1));

    root.addEventListener("dragover", (e) => e.preventDefault());
    root.addEventListener("drop", (e) => this._onDrop(e));

    if (this._outsideClickHandler) document.removeEventListener("click", this._outsideClickHandler);
    this._outsideClickHandler = (e) => {
      if (!e.target.closest(".dr-select")) {
        root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
      }
    };
    document.addEventListener("click", this._outsideClickHandler);

    // Delegated clicks for dynamically generated card/filter content
    root.addEventListener("click", (e) => {
      const filterToggle = e.target.closest("[data-dr-filter-toggle]");
      if (filterToggle) {
        const menu = filterToggle.nextElementSibling;
        const wasOpen = menu.classList.contains("open");
        root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
        if (!wasOpen) menu.classList.add("open");
        return;
      }

      const filterOpt = e.target.closest("[data-dr-filter-value]");
      if (filterOpt) {
        const kind = filterOpt.closest(".dr-filter-select")?.dataset.drFilterKind || "primary";
        if (kind === "location") this.activeLocationFilter = filterOpt.dataset.drFilterValue;
        else this.activeFilter = filterOpt.dataset.drFilterValue;
        this._renderContent();
        return;
      }

      const openActor = e.target.closest("[data-dr-open-actor]");
      if (openActor) { e.preventDefault(); fromUuid(openActor.dataset.drOpenActor).then(doc => doc?.sheet?.render(true)); return; }

      const openSource = e.target.closest("[data-dr-open-source]");
      if (openSource) { e.preventDefault(); fromUuid(openSource.dataset.drOpenSource).then(doc => doc?.sheet?.render(true)); return; }

      const openEntity = e.target.closest("[data-dr-open-entity]");
      if (openEntity) {
        e.preventDefault();
        e.stopPropagation();
        const [type, id] = openEntity.dataset.drOpenEntity.split(":");
        openEntityWindow(type, id);
        return;
      }

      const delFaction = e.target.closest("[data-dr-del-faction]");
      if (delFaction) { e.stopPropagation(); deleteEntity("faction", delFaction.dataset.drDelFaction); return; }

      const delContact = e.target.closest("[data-dr-del-contact]");
      if (delContact) { e.stopPropagation(); deleteEntity("contact", delContact.dataset.drDelContact); return; }

      const delWorld = e.target.closest("[data-dr-del-world]");
      if (delWorld) { e.stopPropagation(); deleteEntity("world", delWorld.dataset.drDelWorld); return; }

      const card = e.target.closest(".dr-card[data-dr-card-type]");
      if (card) { openEntityWindow(card.dataset.drCardType, card.dataset.drCardId); return; }

      root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
    });

    this._loadData().then(() => {
      priInput.value = this.trackerState.pri === "" ? "" : this.trackerState.pri;
      this._renderContent();
    });
  }

  async _onDrop(event) {
    event.preventDefault();
    if (this.currentTab !== "contacts" && this.currentTab !== "worlds") {
      ui.notifications.info("Switch to the Contacts or Worlds tab to drop items here.");
      return;
    }
    const raw = event.dataTransfer.getData("text/plain");
    console.log("Drinax Tracker | drop payload:", raw);
    let data = null;
    try { data = JSON.parse(raw); } catch (err) { /* not a Foundry document drag, see plain-text fallback below */ }

    if (data?.uuid) {
      const doc = await fromUuid(data.uuid);
      if (!doc) {
        ui.notifications.warn(`Drinax Tracker: couldn't resolve document ${data.uuid}.`);
        return;
      }
      if (this.currentTab === "contacts") {
        if (data.type !== "Actor") {
          ui.notifications.warn(`Drop an Actor onto the Contacts tab to create a contact (got type "${data.type}").`);
          return;
        }
        openEntityWindow("contact", null, { name: doc.name, actorUuid: doc.uuid, soc: guessActorSoc(doc) });
      } else {
        openEntityWindow("world", null, { name: doc.name, sourceUuid: doc.uuid, uwp: guessWorldUwp(doc) });
      }
      return;
    }

    // Not a Foundry document drag — some modules (e.g. Traveller Toolkit) just
    // put plain text on the drag payload instead of a linked document. Use it
    // as a starting name rather than treating it as an error.
    const text = (raw || "").trim();
    if (!text) {
      ui.notifications.warn("Drinax Tracker: couldn't read what was dropped — see the browser console (F12) for the raw payload.");
      return;
    }
    if (this.currentTab === "contacts") openEntityWindow("contact", null, { name: text });
    else openEntityWindow("world", null, { name: text });
  }

  _renderSummary() {
    const el = this.root.querySelector("[data-dr-summary]");
    const chips = FACTION_CATEGORIES.map(c => {
      const n = this.trackerState.factions.filter(f => f.category === c.id).length;
      return `<span class="dr-summary-chip"><b>${n}</b> ${esc(c.label)}</span>`;
    });
    chips.push(`<span class="dr-summary-chip"><b>${this.trackerState.contacts.length}</b> Contacts</span>`);
    chips.push(`<span class="dr-summary-chip"><b>${this.trackerState.worlds.length}</b> Worlds tracked</span>`);
    el.innerHTML = chips.join("");
  }

  _filterSelectHtml(items, selected, kind) {
    const selectedItem = items.find(it => it.value === selected) || items[0];
    const opts = items.map(it => `<div class="dr-select-opt ${it.value === selected ? "selected" : ""}" data-dr-filter-value="${esc(it.value)}">${esc(it.label)}</div>`).join("");
    return `
      <div class="dr-select dr-filter-select" data-dr-filter-kind="${esc(kind || "primary")}">
        <button type="button" class="dr-select-btn" data-dr-filter-toggle>${esc(selectedItem.label)}</button>
        <div class="dr-select-menu">${opts}</div>
      </div>`;
  }

  _renderFilters() {
    const el = this.root.querySelector("[data-dr-filters]");
    if (this.currentTab === "factions") {
      const items = [{ value: "all", label: "All Categories" }, ...FACTION_CATEGORIES.map(c => ({ value: c.id, label: c.label }))];
      el.innerHTML = this._filterSelectHtml(items, this.activeFilter, "primary");
    } else if (this.currentTab === "contacts") {
      const roleItems = [{ value: "all", label: "All Roles" }, ...CONTACT_ROLES.map(r => ({ value: r.id, label: r.label }))];
      const locationItems = [
        { value: "all", label: "All Locations" },
        { value: "none", label: "Unspecified" },
        ...this.trackerState.worlds.map(w => ({ value: w.id, label: w.name }))
      ];
      el.innerHTML =
        this._filterSelectHtml(roleItems, this.activeFilter, "primary") +
        this._filterSelectHtml(locationItems, this.activeLocationFilter, "location");
    } else {
      el.innerHTML = "";
    }
  }

  _factionCard(f) {
    const cat = catInfo(f.category);
    const disp = dispInfo(f.disposition);
    const hasStanding = STANDING_CATEGORIES.includes(f.category) && typeof f.standing === "number" && Number.isFinite(f.standing);
    const standingLabel = hasStanding ? (f.standing > 0 ? `+${f.standing}` : `${f.standing}`) : "";
    return `
      <div class="dr-card" style="--cat-color:${cat.color}" data-dr-card-type="faction" data-dr-card-id="${f.id}">
        <div class="dr-card-top"><p class="dr-card-name">${esc(f.name)}</p></div>
        <span class="dr-card-tag">${esc(cat.label)}</span>
        <span class="dr-badge"><span class="dr-dot" style="--dot-color:${disp.color}"></span>${esc(disp.label)}</span>
        ${hasStanding ? `<div class="dr-card-meta">Standing: ${standingLabel}</div>` : ""}
        ${f.contact ? `<div class="dr-card-meta">Contact: ${esc(f.contact)}</div>` : ""}
        <div class="dr-card-actions">
          ${f.protected ? "" : `<button type="button" class="dr-icon-btn danger" data-dr-del-faction="${f.id}">Delete</button>`}
        </div>
      </div>`;
  }

  _contactCard(c) {
    const role = roleInfo(c.role);
    const av = calcAV(c.soc);
    const hasSoc = typeof c.soc === "number" && Number.isFinite(c.soc);
    const world = c.location ? this.trackerState.worlds.find(w => w.id === c.location) : null;
    return `
      <div class="dr-card" style="--cat-color:${role.color}" data-dr-card-type="contact" data-dr-card-id="${c.id}">
        <div class="dr-card-top"><p class="dr-card-name">${esc(c.name)}</p></div>
        <span class="dr-card-tag">${esc(role.label)}</span>
        ${c.ac ? `<span class="dr-badge">AC ${esc(c.ac)}</span>` : ""}
        ${hasSoc ? `<div class="dr-card-meta">SOC ${c.soc} &middot; AV ${av}</div>` : ""}
        ${world ? `<div class="dr-card-meta">Location: <a href="#" data-dr-open-entity="world:${world.id}">${esc(world.name)}</a></div>` : ""}
        ${c.actorUuid ? `<div class="dr-card-meta"><a href="#" data-dr-open-actor="${esc(c.actorUuid)}">Open actor sheet</a></div>` : ""}
        <div class="dr-card-actions">
          <button type="button" class="dr-icon-btn danger" data-dr-del-contact="${c.id}">Delete</button>
        </div>
      </div>`;
  }

  _worldCard(w) {
    const f = w.faction ? this.trackerState.factions.find(x => x.id === w.faction) : null;
    const cat = f ? catInfo(f.category) : null;
    const rel = relInfo(w.relationship);
    const tags = (w.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const linkedContacts = this.trackerState.contacts.filter(c => c.location === w.id);
    return `
      <div class="dr-card" style="--cat-color:${cat ? cat.color : "var(--border)"}" data-dr-card-type="world" data-dr-card-id="${w.id}">
        <div class="dr-card-top">
          <p class="dr-card-name">${esc(w.name)}</p>
          ${w.uwp ? `<span class="dr-card-uwp mono">${esc(w.uwp)}</span>` : ""}
        </div>
        ${w.location ? `<div class="dr-card-meta">${esc(w.location)}</div>` : ""}
        ${f ? `<span class="dr-badge" style="color:${cat.color}">${esc(f.name)}</span>` : `<span class="dr-badge">Unclaimed</span>`}
        <span class="dr-badge" style="color:${rel.color}">${esc(rel.label)}</span>
        <div class="dr-card-meta">${this._relationshipEffectsText(w.relationship)}</div>
        ${w.status ? `<div class="dr-card-meta">Status: ${esc(w.status)}</div>` : ""}
        ${tags.length ? `<div class="dr-card-tags">${tags.map(t => `<span class="dr-tag-pill">${esc(t)}</span>`).join("")}</div>` : ""}
        ${linkedContacts.length ? `<div class="dr-card-meta">Contacts here: ${linkedContacts.map(c => `<a href="#" data-dr-open-entity="contact:${c.id}">${esc(c.name)}</a>`).join(", ")}</div>` : ""}
        ${w.sourceUuid ? `<div class="dr-card-meta"><a href="#" data-dr-open-source="${esc(w.sourceUuid)}">Open source document</a></div>` : ""}
        <div class="dr-card-actions">
          <button type="button" class="dr-icon-btn danger" data-dr-del-world="${w.id}">Delete</button>
        </div>
      </div>`;
  }

  _logEntryCard(entry) {
    const realTime = new Date(entry.realTime).toLocaleString();
    const changesHtml = entry.changes.map(c => `<div class="dr-card-meta">${esc(c.field)}: ${esc(String(c.from))} &rarr; ${esc(String(c.to))}</div>`).join("");
    return `
      <div class="dr-card">
        <div class="dr-card-top"><p class="dr-card-name">${esc(entry.entityName)}</p></div>
        <span class="dr-card-tag">${esc(entry.entityType)}</span>
        ${changesHtml}
        ${entry.reason ? `<p class="dr-card-notes">Reason: ${esc(entry.reason)}</p>` : ""}
        <div class="dr-card-meta">${entry.gameDate ? `Game date ${esc(entry.gameDate)} &middot; ` : ""}${esc(realTime)}</div>
      </div>`;
  }

  _renderContent() {
    this._renderSummary();
    this._renderFilters();
    const grid = this.root.querySelector("[data-dr-grid]");
    const empty = this.root.querySelector("[data-dr-empty]");
    const q = (this.root.querySelector("[data-dr-search]").value || "").toLowerCase();

    if (this.currentTab === "factions") {
      let list = this.trackerState.factions.filter(f => this.activeFilter === "all" || f.category === this.activeFilter);
      if (q) list = list.filter(f => (f.name + " " + (f.notes || "") + " " + (f.contact || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.trackerState.factions.length === 0
          ? "No factions yet. Add the Kingdom, the Imperium, an Aslan clan, or any pirate crew you’re tracking."
          : "No factions match your search or filter.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(f => this._factionCard(f)).join("");
      }
    } else if (this.currentTab === "contacts") {
      let list = this.trackerState.contacts.filter(c => {
        if (this.activeFilter !== "all" && c.role !== this.activeFilter) return false;
        if (this.activeLocationFilter === "all") return true;
        if (this.activeLocationFilter === "none") return !c.location;
        return c.location === this.activeLocationFilter;
      });
      if (q) list = list.filter(c => (c.name + " " + (c.notes || "") + " " + (c.ac || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.trackerState.contacts.length === 0
          ? "No contacts yet. Drag an Actor here, or use + Add, to track a contact, ally, or associate."
          : "No contacts match your search or filter.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(c => this._contactCard(c)).join("");
      }
    } else if (this.currentTab === "worlds") {
      let list = this.trackerState.worlds.slice();
      if (q) list = list.filter(w => (w.name + " " + (w.notes || "") + " " + (w.status || "") + " " + (w.tags || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.trackerState.worlds.length === 0
          ? "No worlds yet. Add the ones your crew has surveyed, raided, or annexed, or drag a world entry here."
          : "No worlds match your search.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(w => this._worldCard(w)).join("");
      }
    } else {
      let list = (this.trackerState.log || []).slice();
      if (q) list = list.filter(entry => (entry.entityName + " " + (entry.reason || "") + " " + entry.changes.map(c => c.field).join(" ")).toLowerCase().includes(q));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = "No logged changes yet. Changes to Disposition, Standing, AC, and PRI are logged here automatically.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(entry => this._logEntryCard(entry)).join("");
      }
    }
  }

  _relationshipEffectsText(id) { return relationshipEffectsText(id); }

  async _logChange(entityType, entityName, changes) {
    if (!changes.length) return;
    const summary = changes.map(c => `${esc(c.field)}: ${esc(String(c.from))} &rarr; ${esc(String(c.to))}`).join("<br>");
    const reason = await promptReason(`Log reason — ${entityName}`, summary);
    this.trackerState.log = this.trackerState.log || [];
    this.trackerState.log.unshift({
      id: uid(),
      realTime: new Date().toISOString(),
      gameDate: getCampaignDate(),
      entityType,
      entityName,
      changes,
      reason
    });
    await this._saveData();
    if (this.currentTab === "log") this._renderContent();
  }
}

// ---------------------------------------------------------------------------
// Per-entity window (faction/contact/world) — Add and Edit both happen here,
// one instance per entity (registry above), replacing the old in-window
// sliding drawer. See entityWindows/openEntityWindow/refreshOpenWindows.
// ---------------------------------------------------------------------------
class DrinaxEntityWindow extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["drinax-tracker-window", "drinax-entity-window"],
    window: { resizable: true },
    position: { width: 460, height: 640 }
  };

  constructor(entityType, entityId, prefill) {
    super();
    this.entityType = entityType; // "faction" | "contact" | "world"
    this.entityId = entityId; // null while adding
    this.prefill = prefill || null; // { name, actorUuid, sourceUuid, uwp, soc }
    this._tmResults = null;
  }

  get id() { return `drinax-entity-${this.entityType}-${this.entityId || "new"}`; }

  _plural() { return `${this.entityType}s`; }

  _data() { return game.settings.get(MODULE_ID, "data") || seedData(); }

  _entity() {
    if (!this.entityId) return null;
    const data = this._data();
    return (data[this._plural()] || []).find(x => x.id === this.entityId) || null;
  }

  get title() {
    const entity = this._entity();
    return entity ? entity.name : `Add ${entityTypeLabel(this.entityType)}`;
  }

  async _renderHTML(context, options) {
    return `<div id="drinax-root"><div class="dr-entity-window" data-dr-entity-content></div></div>`;
  }

  async _replaceHTML(result, content, options) {
    content.innerHTML = result;
  }

  async _onRender(context, options) {
    this.root = this.element.querySelector("#drinax-root");
    this.root.classList.toggle("dr-standard-look", standardLookEnabled());
    this._wireEvents();
    this._renderContent();
  }

  async close(options) {
    if (this._outsideClickHandler) document.removeEventListener("click", this._outsideClickHandler);
    entityWindows.delete(entityWindowKey(this.entityType, this.entityId));
    return super.close(options);
  }

  _wireEvents() {
    const root = this.root;

    if (this._outsideClickHandler) document.removeEventListener("click", this._outsideClickHandler);
    this._outsideClickHandler = (e) => {
      if (!e.target.closest(".dr-select")) {
        root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
      }
    };
    document.addEventListener("click", this._outsideClickHandler);

    root.addEventListener("click", (e) => {
      const selectToggle = e.target.closest("[data-dr-select-toggle]");
      if (selectToggle) {
        const menu = selectToggle.nextElementSibling;
        const wasOpen = menu.classList.contains("open");
        root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
        if (!wasOpen) menu.classList.add("open");
        return;
      }

      const selectOpt = e.target.closest("[data-dr-select-value]");
      if (selectOpt) {
        const wrapper = selectOpt.closest(".dr-select");
        const hidden = wrapper.querySelector("input[type=hidden]");
        const btn = wrapper.querySelector("[data-dr-select-toggle]");
        hidden.value = selectOpt.dataset.drSelectValue;
        btn.textContent = selectOpt.textContent;
        wrapper.querySelectorAll("[data-dr-select-value]").forEach(o => o.classList.toggle("selected", o === selectOpt));
        wrapper.querySelector(".dr-select-menu").classList.remove("open");

        if (hidden.hasAttribute("data-f-category")) {
          const standingWrapper = root.querySelector("[data-f-standing-wrapper]");
          if (standingWrapper) standingWrapper.style.display = STANDING_CATEGORIES.includes(hidden.value) ? "" : "none";
        }
        if (hidden.hasAttribute("data-w-faction")) this._recomputeWorldRelationshipDefault();
        return;
      }

      const tmLookup = e.target.closest("[data-dr-tm-lookup]");
      if (tmLookup) { this._lookupTravellerMap(); return; }

      const tmResult = e.target.closest("[data-dr-tm-result]");
      if (tmResult) { this._applyTravellerMapResult(Number(tmResult.dataset.drTmResult)); return; }

      const insertLink = e.target.closest("[data-dr-insert-link]");
      if (insertLink) { this._insertEntityLink(); return; }

      const fmtBtn = e.target.closest("[data-dr-fmt]");
      if (fmtBtn) {
        e.preventDefault();
        const editable = root.querySelector("[data-dr-notes-editable]");
        if (editable) { editable.focus(); document.execCommand(fmtBtn.dataset.drFmt, false, null); }
        return;
      }

      const insertHyperlink = e.target.closest("[data-dr-insert-hyperlink]");
      if (insertHyperlink) { this._insertHyperlink(); return; }

      const insertImage = e.target.closest("[data-dr-insert-image]");
      if (insertImage) { this._insertImage(); return; }

      const openEntity = e.target.closest("[data-dr-open-entity]");
      if (openEntity) { e.preventDefault(); const [type, id] = openEntity.dataset.drOpenEntity.split(":"); openEntityWindow(type, id); return; }

      const openActor = e.target.closest("[data-dr-open-actor]");
      if (openActor) { e.preventDefault(); fromUuid(openActor.dataset.drOpenActor).then(doc => doc?.sheet?.render(true)); return; }

      const openSource = e.target.closest("[data-dr-open-source]");
      if (openSource) { e.preventDefault(); fromUuid(openSource.dataset.drOpenSource).then(doc => doc?.sheet?.render(true)); return; }

      const save = e.target.closest("[data-dr-save]");
      if (save) { this._save(); return; }

      const del = e.target.closest("[data-dr-delete]");
      if (del) { deleteEntity(this.entityType, this.entityId); return; }

      const cancel = e.target.closest("[data-dr-cancel]");
      if (cancel) { this.close(); return; }

      root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
    });

    // Live Asset Value recalculation as SOC changes, and live
    // Relationship-default recalculation as a world's UWP is typed.
    root.addEventListener("input", (e) => {
      if (e.target.matches("[data-c-soc]")) {
        const avField = root.querySelector("[data-c-av]");
        if (avField) {
          const av = calcAV(e.target.value);
          avField.value = av === "" ? "" : av;
        }
      }
      if (e.target.matches("[data-w-uwp]")) this._recomputeWorldRelationshipDefault();
    });

    // Auto-lookup on Traveller Map once a world Name is entered, if UWP is
    // still blank. Uses focusout (bubbles), since blur does not. Also
    // recomputes the Relationship default, since Drinax/Theev are named
    // special cases that apply even when UWP is already known.
    root.addEventListener("focusout", (e) => {
      if (e.target.matches("[data-w-name]")) {
        const uwpField = root.querySelector("[data-w-uwp]");
        if (e.target.value.trim() && uwpField && !uwpField.value.trim()) this._lookupTravellerMap();
        this._recomputeWorldRelationshipDefault();
      }
    });
  }

  _renderContent() {
    const titleEl = this.element?.querySelector(".window-title");
    if (titleEl) titleEl.textContent = this.title;
    const content = this.root.querySelector("[data-dr-entity-content]");
    const entity = this._entity();
    const data = this._data();
    if (this.entityType === "faction") content.innerHTML = this._factionForm(entity);
    else if (this.entityType === "contact") content.innerHTML = this._contactForm(entity, data);
    else content.innerHTML = this._worldForm(entity, data);
    // Editing an existing world saved before a UWP was known, or adding one
    // from a drop/prefill that didn't resolve a UWP — look it up immediately
    // rather than waiting for a name-field blur.
    if (this.entityType === "world") {
      const name = entity?.name || this.prefill?.name;
      const uwp = entity?.uwp || this.prefill?.uwp;
      if (name && !uwp) this._lookupTravellerMap();
    }
  }

  // Reads the notes editor's current content straight from its live DOM —
  // it's a plain contenteditable box, so its innerHTML already IS the
  // current content, no separate serialization needed.
  _notesHtml() {
    return this.root.querySelector("[data-dr-notes-editable]")?.innerHTML || "";
  }

  _factionForm(f) {
    const isEdit = !!f;
    f = f || { category: "drinax", disposition: "neutral", name: "", contact: "", notes: "", standing: "", protected: false };
    const showStanding = STANDING_CATEGORIES.includes(f.category);
    return `
      <h3>${isEdit ? "Edit faction" : "Add faction"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-f-name value="${esc(f.name)}" placeholder="e.g. Clan Ki'shafeni"></div>
      <div class="dr-field"><label>Category</label>${customSelectHtml("data-f-category", FACTION_CATEGORIES.map(c => ({ value: c.id, label: c.label })), f.category)}</div>
      <div class="dr-field"><label>Disposition toward the party</label>${customSelectHtml("data-f-disposition", DISPOSITIONS.map(d => ({ value: d.id, label: d.label })), f.disposition)}</div>
      <div class="dr-field"><label>Leader / contact</label><input type="text" data-f-contact value="${esc(f.contact)}" placeholder="Named NPC, if any"></div>
      <div data-f-standing-wrapper style="${showStanding ? "" : "display:none;"}">
        <div class="dr-field"><label>Standing</label><input type="number" data-f-standing value="${f.standing === "" || f.standing === null || f.standing === undefined ? "" : f.standing}" placeholder="e.g. -5"></div>
        <div class="dr-field"><label>Standing reverts toward (baseline)</label><input type="number" data-f-standing-baseline value="${f.standingBaseline === "" || f.standingBaseline === null || f.standingBaseline === undefined ? defaultStandingBaseline(f.category) : f.standingBaseline}" placeholder="e.g. 0"></div>
        <p class="dr-card-meta">Standing drifts 1 point toward the baseline for every 30 in-game days elapsed.</p>
      </div>
      <div class="dr-field">
        <label>Notes</label>
        ${notesEditorHtml(f.notes)}
      </div>
      <div class="dr-field dr-field-checkbox"><label><input type="checkbox" data-f-protected ${f.protected ? "checked" : ""}> Protect from deletion</label></div>
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save>Save</button>
        ${isEdit && !f.protected ? `<button type="button" class="dr-icon-btn danger" data-dr-delete>Delete</button>` : ""}
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  _contactForm(c, data) {
    const isEdit = !!c;
    c = c || {
      role: "contact", name: this.prefill?.name || "", ac: "",
      soc: this.prefill?.soc ?? "", location: "", notes: "",
      actorUuid: this.prefill?.actorUuid || null
    };
    const av = calcAV(c.soc);
    const locationItems = [{ value: "", label: "Unspecified" }, ...data.worlds.map(w => ({ value: w.id, label: w.name }))];
    return `
      <h3>${isEdit ? "Edit contact" : "Add contact"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-c-name value="${esc(c.name)}" placeholder="e.g. Baron Nakamura"></div>
      <div class="dr-field"><label>Role</label>${customSelectHtml("data-c-role", CONTACT_ROLES.map(r => ({ value: r.id, label: r.label })), c.role)}</div>
      <div class="dr-field"><label>Allegiance Code (AC)</label><input type="text" list="dr-ac-list" data-c-ac value="${esc(c.ac)}" placeholder="e.g. Dr">
        <datalist id="dr-ac-list">${ALLEGIANCE_SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      </div>
      <div class="dr-field"><label>Social Standing (SOC)</label><input type="number" data-c-soc value="${c.soc === "" || c.soc === null || c.soc === undefined ? "" : c.soc}" placeholder="e.g. 9"></div>
      <div class="dr-field"><label>Asset Value (AV = SOC&sup3;)</label><input type="text" class="dr-field-readonly" data-c-av value="${av === "" ? "" : av}" readonly tabindex="-1"></div>
      <div class="dr-field"><label>Location</label>${customSelectHtml("data-c-location", locationItems, c.location || "")}</div>
      <div class="dr-field">
        <label>Notes</label>
        ${notesEditorHtml(c.notes)}
      </div>
      ${c.actorUuid ? `<div class="dr-card-meta">Linked actor: <a href="#" data-dr-open-actor="${esc(c.actorUuid)}">Open sheet</a></div>` : ""}
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save>Save</button>
        ${isEdit ? `<button type="button" class="dr-icon-btn danger" data-dr-delete>Delete</button>` : ""}
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  _worldForm(w, data) {
    const isEdit = !!w;
    w = w || {
      name: this.prefill?.name || "", uwp: this.prefill?.uwp || "", location: "",
      faction: "", status: "", tags: "", notes: "", relationship: "neutral",
      sourceUuid: this.prefill?.sourceUuid || null
    };
    const linkedContacts = isEdit ? data.contacts.filter(c => c.location === w.id) : [];
    return `
      <h3>${isEdit ? "Edit world" : "Add world"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-w-name value="${esc(w.name)}" placeholder="e.g. Cutlass"></div>
      <div class="dr-field">
        <label>UWP</label>
        <div class="dr-inline-field">
          <input type="text" class="mono" data-w-uwp value="${esc(w.uwp)}" placeholder="e.g. A788899-C">
          <button type="button" class="dr-icon-btn-square" data-dr-tm-lookup title="Look up on Traveller Map">&#128269;</button>
        </div>
      </div>
      <div class="dr-tm-results" data-dr-tm-results></div>
      <div class="dr-field"><label>Location (hex / subsector)</label><input type="text" data-w-location value="${esc(w.location)}" placeholder="e.g. 1907 Drinax"></div>
      <div class="dr-field"><label>Controlling faction</label>${customSelectHtml("data-w-faction", [{ value: "", label: "Unclaimed / independent" }, ...data.factions.map(f => ({ value: f.id, label: f.name }))], w.faction || "")}</div>
      <div class="dr-field">
        <label>Relationship</label>
        ${customSelectHtml("data-w-relationship", WORLD_RELATIONSHIPS.map(r => ({ value: r.id, label: r.label })), w.relationship || "neutral")}
      </div>
      <p class="dr-card-meta" data-dr-relationship-effects>${relationshipEffectsText(w.relationship || "neutral")}</p>
      <div class="dr-field"><label>Status</label><input type="text" list="dr-status-list" data-w-status value="${esc(w.status)}" placeholder="e.g. Contested">
        <datalist id="dr-status-list">${WORLD_STATUS_SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      </div>
      <div class="dr-field"><label>Tags (comma separated)</label><input type="text" data-w-tags value="${esc(w.tags)}" placeholder="naval base, gas giant..."></div>
      ${linkedContacts.length ? `<div class="dr-field"><label>Contacts here</label><div class="dr-card-meta">${linkedContacts.map(c => `<a href="#" data-dr-open-entity="contact:${c.id}">${esc(c.name)}</a>`).join(", ")}</div></div>` : ""}
      <div class="dr-field">
        <label>Notes</label>
        ${notesEditorHtml(w.notes)}
      </div>
      ${w.sourceUuid ? `<div class="dr-card-meta">Linked document: <a href="#" data-dr-open-source="${esc(w.sourceUuid)}">Open source</a></div>` : ""}
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save>Save</button>
        ${isEdit ? `<button type="button" class="dr-icon-btn danger" data-dr-delete>Delete</button>` : ""}
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  // Saves the current text selection/cursor position within `editable`
  // (if any) before something that steals focus away from it — a DialogV2
  // prompt, a FilePicker — so it can be restored afterward and the
  // insertion lands where the user actually had their cursor, not
  // wherever focus happens to end up.
  _captureSelection(editable) {
    const sel = window.getSelection();
    if (!editable || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  }

  // Restores a captured selection (or, if none, positions at the end of
  // the editable content) and focuses the editor — call immediately
  // before any execCommand that should act at that position.
  _restoreSelection(editable, range) {
    editable.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (range) {
      sel.addRange(range);
      return;
    }
    const r = document.createRange();
    r.selectNodeContents(editable);
    r.collapse(false);
    sel.addRange(r);
  }

  // Inserts "@Drinax[type:id]{Name}" as plain text at the notes editor's
  // cursor position — this plain text is exactly what the "drinax-link"
  // enricher (registered in the init hook) later matches when rendering
  // notes on a card, turning it into a clickable link.
  async _insertEntityLink() {
    const data = this._data();
    const options = [
      ...data.factions.map(x => ({ value: `faction:${x.id}`, label: `Faction — ${x.name}` })),
      ...data.contacts.map(x => ({ value: `contact:${x.id}`, label: `Contact — ${x.name}` })),
      ...data.worlds.map(x => ({ value: `world:${x.id}`, label: `World — ${x.name}` }))
    ].filter(o => o.value !== `${this.entityType}:${this.entityId}`);
    if (!options.length) { ui.notifications.warn("Nothing else to link to yet."); return; }
    const editable = this.root.querySelector("[data-dr-notes-editable]");
    const savedRange = this._captureSelection(editable);
    const picked = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Link to Entity" },
      content: `<div class="dr-field"><label>Entity</label><select id="dr-link-pick">${options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select></div>`,
      ok: {
        label: "Insert Link",
        callback: (event, button) => button.form.querySelector("#dr-link-pick").value
      },
      rejectClose: false
    }).catch(() => null);
    if (!picked || !editable) return;
    const [type, entId] = picked.split(":");
    const entity = findEntity(type, entId);
    if (!entity) return;
    this._restoreSelection(editable, savedRange);
    document.execCommand("insertText", false, `@Drinax[${type}:${entId}]{${entity.name}}`);
  }

  // Wraps the current selection in a hyperlink, or inserts the URL as new
  // linked text if nothing was selected.
  async _insertHyperlink() {
    const editable = this.root.querySelector("[data-dr-notes-editable]");
    const savedRange = this._captureSelection(editable);
    const hadSelection = !!savedRange && !savedRange.collapsed;
    const url = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Insert Hyperlink" },
      content: `<div class="dr-field"><label>URL</label><input type="text" id="dr-link-url" placeholder="https://..."></div>`,
      ok: {
        label: "Insert",
        callback: (event, button) => button.form.querySelector("#dr-link-url").value.trim()
      },
      rejectClose: false
    }).catch(() => null);
    if (!url || !editable) return;
    this._restoreSelection(editable, savedRange);
    if (hadSelection) document.execCommand("createLink", false, url);
    else document.execCommand("insertHTML", false, `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
  }

  // Opens Foundry's own FilePicker to choose an image, then inserts it at
  // the notes editor's cursor position.
  async _insertImage() {
    const editable = this.root.querySelector("[data-dr-notes-editable]");
    const savedRange = this._captureSelection(editable);
    const FilePickerImpl = foundry.applications.apps.FilePicker.implementation;
    await new Promise(resolve => {
      const fp = new FilePickerImpl({
        type: "image",
        callback: (path) => {
          if (editable) {
            this._restoreSelection(editable, savedRange);
            document.execCommand("insertHTML", false, `<img src="${esc(path)}" style="max-width:100%;">`);
          }
          resolve();
        }
      });
      fp.render(true);
    });
  }

  async _lookupTravellerMap() {
    const nameField = this.root.querySelector("[data-w-name]");
    const resultsEl = this.root.querySelector("[data-dr-tm-results]");
    const query = nameField ? nameField.value.trim() : "";
    if (!query) { ui.notifications.warn("Enter a world name first."); return; }
    if (resultsEl) resultsEl.innerHTML = `<p class="dr-card-meta">Searching Traveller Map…</p>`;
    const results = await searchTravellerMap(query);
    this._tmResults = results;
    if (!resultsEl) return;
    if (results.length === 0) {
      resultsEl.innerHTML = `<p class="dr-card-meta">No matches found on Traveller Map.</p>`;
      return;
    }
    if (results.length === 1) {
      await this._applyTravellerMapResult(0);
      return;
    }
    resultsEl.innerHTML = results.map((r, i) => `
      <div class="dr-tm-result" data-dr-tm-result="${i}">
        <b>${esc(r.name)}</b> &mdash; ${esc(r.sector)} ${esc(r.hex)} <span class="mono">${esc(r.uwp)}</span>
      </div>`).join("");
  }

  // Sets a custom-dropdown field's value/label from code (not a user click) —
  // used when Traveller Map data fills in Controlling faction or Relationship.
  _setCustomSelectValue(dataAttr, value) {
    const hidden = this.root.querySelector(`[${dataAttr}]`);
    if (!hidden) return;
    const wrapper = hidden.closest(".dr-select");
    if (!wrapper) return;
    const opt = wrapper.querySelector(`[data-dr-select-value="${CSS.escape(value)}"]`);
    if (!opt) return;
    hidden.value = value;
    const btn = wrapper.querySelector("[data-dr-select-toggle]");
    if (btn) btn.textContent = opt.textContent;
    wrapper.querySelectorAll("[data-dr-select-value]").forEach(o => o.classList.toggle("selected", o === opt));
  }

  // Recomputes the suggested Relationship for a world that hasn't been saved
  // yet (i.e. this window is in "Add" mode). Never touches an existing
  // world's already-set Relationship.
  _recomputeWorldRelationshipDefault() {
    if (this.entityId) return;
    const name = this.root.querySelector("[data-w-name]")?.value || "";
    const uwp = this.root.querySelector("[data-w-uwp]")?.value || "";
    const factionId = this.root.querySelector("[data-w-faction]")?.value || "";
    const data = this._data();
    const faction = data.factions.find(f => f.id === factionId);
    const relationship = defaultWorldRelationship({ name, factionCategory: faction?.category, uwp });
    this._setCustomSelectValue("data-w-relationship", relationship);
    const effectsEl = this.root.querySelector("[data-dr-relationship-effects]");
    if (effectsEl) effectsEl.innerHTML = relationshipEffectsText(relationship);
  }

  async _applyTravellerMapResult(idx) {
    const r = this._tmResults?.[idx];
    if (!r) return;
    const uwpField = this.root.querySelector("[data-w-uwp]");
    const locationField = this.root.querySelector("[data-w-location]");
    const resultsEl = this.root.querySelector("[data-dr-tm-results]");
    if (uwpField) uwpField.value = r.uwp;
    if (locationField) locationField.value = `${r.sector} ${r.hex}`;
    if (resultsEl) resultsEl.innerHTML = `<p class="dr-card-meta">Filled from Traveller Map: ${esc(r.name)}, ${esc(r.sector)} ${esc(r.hex)}.</p>`;

    // Derive Controlling faction: Drinax itself is a named special case;
    // otherwise Imperium/Aslan Hierate territory is inferred from the
    // world's Allegiance code (Aslan codes carry a clan sub-code after
    // "As", e.g. "AsT9" — we don't track individual clans here, so any
    // "As*" code maps to the single Aslan Hierate faction record).
    const factionField = this.root.querySelector("[data-w-faction]");
    if (factionField && !factionField.value) {
      let targetCategory = null;
      if (r.name.trim().toLowerCase() === "drinax") {
        targetCategory = "drinax";
      } else {
        const allegiance = await fetchWorldAllegiance(r.sector, r.hex);
        if (allegiance.startsWith("As")) targetCategory = "hierate";
        else if (allegiance.startsWith("Im")) targetCategory = "imperium";
      }
      if (targetCategory) {
        const data = this._data();
        const faction = data.factions.find(f => f.category === targetCategory);
        if (faction) this._setCustomSelectValue("data-w-faction", faction.id);
      }
    }

    this._recomputeWorldRelationshipDefault();
  }

  async _save() {
    if (this.entityType === "faction") await this._saveFaction();
    else if (this.entityType === "contact") await this._saveContact();
    else await this._saveWorld();
  }

  async _saveFaction() {
    const root = this.root;
    const name = root.querySelector("[data-f-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a faction name."); return; }
    const standingRaw = root.querySelector("[data-f-standing]").value.trim();
    const standingBaselineRaw = root.querySelector("[data-f-standing-baseline]").value.trim();
    const category = root.querySelector("[data-f-category]").value;
    const fdata = {
      name,
      category,
      disposition: root.querySelector("[data-f-disposition]").value,
      contact: root.querySelector("[data-f-contact]").value.trim(),
      standing: standingRaw === "" ? "" : Number(standingRaw),
      standingBaseline: standingBaselineRaw === "" ? defaultStandingBaseline(category) : Number(standingBaselineRaw),
      notes: this._notesHtml(),
      protected: root.querySelector("[data-f-protected]").checked,
    };
    const data = this._data();
    data.factions = data.factions || [];
    let changes = [];
    if (this.entityId) {
      const idx = data.factions.findIndex(x => x.id === this.entityId);
      const prev = data.factions[idx];
      if (prev.disposition !== fdata.disposition) {
        changes.push({ field: "Disposition", from: dispInfo(prev.disposition).label, to: dispInfo(fdata.disposition).label });
      }
      const prevStanding = typeof prev.standing === "number" ? prev.standing : null;
      const nextStanding = typeof fdata.standing === "number" ? fdata.standing : null;
      if (prevStanding !== nextStanding) {
        changes.push({ field: "Standing", from: prevStanding ?? "—", to: nextStanding ?? "—" });
        fdata.standingUpdatedDay = gameDayIndex();
      }
      data.factions[idx] = { ...prev, ...fdata };
    } else {
      this.entityId = uid();
      data.factions.push({ id: this.entityId, standingUpdatedDay: gameDayIndex(), ...fdata });
    }
    await game.settings.set(MODULE_ID, "data", data);
    refreshOpenWindows();
    this.close();
    if (changes.length) {
      const data2 = this._data();
      await logChange(data2, "Faction", name, changes);
      await game.settings.set(MODULE_ID, "data", data2);
      refreshOpenWindows();
    }
  }

  async _saveContact() {
    const root = this.root;
    const name = root.querySelector("[data-c-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a contact name."); return; }
    const socRaw = root.querySelector("[data-c-soc]").value.trim();
    const cdata = {
      name,
      role: root.querySelector("[data-c-role]").value,
      ac: root.querySelector("[data-c-ac]").value.trim(),
      soc: socRaw === "" ? "" : Number(socRaw),
      location: root.querySelector("[data-c-location]").value || "",
      notes: this._notesHtml(),
    };
    const data = this._data();
    data.contacts = data.contacts || [];
    let changes = [];
    if (this.entityId) {
      const idx = data.contacts.findIndex(x => x.id === this.entityId);
      const prev = data.contacts[idx];
      if ((prev.ac || "") !== (cdata.ac || "")) changes.push({ field: "AC", from: prev.ac || "—", to: cdata.ac || "—" });
      data.contacts[idx] = { ...prev, ...cdata };
    } else {
      this.entityId = uid();
      data.contacts.push({ id: this.entityId, actorUuid: this.prefill?.actorUuid || null, ...cdata });
    }
    await game.settings.set(MODULE_ID, "data", data);
    refreshOpenWindows();
    this.close();
    if (changes.length) {
      const data2 = this._data();
      await logChange(data2, "Contact", name, changes);
      await game.settings.set(MODULE_ID, "data", data2);
      refreshOpenWindows();
    }
  }

  async _saveWorld() {
    const root = this.root;
    const name = root.querySelector("[data-w-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a world name."); return; }
    const wdata = {
      name,
      uwp: root.querySelector("[data-w-uwp]").value.trim(),
      location: root.querySelector("[data-w-location]").value.trim(),
      faction: root.querySelector("[data-w-faction]").value || null,
      relationship: root.querySelector("[data-w-relationship]").value || "neutral",
      status: root.querySelector("[data-w-status]").value.trim(),
      tags: root.querySelector("[data-w-tags]").value.trim(),
      notes: this._notesHtml(),
    };
    const data = this._data();
    data.worlds = data.worlds || [];
    if (this.entityId) {
      const idx = data.worlds.findIndex(x => x.id === this.entityId);
      data.worlds[idx] = { ...data.worlds[idx], ...wdata };
    } else {
      this.entityId = uid();
      data.worlds.push({ id: this.entityId, sourceUuid: this.prefill?.sourceUuid || null, ...wdata });
    }
    await game.settings.set(MODULE_ID, "data", data);
    refreshOpenWindows();
    this.close();
  }
}

// Reset is deliberately tucked away in Foundry's Configure Settings screen
// (Module Settings) rather than the tracker toolbar, so it isn't one click
// away during normal play. Foundry requires a settings-menu "type" to be a
// FormApplication or ApplicationV2 subclass — a plain Dialog is rejected
// with "You must provide a menu type that is a FormApplication or
// ApplicationV2 instance or subclass" — so this overrides render() to show
// a confirm dialog instead of ever opening an actual form window. Built on
// ApplicationV2 (not the deprecated FormApplication) for the same reason as
// DrinaxTrackerApp above.
//
// Shared by the settings-menu entry below and the "/drinax-reset" chat
// command (see the chatMessage hook near the bottom of this file) — both
// are just different ways to trigger the same confirm-then-reset flow.
async function resetTrackerData() {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Reset Drinax Tracker Data" },
    content: "<p>Reset all Drinax Tracker data — factions, contacts, worlds, PRI, and the change log — back to the starting examples? This cannot be undone.</p>"
  });
  if (!ok) return;
  const data = seedData();
  await game.settings.set(MODULE_ID, "data", data);
  // Every open entity window points at data that no longer exists after a
  // full reset — close them all rather than leaving them showing stale ids.
  for (const win of Array.from(entityWindows.values())) {
    if (win.rendered) win.close();
  }
  entityWindows.clear();
  refreshOpenWindows();
  ui.notifications.info("Drinax Tracker data has been reset.");
}

class DrinaxResetMenu extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "drinax-tracker-reset-menu", window: { title: "Reset Drinax Tracker Data" } };

  async render(options) {
    await resetTrackerData();
    return this;
  }
}

// "Use Standard Foundry Styling" — off by default, so nothing changes for
// existing worlds until a GM opts in. When on, the window's custom dark/
// gold theme is replaced with the browser/OS's own system colors and the
// default UI font (see the "dr-standard-look" CSS block in
// styles/drinax-tracker.css), approximating Foundry's own native look
// rather than reproducing it pixel-for-pixel.
function standardLookEnabled() {
  try { return !!game.settings.get(MODULE_ID, "standardLook"); } catch (err) { return false; }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "data", {
    name: "Drinax Tracker Data",
    scope: "world",
    config: false,
    type: Object,
    default: null
  });

  game.settings.register(MODULE_ID, "standardLook", {
    name: "Use Standard Foundry Styling",
    hint: "Replace this module's custom dark/gold theme with Foundry's own default window/button styling.",
    scope: "world",
    config: true,
    type: Boolean,
    // Default on: the custom dark/gold theme was fighting Foundry's own
    // <prose-mirror> notes editor, whose toolbar icons are styled by
    // Foundry's own core CSS assuming Foundry's own (light) editor
    // background — forcing our dark background under them left the icons
    // nearly invisible (confirmed live, 2026-09). Standard look avoids that
    // entirely by matching Foundry's own look everywhere, not just in the
    // editor.
    default: true,
    onChange: () => {
      const app = game.modules.get(MODULE_ID)?.app;
      if (app?.rendered) app.root?.classList.toggle("dr-standard-look", standardLookEnabled());
      for (const win of entityWindows.values()) {
        if (win.rendered) win.root?.classList.toggle("dr-standard-look", standardLookEnabled());
      }
    }
  });

  game.settings.registerMenu(MODULE_ID, "resetData", {
    name: "Reset Tracker Data",
    label: "Reset Data",
    hint: "Reset all Drinax Tracker factions, contacts, worlds, PRI, and the change log back to the starting examples. This cannot be undone.",
    icon: "fa-solid fa-rotate-left",
    type: DrinaxResetMenu,
    restricted: true
  });

  // Custom "@Drinax[type:id]{Label}" content-link syntax, so a Notes editor
  // can link to another faction/contact/world (these aren't real Foundry
  // documents, so they can't use the native "@UUID[...]" syntax) — a real,
  // documented v13 mechanism (CONFIG.TextEditor.enrichers), confirmed
  // against a live system's own usage of it while planning this feature.
  // onRender fires once the enriched element is actually in the DOM, so the
  // click handler always has something real to attach to.
  CONFIG.TextEditor.enrichers.push({
    id: "drinax-link",
    pattern: /@Drinax\[(faction|contact|world):([^\]]+)\](?:\{([^}]+)\})?/g,
    enricher: async (match) => {
      const [, type, entId, label] = match;
      const entity = findEntity(type, entId);
      const a = document.createElement("a");
      a.className = "content-link drinax-link";
      a.dataset.drOpenEntity = `${type}:${entId}`;
      a.innerHTML = `<i class="fa-solid ${entityIcon(type)}"></i>${esc(label || entity?.name || "Unknown")}`;
      return a;
    },
    onRender: (element) => {
      element.querySelectorAll(".drinax-link").forEach(a => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const [type, entId] = a.dataset.drOpenEntity.split(":");
          openEntityWindow(type, entId);
        });
      });
    }
  });
});

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  const openTracker = () => {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can open the Drinax Tracker.");
      return;
    }
    if (!mod.app) mod.app = new DrinaxTrackerApp();
    mod.app.render(true);
  };
  if (mod) mod.api = { open: openTracker };

  // Catch up on any Standing drift accumulated since the world was last open.
  if (game.user.isGM) checkStandingDriftAndPersist();
});

// Re-check Standing drift whenever the GM advances the mgt2e campaign date —
// so it stays current even if nobody has the tracker open when a drift
// threshold is crossed.
Hooks.on("updateSetting", (setting) => {
  if (setting.key === "mgt2e.currentYear" || setting.key === "mgt2e.currentDay") {
    checkStandingDriftAndPersist();
  }
});

// Live-sync: refresh the main tracker window, plus every open entity window,
// when the underlying data changes from elsewhere — a co-GM saving on their
// own session, or this same client's own save. Without this, a window left
// open would silently work from an increasingly stale copy, and its next
// save would overwrite whatever the other GM had just saved (the whole data
// blob is written on every save, not a merge).
Hooks.on("updateSetting", (setting) => {
  if (setting.key !== `${MODULE_ID}.data`) return;
  refreshOpenWindows();
});

// "/drinax-reset" chat command — Foundry has no built-in slash-command
// framework, so this hooks the raw chat entry box directly. Returning false
// from "chatMessage" stops Foundry from posting the text as a normal chat
// message; any other input is left completely alone (returning true) so
// this can never interfere with real chat, rolls, or other modules' own
// commands.
Hooks.on("chatMessage", (chatLog, message) => {
  if (message.trim().toLowerCase() !== "/drinax-reset") return true;
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can reset Drinax Tracker data.");
    return false;
  }
  resetTrackerData();
  return false;
});

// Best-effort button in the Journal Directory header. If Foundry's sidebar
// markup doesn't match (core UI changes between versions), this silently
// does nothing — use the macro below as the reliable way to open the tracker.
Hooks.on("renderJournalDirectory", (app, html) => {
  try {
    if (!game.user.isGM) return;
    const el = html instanceof jQuery ? html[0] : html;
    const header = el.querySelector(".directory-header") || el;
    if (header.querySelector(".drinax-tracker-open-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("drinax-tracker-open-btn");
    btn.innerHTML = '<i class="fa-solid fa-skull-crossbones"></i> Drinax Tracker';
    btn.style.width = "100%";
    btn.addEventListener("click", () => game.modules.get(MODULE_ID)?.api?.open());
    const actions = header.querySelector(".header-actions") || header;
    actions.appendChild(btn);
  } catch (err) {
    console.warn("Drinax Tracker | Could not add sidebar button, use the macro instead.", err);
  }
});
