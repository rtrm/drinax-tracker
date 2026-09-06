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

function catInfo(id) { return FACTION_CATEGORIES.find(c => c.id === id) || FACTION_CATEGORIES[FACTION_CATEGORIES.length - 1]; }
function dispInfo(id) { return DISPOSITIONS.find(d => d.id === id) || DISPOSITIONS[2]; }
function roleInfo(id) { return CONTACT_ROLES.find(r => r.id === id) || CONTACT_ROLES[0]; }
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

function seedData() {
  return {
    factions: [
      { id: uid(), category: "drinax", name: "The Kingdom of Drinax", disposition: "allied", contact: "", notes: "Edit this entry with your campaign’s current King and court details.", protected: true },
      { id: uid(), category: "imperium", name: "Third Imperium", disposition: "neutral", contact: "", notes: "Local Imperial presence bordering the Reach — note down the relevant subsector fleet or consulate here.", standing: 0, protected: true },
      { id: uid(), category: "hierate", name: "The Aslan Hierate", disposition: "neutral", contact: "", notes: "The Hierate as a whole — track its overall relationship with Drinax here. Individual clans go under Aslan Clan.", standing: -5, protected: true },
      { id: uid(), category: "aslan_clan", name: "Example Aslan Clan", disposition: "neutral", contact: "", notes: "Rename to an actual clan from your game and track its own territory ambitions here — add as many clans as you need.", protected: false },
      { id: uid(), category: "pirate", name: "Example Pirate Band", disposition: "unfriendly", contact: "", notes: "Rename to a rival or allied pirate crew from your campaign.", protected: false },
      { id: uid(), category: "other", name: "Example Other Faction", disposition: "neutral", contact: "", notes: "Use this category for corporations, local governments, or other groups.", protected: false },
    ],
    contacts: [
      { id: uid(), role: "ally", name: "Example Ally Contact", ac: "Dr", soc: 9, notes: "Rename to an NPC ally, informant, or associate from your campaign.", actorUuid: null },
    ],
    worlds: [
      { id: uid(), name: "Drinax", uwp: "", location: "", faction: null, status: "Under Drinax control", tags: "homeworld", notes: "The throne world itself — fill in UWP and current condition.", sourceUuid: null },
    ],
    pri: ""
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
    this.state = { factions: [], contacts: [], worlds: [], pri: "" };
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
    this.state = {
      factions: data.factions || [],
      contacts: data.contacts || [],
      worlds: data.worlds || [],
      pri: data.pri ?? ""
    };
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
        this._renderContent();
      });
    });

    root.querySelector("[data-dr-search]").addEventListener("input", () => this._renderContent());
    root.querySelector("[data-dr-add]").addEventListener("click", () => this._openDrawer());
    root.querySelector("[data-dr-reset]").addEventListener("click", () => this._resetConfirm());
    root.querySelector("[data-dr-overlay]").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this._closeDrawer();
    });

    const priInput = root.querySelector("[data-dr-pri]");
    priInput.addEventListener("change", async () => {
      this.state.pri = priInput.value === "" ? "" : Number(priInput.value);
      await this._saveData();
    });
    const bumpPri = async (delta) => {
      const current = priInput.value === "" ? 0 : Number(priInput.value);
      this.state.pri = current + delta;
      priInput.value = this.state.pri;
      await this._saveData();
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
      const filterBtn = e.target.closest("[data-dr-filter]");
      if (filterBtn) { this.activeFilter = filterBtn.dataset.drFilter; this._renderContent(); return; }

      const editFaction = e.target.closest("[data-dr-edit-faction]");
      if (editFaction) { this._openDrawer("faction", editFaction.dataset.drEditFaction); return; }

      const editContact = e.target.closest("[data-dr-edit-contact]");
      if (editContact) { this._openDrawer("contact", editContact.dataset.drEditContact); return; }

      const editWorld = e.target.closest("[data-dr-edit-world]");
      if (editWorld) { this._openDrawer("world", editWorld.dataset.drEditWorld); return; }

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
        return;
      }

      root.querySelectorAll(".dr-select-menu.open").forEach(m => m.classList.remove("open"));
    });

    // Delegated input for live Asset Value recalculation as SOC changes
    root.addEventListener("input", (e) => {
      if (e.target.matches("[data-c-soc]")) {
        const avField = this.root.querySelector("[data-c-av]");
        if (avField) {
          const av = calcAV(e.target.value);
          avField.value = av === "" ? "" : av;
        }
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
        if (uwp && uwpField) uwpField.value = uwp;
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

  _renderFilters() {
    const el = this.root.querySelector("[data-dr-filters]");
    if (this.currentTab === "factions") {
      let html = `<button type="button" class="dr-filter-chip ${this.activeFilter === "all" ? "active" : ""}" data-dr-filter="all">All</button>`;
      FACTION_CATEGORIES.forEach(c => {
        html += `<button type="button" class="dr-filter-chip ${this.activeFilter === c.id ? "active" : ""}" style="color:${c.color}" data-dr-filter="${c.id}">${esc(c.label)}</button>`;
      });
      el.innerHTML = html;
    } else if (this.currentTab === "contacts") {
      let html = `<button type="button" class="dr-filter-chip ${this.activeFilter === "all" ? "active" : ""}" data-dr-filter="all">All</button>`;
      CONTACT_ROLES.forEach(r => {
        html += `<button type="button" class="dr-filter-chip ${this.activeFilter === r.id ? "active" : ""}" style="color:${r.color}" data-dr-filter="${r.id}">${esc(r.label)}</button>`;
      });
      el.innerHTML = html;
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
    const tags = (w.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    return `
      <div class="dr-card" style="--cat-color:${cat ? cat.color : "var(--border)"}">
        <div class="dr-card-top">
          <p class="dr-card-name">${esc(w.name)}</p>
          ${w.uwp ? `<span class="dr-card-uwp mono">${esc(w.uwp)}</span>` : ""}
        </div>
        ${w.location ? `<div class="dr-card-meta">${esc(w.location)}</div>` : ""}
        ${f ? `<span class="dr-badge" style="color:${cat.color}">${esc(f.name)}</span>` : `<span class="dr-badge">Unclaimed</span>`}
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
    } else {
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
      <div class="dr-field" data-f-standing-wrapper style="${showStanding ? "" : "display:none;"}"><label>Standing</label><input type="number" data-f-standing value="${f.standing === "" || f.standing === null || f.standing === undefined ? "" : f.standing}" placeholder="e.g. -5"></div>
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

  _drawerWorldForm(w) {
    const isEdit = !!w;
    w = w || { name: "", uwp: "", location: "", faction: "", status: "", tags: "", notes: "" };
    return `
      <h3>${isEdit ? "Edit world" : "Add world"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-w-name value="${esc(w.name)}" placeholder="e.g. Cutlass"></div>
      <div class="dr-field"><label>UWP</label><input type="text" class="mono" data-w-uwp value="${esc(w.uwp)}" placeholder="e.g. A788899-C"></div>
      <div class="dr-field"><label>Location (hex / subsector)</label><input type="text" data-w-location value="${esc(w.location)}" placeholder="e.g. 1907 Drinax"></div>
      <div class="dr-field"><label>Controlling faction</label>${this._customSelectHtml("data-w-faction", [{ value: "", label: "Unclaimed / independent" }, ...this.state.factions.map(f => ({ value: f.id, label: f.name }))], w.faction || "")}</div>
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

  async _saveFaction(id) {
    const root = this.root;
    const name = root.querySelector("[data-f-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a faction name."); return; }
    const standingRaw = root.querySelector("[data-f-standing]").value.trim();
    const data = {
      name,
      category: root.querySelector("[data-f-category]").value,
      disposition: root.querySelector("[data-f-disposition]").value,
      contact: root.querySelector("[data-f-contact]").value.trim(),
      standing: standingRaw === "" ? "" : Number(standingRaw),
      notes: root.querySelector("[data-f-notes]").value.trim(),
      protected: root.querySelector("[data-f-protected]").checked,
    };
    if (id) {
      const idx = this.state.factions.findIndex(x => x.id === id);
      this.state.factions[idx] = { ...this.state.factions[idx], ...data };
    } else {
      this.state.factions.push({ id: uid(), ...data });
    }
    await this._saveData();
    this._closeDrawer();
    this._renderContent();
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
    if (id) {
      const idx = this.state.contacts.findIndex(x => x.id === id);
      this.state.contacts[idx] = { ...this.state.contacts[idx], ...data };
    } else {
      this.state.contacts.push({ id: uid(), actorUuid: this._pendingActorUuid || null, ...data });
    }
    await this._saveData();
    this._closeDrawer();
    this._renderContent();
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

  async _resetConfirm() {
    const ok = await Dialog.confirm({
      title: "Reset tracker data",
      content: "<p>Reset all tracker data back to the starting examples? This cannot be undone.</p>"
    });
    if (!ok) return;
    this.state = seedData();
    await this._saveData();
    this.root.querySelector("[data-dr-pri]").value = this.state.pri === "" ? "" : this.state.pri;
    this._renderContent();
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "data", {
    name: "Drinax Tracker Data",
    scope: "world",
    config: false,
    type: Object,
    default: null
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
