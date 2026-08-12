/* =========================================
   MANAGE USERS - Stat Cards & Users Table
   Loads user data from the Supabase "Profiles"
   table and populates the summary stat cards
   (totalUsers, activeUsers, adminUsers) and the
   users table.
========================================= */

let users = [];

// Load all user profiles from the database
async function loadUsers(providedSession) {
    const supabase = window.supabaseClient;
    if (!supabase) {
        console.error("Supabase client not initialized");
        return;
    }

    let session = providedSession;
    if (!session) {
        const { data } = await supabase.auth.getSession();
        session = data ? data.session : null;
    }
    if (!session) return;

    const { data: profiles, error } = await supabase
        .from('Profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load users:', error);
        return;
    }

    users = (profiles || []).map((p, index) => ({
        id: p.id,
        name: p.full_name || p.email || 'User',
        email: p.email || '',
        studentId: p.student_id || p.studentId || `CUU-${String(index + 1).padStart(4, '0')}` || '',
        role: p.role || 'student',
        status: p.status || 'Active',
        profile: p.avatar_url || 'https://via.placeholder.com/40',
        joined: p.created_at || ''
    }));

    updateSummary();
    renderUsers(getFilteredUsers());
}

// Render users into the table
function renderUsers(filteredUsers = users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No users found.</td></tr>`;
        return;
    }

    filteredUsers.forEach(user => {
        const row = document.createElement('tr');

        const roleDisplay = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        const statusClass = user.status === 'Active' ? 'active' : 'inactive';
        const statusColor = user.status === 'Active'
            ? 'background:#d1fae5;color:#065f46'
            : 'background:#fee2e2;color:#991b1b';

        row.innerHTML = `
            <td>${escapeHTML(user.name)}</td>
            <td>${escapeHTML(user.email)}</td>
            <td>${escapeHTML(user.studentId)}</td>
            <td>${roleDisplay}</td>
            <td><span class="${statusClass}" style="${statusColor};padding:4px 10px;border-radius:20px;font-size:0.8rem;">${user.status}</span></td>
            <td>
                <button class="view" data-id="${user.id}">View</button>
                <button class="delete" data-id="${user.id}">Delete</button>
            </td>
        `;

        tbody.appendChild(row);
    });

    // Attach event listeners to action buttons
    document.querySelectorAll('.view').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const user = users.find(u => u.id === id);
            if (user) {
                alert(`Viewing user:\nName: ${user.name}\nEmail: ${user.email}\nID: ${user.studentId}\nRole: ${user.role}`);
            }
        });
    });

    document.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const targetUser = users.find(u => u.id === id);
            const userName = targetUser ? targetUser.name : 'this user';

            if (confirm(`Are you sure you want to delete ${userName}?`)) {
                const supabase = window.supabaseClient;
                if (supabase && !id.startsWith('local-')) {
                    // 1) Delete associated user reports & items
                    await supabase.from('Reports').delete().eq('user_id', id);
                    await supabase.from('Items').delete().eq('user_id', id);

                    // 2) Delete profile row
                    const { error } = await supabase.from('Profiles').delete().eq('id', id);
                    if (error) {
                        console.error('Failed to delete user:', error);
                        alert('Failed to delete user: ' + error.message);
                        return;
                    }
                }
                users = users.filter(u => u.id !== id);
                updateSummary();
                renderUsers(getFilteredUsers());
                alert(`User ${userName} has been deleted.`);
            }
        });
    });
}

// Update summary cards
function updateSummary() {
    const total = users.length;
    const active = users.filter(u => u.status === 'Active').length;
    const admins = users.filter(u => u.role === 'admin').length;

    const setStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setStat('totalUsers', total);
    setStat('activeUsers', active);
    setStat('adminUsers', admins);
}

// Get currently filtered users based on search input
function getFilteredUsers() {
    const input = document.querySelector('.search-box input');
    if (!input) return users;
    const searchTerm = input.value.toLowerCase().trim();
    if (!searchTerm) return users;

    return users.filter(user =>
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        user.studentId.toLowerCase().includes(searchTerm) ||
        user.role.toLowerCase().includes(searchTerm)
    );
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '<',
            '>': '>',
            "'": '&#39;',
            '"': '"'
        }[tag] || tag)
    );
}

// Handle search input
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderUsers(getFilteredUsers());
        });
    }

    // Handle Add User button
    const addUserBtn = document.querySelector('.add-user');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            const name = prompt('Enter full name:');
            if (!name || !name.trim()) return;

            const email = prompt('Enter email:');
            if (!email || !email.trim()) return;

            const studentId = prompt('Enter Student ID:');
            const role = prompt('Enter role (student/admin):') || 'student';
            const newUser = {
                id: 'local-' + Date.now(),
                name: name.trim(),
                email: email.trim(),
                studentId: studentId || `CUU-${String(users.length + 1).padStart(4, '0')}`,
                role: role.toLowerCase() === 'admin' ? 'admin' : 'student',
                status: 'Active',
                profile: 'https://via.placeholder.com/40'
            };

            users.push(newUser);
            updateSummary();
            renderUsers(getFilteredUsers());
        });
    }

    // Load users from database via onAuthStateChange
    if (window.supabaseClient) {
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) loadUsers(session);
        });
    }
});
