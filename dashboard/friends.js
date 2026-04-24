import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://fjkybogixlqecziuxfui.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROLE_COLORS = {
  "owner": "#ff4444", "admin": "#ff8800", "mod": "#4255ff",
  "jr-mod": "#84ff00", "vip": "#a855f7", "basic": "#aaaaaa", "visitor": "#888888"
};

let currentUser = null;
let currentProfile = null;
let currentTab = "all";

// ─── INIT ────────────────────────────────────────────────
async function init() {
  let session = null;
  let attempts = 0;
  while (!session && attempts < 5) {
    const { data } = await client.auth.getSession();
    session = data.session;
    if (!session) { attempts++; await new Promise(r => setTimeout(r, 500)); }
  }
  if (!session) { window.location.href = "../index.html"; return; }

  currentUser = session.user;

  await client.from("profiles")
    .update({ is_online: true, last_seen: new Date().toISOString() })
    .eq("id", currentUser.id);

  window.addEventListener("beforeunload", async () => {
    await client.from("profiles")
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq("id", currentUser.id);
  });

  const { data: profile } = await client
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", currentUser.id)
    .single();

  currentProfile = profile;
  populateDropdown(profile);
  setupNavRoles(profile.role);
  loadTab("all");
  loadPendingCount();
}

// ─── DROPDOWN ───────────────────────────────────────────
function populateDropdown(profile) {
  const roleColor = ROLE_COLORS[profile.role] || "#fff";
  const userNameEl = document.getElementById("userName");
  const userEmailEl = document.getElementById("userEmail");
  const roleTag = document.getElementById("userRoleTag");
  const profilePicEl = document.getElementById("profilePic");

  if (userNameEl) { userNameEl.textContent = profile.full_name || "User"; userNameEl.style.color = roleColor; }
  if (userEmailEl) userEmailEl.textContent = currentUser.email;
  if (roleTag) { roleTag.textContent = profile.role; roleTag.style.color = roleColor; roleTag.style.border = `1px solid ${roleColor}`; }
  if (profilePicEl && profile.avatar_url) { profilePicEl.src = profile.avatar_url; profilePicEl.style.borderColor = roleColor; }

  const profilePic = document.getElementById("profilePic");
  const dropdownMenu = document.getElementById("dropdownMenu");
  if (profilePic && dropdownMenu) {
    profilePic.addEventListener("click", e => {
      e.stopPropagation();
      dropdownMenu.style.display = dropdownMenu.style.display === "flex" ? "none" : "flex";
    });
    window.addEventListener("click", e => {
      if (!profilePic.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.style.display = "none";
      }
    });
  }

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await client.from("profiles").update({ is_online: false }).eq("id", currentUser.id);
    await client.auth.signOut();
    window.location.href = "../index.html";
  });
}

// ─── NAV ROLES ──────────────────────────────────────────
function setupNavRoles(role) {
  if (["vip", "jr-mod", "mod", "admin", "owner"].includes(role))
    document.getElementById("nav-vip")?.classList.remove("hidden");
  if (["mod", "admin", "owner"].includes(role))
    document.getElementById("nav-addon")?.classList.remove("hidden");
  if (role === "owner")
    document.getElementById("nav-owner")?.classList.remove("hidden");
}

// ─── TABS ────────────────────────────────────────────────
document.querySelectorAll(".header-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".header-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    loadTab(currentTab);
  });
});

async function loadTab(tab) {
  if (tab === "all") await loadFriends(false);
  else if (tab === "online") await loadFriends(true);
  else if (tab === "pending") await loadPending();
}

// ─── LOAD FRIENDS ────────────────────────────────────────
async function loadFriends(onlineOnly = false) {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>`;

  const { data: friendships } = await client
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  if (!friendships || friendships.length === 0) {
    content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-user-group"></i> No friends yet. Add some!</div>`;
    return;
  }

  const friendIds = friendships.map(f =>
    f.sender_id === currentUser.id ? f.receiver_id : f.sender_id
  );

  const { data: profiles } = await client
    .from("profiles")
    .select("id, full_name, avatar_url, role, is_online, last_seen")
    .in("id", friendIds);

  const filtered = onlineOnly ? profiles.filter(p => p.is_online) : profiles;

  if (!filtered || filtered.length === 0) {
    content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle"></i> No friends ${onlineOnly ? "online" : ""} right now.</div>`;
    return;
  }

  const title = onlineOnly
    ? `<div class="section-title">Online — ${filtered.length}</div>`
    : `<div class="section-title">All Friends — ${filtered.length}</div>`;

  content.innerHTML = title + filtered.map(p => `
    <div class="user-card">
      <div class="user-avatar-wrap">
        <img class="user-avatar" src="${p.avatar_url || ''}" onerror="this.src=''">
        <span class="status-dot ${p.is_online ? 'online' : 'offline'}"></span>
      </div>
      <div class="user-info">
        <div class="user-name" style="color:${ROLE_COLORS[p.role] || '#fff'}">${p.full_name || 'User'}</div>
        <div class="user-status">${p.is_online ? '🟢 Online' : '⚫ Offline'}</div>
      </div>
      <div class="user-actions">
        <button class="btn-message" onclick="startDM('${p.id}')">
          <i class="fa-solid fa-message"></i> Message
        </button>
        <button class="btn-remove" onclick="removeFriend('${p.id}')">
          <i class="fa-solid fa-user-minus"></i>
        </button>
      </div>
    </div>
  `).join("");
}

// ─── LOAD PENDING ────────────────────────────────────────
async function loadPending() {
  const content = document.getElementById("content");
  content.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>`;

  const { data: incoming } = await client
    .from("friendships")
    .select("*, sender:sender_id(id, full_name, avatar_url, role, is_online)")
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending");

  const { data: outgoing } = await client
    .from("friendships")
    .select("*, receiver:receiver_id(id, full_name, avatar_url, role)")
    .eq("sender_id", currentUser.id)
    .eq("status", "pending");

  let html = "";

  if (incoming && incoming.length > 0) {
    html += `<div class="section-title">Incoming Requests — ${incoming.length}</div>`;
    html += incoming.map(f => `
      <div class="user-card">
        <div class="user-avatar-wrap">
          <img class="user-avatar" src="${f.sender.avatar_url || ''}">
          <span class="status-dot ${f.sender.is_online ? 'online' : 'offline'}"></span>
        </div>
        <div class="user-info">
          <div class="user-name" style="color:${ROLE_COLORS[f.sender.role] || '#fff'}">${f.sender.full_name || 'User'}</div>
          <div class="user-status">Wants to be your friend</div>
        </div>
        <div class="user-actions">
          <button class="btn-accept" onclick="acceptFriend('${f.id}')">
            <i class="fa-solid fa-check"></i> Accept
          </button>
          <button class="btn-decline" onclick="declineFriend('${f.id}')">
            <i class="fa-solid fa-x"></i> Decline
          </button>
        </div>
      </div>
    `).join("");
  }

  if (outgoing && outgoing.length > 0) {
    html += `<div class="section-title" style="margin-top:20px;">Outgoing Requests — ${outgoing.length}</div>`;
    html += outgoing.map(f => `
      <div class="user-card">
        <div class="user-avatar-wrap">
          <img class="user-avatar" src="${f.receiver.avatar_url || ''}">
        </div>
        <div class="user-info">
          <div class="user-name" style="color:${ROLE_COLORS[f.receiver.role] || '#fff'}">${f.receiver.full_name || 'User'}</div>
          <div class="user-status">Pending...</div>
        </div>
        <div class="user-actions">
          <button class="btn-pending">⏳ Pending</button>
          <button class="btn-decline" onclick="cancelRequest('${f.id}')">
            <i class="fa-solid fa-x"></i> Cancel
          </button>
        </div>
      </div>
    `).join("");
  }

  if (!html) {
    html = `<div class="empty-state"><i class="fa-solid fa-envelope"></i> No pending requests!</div>`;
  }

  content.innerHTML = html;
}

// ─── PENDING COUNT ───────────────────────────────────────
async function loadPendingCount() {
  const { data } = await client
    .from("friendships")
    .select("id")
    .eq("receiver_id", currentUser.id)
    .eq("status", "pending");

  const badge = document.getElementById("pendingBadge");
  if (badge && data && data.length > 0) {
    badge.innerHTML = `<span class="pending-badge">${data.length}</span>`;
  }
}

// ─── ADD FRIEND MODAL ────────────────────────────────────
document.getElementById("addFriendBtn").addEventListener("click", () => {
  document.getElementById("addFriendModal")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div id="addFriendModal" style="
      position:fixed; top:0; left:0; width:100%; height:100%;
      background:rgba(0,0,0,0.6); z-index:10000;
      display:flex; align-items:center; justify-content:center;
    ">
      <div style="
        background:#11141b; border-radius:12px; padding:30px;
        width:460px; border:1px solid #222; box-shadow:0 0 40px rgba(0,0,0,0.5);
      ">
        <h3 style="margin:0 0 8px 0; font-size:18px;">👥 Add Friend</h3>
        <p style="color:#a0a4b8; font-size:13px; margin:0 0 20px 0;">Search by name to send a friend request.</p>
        <div class="search-bar">
          <input id="friendSearchInput" placeholder="Start typing a name..." />
          <button onclick="searchUsers()"><i class="fa-solid fa-search"></i></button>
        </div>
        <div id="searchResults"></div>
        <div style="margin-top:15px; text-align:right;">
          <button onclick="document.getElementById('addFriendModal').rem

          window.sendFriendRequest = sendFriendRequest;
window.acceptFriend = acceptFriend;
window.declineFriend = declineFriend;
window.cancelRequest = cancelRequest;
window.removeFriend = removeFriend;
window.startDM = startDM;

init();
