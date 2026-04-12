import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const client = createClient(
  "https://fjkybogixlqecziuxfui.supabase.co",
  "sb_publishable_SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_"
);

// Wait for Supabase to restore session
async function loadUser() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    window.location.href = "../index.html";
    return;
  }

  const user = session.user;

  // Update main box info
  document.getElementById("userInfo").innerText =
    `${user.user_metadata.full_name}\n${user.email}`;

  // Update dropdown info
  document.getElementById("userName").innerText = user.user_metadata.full_name;
  document.getElementById("userEmail").innerText = user.email;

  // Update profile picture
  document.getElementById("profilePic").src = user.user_metadata.avatar_url;

  setupDropdown();
}

function setupDropdown() {
  const profilePic = document.getElementById("profilePic");
  const dropdown = document.getElementById("dropdownMenu");

  // Toggle dropdown
  profilePic.addEventListener("click", () => {
    dropdown.style.display = dropdown.style.display === "flex" ? "none" : "flex";
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!profilePic.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = "none";
    }
  });
}

export async function logout() {
  await client.auth.signOut();
  window.location.href = "../index.html";
}

// Load user on page start
loadUser();
