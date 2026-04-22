import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://fjkybogixlqecziuxfui.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// All available permissions with friendly labels
const PERMISSIONS = [
  { key: "canBan",             label: "Ban Members",        icon: "fa-ban" },
  { key: "canMute",            label: "Mute Members",       icon: "fa-microphone-slash" },
  { key: "canManageLinks",     label: "Manage Links",       icon: "fa-link" },
  { key: "canManageRoles",     label: "Manage Roles",       icon: "fa-shield-halved" },
  { key: "canManageUsers",     label: "Manage Users",       icon: "fa-users" },
  { key: "canManageEverything",label: "Full Access",        icon: "fa-crown" },
];

// ─── OWNER AUTH CHECK ───────────────────────────────────
async function checkOwner() {
  const securityStatus = document.getElementById("securityStatus");
  const ownerNameEl = document.getElementById("ownerName");

  securityStatus.textContent = "Verifying session and role…";

  const { data: { session }, error: sessionError } = await client.auth.getSession();

  if (sessionError || !session) {
    securityStatus.textContent = "No session found. Redirecting to login…";
    window.location.href = "../index.html";
    return;
  }

  const user = session.user;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    securityStatus.textContent = "No profile found. Redirecting…";
    window.location.href = "index.html";
    return;
  }

  if (ownerNameEl && profile.full_name) {
    ownerNameEl.textContent = profile.full_name;
  }

  if (profile.role !== "owner") {
    securityStatus.textContent = "You are not Owner. Redirecting…";
    window.location.href = "index.html";
    return;
  }

  securityStatus.textContent = "Access granted. You have full Owner permissions.";
  loadRoles();
}

checkOwner();

// ─── LOAD ROLES ─────────────────────────────────────────
async function loadRoles() {
  const rolesList = document.getElementById("rolesList");

  const { data: roles, error } = await client
    .from("roles")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    rolesList.innerHTML = "<p style='color:#ff6b6b'>Error loading roles.</p>";
    return;
  }

  rolesList.innerHTML = roles.map(role => renderRoleCard(role)).join("");

  // Bind toggle events
  rolesList.querySelectorAll(".perm-toggle").forEach(toggle => {
    toggle.addEventListener("change", async (e) => {
      const roleId = e.target.dataset.roleId;
      const permKey = e.target.dataset.perm;
      const checked = e.target.checked;
      await updatePermission(roleId, permKey, checked);
    });
  });
}

// ─── RENDER ROLE CARD ───────────────────────────────────
function renderRoleCard(role) {
  const perms = role.permissions || {};

  const togglesHTML = PERMISSIONS.map(p => `
    <div class="perm-row">
      <div class="perm-label">
        <i class="fa-solid ${p.icon}"></i>
        <span>${p.label}</span>
      </div>
      <label class="toggle-switch">
        <input 
          type="checkbox" 
          class="perm-toggle"
          data-role-id="${role.id}"
          data-perm="${p.key}"
          ${perms[p.key] ? "checked" : ""}
          ${role.name === "Owner" ? "disabled" : ""}
        >
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join("");

  return `
    <div class="role-card" id="role-${role.id}">
      <div class="role-card-header">
        <div class="role-card-title">${getRoleIcon(role.name)} ${role.name}</div>
        <div class="role-card-actions">
          ${role.name !== "Owner" ? `
            <button class="btn-danger-small" onclick="deleteRole('${role.id}', '${role.name}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ""}
        </div>
      </div>
      <div class="perm-grid">
        ${togglesHTML}
      </div>
    </div>
  `;
}

function getRoleIcon(name) {
  const icons = {
    "Owner": "👑",
    "Admin": "🛡️",
    "Mod": "⚔️",
    "Jr. Mod": "🔨",
    "VIP": "⭐",
    "Basic": "⬤",
    "Visitor": "○",
  };
  return icons[name] || "🔵";
}

// ─── UPDATE PERMISSION ──────────────────────────────────
async function updatePermission(roleId, permKey, value) {
  // Get current permissions
  const { data: role } = await client
    .from("roles")
    .select("permissions")
    .eq("id", roleId)
    .single();

  const updated = { ...(role?.permissions || {}), [permKey]: value };

  const { error } = await client
    .from("roles")
    .update({ permissions: updated })
    .eq("id", roleId);

  if (error) {
    alert("Failed to update permission.");
    // Revert toggle visually
    const toggle = document.querySelector(
      `.perm-toggle[data-role-id="${roleId}"][data-perm="${permKey}"]`
    );
    if (toggle) toggle.checked = !value;
  }
}

// ─── CREATE ROLE ────────────────────────────────────────
async function createRole() {
  const name = prompt("Enter new role name:");
  if (!name) return;

  const { error } = await client
    .from("roles")
    .insert({ name, permissions: {} });

  if (error) {
    alert("Error creating role: " + error.message);
    return;
  }

  loadRoles();
}

document.getElementById("createRoleBtn").onclick = createRole;

// ─── DELETE ROLE ────────────────────────────────────────
async function deleteRole(id, name) {
  if (!confirm(`Delete the "${name}" role?`)) return;

  const { error } = await client
    .from("roles")
    .delete()
    .eq("id", id);

  if (error) {
    alert("Error deleting role.");
    return;
  }

  loadRoles();
}

window.deleteRole = deleteRole;
