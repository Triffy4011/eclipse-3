import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://fjkybogixlqecziuxfui.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let categories = [];
let currentCategoryId = null;
let dragSrcEl = null;

// ─── INIT ───────────────────────────────────────────────
export async function initSiteEditor() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (profile?.role !== "owner") return;

  injectHTML();
  injectCSS();
  bindEvents();
  await loadCategories();
}

// ─── INJECT HTML ────────────────────────────────────────
function injectHTML() {
  document.body.insertAdjacentHTML("beforeend", `
    <!-- Floating Widget -->
    <div id="siteEditorWidget" title="Site Editor">
      <i class="fa-solid fa-pen-to-square"></i>
    </div>

    <!-- Editor Panel -->
    <div id="siteEditorPanel">
      <div class="editor-header">
        <h2>⚡ Site Editor</h2>
        <button class="editor-close" id="editorClose"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="editor-tabs">
        <button class="editor-tab active" data-tab="categories">Categories</button>
        <button class="editor-tab" data-tab="links">Links</button>
        <button class="editor-tab" data-tab="roles">Role Visibility</button>
      </div>
      <div class="editor-body" id="editorBody"></div>
    </div>

    <!-- Modal -->
    <div class="editor-modal-overlay" id="editorModal">
      <div class="editor-modal">
        <h3 id="modalTitle">Edit</h3>
        <div id="modalBody"></div>
        <div class="modal-actions">
          <button class="btn-cancel" id="modalCancel">Cancel</button>
          <button class="btn-primary" id="modalSave">Save</button>
        </div>
      </div>
    </div>
  `);
}

function injectCSS() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "site-editor.css";
  document.head.appendChild(link);
}

// ─── EVENTS ─────────────────────────────────────────────
function bindEvents() {
  document.getElementById("siteEditorWidget").onclick = togglePanel;
  document.getElementById("editorClose").onclick = togglePanel;
  document.getElementById("modalCancel").onclick = closeModal;

  document.querySelectorAll(".editor-tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function togglePanel() {
  document.getElementById("siteEditorPanel").classList.toggle("open");
}

function closeModal() {
  document.getElementById("editorModal").classList.remove("open");
}

function switchTab(tab) {
  document.querySelectorAll(".editor-tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"]`).classList.add("active");

  if (tab === "categories") renderCategories();
  if (tab === "links") renderLinksTab();
  if (tab === "roles") renderRolesTab();
}

// ─── CATEGORIES ─────────────────────────────────────────
async function loadCategories() {
  const { data } = await client
    .from("categories")
    .select("*, links(*)")
    .order("order_index");
  categories = data || [];
  renderCategories();
}

function renderCategories() {
  const body = document.getElementById("editorBody");
  body.innerHTML = `
    <button class="btn-primary" id="addCategoryBtn" style="margin-bottom:15px; width:100%">
      <i class="fa-solid fa-plus"></i> Add Category
    </button>
    <div id="categoriesList"></div>
  `;

  document.getElementById("addCategoryBtn").onclick = () => openCategoryModal();

  const list = document.getElementById("categoriesList");
  categories.forEach(cat => {
    const card = document.createElement("div");
    card.className = "category-card";
    card.draggable = true;
    card.dataset.id = cat.id;
    card.innerHTML = `
      <div class="category-header">
        <div class="category-name">
          <span>${cat.icon || "📁"}</span>
          <span>${cat.name}</span>
          <span class="visibility-indicator">${cat.visibility || "public"}</span>
        </div>
        <div class="category-actions">
          <button class="btn-small btn-edit" onclick="window.__eclipseEditCategory('${cat.id}')">Edit</button>
          <button class="btn-small btn-delete" onclick="window.__eclipseDeleteCategory('${cat.id}')">Delete</button>
        </div>
      </div>
      <div style="margin-top:8px; font-size:12px; color:#a0a4b8;">
        ${(cat.links || []).length} link(s) — 
        <span style="cursor:pointer; color:#4255ff;" onclick="window.__eclipseToggleLinks('${cat.id}')">
          Manage Links ▾
        </span>
      </div>
      <div class="links-list" id="links-${cat.id}">
        ${renderLinkItems(cat)}
      </div>
    `;

    // Drag to reorder
    card.addEventListener("dragstart", e => {
      dragSrcEl = card;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", e => e.preventDefault());
    card.addEventListener("drop", async e => {
      e.preventDefault();
      if (dragSrcEl !== card) {
        const ids = [...document.querySelectorAll(".category-card")].map(c => c.dataset.id);
        const fromIdx = ids.indexOf(dragSrcEl.dataset.id);
        const toIdx = ids.indexOf(card.dataset.id);
        ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
        await saveNewCategoryOrder(ids);
        card.parentNode.insertBefore(dragSrcEl, fromIdx < toIdx ? card.nextSibling : card);
      }
    });

    list.appendChild(card);
  });

  // Global handlers
  window.__eclipseEditCategory = (id) => openCategoryModal(id);
  window.__eclipseDeleteCategory = (id) => deleteCategory(id);
  window.__eclipseToggleLinks = (id) => {
    const el = document.getElementById(`links-${id}`);
    el.classList.toggle("open");
    currentCategoryId = id;
  };
}

function renderLinkItems(cat) {
  if (!cat.links || cat.links.length === 0) {
    return `<div style="color:#a0a4b8; font-size:12px; padding:8px;">No links yet.</div>`;
  }
  return cat.links.map(link => `
    <div class="link-item" draggable="true" data-link-id="${link.id}">
      <div>
        <div class="link-name"><i class="fa-solid fa-link"></i> ${link.name}</div>
        <div class="link-url">${link.url}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn-small btn-edit" onclick="window.__eclipseEditLink('${link.id}', '${cat.id}')">Edit</button>
        <button class="btn-small btn-delete" onclick="window.__eclipseDeleteLink('${link.id}')">Delete</button>
      </div>
    </div>
  `).join("") + `
    <button class="btn-small btn-edit" style="width:100%; margin-top:8px;" onclick="window.__eclipseAddLink('${cat.id}')">
      + Add Link
    </button>
    <div class="url-dropzone" id="dropzone-${cat.id}">
      🔗 Drag a URL here to instantly add a link
    </div>
  `;
}

// ─── CATEGORY MODAL ─────────────────────────────────────
function openCategoryModal(id = null) {
  const cat = id ? categories.find(c => c.id === id) : null;
  document.getElementById("modalTitle").textContent = cat ? "Edit Category" : "Add Category";
  document.getElementById("modalBody").innerHTML = `
    <div class="form-group">
      <label>Name</label>
      <input id="catName" value="${cat?.name || ""}" placeholder="e.g. Games" />
    </div>
    <div class="form-group">
      <label>Icon (emoji)</label>
      <input id="catIcon" value="${cat?.icon || ""}" placeholder="e.g. 🎮" />
    </div>
    <div class="form-group">
      <label>Color</label>
      <input id="catColor" type="color" value="${cat?.color || "#4255ff"}" />
    </div>
    <div class="form-group">
      <label>Visibility</label>
      <select id="catVisibility">
        <option value="public" ${cat?.visibility === "public" ? "selected" : ""}>Public</option>
        <option value="vip" ${cat?.visibility === "vip" ? "selected" : ""}>VIP Only</option>
        <option value="mod" ${cat?.visibility === "mod" ? "selected" : ""}>Mod+</option>
        <option value="admin" ${cat?.visibility === "admin" ? "selected" : ""}>Admin+</option>
        <option value="owner" ${cat?.visibility === "owner" ? "selected" : ""}>Owner Only</option>
      </select>
    </div>
  `;

  document.getElementById("modalSave").onclick = () => saveCategory(id);
  document.getElementById("editorModal").classList.add("open");
}

async function saveCategory(id) {
  const payload = {
    name: document.getElementById("catName").value,
    icon: document.getElementById("catIcon").value,
    color: document.getElementById("catColor").value,
    visibility: document.getElementById("catVisibility").value,
  };

  if (id) {
    await client.from("categories").update(payload).eq("id", id);
  } else {
    payload.order_index = categories.length;
    await client.from("categories").insert(payload);
  }

  closeModal();
  await loadCategories();
}

async function deleteCategory(id) {
  if (!confirm("Delete this category and all its links?")) return;
  await client.from("categories").delete().eq("id", id);
  await loadCategories();
}

async function saveNewCategoryOrder(ids) {
  for (let i = 0; i < ids.length; i++) {
    await client.from("categories").update({ order_index: i }).eq("id", ids[i]);
  }
}

// ─── LINKS ──────────────────────────────────────────────
function renderLinksTab() {
  const body = document.getElementById("editorBody");
  body.innerHTML = `
    <p style="color:#a0a4b8; font-size:13px;">Select a category from the Categories tab and click "Manage Links" to edit links.</p>
  `;
}

function openLinkModal(categoryId, linkId = null) {
  const cat = categories.find(c => c.id === categoryId);
  const link = linkId ? cat?.links?.find(l => l.id === linkId) : null;

  document.getElementById("modalTitle").textContent = link ? "Edit Link" : "Add Link";
  document.getElementById("modalBody").innerHTML = `
    <div class="url-dropzone" id="linkDropzone">🔗 Drag a URL here or type below</div>
    <div class="form-group">
      <label>Name</label>
      <input id="linkName" value="${link?.name || ""}" placeholder="e.g. UniUB V4" />
    </div>
    <div class="form-group">
      <label>URL</label>
      <input id="linkUrl" value="${link?.url || ""}" placeholder="https://..." />
    </div>
    <div class="form-group">
      <label>Description (optional)</label>
      <input id="linkDesc" value="${link?.description || ""}" placeholder="Short description" />
    </div>
  `;

  // URL drop support
  const dropzone = document.getElementById("linkDropzone");
  dropzone.addEventListener("dragover", e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const url = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text/uri-list");
    if (url) document.getElementById("linkUrl").value = url;
  });

  document.getElementById("modalSave").onclick = () => saveLink(categoryId, linkId);
  document.getElementById("editorModal").classList.add("open");
}

async function saveLink(categoryId, linkId) {
  const payload = {
    category_id: categoryId,
    name: document.getElementById("linkName").value,
    url: document.getElementById("linkUrl").value,
    description: document.getElementById("linkDesc").value,
  };

  if (linkId) {
    await client.from("links").update(payload).eq("id", linkId);
  } else {
    const cat = categories.find(c => c.id === categoryId);
    payload.order_index = (cat?.links || []).length;
    await client.from("links").insert(payload);
  }

  closeModal();
  await loadCategories();
}

async function deleteLink(linkId) {
  if (!confirm("Delete this link?")) return;
  await client.from("links").delete().eq("id", linkId);
  await loadCategories();
}

// ─── ROLES TAB ──────────────────────────────────────────
function renderRolesTab() {
  const body = document.getElementById("editorBody");
  body.innerHTML = `
    <p style="color:#a0a4b8; font-size:13px; margin-bottom:15px;">
      Drag a role badge onto a category to set its visibility.
    </p>
    <div class="role-badges">
  <div class="role-badge owner" draggable="true" data-role="owner">👑 Owner</div>
  <div class="role-badge admin" draggable="true" data-role="admin">🛡️ Admin</div>
  <div class="role-badge mod" draggable="true" data-role="mod">⚔️ Mod</div>
  <div class="role-badge jr-mod" draggable="true" data-role="jr-mod">🔨 Jr. Mod</div>
  <div class="role-badge vip" draggable="true" data-role="vip">⭐ VIP</div>
  <div class="role-badge basic" draggable="true" data-role="basic">⬤ Basic</div>
  <div class="role-badge visitor" draggable="true" data-role="visitor">○ Visitor</div>
</div>
    <div id="roleCategoryList"></div>
  `;

  // Render categories as drop targets
  const list = document.getElementById("roleCategoryList");
  categories.forEach(cat => {
    const div = document.createElement("div");
    div.className = "category-card";
    div.dataset.id = cat.id;
    div.innerHTML = `
      <div class="category-header">
        <div class="category-name">
          <span>${cat.icon || "📁"}</span>
          <span>${cat.name}</span>
        </div>
        <span class="visibility-indicator" id="vis-${cat.id}">${cat.visibility || "public"}</span>
      </div>
    `;

    div.addEventListener("dragover", e => {
      e.preventDefault();
      div.style.borderColor = "#4255ff";
    });
    div.addEventListener("dragleave", () => div.style.borderColor = "");
    div.addEventListener("drop", async e => {
      e.preventDefault();
      div.style.borderColor = "";
      const role = e.dataTransfer.getData("text/plain");
      await client.from("categories").update({ visibility: role }).eq("id", cat.id);
      document.getElementById(`vis-${cat.id}`).textContent = role;
      await loadCategories();
    });

    list.appendChild(div);
  });

  // Make role badges draggable
  document.querySelectorAll(".role-badge").forEach(badge => {
    badge.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", badge.dataset.role);
    });
  });
}

// ─── GLOBAL HANDLERS ────────────────────────────────────
window.__eclipseAddLink = (catId) => openLinkModal(catId);
window.__eclipseEditLink = (linkId, catId) => openLinkModal(catId, linkId);
window.__eclipseDeleteLink = (id) => deleteLink(id);
