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

// Re-reads the saved data, applies drift, and persists + refreshes the open
// tracker window (if any) — used when the mgt2e campaign date changes while
// nobody has the tracker open.
async function checkStandingDriftAndPersist() {
  if (!game.user.isGM) return;
  let data = game.settings.get(MODULE_ID, "data");
  if (!data) return;
  if (!runStandingDrift(data)) return;
  await game.settings.set(MODULE_ID, "data", data);
  const app = game.modules.get(MODULE_ID)?.app;
  if (app?.rendered) {
    app.state = { factions: data.factions, contacts: data.contacts, worlds: data.worlds, pri: data.pri, log: data.log };
    app._renderContent();
  }
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
      { id: uid(), role: "ally", name: "Example Ally Contact", ac: "Dr", soc: 9, notes: "Rename to an NPC ally, informant, or associate from your campaign.", actorUuid: null },
    ],
    worlds: [
      { id: uid(), name: "Drinax", uwp: "", location: "", faction: drinaxFactionId, status: "Under Drinax control", tags: "homeworld", notes: "The throne world itself — fill in UWP and current condition.", sourceUuid: null, relationship: "haven" },
      { id: uid(), name: "Theev", uwp: "", location: "", faction: null, status: "", tags: "", notes: "", sourceUuid: null, relationship: "friendly" },
    ],
    pri: "",
    log: []
  };
}

class DrinaxTrackerApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "drinax-tracker-app",
      title: "Pirates of Drinax Tracker",
      template: `modules/${MODULE_ID}/templates/tracker.hbs`,
      width: 880,
      height: 680,
      resizable: true,
      classes: ["drinax-tracker-window"]
    });
  }

  constructor(options = {}) {
    super(options);
    this.state = { factions: [], contacts: [], worlds: [], pri: "", log: [] };
    this.currentTab = "factions";
    this.activeFilter = "all";
    this._pendingActorUuid = null;
    this._pendingSourceUuid = null;
  }

  getData() { return {}; }

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
    const drifted = runStandingDrift(data);
    this.state = {
      factions: data.factions || [],
      contacts: data.contacts || [],
      worlds: data.worlds || [],
      pri: data.pri ?? "",
      log: data.log || []
    };
    if (migrated || drifted) await this._saveData();
  }

  async _saveData() {
    await game.settings.set(MODULE_ID, "data", this.state);
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0].querySelector("#drinax-root");
    this.root = root;

    root.querySelectorAll("[data-dr-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.currentTab = btn.dataset.drTab;
        this.activeFilter = "all";
        root.querySelectorAll("[data-dr-tab]").forEach(b => b.classList.toggle("active", b === btn));
        root.querySelector("[data-dr-search]").value = "";
        root.querySelector("[data-dr-add]").style.display = this.currentTab === "log" ? "none" : "";
        this._renderContent();
      });
    });

    root.querySelector("[data-dr-search]").addEventListener("input", () => this._renderContent());
    root.querySelector("[data-dr-add]").addEventListener("click", () => this._openDrawer());
    root.querySelector("[data-dr-overlay]").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this._closeDrawer();
    });

    const priInput = root.querySelector("[data-dr-pri]");
    priInput.addEventListener("change", async () => {
      const prev = this.state.pri;
      const next = priInput.value === "" ? "" : Number(priInput.value);
      this.state.pri = next;
      await this._saveData();
      if (prev !== next) await this._logChange("PRI", "Piracy Response Indicator", [{ field: "PRI", from: prev === "" ? "—" : prev, to: next === "" ? "—" : next }]);
    });
    const bumpPri = async (delta) => {
      const prev = priInput.value === "" ? 0 : Number(priInput.value);
      const next = prev + delta;
      this.state.pri = next;
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

    // Delegated clicks for dynamically generated card/filter/drawer content
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
        this.activeFilter = filterOpt.dataset.drFilterValue;
        this._renderContent();
        return;
      }

      const editFaction = e.target.closest("[data-dr-edit-faction]");
      if (editFaction) { this._openDrawer("faction", editFaction.dataset.drEditFaction); return; }

      const editContact = e.target.closest("[data-dr-edit-contact]");
      if (editContact) { this._openDrawer("contact", editContact.dataset.drEditContact); return; }

      const editWorld = e.target.closest("[data-dr-edit-world]");
      if (editWorld) { this._openDrawer("world", editWorld.dataset.drEditWorld); return; }

      const tmLookup = e.target.closest("[data-dr-tm-lookup]");
      if (tmLookup) { this._lookupTravellerMap(); return; }

      const tmResult = e.target.closest("[data-dr-tm-result]");
      if (tmResult) { this._applyTravellerMapResult(Number(tmResult.dataset.drTmResult)); return; }

      const delFaction = e.target.closest("[data-dr-del-faction]");
      if (delFaction) { this._delete("faction", delFaction.dataset.drDelFaction); return; }

      const delContact = e.target.closest("[data-dr-del-contact]");
      if (delContact) { this._delete("contact", delContact.dataset.drDelContact); return; }

      const delWorld = e.target.closest("[data-dr-del-world]");
      if (delWorld) { this._delete("world", delWorld.dataset.drDelWorld); return; }

      const saveFaction = e.target.closest("[data-dr-save-faction]");
      if (saveFaction) { this._saveFaction(saveFaction.dataset.drSaveFaction || null); return; }

      const saveContact = e.target.closest("[data-dr-save-contact]");
      if (saveContact) { this._saveContact(saveContact.dataset.drSaveContact || null); return; }

      const saveWorld = e.target.closest("[data-dr-save-world]");
      if (saveWorld) { this._saveWorld(saveWorld.dataset.drSaveWorld || null); return; }

      const openActor = e.target.closest("[data-dr-open-actor]");
      if (openActor) { e.preventDefault(); fromUuid(openActor.dataset.drOpenActor).then(doc => doc?.sheet?.render(true)); return; }

      const openSource = e.target.closest("[data-dr-open-source]");
      if (openSource) { e.preventDefault(); fromUuid(openSource.dataset.drOpenSource).then(doc => doc?.sheet?.render(true)); return; }

      const cancel = e.target.closest("[data-dr-cancel]");
      if (cancel) { this._closeDrawer(); return; }

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
          const standingWrapper = this.root.querySelector("[data-f-standing-wrapper]");
          if (standingWrapper) {
            standingWrapper.style.display = STANDING_CATEGORIES.includes(hidden.value) ? "" : "none";
          }
        }
        if (hidden.hasAttribute("data-w-faction")) {
          this._recomputeWorldRelationshipDefault();
        }
        return;
      }

      root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
    });

    // Delegated input for live Asset Value recalculation as SOC changes, and
    // live Relationship-default recalculation as a world's UWP is typed.
    root.addEventListener("input", (e) => {
      if (e.target.matches("[data-c-soc]")) {
        const avField = this.root.querySelector("[data-c-av]");
        if (avField) {
          const av = calcAV(e.target.value);
          avField.value = av === "" ? "" : av;
        }
      }
      if (e.target.matches("[data-w-uwp]")) {
        this._recomputeWorldRelationshipDefault();
      }
    });

    // Auto-lookup on Traveller Map once a world Name is entered, if UWP is
    // still blank. Uses focusout (bubbles), since blur does not. Also
    // recomputes the Relationship default, since Drinax/Theev are named
    // special cases that apply even when UWP is already known.
    root.addEventListener("focusout", (e) => {
      if (e.target.matches("[data-w-name]")) {
        const nameField = e.target;
        const uwpField = this.root.querySelector("[data-w-uwp]");
        if (nameField.value.trim() && uwpField && !uwpField.value.trim()) {
          this._lookupTravellerMap();
        }
        this._recomputeWorldRelationshipDefault();
      }
    });

    this._loadData().then(() => {
      priInput.value = this.state.pri === "" ? "" : this.state.pri;
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
        this._pendingActorUuid = doc.uuid;
        this._openDrawer("contact", null);
        const nameField = this.root.querySelector("[data-c-name]");
        const socField = this.root.querySelector("[data-c-soc]");
        const avField = this.root.querySelector("[data-c-av]");
        if (nameField) nameField.value = doc.name;
        const soc = guessActorSoc(doc);
        if (soc !== "" && socField) {
          socField.value = soc;
          if (avField) avField.value = calcAV(soc);
        }
      } else {
        this._pendingSourceUuid = doc.uuid;
        this._openDrawer("world", null);
        const nameField = this.root.querySelector("[data-w-name]");
        const uwpField = this.root.querySelector("[data-w-uwp]");
        if (nameField) nameField.value = doc.name;
        const uwp = guessWorldUwp(doc);
        if (uwp && uwpField) {
          uwpField.value = uwp;
          this._recomputeWorldRelationshipDefault();
        } else {
          await this._lookupTravellerMap();
        }
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
    if (this.currentTab === "contacts") {
      this._openDrawer("contact", null);
      const nameField = this.root.querySelector("[data-c-name]");
      if (nameField) nameField.value = text;
    } else {
      this._openDrawer("world", null);
      const nameField = this.root.querySelector("[data-w-name]");
      if (nameField) nameField.value = text;
      await this._lookupTravellerMap();
    }
  }

  _renderSummary() {
    const el = this.root.querySelector("[data-dr-summary]");
    const chips = FACTION_CATEGORIES.map(c => {
      const n = this.state.factions.filter(f => f.category === c.id).length;
      return `<span class="dr-summary-chip"><b>${n}</b> ${esc(c.label)}</span>`;
    });
    chips.push(`<span class="dr-summary-chip"><b>${this.state.contacts.length}</b> Contacts</span>`);
    chips.push(`<span class="dr-summary-chip"><b>${this.state.worlds.length}</b> Worlds tracked</span>`);
    el.innerHTML = chips.join("");
  }

  _filterSelectHtml(items, selected) {
    const selectedItem = items.find(it => it.value === selected) || items[0];
    const opts = items.map(it => `<div class="dr-select-opt ${it.value === selected ? "selected" : ""}" data-dr-filter-value="${esc(it.value)}">${esc(it.label)}</div>`).join("");
    return `
      <div class="dr-select dr-filter-select">
        <button type="button" class="dr-select-btn" data-dr-filter-toggle>${esc(selectedItem.label)}</button>
        <div class="dr-select-menu">${opts}</div>
      </div>`;
  }

  _renderFilters() {
    const el = this.root.querySelector("[data-dr-filters]");
    if (this.currentTab === "factions") {
      const items = [{ value: "all", label: "All Categories" }, ...FACTION_CATEGORIES.map(c => ({ value: c.id, label: c.label }))];
      el.innerHTML = this._filterSelectHtml(items, this.activeFilter);
    } else if (this.currentTab === "contacts") {
      const items = [{ value: "all", label: "All Roles" }, ...CONTACT_ROLES.map(r => ({ value: r.id, label: r.label }))];
      el.innerHTML = this._filterSelectHtml(items, this.activeFilter);
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
      <div class="dr-card" style="--cat-color:${cat.color}">
        <div class="dr-card-top"><p class="dr-card-name">${esc(f.name)}</p></div>
        <span class="dr-card-tag">${esc(cat.label)}</span>
        <span class="dr-badge"><span class="dr-dot" style="--dot-color:${disp.color}"></span>${esc(disp.label)}</span>
        ${hasStanding ? `<div class="dr-card-meta">Standing: ${standingLabel}</div>` : ""}
        ${f.contact ? `<div class="dr-card-meta">Contact: ${esc(f.contact)}</div>` : ""}
        ${f.notes ? `<p class="dr-card-notes">${esc(f.notes)}</p>` : ""}
        <div class="dr-card-actions">
          <button type="button" class="dr-icon-btn" data-dr-edit-faction="${f.id}">Edit</button>
          ${f.protected ? "" : `<button type="button" class="dr-icon-btn danger" data-dr-del-faction="${f.id}">Delete</button>`}
        </div>
      </div>`;
  }

  _contactCard(c) {
    const role = roleInfo(c.role);
    const av = calcAV(c.soc);
    const hasSoc = typeof c.soc === "number" && Number.isFinite(c.soc);
    return `
      <div class="dr-card" style="--cat-color:${role.color}">
        <div class="dr-card-top"><p class="dr-card-name">${esc(c.name)}</p></div>
        <span class="dr-card-tag">${esc(role.label)}</span>
        ${c.ac ? `<span class="dr-badge">AC ${esc(c.ac)}</span>` : ""}
        ${hasSoc ? `<div class="dr-card-meta">SOC ${c.soc} &middot; AV ${av}</div>` : ""}
        ${c.notes ? `<p class="dr-card-notes">${esc(c.notes)}</p>` : ""}
        ${c.actorUuid ? `<div class="dr-card-meta"><a href="#" data-dr-open-actor="${esc(c.actorUuid)}">Open actor sheet</a></div>` : ""}
        <div class="dr-card-actions">
          <button type="button" class="dr-icon-btn" data-dr-edit-contact="${c.id}">Edit</button>
          <button type="button" class="dr-icon-btn danger" data-dr-del-contact="${c.id}">Delete</button>
        </div>
      </div>`;
  }

  _worldCard(w) {
    const f = w.faction ? this.state.factions.find(x => x.id === w.faction) : null;
    const cat = f ? catInfo(f.category) : null;
    const rel = relInfo(w.relationship);
    const tags = (w.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    return `
      <div class="dr-card" style="--cat-color:${cat ? cat.color : "var(--border)"}">
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
        ${w.notes ? `<p class="dr-card-notes">${esc(w.notes)}</p>` : ""}
        ${w.sourceUuid ? `<div class="dr-card-meta"><a href="#" data-dr-open-source="${esc(w.sourceUuid)}">Open source document</a></div>` : ""}
        <div class="dr-card-actions">
          <button type="button" class="dr-icon-btn" data-dr-edit-world="${w.id}">Edit</button>
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
      let list = this.state.factions.filter(f => this.activeFilter === "all" || f.category === this.activeFilter);
      if (q) list = list.filter(f => (f.name + " " + (f.notes || "") + " " + (f.contact || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.state.factions.length === 0
          ? "No factions yet. Add the Kingdom, the Imperium, an Aslan clan, or any pirate crew you’re tracking."
          : "No factions match your search or filter.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(f => this._factionCard(f)).join("");
      }
    } else if (this.currentTab === "contacts") {
      let list = this.state.contacts.filter(c => this.activeFilter === "all" || c.role === this.activeFilter);
      if (q) list = list.filter(c => (c.name + " " + (c.notes || "") + " " + (c.ac || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.state.contacts.length === 0
          ? "No contacts yet. Drag an Actor here, or use + Add, to track a contact, ally, or associate."
          : "No contacts match your search or filter.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(c => this._contactCard(c)).join("");
      }
    } else if (this.currentTab === "worlds") {
      let list = this.state.worlds.slice();
      if (q) list = list.filter(w => (w.name + " " + (w.notes || "") + " " + (w.status || "") + " " + (w.tags || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.state.worlds.length === 0
          ? "No worlds yet. Add the ones your crew has surveyed, raided, or annexed, or drag a world entry here."
          : "No worlds match your search.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(w => this._worldCard(w)).join("");
      }
    } else {
      let list = (this.state.log || []).slice();
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

  // Custom dropdown markup used in place of native <select>, since native
  // select popups on this platform ignore our dark theme colors (Windows'
  // combo-box chrome overrides author styling for both the closed box and,
  // in some cases, the popup list). The hidden input keeps the same
  // data-attribute the save methods already query, so nothing else changes.
  _customSelectHtml(dataAttr, items, selected) {
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

  _drawerFactionForm(f) {
    const isEdit = !!f;
    f = f || { category: "drinax", disposition: "neutral", name: "", contact: "", notes: "", standing: "", protected: false };
    const showStanding = STANDING_CATEGORIES.includes(f.category);
    return `
      <h3>${isEdit ? "Edit faction" : "Add faction"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-f-name value="${esc(f.name)}" placeholder="e.g. Clan Ki'shafeni"></div>
      <div class="dr-field"><label>Category</label>${this._customSelectHtml("data-f-category", FACTION_CATEGORIES.map(c => ({ value: c.id, label: c.label })), f.category)}</div>
      <div class="dr-field"><label>Disposition toward the party</label>${this._customSelectHtml("data-f-disposition", DISPOSITIONS.map(d => ({ value: d.id, label: d.label })), f.disposition)}</div>
      <div class="dr-field"><label>Leader / contact</label><input type="text" data-f-contact value="${esc(f.contact)}" placeholder="Named NPC, if any"></div>
      <div data-f-standing-wrapper style="${showStanding ? "" : "display:none;"}">
        <div class="dr-field"><label>Standing</label><input type="number" data-f-standing value="${f.standing === "" || f.standing === null || f.standing === undefined ? "" : f.standing}" placeholder="e.g. -5"></div>
        <div class="dr-field"><label>Standing reverts toward (baseline)</label><input type="number" data-f-standing-baseline value="${f.standingBaseline === "" || f.standingBaseline === null || f.standingBaseline === undefined ? defaultStandingBaseline(f.category) : f.standingBaseline}" placeholder="e.g. 0"></div>
        <p class="dr-card-meta">Standing drifts 1 point toward the baseline for every 30 in-game days elapsed.</p>
      </div>
      <div class="dr-field"><label>Notes</label><textarea data-f-notes placeholder="Goals, assets, history with the party...">${esc(f.notes)}</textarea></div>
      <div class="dr-field dr-field-checkbox"><label><input type="checkbox" data-f-protected ${f.protected ? "checked" : ""}> Protect from deletion</label></div>
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save-faction="${isEdit ? f.id : ""}">Save</button>
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  _drawerContactForm(c) {
    const isEdit = !!c;
    c = c || { role: "contact", name: "", ac: "", soc: "", notes: "", actorUuid: null };
    const av = calcAV(c.soc);
    return `
      <h3>${isEdit ? "Edit contact" : "Add contact"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-c-name value="${esc(c.name)}" placeholder="e.g. Baron Nakamura"></div>
      <div class="dr-field"><label>Role</label>${this._customSelectHtml("data-c-role", CONTACT_ROLES.map(r => ({ value: r.id, label: r.label })), c.role)}</div>
      <div class="dr-field"><label>Allegiance Code (AC)</label><input type="text" list="dr-ac-list" data-c-ac value="${esc(c.ac)}" placeholder="e.g. Dr">
        <datalist id="dr-ac-list">${ALLEGIANCE_SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      </div>
      <div class="dr-field"><label>Social Standing (SOC)</label><input type="number" data-c-soc value="${c.soc === "" || c.soc === null || c.soc === undefined ? "" : c.soc}" placeholder="e.g. 9"></div>
      <div class="dr-field"><label>Asset Value (AV = SOC&sup3;)</label><input type="text" class="dr-field-readonly" data-c-av value="${av === "" ? "" : av}" readonly tabindex="-1"></div>
      <div class="dr-field"><label>Notes</label><textarea data-c-notes placeholder="Background, history with the party...">${esc(c.notes)}</textarea></div>
      ${c.actorUuid ? `<div class="dr-card-meta">Linked actor: <a href="#" data-dr-open-actor="${esc(c.actorUuid)}">Open sheet</a></div>` : ""}
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save-contact="${isEdit ? c.id : ""}">Save</button>
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  _relationshipEffectsText(id) {
    const r = relInfo(id);
    return `Fence ${r.fence} &middot; Recruit ${r.recruitment} &middot; Arrest ${r.riskArrest} &middot; Spies ${r.riskSpies} &middot; Protect ${r.protection}`;
  }

  _drawerWorldForm(w) {
    const isEdit = !!w;
    w = w || { name: "", uwp: "", location: "", faction: "", status: "", tags: "", notes: "", relationship: "neutral" };
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
      <div class="dr-field"><label>Controlling faction</label>${this._customSelectHtml("data-w-faction", [{ value: "", label: "Unclaimed / independent" }, ...this.state.factions.map(f => ({ value: f.id, label: f.name }))], w.faction || "")}</div>
      <div class="dr-field">
        <label>Relationship</label>
        ${this._customSelectHtml("data-w-relationship", WORLD_RELATIONSHIPS.map(r => ({ value: r.id, label: r.label })), w.relationship || "neutral")}
      </div>
      <p class="dr-card-meta" data-dr-relationship-effects>${this._relationshipEffectsText(w.relationship || "neutral")}</p>
      <div class="dr-field"><label>Status</label><input type="text" list="dr-status-list" data-w-status value="${esc(w.status)}" placeholder="e.g. Contested">
        <datalist id="dr-status-list">${WORLD_STATUS_SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      </div>
      <div class="dr-field"><label>Tags (comma separated)</label><input type="text" data-w-tags value="${esc(w.tags)}" placeholder="naval base, gas giant..."></div>
      <div class="dr-field"><label>Notes</label><textarea data-w-notes placeholder="Key sites, contacts, events here...">${esc(w.notes)}</textarea></div>
      ${w.sourceUuid ? `<div class="dr-card-meta">Linked document: <a href="#" data-dr-open-source="${esc(w.sourceUuid)}">Open source</a></div>` : ""}
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save-world="${isEdit ? w.id : ""}">Save</button>
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  _openDrawer(type, id) {
    type = type || (this.currentTab === "factions" ? "faction" : this.currentTab === "contacts" ? "contact" : "world");
    const content = this.root.querySelector("[data-dr-drawer-content]");
    if (type === "faction") {
      const f = id ? this.state.factions.find(x => x.id === id) : null;
      content.innerHTML = this._drawerFactionForm(f);
    } else if (type === "contact") {
      const c = id ? this.state.contacts.find(x => x.id === id) : null;
      content.innerHTML = this._drawerContactForm(c);
    } else {
      const w = id ? this.state.worlds.find(x => x.id === id) : null;
      content.innerHTML = this._drawerWorldForm(w);
      // Editing an existing world saved before a UWP was known — look it up
      // immediately rather than waiting for the GM to touch the Name field.
      if (w && w.name && !w.uwp) this._lookupTravellerMap();
    }
    this.root.querySelector("[data-dr-overlay]").classList.add("open");
    this.root.querySelector("[data-dr-drawer]").classList.add("open");
  }

  _closeDrawer() {
    this.root.querySelector("[data-dr-overlay]").classList.remove("open");
    this.root.querySelector("[data-dr-drawer]").classList.remove("open");
    this._pendingActorUuid = null;
    this._pendingSourceUuid = null;
  }

  // Shows a small dialog asking for an optional reason, used when logging a
  // change to AC, Disposition, PRI, or Standing.
  async _promptReason(title, summary) {
    try {
      const reason = await Dialog.prompt({
        title,
        content: `
          <div class="dr-field"><p class="dr-card-meta">${summary}</p></div>
          <div class="dr-field"><label>Reason (optional)</label><textarea id="dr-reason-input" rows="3"></textarea></div>
        `,
        label: "Log Change",
        callback: (html) => {
          const el = html instanceof jQuery ? html[0] : html;
          return el.querySelector("#dr-reason-input").value.trim();
        },
        rejectClose: false
      });
      return reason || "";
    } catch (err) {
      return "";
    }
  }

  async _logChange(entityType, entityName, changes) {
    if (!changes.length) return;
    const summary = changes.map(c => `${esc(c.field)}: ${esc(String(c.from))} &rarr; ${esc(String(c.to))}`).join("<br>");
    const reason = await this._promptReason(`Log reason — ${entityName}`, summary);
    this.state.log = this.state.log || [];
    this.state.log.unshift({
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

  async _saveFaction(id) {
    const root = this.root;
    const name = root.querySelector("[data-f-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a faction name."); return; }
    const standingRaw = root.querySelector("[data-f-standing]").value.trim();
    const standingBaselineRaw = root.querySelector("[data-f-standing-baseline]").value.trim();
    const category = root.querySelector("[data-f-category]").value;
    const data = {
      name,
      category,
      disposition: root.querySelector("[data-f-disposition]").value,
      contact: root.querySelector("[data-f-contact]").value.trim(),
      standing: standingRaw === "" ? "" : Number(standingRaw),
      standingBaseline: standingBaselineRaw === "" ? defaultStandingBaseline(category) : Number(standingBaselineRaw),
      notes: root.querySelector("[data-f-notes]").value.trim(),
      protected: root.querySelector("[data-f-protected]").checked,
    };
    let changes = [];
    if (id) {
      const idx = this.state.factions.findIndex(x => x.id === id);
      const prev = this.state.factions[idx];
      if (prev.disposition !== data.disposition) {
        changes.push({ field: "Disposition", from: dispInfo(prev.disposition).label, to: dispInfo(data.disposition).label });
      }
      const prevStanding = typeof prev.standing === "number" ? prev.standing : null;
      const nextStanding = typeof data.standing === "number" ? data.standing : null;
      if (prevStanding !== nextStanding) {
        changes.push({ field: "Standing", from: prevStanding ?? "—", to: nextStanding ?? "—" });
        data.standingUpdatedDay = gameDayIndex();
      }
      this.state.factions[idx] = { ...prev, ...data };
    } else {
      this.state.factions.push({ id: uid(), standingUpdatedDay: gameDayIndex(), ...data });
    }
    await this._saveData();
    this._closeDrawer();
    this._renderContent();
    if (changes.length) await this._logChange("Faction", name, changes);
  }

  async _saveContact(id) {
    const root = this.root;
    const name = root.querySelector("[data-c-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a contact name."); return; }
    const socRaw = root.querySelector("[data-c-soc]").value.trim();
    const data = {
      name,
      role: root.querySelector("[data-c-role]").value,
      ac: root.querySelector("[data-c-ac]").value.trim(),
      soc: socRaw === "" ? "" : Number(socRaw),
      notes: root.querySelector("[data-c-notes]").value.trim(),
    };
    let changes = [];
    if (id) {
      const idx = this.state.contacts.findIndex(x => x.id === id);
      const prev = this.state.contacts[idx];
      if ((prev.ac || "") !== (data.ac || "")) {
        changes.push({ field: "AC", from: prev.ac || "—", to: data.ac || "—" });
      }
      this.state.contacts[idx] = { ...prev, ...data };
    } else {
      this.state.contacts.push({ id: uid(), actorUuid: this._pendingActorUuid || null, ...data });
    }
    await this._saveData();
    this._closeDrawer();
    this._renderContent();
    if (changes.length) await this._logChange("Contact", name, changes);
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
  // yet (i.e. the drawer is in "Add" mode) — Save button carries no id in
  // that case. Never touches an existing world's already-set Relationship.
  _recomputeWorldRelationshipDefault() {
    const saveBtn = this.root.querySelector("[data-dr-save-world]");
    if (!saveBtn || saveBtn.dataset.drSaveWorld) return;
    const name = this.root.querySelector("[data-w-name]")?.value || "";
    const uwp = this.root.querySelector("[data-w-uwp]")?.value || "";
    const factionId = this.root.querySelector("[data-w-faction]")?.value || "";
    const faction = this.state.factions.find(f => f.id === factionId);
    const relationship = defaultWorldRelationship({ name, factionCategory: faction?.category, uwp });
    this._setCustomSelectValue("data-w-relationship", relationship);
    const effectsEl = this.root.querySelector("[data-dr-relationship-effects]");
    if (effectsEl) effectsEl.innerHTML = this._relationshipEffectsText(relationship);
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
        const faction = this.state.factions.find(f => f.category === targetCategory);
        if (faction) this._setCustomSelectValue("data-w-faction", faction.id);
      }
    }

    this._recomputeWorldRelationshipDefault();
  }

  async _saveWorld(id) {
    const root = this.root;
    const name = root.querySelector("[data-w-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a world name."); return; }
    const data = {
      name,
      uwp: root.querySelector("[data-w-uwp]").value.trim(),
      location: root.querySelector("[data-w-location]").value.trim(),
      faction: root.querySelector("[data-w-faction]").value || null,
      relationship: root.querySelector("[data-w-relationship]").value || "neutral",
      status: root.querySelector("[data-w-status]").value.trim(),
      tags: root.querySelector("[data-w-tags]").value.trim(),
      notes: root.querySelector("[data-w-notes]").value.trim(),
    };
    if (id) {
      const idx = this.state.worlds.findIndex(x => x.id === id);
      this.state.worlds[idx] = { ...this.state.worlds[idx], ...data };
    } else {
      this.state.worlds.push({ id: uid(), sourceUuid: this._pendingSourceUuid || null, ...data });
    }
    await this._saveData();
    this._closeDrawer();
    this._renderContent();
  }

  async _delete(type, id) {
    const ok = await Dialog.confirm({
      title: "Delete entry",
      content: "<p>Delete this entry? This cannot be undone.</p>"
    });
    if (!ok) return;
    if (type === "faction") {
      this.state.factions = this.state.factions.filter(x => x.id !== id);
      this.state.worlds.forEach(w => { if (w.faction === id) w.faction = null; });
    } else if (type === "contact") {
      this.state.contacts = this.state.contacts.filter(x => x.id !== id);
    } else {
      this.state.worlds = this.state.worlds.filter(x => x.id !== id);
    }
    await this._saveData();
    this._renderContent();
  }
}

// Reset is deliberately tucked away in Foundry's Configure Settings screen
// (Module Settings) rather than the tracker toolbar, so it isn't one click
// away during normal play. Foundry requires a settings-menu "type" to be a
// FormApplication (or ApplicationV2) subclass — a plain Dialog is rejected
// with "You must provide a menu type that is a FormApplication or
// ApplicationV2 instance or subclass" — so this overrides render() to show
// a confirm dialog instead of ever opening an actual form window.
class DrinaxResetMenu extends FormApplication {
  async render() {
    const ok = await Dialog.confirm({
      title: "Reset Drinax Tracker Data",
      content: "<p>Reset all Drinax Tracker data — factions, contacts, worlds, PRI, and the change log — back to the starting examples? This cannot be undone.</p>"
    });
    if (!ok) return this;
    const data = seedData();
    await game.settings.set(MODULE_ID, "data", data);
    const app = game.modules.get(MODULE_ID)?.app;
    if (app?.rendered) {
      app.state = { factions: data.factions, contacts: data.contacts, worlds: data.worlds, pri: data.pri, log: data.log };
      const priInput = app.root.querySelector("[data-dr-pri]");
      if (priInput) priInput.value = data.pri === "" ? "" : data.pri;
      app._renderContent();
    }
    ui.notifications.info("Drinax Tracker data has been reset.");
    return this;
  }

  async _updateObject() { /* never submitted — render() is fully overridden above */ }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "data", {
    name: "Drinax Tracker Data",
    scope: "world",
    config: false,
    type: Object,
    default: null
  });

  game.settings.registerMenu(MODULE_ID, "resetData", {
    name: "Reset Tracker Data",
    label: "Reset Data",
    hint: "Reset all Drinax Tracker factions, contacts, worlds, PRI, and the change log back to the starting examples. This cannot be undone.",
    icon: "fa-solid fa-rotate-left",
    type: DrinaxResetMenu,
    restricted: true
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

// Re-check Standing drift whenever the GM advances the mgt2e campaign date,
// so it stays current even if nobody has the tracker open.
Hooks.on("updateSetting", (setting) => {
  if (setting.key === "mgt2e.currentYear" || setting.key === "mgt2e.currentDay") {
    checkStandingDriftAndPersist();
  }
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
