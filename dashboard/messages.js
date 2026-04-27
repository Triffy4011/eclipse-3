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
let currentConvId = null;
let messageSubscription = null;

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
  await loadConversations();

  const params = new URLSearchParams(window.location.search);
  const dmId = params.get("dm");
  if (dmId) openConversation(dmId);
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
      if (!profilePic.contains(e.target) && !dropdownMenu.contains(e.target))
        dropdownMenu.style.display = "none";
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

// ─── LOAD CONVERSATIONS ──────────────────────────────────
async function loadConversations() {
  const list = document.getElementById("conversationsList");

  const { data: memberships } = await client
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  if (!memberships || memberships.length === 0) {
    list.innerHTML = `<div style="color:#a0a4b8; font-size:13px; padding:12px;">No conversations yet.</div>`;
    return;
  }

  const convIds = memberships.map(m => m.conversation_id);

  const { data: conversations } = await client
    .from("conversations")
    .select("*")
    .in("id", convIds)
    .order("created_at", { ascending: false });

  if (!conversations || conversations.length === 0) {
    list.innerHTML = `<div style="color:#a0a4b8; font-size:13px; padding:12px;">No conversations yet.</div>`;
    return;
  }

  const { data: allMembers } = await client
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", convIds);

  const allUserIds = [...new Set(allMembers.map(m => m.user_id))];
  const { data: allProfiles } = await client
    .from("profiles")
    .select("id, full_name, avatar_url, role, is_online")
    .in("id", allUserIds);

  const dms = conversations.filter(c => c.type === "dm");
  const groups = conversations.filter(c => c.type === "group");

  let html = "";

  if (dms.length > 0) {
    html += `<div class="section-label">Direct Messages</div>`;
    html += dms.map(conv => {
      const members = allMembers.filter(m => m.conversation_id === conv.id);
      const otherMember = members.find(m => m.user_id !== currentUser.id);
      const otherProfile = allProfiles?.find(p => p.id === otherMember?.user_id);

      return `
        <div class="conv-item ${currentConvId === conv.id ? 'active' : ''}"
          onclick="openConversation('${conv.id}')">
          <div class="conv-avatar-wrap">
            <img class="conv-avatar" src="${otherProfile?.avatar_url || ''}" onerror="this.src=''">
            <span class="conv-status-dot ${otherProfile?.is_online ? 'online' : 'offline'}"></span>
          </div>
          <div class="conv-info">
            <div class="conv-name" style="color:${ROLE_COLORS[otherProfile?.role] || '#fff'}">
              ${otherProfile?.full_name || 'Unknown'}
            </div>
            <div class="conv-preview">Click to open chat</div>
          </div>
        </div>
      `;
    }).join("");
  }

  if (groups.length > 0) {
    html += `<div class="section-label">Group Chats</div>`;
    html += groups.map(conv => `
      <div class="conv-item ${currentConvId === conv.id ? 'active' : ''}"
        onclick="openConversation('${conv.id}')">
        <div class="conv-avatar-wrap">
          <img class="conv-avatar" src="${conv.icon || ''}" 
            onerror="this.style.display='none'" 
            style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
        </div>
        <div class="conv-info">
          <div class="conv-name">${conv.name || 'Group Chat'}</div>
          <div class="conv-preview">Click to open chat</div>
        </div>
      </div>
    `).join("");
  }

  list.innerHTML = html;
}

// ─── OPEN CONVERSATION ───────────────────────────────────
async function openConversation(convId) {
  currentConvId = convId;

  if (messageSubscription) {
    client.removeChannel(messageSubscription);
  }

  document.querySelectorAll(".conv-item").forEach(item => item.classList.remove("active"));
  document.querySelector(`[onclick="openConversation('${convId}')"]`)?.classList.add("active");

  const { data: conv } = await client
    .from("conversations")
    .select("*")
    .eq("id", convId)
    .single();

  const { data: members } = await client
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", convId);

  const memberIds = members.map(m => m.user_id);
  const { data: profiles } = await client
    .from("profiles")
    .select("id, full_name, avatar_url, role, is_online")
    .in("id", memberIds);

  const otherProfile = conv.type === "dm"
    ? profiles.find(p => p.id !== currentUser.id)
    : null;

  const headerAvatar = conv.type === "dm"
    ? `<img class="chat-header-avatar" src="${otherProfile?.avatar_url || ''}" onerror="this.src=''">`
    : `<img class="chat-header-avatar" src="${conv.icon || ''}" onerror="this.src=''" style="border-radius:50%; object-fit:cover;">`;

  const headerName = conv.type === "dm"
    ? `<h3 style="color:${ROLE_COLORS[otherProfile?.role] || '#fff'}">${otherProfile?.full_name || 'Unknown'}</h3>`
    : `<h3>${conv.name || 'Group Chat'}</h3>`;

  const headerStatus = conv.type === "dm"
    ? `<p>${otherProfile?.is_online ? '🟢 Online' : '⚫ Offline'}</p>`
    : `<p>${memberIds.length} members</p>`;

  const chatArea = document.getElementById("chatArea");
  chatArea.innerHTML = `
    <div class="chat-header">
      ${headerAvatar}
      <div class="chat-header-info">
        ${headerName}
        ${headerStatus}
      </div>
    </div>
    <div class="chat-messages" id="chatMessages"></div>
    <div class="chat-input-area">
      <textarea class="chat-input" id="chatInput" 
        placeholder="Message ${conv.type === 'dm' ? otherProfile?.full_name || '...' : conv.name || 'group'}..." 
        rows="1"></textarea>
      <button class="send-btn" id="sendBtn"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  `;

  await loadMessages(convId, profiles);

  document.getElementById("sendBtn").addEventListener("click", () => sendMessage(convId, profiles));

  document.getElementById("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(convId, profiles);
    }
  });

  messageSubscription = client
    .channel(`messages:${convId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `conversation_id=eq.${convId}`
    }, async (payload) => {
      const msg = payload.new;
      const sender = profiles.find(p => p.id === msg.sender_id);
      appendMessage(msg, sender);
      scrollToBottom();
    })
    .subscribe();
}

// ─── LOAD MESSAGES ───────────────────────────────────────
async function loadMessages(convId, profiles) {
  const { data: messages } = await client
    .from("messages")
    .select("*")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(100);

  const container = document.getElementById("chatMessages");
  if (!messages || messages.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:#a0a4b8; font-size:13px; margin-top:40px;">No messages yet. Say hi! 👋</div>`;
    return;
  }

  container.innerHTML = "";
  messages.forEach(msg => {
    const sender = profiles.find(p => p.id === msg.sender_id);
    appendMessage(msg, sender);
  });

  scrollToBottom();
}

// ─── APPEND MESSAGE ──────────────────────────────────────
function appendMessage(msg, sender) {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  const isOwn = msg.sender_id === currentUser.id;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const div = document.createElement("div");
  div.className = "message-group";
  div.innerHTML = `
    <div class="message-row ${isOwn ? 'own-row' : ''}">
      <img class="message-avatar" src="${sender?.avatar_url || ''}" onerror="this.src=''">
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender" style="color:${ROLE_COLORS[sender?.role] || '#fff'}">
            ${isOwn ? 'You' : sender?.full_name || 'Unknown'}
          </span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-bubble ${isOwn ? 'own' : ''}">${escapeHtml(msg.content)}</div>
      </div>
    </div>
  `;

  container.appendChild(div);
}

// ─── SEND MESSAGE ────────────────────────────────────────
async function sendMessage(convId, profiles) {
  const input = document.getElementById("chatInput");
  const content = input.value.trim();
  if (!content) return;

  input.value = "";
  input.style.height = "auto";

  const { error } = await client
    .from("messages")
    .insert({
      conversation_id: convId,
      sender_id: currentUser.id,
      content
    });

  if (error) {
    alert("Failed to send message: " + error.message);
    input.value = content;
  }
}

// ─── NEW DM MODAL ────────────────────────────────────────
document.getElementById("newDmBtn").addEventListener("click", () => {
  document.getElementById("newDmModal")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div id="newDmModal" style="
      position:fixed; top:0; left:0; width:100%; height:100%;
      background:rgba(0,0,0,0.6); z-index:10000;
      display:flex; align-items:center; justify-content:center;
    ">
      <div style="
        background:#11141b; border-radius:12px; padding:30px;
        width:420px; border:1px solid #222; box-shadow:0 0 40px rgba(0,0,0,0.5);
      ">
        <h3 style="margin:0 0 16px 0; font-size:18px;">💬 New Message</h3>
        <input id="dmSearchInput" placeholder="Search friends..." style="
          width:100%; padding:10px; background:#0d0f14;
          border:1px solid #333; border-radius:6px; color:white;
          font-size:14px; box-sizing:border-box; margin-bottom:12px;
        "/>
        <div id="dmSearchResults"></div>
        <div style="margin-top:15px; text-align:right;">
          <button onclick="document.getElementById('newDmModal').remove()" style="
            background:#1a1d26; color:#a0a4b8; padding:10px 16px;
            border-radius:8px; border:none; cursor:pointer; font-size:14px; margin-top:0;
          ">Cancel</button>
        </div>
      </div>
    </div>
  `);

  const input = document.getElementById("dmSearchInput");
  input.focus();
  input.addEventListener("input", async e => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      document.getElementById("dmSearchResults").innerHTML = "";
      return;
    }
    await searchFriendsForDM(query);
  });
});

async function searchFriendsForDM(query) {
  const results = document.getElementById("dmSearchResults");

  const { data: friendships } = await client
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

  if (!friendships || friendships.length === 0) {
    results.innerHTML = `<div style="color:#a0a4b8; font-size:13px;">No friends yet.</div>`;
    return;
  }

  const friendIds = friendships.map(f =>
    f.sender_id === currentUser.id ? f.receiver_id : f.sender_id
  );

  const { data: friends } = await client
    .from("profiles")
    .select("id, full_name, avatar_url, role, is_online")
    .in("id", friendIds)
    .ilike("full_name", `%${query}%`);

  if (!friends || friends.length === 0) {
    results.innerHTML = `<div style="color:#a0a4b8; font-size:13px;">No friends found.</div>`;
    return;
  }

  results.innerHTML = friends.map(f => `
    <div style="
      display:flex; align-items:center; padding:10px 12px;
      background:#1a1d26; border-radius:8px; margin-bottom:6px; cursor:pointer;
      transition:background 0.2s;
    " onmouseover="this.style.background='#222533'" onmouseout="this.style.background='#1a1d26'"
      onclick="startDMFromModal('${f.id}')">
      <div style="position:relative; margin-right:12px;">
        <img src="${f.avatar_url || ''}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
        <span style="position:absolute; bottom:1px; right:1px; width:10px; height:10px; border-radius:50%;
          background:${f.is_online ? '#23a55a' : '#80848e'}; border:2px solid #1a1d26;"></span>
      </div>
      <div>
        <div style="font-size:14px; font-weight:bold; color:${ROLE_COLORS[f.role] || '#fff'}">${f.full_name || 'User'}</div>
        <div style="font-size:12px; color:#a0a4b8;">${f.is_online ? 'Online' : 'Offline'}</div>
      </div>
    </div>
  `).join("");
}

async function startDMFromModal(friendId) {
  document.getElementById("newDmModal")?.remove();

  const { data: existing } = await client
    .from("conversation_members")
    .select("conversation_id, conversations(id, type)")
    .eq("user_id", currentUser.id);

  let dmId = null;
  for (const mem of existing || []) {
    if (mem.conversations?.type === "dm") {
      const { data: otherMem } = await client
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", mem.conversation_id)
        .eq("user_id", friendId);
      if (otherMem && otherMem.length > 0) {
        dmId = mem.conversation_id;
        break;
      }
    }
  }

  if (!dmId) {
    const { data: conv } = await client
      .from("conversations")
      .insert({ type: "dm", created_by: currentUser.id })
      .select()
      .single();

    dmId = conv.id;

    await client.from("conversation_members").insert([
      { conversation_id: dmId, user_id: currentUser.id },
      { conversation_id: dmId, user_id: friendId }
    ]);
  }

  await loadConversations();
  openConversation(dmId);
}

window.openConversation = openConversation;
window.startDMFromModal = startDMFromModal;

// ─── HELPERS ────────────────────────────────────────────
function scrollToBottom() {
  const container = document.getElementById("chatMessages");
  if (container) container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
