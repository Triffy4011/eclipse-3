import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://fjkybogixlqecziuxfui.supabase.co";
const SUPABASE_ANON_KEY = "sb-publishable-SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// -----------------------------
// OWNER AUTH CHECK
// -----------------------------
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

  if (profile.role !== "Owner") {
    securityStatus.textContent = "You are not Owner. Redirecting…";
    window.location.href = "index.html";
    return;
  }

  securityStatus.textContent = "Access granted. You have full Owner permissions.";

  // ⭐ Load Phase B UI
  loadRoles();
}

checkOwner();

// -----------------------------
// ROLE MANAGER (PHASE B)
// -----------------------------
async function loadRoles() {
  const rolesList = document.getElementById("rolesList");

  const { data: roles, error } = await client
    .from("roles")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    rolesList.innerHTML = "Error loading roles.";
    return;
  }

  let html = `
    <table style="width:100%; border-collapse:collapse;">
      <tr style="background:#222;">
        <th style="padding:10px; text-align:left;">Role</th>
        <th style="padding:10px; text-align:left;">Permissions</th>
        <th style="padding:10px;">Actions</th>
      </tr>
  `;

  roles.forEach(role => {
    html += `
      <tr style="border-bottom:1px solid #333;">
        <td style="padding:10px;">${role.name}</td>
        <td style="padding:10px; color:#a0a4b8;">${JSON.stringify(role.permissions)}</td>
        <td style="padding:10px;">
          <button onclick="editRole('${role.id}')" style="padding:6px 10px;">Edit</button>
          <button onclick="deleteRole('${role.id}')" style="padding:6px 10px; background:#ff4444; color:white;">Delete</button>
        </td>
      </tr>
    `;
  });

  html += "</table>";

  rolesList.innerHTML = html;
}

window.loadRoles = loadRoles;

// CREATE ROLE
async function createRole() {
  const name = prompt("Enter new role name:");

  if (!name) return;

  const { error } = await client
    .from("roles")
    .insert({ name, permissions: {} });

  if (error) {
    alert("Error creating role.");
    return;
  }

  loadRoles();
}

document.getElementById("createRoleBtn").onclick = createRole;

// DELETE ROLE
async function deleteRole(id) {
  if (!confirm("Delete this role?")) return;

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

// EDIT ROLE
async function editRole(id) {
  const newPerms = prompt("Enter permissions as JSON (example: {\"canBan\":true}):");

  if (!newPerms) return;

  let parsed;
  try {
    parsed = JSON.parse(newPerms);
  } catch {
    alert("Invalid JSON.");
    return;
  }

  const { error } = await client
    .from("roles")
    .update({ permissions: parsed })
    .eq("id", id);

  if (error) {
    alert("Error updating role.");
    return;
  }

  loadRoles();
}

window.editRole = editRole;
