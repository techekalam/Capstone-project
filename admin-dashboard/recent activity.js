const searchInput = document.getElementById("searchInput");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const clearLogsBtn = document.getElementById("clearLogsBtn");
const auditTableBody = document.getElementById("auditTableBody");
const emptyMessage = document.getElementById("emptyMessage");

async function loadRecentActivity(providedSession) {
    const supabase = window.supabaseClient;

    if (!supabase) {
        console.error("Supabase client not initialized");
        if (emptyMessage) {
            emptyMessage.textContent = "Database connection failed. Please refresh.";
            emptyMessage.style.display = "block";
        }
        return;
    }

    let session = providedSession;
    if (!session) {
        const { data } = await supabase.auth.getSession();
        session = data ? data.session : null;
    }
    if (!session) return;

    // Use select('*') to avoid 400 errors from non-existent column names
    const reportPromise = supabase
        .from('Reports')
        .select('*')
        .order('created_at', { ascending: false });

    const itemPromise = supabase
        .from('Items')
        .select('*')
        .order('created_at', { ascending: false });

    const profilePromise = supabase
        .from('Profiles')
        .select('*')
        .order('created_at', { ascending: false });

    const [reportResult, itemResult, profileResult] = await Promise.all([
        reportPromise, itemPromise, profilePromise
    ]);

    const reports = reportResult.data;
    const reportError = reportResult.error;
    const items = itemResult.data;
    const itemError = itemResult.error;
    const profiles = profileResult.data;
    const profileError = profileResult.error;

    if (reportError) console.error('Reports fetch error:', reportError);
    if (itemError) console.error('Items fetch error:', itemError);
    if (profileError) console.error('Profiles fetch error:', profileError);

    // Build a role lookup from profiles
    const roleMap = {};
    if (profiles) {
        profiles.forEach(p => { roleMap[p.id] = p.role || 'user'; });
    }

    const activities = [];

    // Account creations from Profiles
    if (profiles) {
        profiles.forEach(p => {
            activities.push({
                date: p.created_at,
                user_id: p.id,
                role: p.role || 'user',
                description: `New account created: ${p.full_name || p.email || 'Unknown'}`,
                status: 'success'
            });
        });
    }

    // Reports
    if (reports) {
        reports.forEach(r => {
            activities.push({
                date: r.created_at || r.date,
                user_id: r.user_id,
                role: roleMap[r.user_id] || 'user',
                description: `Reported a ${r.item_type || r.category || 'lost/found'} item${r.item_name ? ': ' + r.item_name : ''}`,
                status: (r.status || 'pending').toLowerCase()
            });
        });
    }

    // Items
    if (items) {
        items.forEach(i => {
            activities.push({
                date: i.created_at || i.date,
                user_id: i.user_id,
                role: roleMap[i.user_id] || 'user',
                description: `Added item: ${i.item_name || 'Unnamed'}`,
                status: (i.status || 'pending').toLowerCase()
            });
        });
    }

    // Sort by date descending (newest first)
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log(`Loaded ${activities.length} activities (${(reports || []).length} reports, ${(items || []).length} items, ${(profiles || []).length} profiles)`);

    // Populate table
    auditTableBody.innerHTML = '';

    if (activities.length === 0) {
        emptyMessage.textContent = "No activity found in the system yet.";
        emptyMessage.style.display = "block";

        // Show debug info if all queries failed
        if (reportError && itemError && profileError) {
            emptyMessage.textContent = "Failed to load data. Check console for details (possible RLS policy issue).";
        }
        return;
    }

    const formatDateTime = (dateVal) => {
        if (!dateVal) return "—";
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return "—";
        const pad = (n) => n.toString().padStart(2, '0');
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[d.getDay()];
        return `${dayName}, ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    activities.forEach(act => {
        const tr = document.createElement('tr');
        const role = (act.role || 'user').toLowerCase();
        const status = (act.status || 'pending').toLowerCase();
        tr.dataset.role = role;
        tr.dataset.status = status;

        // Shorten the UUID for display
        const shortId = act.user_id ? act.user_id.substring(0, 8) + '...' : '—';

        tr.innerHTML = `
            <td>${formatDateTime(act.date)}</td>
            <td title="${act.user_id || ''}">${shortId}</td>
            <td>${role}</td>
            <td>${act.description}</td>
            <td><span class="status ${status}">${status}</span></td>
        `;
        auditTableBody.appendChild(tr);
    });

    emptyMessage.style.display = "none";
    filterLogs();
}

function filterLogs() {
    const searchValue = (searchInput?.value || "").toLowerCase();
    const selectedRole = (roleFilter?.value || "all").toLowerCase();
    const selectedStatus = (statusFilter?.value || "all").toLowerCase();

    const rows = auditTableBody.querySelectorAll("tr");
    let visibleRows = 0;

    rows.forEach(row => {
        const rowText = row.textContent.toLowerCase();
        const rowRole = row.dataset.role || "user";
        const rowStatus = row.dataset.status || "pending";

        const matchesSearch = rowText.includes(searchValue);
        const matchesRole = selectedRole === "all" || rowRole === selectedRole;
        const matchesStatus = selectedStatus === "all" || rowStatus === selectedStatus;

        if (matchesSearch && matchesRole && matchesStatus) {
            row.style.display = "";
            visibleRows++;
        } else {
            row.style.display = "none";
        }
    });

    emptyMessage.style.display = visibleRows === 0 ? "block" : "none";
    if (visibleRows === 0) {
        emptyMessage.textContent = "No audit logs match your filters.";
    }
}

// Event listeners
if (searchInput) searchInput.addEventListener("input", filterLogs);
if (roleFilter) roleFilter.addEventListener("change", filterLogs);
if (statusFilter) statusFilter.addEventListener("change", filterLogs);
if (clearLogsBtn) {
    clearLogsBtn.addEventListener("click", () => {
        const confirmClear = confirm(
            "Are you sure you want to clear all system audit logs?"
        );
        if (confirmClear) {
            auditTableBody.innerHTML = "";
            emptyMessage.style.display = "block";
            emptyMessage.textContent = "Logs cleared.";
        }
    });
}

// Initial load via onAuthStateChange
if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) loadRecentActivity(session);
    });
}
