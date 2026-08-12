
/* =========================================
   STATE
========================================= */
const state = {
    activeSection: 'dashboard-view',
    admin: {
        name: 'Admin User',
        email: 'admin@cavendish.ac.ug',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80'
    },
    reports: [],
    items: [],
    users: [],
    claims: [],
    activities: []
};

/* =========================================
   DATA LOADING (Supabase)
========================================= */
async function loadDashboardData() {
    // Load reports from the database
    const { data: reports, error: reportError } = await window.supabaseClient
        .from('Reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (!reportError && reports) {
        state.reports = reports.map(r => ({
            id: r.id,
            itemName: r.item_name || r.category || 'Unnamed item',
            category: r.category || 'Other',
            itemType: r.item_type || r.type || '',
            location: r.location || '',
            date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
            user: r.user_id || '',
            status: r.status || 'Pending'
        }));
    } else if (reportError) {
        console.error('Failed to load reports:', reportError);
    }

    // Load items from the database
    const { data: items, error: itemError } = await window.supabaseClient
        .from('Items')
        .select('*')
        .order('created_at', { ascending: false });

    if (!itemError && items) {
        state.items = items.map(i => ({
            id: i.id,
            itemName: i.item_name || 'Unnamed item',
            category: i.category || 'Other',
            type: i.type || 'Found',
            location: i.location || '',
            imageUrl: i.image_url || '',
            status: i.status || 'Unclaimed'
        }));
    } else if (itemError) {
        console.error('Failed to load items:', itemError);
    }

    // Load user profiles (for account activity + user management table)
    const { data: profiles, error: profileError } = await window.supabaseClient
        .from('Profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (!profileError && profiles) {
        state.users = profiles.map(p => ({
            id: p.id,
            name: p.full_name || p.email || 'User',
            email: p.email || '',
            role: p.role || 'Student',
            regDate: p.created_at ? new Date(p.created_at).toLocaleDateString() : '',
            createdAt: p.created_at || null   // raw ISO date for activity feed
        }));
    } else if (profileError) {
        console.error('Failed to load profiles:', profileError);
    }

    // Load claims from database
    const { data: dbClaims, error: claimError } = await window.supabaseClient
        .from('Claims')
        .select('*')
        .order('created_at', { ascending: false });

    if (!claimError && dbClaims) {
        state.claims = dbClaims.map(c => ({
            id: c.id,
            claimantName: c.item_name || 'Item Claim',
            itemClaimed: c.item_name || 'Item',
            description: `Reason: ${c.claim_reason || ''} | Proof: ${c.proof_details || ''}`,
            dateSubmitted: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
            status: c.status || 'Pending'
        }));
    } else if (claimError) {
        console.warn('Failed to load claims in admin:', claimError);
    }

    // Build a unified activity feed (account creations, reports, items)
    buildActivities(reports, items);

    // Render the dashboard once data is loaded
    updateStats();
    renderActiveSection();
}

/* Build a chronological activity feed combining profiles, reports, and items */
function buildActivities(reports, items) {
    const activities = [];

    // Account creations (from Profiles)
    state.users.forEach(u => {
        if (!u.createdAt) return; // skip if no date at all
        activities.push({
            date: new Date(u.createdAt),
            type: 'Account',
            title: 'New account created',
            detail: `${u.name} (${u.email}) registered`,
            user: u.name,
            status: 'Success'
        });
    });

    // Reports made
    if (reports) {
        reports.forEach(r => {
            activities.push({
                date: r.created_at ? new Date(r.created_at) : new Date(),
                type: 'Report',
                title: 'Report submitted',
                detail: `${r.item_name || r.category || 'Item'} reported as ${r.item_type || 'lost/found'}`,
                user: r.user_id || '',
                status: r.status || 'Pending'
            });
        });
    }

    // Items added
    if (items) {
        items.forEach(i => {
            activities.push({
                date: i.created_at ? new Date(i.created_at) : new Date(),
                type: 'Item',
                title: 'Item added',
                detail: `${i.item_name || 'Item'} (${i.type || 'Found'}) at ${i.location || 'unknown location'}`,
                user: i.user_id || '',
                status: i.status || 'Unclaimed'
            });
        });
    }

    // Sort newest first
    activities.sort((a, b) => b.date - a.date);
    state.activities = activities;
}

/* =========================================
  INITIALIZATION & SETUP
========================================= */
document.addEventListener("DOMContentLoaded", () => {
    // Prevent back-button access to cached pages after logout
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) {
            window.location.reload();
        }
    });

    // Wire up navigation immediately — don't wait for auth
    setupNavigation();

    if (!window.supabaseClient) {
        updateStats();
        renderActiveSection();
        return;
    }

    let handlersAttached = false;

    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.replace("../login-page/login.html");
            return;
        }

        if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return;

        const user = session.user;
        const emailLower = (user.email || '').toLowerCase();

        // Fetch profile once
        let { data: profile } = await window.supabaseClient
            .from('Profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        let userRole = profile && profile.role ? profile.role.toLowerCase() : '';

        // Auto-upgrade role if email contains 'admin'
        if (userRole !== 'admin' && emailLower.includes('admin')) {
            userRole = 'admin';
            window.supabaseClient.from('Profiles').upsert({
                id: user.id,
                full_name: (user.user_metadata && user.user_metadata.full_name) || user.email,
                email: user.email,
                role: 'admin'
            }).then(() => {}).catch(err => console.warn('Role auto-upgrade warning:', err));
        }

        if (userRole !== 'admin') {
            console.warn("User is not an admin. Role:", userRole, "Email:", user.email);
            window.location.replace("../login-page/login.html");
            return;
        }

        // Store the actual role string (original casing) for Claims Officer check
        state.currentUserRole = (profile && profile.role) ? profile.role : '';

        state.admin = {
            name: (profile && profile.full_name) || user.user_metadata?.full_name || user.email || 'Admin',
            email: (profile && profile.email) || user.email || '',
            role: 'Admin',
            avatarUrl: (profile && profile.avatar_url) ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80'
        };

        const roleEl = document.getElementById("profile-admin-role");
        if (roleEl) roleEl.textContent = state.admin.role;
        const miniName = document.getElementById("mini-admin-name");
        if (miniName) miniName.textContent = state.admin.name;
        const miniAvatar = document.getElementById("mini-admin-avatar");
        if (miniAvatar) miniAvatar.src = state.admin.avatarUrl;
        const profName = document.getElementById("profile-admin-name");
        if (profName) profName.textContent = state.admin.name;
        const profEmail = document.getElementById("profile-admin-email");
        if (profEmail) profEmail.textContent = state.admin.email;
        const profAvatar = document.getElementById("profile-admin-avatar");
        if (profAvatar) profAvatar.src = state.admin.avatarUrl;

        // Attach one-time UI handlers
        if (!handlersAttached) {
            handlersAttached = true;

            document.getElementById('change-pwd-btn')?.addEventListener('click', async () => {
                const newPwd = prompt('Enter new password (at least 6 characters):');
                if (!newPwd) return;
                const { error } = await window.supabaseClient.auth.updateUser({ password: newPwd });
                if (error) alert('Password update failed: ' + error.message);
                else alert('Password updated successfully!');
            });

            document.getElementById('profile-admin-name')?.addEventListener('click', async () => {
                const newName = prompt('Enter new display name:');
                if (!newName) return;
                const { error } = await window.supabaseClient.from('Profiles').upsert({
                    id: user.id,
                    full_name: newName,
                    email: user.email,
                    role: profile?.role || 'Admin'
                });
                if (error) alert('Profile update failed: ' + error.message);
                else {
                    alert('Profile updated!');
                    state.admin.name = newName;
                    document.getElementById('mini-admin-name').textContent = newName;
                    document.getElementById('profile-admin-name').textContent = newName;
                }
            });

            setupFilters();
            setupSearch();
            setupModals();
        }


        // Start 5-second refresh interval
        if (state.refreshInterval) clearInterval(state.refreshInterval);
        state.refreshInterval = setInterval(loadDashboardData, 5000);

        await loadDashboardData();
    });
});


function setupNavigation() {
    const navButtons = document.querySelectorAll(".nav-btn[data-section]");

    navButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const targetSection = btn.getAttribute("data-section");
            if (!targetSection) return;
            state.activeSection = targetSection;
            document.querySelectorAll(".nav-btn[data-section]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderActiveSection();
        });
    });

    const shortcutBtn = document.getElementById("all-reports-shortcut-btn");
    if (shortcutBtn) {
        shortcutBtn.addEventListener("click", () => {
            switchSection("reports-view");
        });
    }

    const handleLogout = async (e) => {
        if (e) e.preventDefault();
        try {
            if (window.supabaseClient) {
                await window.supabaseClient.auth.signOut();
            }
        } catch (err) {
            console.error('Logout error:', err);
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace("../login-page/login.html");
    };

    const logoutSidebar = document.getElementById("logout-sidebar-btn");
    if (logoutSidebar) {
        logoutSidebar.addEventListener("click", handleLogout);
    }

    const logoutProfile = document.getElementById("logout-profile-btn");
    if (logoutProfile) {
        logoutProfile.addEventListener("click", handleLogout);
    }
}

function switchSection(sectionId) {
    state.activeSection = sectionId;
   
    const navButtons = document.querySelectorAll(".nav-btn:not(.logout-btn)");
    navButtons.forEach(btn => {
        if(btn.getAttribute("data-section") === sectionId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    renderActiveSection();
}

function renderActiveSection() {
    const sections = document.querySelectorAll(".dashboard-section");
    sections.forEach(sec => sec.classList.add("hidden"));
    
    const activeSec = document.getElementById(state.activeSection);
    if(activeSec) {
        activeSec.classList.remove("hidden");
    }

  
    const titleMapping = {
        'dashboard-view': 'Dashboard Overview',
        'reports-view': 'Manage Submitted Reports',
        'items-view': 'Manage Lost & Found Items',
        'users-view': 'Campus Registered Users',
        'claims-view': 'Claims Verification Desk',
        'activity-view': 'Recent System Activity',
        'profile-view': 'Admin User Profile'
    };
    
    document.getElementById("current-section-title").textContent = titleMapping[state.activeSection] || "admin-dashboard";

    switch(state.activeSection) {
        case 'dashboard-view':
            renderOverview();
            break;
        case 'reports-view':
            renderReports();
            break;
        case 'items-view':
            renderItems();
            break;
        case 'users-view':
            renderUsers();
            break;
        case 'claims-view':
            renderClaims();
            break;
        case 'activity-view':
            renderOverview();
            break;
    }
}

function updateStats() {
    const totalReports = state.reports.length;
    
    // Lost Items count (across Items and Reports)
    const lostFromItems = state.items.filter(item => (item.type || '').toLowerCase().includes('lost')).length;
    const lostFromReports = state.reports.filter(rep => (rep.itemType || rep.category || '').toLowerCase().includes('lost')).length;
    const lostItemsCount = lostFromItems + lostFromReports;
   
    // Found Items count (across Items and Reports)
    const foundFromItems = state.items.filter(item => (item.type || '').toLowerCase().includes('found')).length;
    const foundFromReports = state.reports.filter(rep => (rep.itemType || rep.category || '').toLowerCase().includes('found')).length;
    const foundItemsCount = foundFromItems + foundFromReports;
    
    // Pending Reports count
    const pendingReportsCount = state.reports.filter(rep => (rep.status || '').toLowerCase() === 'pending' || (rep.status || '').toLowerCase() === 'unclaimed').length;
    
    // Resolved Cases count (Closed, Claimed, Approved, Returned)
    const resolvedCount = state.reports.filter(rep => {
        const s = (rep.status || '').toLowerCase();
        return s === 'closed' || s === 'claimed' || s === 'approved' || s === 'returned';
    }).length;

    const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setStat("stat-total-reports", totalReports);
    setStat("stat-lost-items", lostItemsCount);
    setStat("stat-found-items", foundItemsCount);
    setStat("stat-pending-reports", pendingReportsCount);
    setStat("stat-resolved-cases", resolvedCount);
}


function getStatusHTML(status) {
    const statusClasses = {
        'Pending': 'status-pending',
        'Approved': 'status-approved',
        'Claimed': 'status-claimed',
        'Closed': 'status-closed',
        'Unclaimed': 'status-pending', 
        'Returned': 'status-claimed'    
    };
    const cls = statusClasses[status] || '';
    return `<span class="status-text ${cls}">${status}</span>`;
}

function renderOverview() {
    // Format timestamp as Day, YYYY-MM-DD HH:mm
    const formatDateTime = (dateVal) => {
        if (!dateVal) return "—";
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return "—";
        const pad = (n) => n.toString().padStart(2, '0');
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = days[d.getDay()];
        return `${dayName}, ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const tbody = document.getElementById("recent-reports-table-body");
    if (!tbody) return;
    tbody.innerHTML = ""; 

    // Use the unified activity feed (account creations, reports, items)
    const recentActivities = state.activities.slice(0, 10);

    if (recentActivities.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No recent activity recorded.</td></tr>`;
        return;
    }

    recentActivities.forEach(act => {
        const tr = document.createElement("tr");
        const dateStr = formatDateTime(act.date);
        tr.innerHTML = `
            <td><strong>${escapeHTML(act.title)}</strong></td>
            <td>${escapeHTML(act.detail)}</td>
            <td>${dateStr}</td>
            <td>${escapeHTML(act.user)}</td>
            <td>${getStatusHTML(act.status)}</td>
            <td>
                <span class="activity-type">${escapeHTML(act.type)}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


function renderReports() {
    const tbody = document.getElementById("reports-table-body");
    tbody.innerHTML = "";
    
    const filterVal = document.getElementById("report-filter-status").value;
    

    const filteredReports = state.reports.filter(rep => {
        if (filterVal === "all") return true;
        return rep.status === filterVal;
    });

    if (filteredReports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No reports match the status filter.</td></tr>`;
        return;
    }

    filteredReports.forEach(rep => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><strong>${escapeHTML(rep.itemName)}</strong></td>
            <td>${escapeHTML(rep.category)}</td>
            <td>${escapeHTML(rep.location)}</td>
            <td>${rep.date}</td>
            <td>${escapeHTML(rep.user)}</td>
            <td>${getStatusHTML(rep.status)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderItems() {
    const container = document.getElementById("items-grid-container");
    container.innerHTML = "";
    
    const filterVal = document.getElementById("item-filter-type").value;
    
    const filteredItems = state.items.filter(item => {
        if (filterVal === "all") return true;
        return item.type === filterVal;
    });

    if(filteredItems.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">No catalog items match criteria.</p>`;
        return;
    }

    filteredItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "item-card";
        
        const imgUrl = item.imageUrl || "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=300&auto=format&fit=crop&q=80";
        
        let actionHTML = '';
        if(item.status === 'Unclaimed') {
            actionHTML = `<button class="primary-btn" style="padding: 6px 12px; font-size: 0.8rem;" onclick="markItemReturned('${item.id}')">Return</button>`;
        } else {
            actionHTML = `<span style="color: var(--text-muted); font-size: 0.8rem; font-style:italic;">Resolved</span>`;
        }

        card.innerHTML = `
            <div class="item-card-image">
                <img src="${imgUrl}" alt="${escapeHTML(item.itemName)}">
                <span class="item-type-badge">${item.type}</span>
            </div>
            <div class="item-card-body">
                <div>
                    <h3 class="item-card-title">${escapeHTML(item.itemName)}</h3>
                    <div class="item-meta-row">
                        <span><strong>Cat:</strong> ${escapeHTML(item.category)}</span>
                        <span><strong>Loc:</strong> ${escapeHTML(item.location)}</span>
                    </div>
                </div>
                <div class="item-status-bar">
                    <div>
                        ${getStatusHTML(item.status)}
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button class="secondary-btn" style="padding: 6px 10px; font-size: 0.8rem;" onclick="openEditItemModal('${item.id}')">Edit</button>
                        ${actionHTML}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderUsers() {
    const tbody = document.getElementById("users-table-body");
    tbody.innerHTML = "";

    if (state.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No users registered in system.</td></tr>`;
        return;
    }

    state.users.forEach(user => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${escapeHTML(user.name)}</strong></td>
            <td>${escapeHTML(user.email)}</td>
            <td>${user.role}</td>
            <td>${user.regDate}</td>
            <td>
                <button class="text-btn" onclick="viewUserProfile('${user.id}')">View Details</button>
                <button class="text-btn" style="color: #DC2626;" onclick="removeUser('${user.id}')">Remove</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}


function renderClaims() {
    const tbody = document.getElementById("claims-table-body");
    tbody.innerHTML = "";

    // Only Claims Officers can verify/reject claims
    const canVerify = state.currentUserRole === 'Claims Officer';

    if (state.claims.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No claim request submissions pending.</td></tr>`;
        return;
    }

    state.claims.forEach(claim => {
        const tr = document.createElement("tr");
        
        let actionButtons = '';
        if (claim.status === 'Pending') {
            if (canVerify) {
                actionButtons = `
                    <button class="text-btn" onclick="processClaim('${claim.id}', 'Approved')">Approve Claim</button>
                    <button class="text-btn" style="color: #DC2626;" onclick="processClaim('${claim.id}', 'Rejected')">Reject</button>
                `;
            } else {
                actionButtons = `<span style="color: var(--text-muted); font-size:0.8rem; font-style:italic;">🔒 Claims Officer only</span>`;
            }
        } else {
            actionButtons = `<span style="color: var(--text-muted); font-size:0.8rem;">Processed</span>`;
        }

        tr.innerHTML = `
            <td><strong>${escapeHTML(claim.claimantName)}</strong></td>
            <td>${escapeHTML(claim.itemClaimed)}</td>
            <td><span style="font-size:0.8125rem; display:block; max-width: 320px; line-height: 1.4;">${escapeHTML(claim.description)}</span></td>
            <td>${claim.dateSubmitted}</td>
            <td>${getStatusHTML(claim.status)}</td>
            <td>${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });
}

function updateReportStatus(reportId, newStatus) {
    
    const reportIndex = state.reports.findIndex(r => r.id === reportId);
    if(reportIndex !== -1) {
        state.reports[reportIndex].status = newStatus;
        
        
        if(newStatus === "Approved") {
            const reportObj = state.reports[reportIndex];
            const hasItem = state.items.some(i => i.itemName === reportObj.itemName);
            if(!hasItem) {
                
                const newItem = {
                    id: "I-" + (200 + state.items.length + 1),
                    itemName: reportObj.itemName,
                    category: reportObj.category,
                    type: "Found", 
                    location: reportObj.location,
                    imageUrl: "",
                    status: "Unclaimed"
                };
                state.items.push(newItem);
            }
        }
        

        updateStats();
        renderActiveSection();
    }
}


function markItemReturned(itemId) {
    const itemIndex = state.items.findIndex(i => i.id === itemId);
    if(itemIndex !== -1) {
        state.items[itemIndex].status = "Returned";
        
        
        const itemName = state.items[itemIndex].itemName;
        const reportIndex = state.reports.findIndex(r => r.itemName === itemName);
        if(reportIndex !== -1) {
            state.reports[reportIndex].status = "Closed";
        }
        
        updateStats();
        renderActiveSection();
    }
}


function removeUser(userId) {
    if(confirm("Are you sure you want to delete this user profile? This action will restrict their platform access.")) {
        state.users = state.users.filter(u => u.id !== userId);
        renderUsers();
    }
}


function processClaim(claimId, decissionStatus) {
    const claimIndex = state.claims.findIndex(c => c.id === claimId);
    if(claimIndex !== -1) {
        state.claims[claimIndex].status = decissionStatus;
        
        const targetClaim = state.claims[claimIndex];
        
      
        if(decissionStatus === "Approved") {
            const itemIndex = state.items.findIndex(i => i.id === targetClaim.itemId);
            if(itemIndex !== -1) {
                state.items[itemIndex].status = "Returned";
            }
            
         
            const reportIndex = state.reports.findIndex(r => r.itemName === targetClaim.itemClaimed);
            if(reportIndex !== -1) {
                state.reports[reportIndex].status = "Claimed";
            }
        }
        
        updateStats();
        renderActiveSection();
    }
}


function setupFilters() {
    document.getElementById("report-filter-status").addEventListener("change", () => {
        renderReports();
    });
    
    document.getElementById("item-filter-type").addEventListener("change", () => {
        renderItems();
    });
}


function setupSearch() {
    const searchInput = document.getElementById("global-search");
    
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        
 
        if (state.activeSection === "reports-view") {
            const tbody = document.getElementById("reports-table-body");
            const rows = tbody.querySelectorAll("tr");
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if(text.includes(query)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            });
        } else if (state.activeSection === "items-view") {
            const cards = document.querySelectorAll("#items-grid-container .item-card");
            
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                if(text.includes(query)) {
                    card.style.display = "";
                } else {
                    card.style.display = "none";
                }
            });
        } else if (state.activeSection === "users-view") {
            const tbody = document.getElementById("users-table-body");
            const rows = tbody.querySelectorAll("tr");
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if(text.includes(query)) {
                    row.style.display = "";
                } else {
                    row.style.display = "none";
                }
            });
        }
    });
}


function setupModals() {
    const itemModal = document.getElementById("item-modal");
    const userModal = document.getElementById("user-modal");
    
 
    document.getElementById("add-item-trigger-btn").addEventListener("click", () => {
        openAddItemModal();
    });
    
 
    document.getElementById("close-item-modal-btn").addEventListener("click", () => itemModal.classList.add("hidden"));
    document.getElementById("cancel-item-modal-btn").addEventListener("click", () => itemModal.classList.add("hidden"));
 
    document.getElementById("close-user-modal-btn").addEventListener("click", () => userModal.classList.add("hidden"));
    document.getElementById("close-user-modal-footer-btn").addEventListener("click", () => userModal.classList.add("hidden"));


    document.getElementById("item-form").addEventListener("submit", (e) => {
        e.preventDefault();
        saveItemData();
    });
}


function openAddItemModal() {
    document.getElementById("modal-title").textContent = "Add Catalog Found Item";
    document.getElementById("item-form-id").value = ""; 
    document.getElementById("item-form-name").value = "";
    document.getElementById("item-form-category").value = "Electronics";
    document.getElementById("item-form-type").value = "Found";
    document.getElementById("item-form-location").value = "";
    document.getElementById("item-form-image").value = "";
    document.getElementById("item-form-status").value = "Unclaimed";
    
 
    document.getElementById("item-form-status").disabled = true;
    
    document.getElementById("item-modal").classList.remove("hidden");
}


window.openEditItemModal = function(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if(item) {
        document.getElementById("modal-title").textContent = "Modify Item Details";
        document.getElementById("item-form-id").value = item.id;
        document.getElementById("item-form-name").value = item.itemName;
        document.getElementById("item-form-category").value = item.category;
        document.getElementById("item-form-type").value = item.type;
        document.getElementById("item-form-location").value = item.location;
        document.getElementById("item-form-image").value = item.imageUrl || "";
        document.getElementById("item-form-status").value = item.status;
        

        document.getElementById("item-form-status").disabled = false;
        
        document.getElementById("item-modal").classList.remove("hidden");
    }
};


function saveItemData() {
    const id = document.getElementById("item-form-id").value;
    const name = document.getElementById("item-form-name").value;
    const category = document.getElementById("item-form-category").value;
    const type = document.getElementById("item-form-type").value;
    const location = document.getElementById("item-form-location").value;
    const imgUrl = document.getElementById("item-form-image").value;
    const status = document.getElementById("item-form-status").value;

    if(!id) {
 
        const newItem = {
            id: "I-" + (200 + state.items.length + 1),
            itemName: name,
            category: category,
            type: type,
            location: location,
            imageUrl: imgUrl,
            status: "Unclaimed"
        };
        state.items.push(newItem);
    } else {
   
        const index = state.items.findIndex(i => i.id === id);
        if(index !== -1) {
            state.items[index].itemName = name;
            state.items[index].category = category;
            state.items[index].type = type;
            state.items[index].location = location;
            state.items[index].imageUrl = imgUrl;
            state.items[index].status = status;
        }
    }
    
  
    document.getElementById("item-modal").classList.add("hidden");
    updateStats();
    renderItems();
}


window.viewUserProfile = function(userId) {
    const user = state.users.find(u => u.id === userId);
    if(user) {
        const container = document.getElementById("user-modal-details");
        container.innerHTML = `
            <div class="user-profile-modal-body">
                <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80" alt="User" class="user-avatar-large">
                <h3>${escapeHTML(user.name)}</h3>
                <span class="profile-role-badge">${user.role}</span>
                
                <div class="user-info-list">
                    <div class="detail-row">
                        <span class="detail-label">User ID:</span>
                        <span class="detail-value">${user.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email Address:</span>
                        <span class="detail-value">${escapeHTML(user.email)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Account Joined:</span>
                        <span class="detail-value">${user.regDate}</span>
                    </div>
                </div>
            </div>
        `;
        document.getElementById("user-modal").classList.remove("hidden");
    }
};


function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
