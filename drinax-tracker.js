const MODULE_ID = "drinax-tracker";

const FACTION_CATEGORIES = [
  { id: "drinax", label: "Kingdom of Drinax", color: "var(--gold)" },
  { id: "imperium", label: "Third Imperium", color: "var(--imperium)" },
  { id: "aslan", label: "Aslan Hierate Clan", color: "var(--aslan)" },
  { id: "pirate", label: "Pirate Group", color: "var(--pirate)" },
  { id: "other", label: "Other Faction", color: "var(--other)" },
];

const DISPOSITIONS = [
  { id: "hostile", label: "Hostile", color: "var(--red)" },
  { id: "unfriendly", label: "Unfriendly", color: "var(--orange)" },
  { id: "neutral", label: "Neutral", color: "var(--slate)" },
  { id: "friendly", label: "Friendly", color: "var(--teal)" },
  { id: "allied", label: "Allied", color: "var(--gold)" },
];

const WORLD_STATUS_SUGGESTIONS = [
  "Unsurveyed", "Contact made", "Under Drinax control", "Imperial territory",
  "Aslan territory", "Contested", "Pirate haven", "Client world", "Annexed"
];

function catInfo(id) { return FACTION_CATEGORIES.find(c => c.id === id) || FACTION_CATEGORIES[4]; }
function dispInfo(id) { return DISPOSITIONS.find(d => d.id === id) || DISPOSITIONS[2]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) {
  return (s || "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function seedData() {
  return {
    factions: [
      { id: uid(), category: "drinax", name: "The Kingdom of Drinax", disposition: "allied", contact: "", notes: "Edit this entry with your campaign\u2019s current King and court details." },
      { id: uid(), category: "imperium", name: "Third Imperium", disposition: "neutral", contact: "", notes: "Local Imperial presence bordering the Reach \u2014 note down the relevant subsector fleet or consulate here." },
      { id: uid(), category: "aslan", name: "Example Aslan Clan", disposition: "neutral", contact: "", notes: "Rename to the actual clan(s) from your game and track their territory ambitions here." },
      { id: uid(), category: "pirate", name: "Example Pirate Band", disposition: "unfriendly", contact: "", notes: "Rename to a rival or allied pirate crew from your campaign." },
      { id: uid(), category: "other", name: "Example Other Faction", disposition: "neutral", contact: "", notes: "Use this category for corporations, local governments, or other groups." },
    ],
    worlds: [
      { id: uid(), name: "Drinax", uwp: "", location: "", faction: null, status: "Under Drinax control", tags: "homeworld", notes: "The throne world itself \u2014 fill in UWP and current condition." },
    ]
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
    this.state = { factions: [], worlds: [] };
    this.currentTab = "factions";
    this.activeFilter = "all";
  }

  getData() { return {}; }

  async _loadData() {
    let data = game.settings.get(MODULE_ID, "data");
    if (!data) {
      data = seedData();
      await game.settings.set(MODULE_ID, "data", data);
    }
    this.state = { factions: data.factions || [], worlds: data.worlds || [] };
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

    // Delegated clicks for dynamically generated card/filter/drawer content
    root.addEventListener("click", (e) => {
      const filterBtn = e.target.closest("[data-dr-filter]");
      if (filterBtn) { this.activeFilter = filterBtn.dataset.drFilter; this._renderContent(); return; }

      const editFaction = e.target.closest("[data-dr-edit-faction]");
      if (editFaction) { this._openDrawer("faction", editFaction.dataset.drEditFaction); return; }

      const editWorld = e.target.closest("[data-dr-edit-world]");
      if (editWorld) { this._openDrawer("world", editWorld.dataset.drEditWorld); return; }

      const delFaction = e.target.closest("[data-dr-del-faction]");
      if (delFaction) { this._delete("faction", delFaction.dataset.drDelFaction); return; }

      const delWorld = e.target.closest("[data-dr-del-world]");
      if (delWorld) { this._delete("world", delWorld.dataset.drDelWorld); return; }

      const saveFaction = e.target.closest("[data-dr-save-faction]");
      if (saveFaction) { this._saveFaction(saveFaction.dataset.drSaveFaction || null); return; }

      const saveWorld = e.target.closest("[data-dr-save-world]");
      if (saveWorld) { this._saveWorld(saveWorld.dataset.drSaveWorld || null); return; }

      const cancel = e.target.closest("[data-dr-cancel]");
      if (cancel) { this._closeDrawer(); return; }
    });

    this._loadData().then(() => this._renderContent());
  }

  _renderSummary() {
    const el = this.root.querySelector("[data-dr-summary]");
    const chips = FACTION_CATEGORIES.map(c => {
      const n = this.state.factions.filter(f => f.category === c.id).length;
      return `<span class="dr-summary-chip"><b>${n}</b> ${esc(c.label)}</span>`;
    });
    chips.push(`<span class="dr-summary-chip"><b>${this.state.worlds.length}</b> Worlds tracked</span>`);
    el.innerHTML = chips.join("");
  }

  _renderFilters() {
    const el = this.root.querySelector("[data-dr-filters]");
    if (this.currentTab !== "factions") { el.innerHTML = ""; return; }
    let html = `<button type="button" class="dr-filter-chip ${this.activeFilter === "all" ? "active" : ""}" data-dr-filter="all">All</button>`;
    FACTION_CATEGORIES.forEach(c => {
      html += `<button type="button" class="dr-filter-chip ${this.activeFilter === c.id ? "active" : ""}" style="color:${c.color}" data-dr-filter="${c.id}">${esc(c.label)}</button>`;
    });
    el.innerHTML = html;
  }

  _factionCard(f) {
    const cat = catInfo(f.category);
    const disp = dispInfo(f.disposition);
    return `
      <div class="dr-card" style="--cat-color:${cat.color}">
        <div class="dr-card-top"><p class="dr-card-name">${esc(f.name)}</p></div>
        <span class="dr-card-tag">${esc(cat.label)}</span>
        <span class="dr-badge"><span class="dr-dot" style="--dot-color:${disp.color}"></span>${esc(disp.label)}</span>
        ${f.contact ? `<div class="dr-card-meta">Contact: ${esc(f.contact)}</div>` : ""}
        ${f.notes ? `<p class="dr-card-notes">${esc(f.notes)}</p>` : ""}
        <div class="dr-card-actions">
          <button type="button" class="dr-icon-btn" data-dr-edit-faction="${f.id}">Edit</button>
          <button type="button" class="dr-icon-btn danger" data-dr-del-faction="${f.id}">Delete</button>
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
          ? "No factions yet. Add the Kingdom, the Imperium, an Aslan clan, or any pirate crew you\u2019re tracking."
          : "No factions match your search or filter.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(f => this._factionCard(f)).join("");
      }
    } else {
      let list = this.state.worlds.slice();
      if (q) list = list.filter(w => (w.name + " " + (w.notes || "") + " " + (w.status || "") + " " + (w.tags || "")).toLowerCase().includes(q));
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) {
        grid.innerHTML = "";
        empty.style.display = "block";
        empty.textContent = this.state.worlds.length === 0
          ? "No worlds yet. Add the ones your crew has surveyed, raided, or annexed."
          : "No worlds match your search.";
      } else {
        empty.style.display = "none";
        grid.innerHTML = list.map(w => this._worldCard(w)).join("");
      }
    }
  }

  _factionOptionsHtml(selected) {
    return FACTION_CATEGORIES.map(c => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.label)}</option>`).join("");
  }
  _dispositionOptionsHtml(selected) {
    return DISPOSITIONS.map(d => `<option value="${d.id}" ${d.id === selected ? "selected" : ""}>${esc(d.label)}</option>`).join("");
  }
  _worldFactionOptionsHtml(selected) {
    let html = `<option value="">Unclaimed / independent</option>`;
    html += this.state.factions.map(f => `<option value="${f.id}" ${f.id === selected ? "selected" : ""}>${esc(f.name)}</option>`).join("");
    return html;
  }

  _drawerFactionForm(f) {
    const isEdit = !!f;
    f = f || { category: "drinax", disposition: "neutral", name: "", contact: "", notes: "" };
    return `
      <h3>${isEdit ? "Edit faction" : "Add faction"}</h3>
      <div class="dr-field"><label>Name</label><input type="text" data-f-name value="${esc(f.name)}" placeholder="e.g. Clan Ki'shafeni"></div>
      <div class="dr-field"><label>Category</label><select data-f-category>${this._factionOptionsHtml(f.category)}</select></div>
      <div class="dr-field"><label>Disposition toward the party</label><select data-f-disposition>${this._dispositionOptionsHtml(f.disposition)}</select></div>
      <div class="dr-field"><label>Leader / contact</label><input type="text" data-f-contact value="${esc(f.contact)}" placeholder="Named NPC, if any"></div>
      <div class="dr-field"><label>Notes</label><textarea data-f-notes placeholder="Goals, assets, history with the party...">${esc(f.notes)}</textarea></div>
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save-faction="${isEdit ? f.id : ""}">Save</button>
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
      <div class="dr-field"><label>Controlling faction</label><select data-w-faction>${this._worldFactionOptionsHtml(w.faction)}</select></div>
      <div class="dr-field"><label>Status</label><input type="text" list="dr-status-list" data-w-status value="${esc(w.status)}" placeholder="e.g. Contested">
        <datalist id="dr-status-list">${WORLD_STATUS_SUGGESTIONS.map(s => `<option value="${esc(s)}">`).join("")}</datalist>
      </div>
      <div class="dr-field"><label>Tags (comma separated)</label><input type="text" data-w-tags value="${esc(w.tags)}" placeholder="naval base, gas giant..."></div>
      <div class="dr-field"><label>Notes</label><textarea data-w-notes placeholder="Key sites, contacts, events here...">${esc(w.notes)}</textarea></div>
      <div class="dr-drawer-actions">
        <button type="button" class="dr-btn" data-dr-save-world="${isEdit ? w.id : ""}">Save</button>
        <button type="button" class="dr-btn dr-btn-ghost" data-dr-cancel>Cancel</button>
      </div>`;
  }

  _openDrawer(type, id) {
    type = type || (this.currentTab === "factions" ? "faction" : "world");
    const content = this.root.querySelector("[data-dr-drawer-content]");
    if (type === "faction") {
      const f = id ? this.state.factions.find(x => x.id === id) : null;
      content.innerHTML = this._drawerFactionForm(f);
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
  }

  async _saveFaction(id) {
    const root = this.root;
    const name = root.querySelector("[data-f-name]").value.trim();
    if (!name) { ui.notifications.warn("Please enter a faction name."); return; }
    const data = {
      name,
      category: root.querySelector("[data-f-category]").value,
      disposition: root.querySelector("[data-f-disposition]").value,
      contact: root.querySelector("[data-f-contact]").value.trim(),
      notes: root.querySelector("[data-f-notes]").value.trim(),
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
      this.state.worlds.push({ id: uid(), ...data });
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
