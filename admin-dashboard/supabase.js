/* =========================================
   GLOBAL SUPABASE CONFIGURATION & SHARED HELPERS
   Load this file on every page AFTER the Supabase CDN script:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="./supabase.js"></script>
========================================= */

const SUPABASE_URL = "https://kxdijmgscsdukjvieamh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2qIUb1NHjj8LXsm9VKxndQ_-clZakRB";

// Storage bucket used for item/report images
const STORAGE_BUCKET = "item-images";

// login-page path (relative — works from admin-dashboard/ and user-dashboard/)
const LOGIN_URL = '../login-page/login.html';

// Create and expose a shared Supabase client for all pages
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

window.supabaseClient = supabaseClient;

/* =========================================
   AUTH HELPERS
========================================= */

// Helper: is the current page a public auth page?
function isAuthPage() {
  const path = window.location.pathname.toLowerCase();
  return path.includes('login') ||
    path.includes('register') ||
    path.includes('forgot') ||
    path.includes('reset') ||
    path.endsWith('index.html') ||
    path.endsWith('/');
}

// Get the current session (or null if signed out)
async function getSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

// Get the current logged-in user, or null
async function getCurrentUser() {
  const session = await getSession();
  return session ? session.user : null;
}

// Redirect to the login-page if there is no active session.
async function requireAuth(loginUrl = LOGIN_URL) {
  const user = await getCurrentUser();
  if (!user && !isAuthPage()) {
    window.location.replace(loginUrl);
    return null;
  }
  return user;
}

// Log the user out and redirect to the login-page
async function logout(loginUrl = LOGIN_URL) {
  if (supabaseClient) await supabaseClient.auth.signOut();

  // Wipe all client-side auth data
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (e) {
    console.warn('Error clearing storage on logout', e);
  }

  // Replace history entry so back/forward can't return here
  window.location.replace(loginUrl);
}

// Return a friendly display name for a user
function getUserDisplayName(user) {
  if (!user) return "";
  return (user.user_metadata && user.user_metadata.full_name) || user.email || "User";
}

/* =========================================
   PROFILE HELPERS
========================================= */

async function ensureProfile(user) {
  if (!supabaseClient || !user) return;

  const fullName = (user.user_metadata && user.user_metadata.full_name) || user.email;
  const phone = (user.user_metadata && user.user_metadata.phone) || "";

  const { data: existing } = await supabaseClient
    .from("Profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return;

  const { error } = await supabaseClient
    .from("Profiles")
    .insert({
      id: user.id,
      full_name: fullName,
      email: user.email,
      phone: phone
    });

  if (error) {
    console.warn("ensureProfile insert warning:", error.message);
  }
}

/* =========================================
   STORAGE HELPERS
========================================= */

async function uploadItemImage(file, userId) {
  if (!supabaseClient || !file) return null;

  const filePath = `${userId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file);

  if (uploadError) {
    console.error("Image upload failed:", uploadError.message);
    return null;
  }

  const { data } = supabaseClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/* =========================================
   DATA HELPERS (Reports)
========================================= */

async function insertReport(reportData) {
  if (!supabaseClient) return { data: null, error: "Supabase client not initialized" };
  return supabaseClient.from("Reports").insert(reportData);
}

async function fetchMyReports(userId) {
  if (!supabaseClient) return { data: null, error: "Supabase client not initialized" };
  return supabaseClient
    .from("Reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

async function deleteReport(id) {
  if (!supabaseClient) return { data: null, error: "Supabase client not initialized" };
  return supabaseClient.from("Reports").delete().eq("id", id);
}

/* =========================================
   DATA HELPERS (Items)
========================================= */

async function fetchAllItems() {
  if (!supabaseClient) return { data: null, error: "Supabase client not initialized" };
  return supabaseClient
    .from("Items")
    .select("*")
    .order("created_at", { ascending: false });
}

/* =========================================
   AUTH GUARDS — Prevent back/forward button access after logout

   Strategy:
   A) On PROTECTED pages: synchronously check localStorage for a
      Supabase auth token. If missing → hide page, redirect immediately.
      This runs before any rendering, so the page never flashes.

   B) On AUTH pages (login/register): push a fresh history state to
      wipe all forward entries, then trap popstate so the user can
      never navigate forward back into a protected page.
========================================= */

// Synchronous helper — checks localStorage directly (no async/await needed)
function hasValidSession() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const val = JSON.parse(localStorage.getItem(key));
        if (val && val.access_token) return true;
      } catch (e) { /* ignore */ }
    }
  }
  return false;
}

if (isAuthPage()) {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('login') || path.includes('register')) {
    try {
      if (supabaseClient) {
        supabaseClient.auth.signOut().catch(() => {});
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) { /* ignore */ }

    // Wipe forward history entries
    history.pushState(null, '', window.location.href);

    // If user presses Back or Forward while on login-page, trap them on login-page
    window.addEventListener('popstate', function () {
      history.pushState(null, '', window.location.href);
    });
  }
} else {
  // ── A) On any protected page ──────────────────────────────
  // Synchronous gate — if no valid session token in localStorage, hide & redirect
  if (!hasValidSession()) {
    document.documentElement.style.display = 'none';
    window.location.replace(LOGIN_URL);
  }

  // Backup: pageshow fires when browser restores from bfcache (e.g. back/forward navigation)
  window.addEventListener('pageshow', function () {
    if (!hasValidSession()) {
      document.documentElement.style.display = 'none';
      window.location.replace(LOGIN_URL);
    }
  });
}
