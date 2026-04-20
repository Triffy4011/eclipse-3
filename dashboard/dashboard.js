import { createClient } from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL = "https://fjkybogixlqecziuxfui.supabase.co";
const SUPABASE_ANON_KEY = "sb-publishable-SjaaZzJG2Q7SLPSQD3hKOg_9h-BNCk_";
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const profilePicEl = document.getElementById("profilePic");
const dropdownMenu = document.getElementById("dropdownMenu");
const userNameEl = document.getElementById("userName");
const userEmailEl = document.getElementById("userEmail");
const avatarEl = document.getElementById("avatar");

// Nav Items
const navVIP = document.getElementById("nav-vip");
const navAdmin = document.getElementById("nav-addon");
const navOwner = document.getElementById("nav-owner");

async function initDashboard() {
    // 1. Check if user is logged in
    const { data: { user }, error: authError } = await client.auth.getUser();

    if (authError || !user) {
        window.location.href = "signin.html";
        return;
    }

    // 2. Fetch profile data
    const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("role, full_name, avatar_url")
        .eq("id", user.id)
        .single();

    if (profile) {
        userNameEl.textContent = profile.full_name || "User";
        userEmailEl.textContent = user.email;
        
        if (profile.avatar_url) {
            profilePicEl.src = profile.avatar_url;
            if (avatarEl) avatarEl.src = profile.avatar_url;
        }

        // 3. Handle Role Visibility
        if (profile.role === "vip" || profile.role === "admin" || profile.role === "owner") {
            if (navVIP) navVIP.style.display = "block";
        }
        if (profile.role === "admin" || profile.role === "owner") {
            if (navAdmin) navAdmin.style.display = "block";
        }
        if (profile.role === "owner") {
            if (navOwner) navOwner.style.display = "block";
        }
    }
}

// Dropdown Toggle Logic
if (profilePicEl && dropdownMenu) {
    profilePicEl.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdownMenu.style.display = dropdownMenu.style.display === "flex" ? "none" : "flex";
    });

    window.addEventListener("click", (e) => {
        if (!profilePicEl.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownMenu.style.display = "none";
        }
    });
}

// Sign Out
document.getElementById("signOut")?.addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "signin.html";
});

initDashboard();
