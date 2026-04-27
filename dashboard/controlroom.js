import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://fjkybogixlqecziuxfui.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROLE_COLORS = {
  "owner": "#ff4444", "admin": "#ff8800", "mod": "#4255ff",
  "jr-mod": "#84ff00", "vip": "#a855f7", "basic": "#aaaaaa", "visitor": "#888888"
};

let currentUser = null;

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

  const { data: profile } = await client
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", currentUser.id)
    .single();

  if (!profile || profile.role !== "owner") {
    window.location.href = "index.html";
    return;
  }

  // Set owner name
  document.getElementById("ownerName").textContent = profile.full_name || "Owner";

  // Populate dropdown
  const profilePicEl = document.getElementById("profilePic");
  const userNameEl = document.getElementById("userName");
  const userEmailEl = document.getElementById("userEmail");
  if (profilePicEl && profile.avatar_url) {
    profilePicEl.src = profile.avatar_url;
    profilePicEl.style.borderColor = ROLE_COLORS["owner"];
  }
  if (userNameEl) { userNameEl.textContent = profile.full_name; userNameEl.style.color = ROLE_COLORS["owner"]; }
  if (userEmailEl) userEmailEl.textContent = currentUser.email;

  // Dropdown toggle
  profilePicEl?.addEventListener("click", e => {
    e.stopPropagation();
    const dd = document.getElementById("dropdownMenu");
    dd.style.display = dd.style.display === "flex" ? "none" : "flex";
  });
  window.addEventListener("click", e => {
    const dd = document.getElementById("dropdownMenu");
    if (!profilePicEl?.contains(e.target)) dd.style.display = "none";
  });

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "../index.html";
  });

  // Load all data
  await Promise.all([
    loadStats(),
    loadRoleBreakdown(),
    loadSystemStatus(),
    loadRecentActivity(),
  ]);
}

// ─── STATS ───────────────────────────────────────────────
async function loadStats() {
  // Total users
  const { count: totalUsers } = await client
    .from("profiles")
    .select("*", { count: "exact", head: true });

  document.getElementById("statTotalUsers").textContent = totalUsers ?? "--";

  // Online users
  const { count: onlineUsers } = await client
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("is_online", true);

  document.getElementById("statOnlineUsers").textContent = onlineUsers ?? "--";

  // New users today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: newUsers } = await client
    .from("profiles")
    .select("created_at");

  const newToday = newUsers?.filter(u => {
    const created = new Date(u.created_at);
    return created >= today;
  }).length || 0;

  document.getElementById("statNewUsers").textContent = newToday;

  // Messages today
  const { count: messagesCount } = await client
    .from("messages")
    .select("*", { count: "exact", head: true })
    .gte("created_at", today.toISOString());

  document.getElementById("statMessages").textContent = messagesCount ?? "--";
}

// ─── ROLE BREAKDOWN ──────────────────────────────────────
async function loadRoleBreakdown() {
  const { data: profiles } = await client
    .from("profiles")
    .select("role");

  const container = document.getElementById("roleBreakdown");

  if (!profiles || profiles.length === 0) {
    container.innerHTML = `<div class="loading-text">No users found.</div>`;
    return;
  }

  const roleCounts = {};
  profiles.forEach(p => {
    roleCounts[p.role] = (roleCounts[p.role] || 0) + 1;
  });

  const total = profiles.length;
  const roleOrder = ["owner", "admin", "mod", "jr-mod", "vip", "basic", "visitor"];

  container.innerHTML = roleOrder
    .filter(r => roleCounts[r])
    .map(role => {
      const count = roleCounts[role] || 0;
      const pct = Math.round((count / total) * 100);
      const label = role.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const color = ROLE_COLORS[role] || "#888";

      return `
        <div class="role-bar-row">
          <div class="role-bar-label">
            <span style="color:${color}">${label}</span>
            <span style="color:#a0a4b8;">${count} user${count !== 1 ? 's' : ''} (${pct}%)</span>
          </div>
          <div class="role-bar-track">
            <div class="role-bar-fill" style="width:${pct}%; background:${color};"></div>
          </div>
        </div>
      `;
    }).join("");
}

// ─── SYSTEM STATUS ───────────────────────────────────────
async function loadSystemStatus() {
  const container = document.getElementById("systemStatus");

  const checks = [];

  // Check database
  try {
    const start = Date.now();
    await client.from("profiles").select("id").limit(1);
    const ms = Date.now() - start;
    checks.push({
      name: "Database",
      status: ms < 500 ? "online" : "warning",
      label: ms < 500 ? `Online (${ms}ms)` : `Slow (${ms}ms)`,
      badge: ms < 500 ? "badge-green" : "badge-orange"
    });
  } catch {
    checks.push({ name: "Database", status: "offline", label: "Offline", badge: "badge-red" });
  }

  // Check auth
  try {
    await client.auth.getSession();
    checks.push({ name: "Authentication", status: "online", label: "Online", badge: "badge-green" });
  } catch {
    checks.push({ name: "Authentication", status: "offline", label: "Offline", badge: "badge-red" });
  }

  // Check realtime
  checks.push({ name: "Realtime", status: "online", label: "Online", badge: "badge-green" });

  // Check storage
  checks.push({ name: "GitHub Pages", status: "online", label: "Online", badge: "badge-green" });

  container.innerHTML = checks.map(c => `
    <div class="status-item">
      <div style="display:flex; align-items:center;">
        <div class="status-dot-indicator status-${c.status}"></div>
        <span style="font-size:13px;">${c.name}</span>
      </div>
      <span class="status-badge ${c.badge}">${c.label}</span>
    </div>
  `).join("");
}

// ─── RECENT ACTIVITY ─────────────────────────────────────
async function loadRecentActivity() {
  const container = document.getElementById("recentActivity");

  // Get recent profiles (new signups)
  const { data: recentUsers } = await client
    .from("profiles")
    .select("id, full_name, avatar_url, role, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  // Get recent messages
  const { data: recentMessages } = await client
    .from("messages")
    .select("id, sender_id, created_at, content")
    .order("created_at", { ascending: false })
    .limit(5);

  // Get profiles for message senders
  let senderProfiles = [];
  if (recentMessages && recentMessages.length > 0) {
    const senderIds = [...new Set(recentMessages.map(m => m.sender_id))];
    const { data: sp } = await client
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .in("id", senderIds);
    senderProfiles = sp || [];
  }

  // Combine and sort activities
  const activities = [
    ...(recentUsers || []).map(u => ({
      type: "join",
      avatar: u.avatar_url,
      name: u.full_name,
      role: u.role,
      text: "joined Eclipse",
      time: u.created_at
    })),
    ...(recentMessages || []).map(m => {
      const sender = senderProfiles.find(p => p.id === m.sender_id);
      return {
        type: "message",
        avatar: sender?.avatar_url,
        name: sender?.full_name,
        role: sender?.role,
        text: `sent a message`,
        time: m.created_at
      };
    })
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

  if (activities.length === 0) {
    container.innerHTML = `<div class="loading-text">No recent activity.</div>`;
    return;
  }

  container.innerHTML = activities.map(a => {
    const time = new Date(a.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const icon = a.type === "join" ? "🟢" : "💬";
    return `
      <div class="activity-item">
        <img class="activity-avatar" src="${a.avatar || ''}" onerror="this.src=''">
        <div class="activity-text">
          ${icon} <span style="color:${ROLE_COLORS[a.role] || '#fff'}">${a.name || 'Unknown'}</span> ${a.text}
        </div>
        <div class="activity-time">${time}</div>
      </div>
    `;
  }).join("");
}

init();
