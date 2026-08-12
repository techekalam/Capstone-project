(function () {
  const supabase = window.supabaseClient;

  // ------------------------------------------------------------------
  // SHARED SESSION — set once by onAuthStateChange, read everywhere.
  // This is the core fix: we never call getSession() on page load
  // because Supabase reads localStorage asynchronously and getSession()
  // can return null before that read finishes, causing false logouts.
  // ------------------------------------------------------------------
  let currentSession = null;

  // ------------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------------

  async function ensureProfile(user) {
    if (!user || !supabase) return;
    const fullName = (user.user_metadata && user.user_metadata.full_name) || user.email;
    const phone = (user.user_metadata && user.user_metadata.phone) || '';

    let assignedRole = 'student';
    const emailLower = (user.email || '').toLowerCase();
    if (emailLower.includes('admin')) {
      assignedRole = 'admin';
    } else if (emailLower.includes('officer')) {
      assignedRole = 'officer';
    }

    const { data: existing } = await supabase
      .from('Profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (existing) {
      if (assignedRole !== 'student' && (!existing.role || existing.role.toLowerCase() === 'student' || existing.role.toLowerCase() === 'user')) {
        await supabase.from('Profiles').update({ role: assignedRole }).eq('id', user.id);
      }
      return;
    }

    const { error } = await supabase.from('Profiles').insert({
      id: user.id,
      full_name: fullName,
      email: user.email,
      phone: phone,
      role: assignedRole
    });

    if (error) {
      console.warn('ensureProfile insert warning (may be handled by trigger):', error.message);
    }
  }

  async function routeUserByRole(user) {
    if (!user) {
      window.location.href = '../login-page/login.html';
      return;
    }

    let role = 'student';
    try {
      const { data: profile } = await supabase
        .from('Profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile && profile.role) role = profile.role.toLowerCase();
    } catch (e) {
      console.error('Failed to read user role:', e);
    }

    const emailLower = (user.email || '').toLowerCase();
    if (role === 'student' || role === 'user' || !role) {
      if (emailLower.includes('admin')) role = 'admin';
      else if (emailLower.includes('officer')) role = 'officer';
    }

    if (role === 'admin') {
      window.location.href = '../admin-dashboard/admin-dashboard.html';
    } else if (role === 'officer') {
      window.location.href = '../officer-dashboard/lost and found officer.html';
    } else {
      window.location.href = '../user-dashboard/dashboard.html';
    }
  }

  // ------------------------------------------------------------------
  // SIGN UP FORM
  // ------------------------------------------------------------------
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('fullName').value;
      const email = document.getElementById('email').value;
      const phone = document.getElementById('phone') ? document.getElementById('phone').value : '';
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password')
        ? document.getElementById('confirm-password').value
        : password;
      const message = document.getElementById('message');

      if (password !== confirmPassword) {
        message.style.color = 'red';
        message.textContent = 'Passwords do not match!';
        return;
      }

      if (!email.toLowerCase().endsWith('@cavendish.ac.ug')) {
        message.style.color = 'red';
        message.textContent = 'Access denied: Only @cavendish.ac.ug emails are allowed.';
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone } }
      });

      if (error) {
        message.style.color = 'red';
        message.textContent = error.message;
      } else if (!data.session) {
        message.style.color = 'green';
        message.textContent = 'Account created! Check your email to confirm.';
        setTimeout(() => (window.location.href = 'login.html'), 2000);
      } else {
        await ensureProfile(data.user);
        message.style.color = 'green';
        message.textContent = 'Account created! Redirecting...';
        setTimeout(() => routeUserByRole(data.user), 1500);
      }
    });
  }

  // ------------------------------------------------------------------
  // LOGIN FORM
  // ------------------------------------------------------------------
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const message = document.getElementById('message');

      if (!supabase) {
        message.style.color = 'red';
        message.textContent = 'Authentication service failed to load. Please refresh and try again.';
        return;
      }

      if (!email.toLowerCase().endsWith('@cavendish.ac.ug')) {
        message.style.color = 'red';
        message.textContent = 'Access denied: Only @cavendish.ac.ug emails are allowed.';
        return;
      }

      message.style.color = 'white';
      message.textContent = 'Signing in…';

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        message.style.color = 'red';
        message.textContent = error.message;
      } else {
        await ensureProfile(data.user);
        await routeUserByRole(data.user);
      }
    });
  }

  // Prevent back-button access to cached pages after logout
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      window.location.reload();
    }
  });

  // ------------------------------------------------------------------
  // LOGOUT BUTTON
  // ------------------------------------------------------------------
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch (err) {
        console.error('Logout error:', err);
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('../login-page/login.html');
    });
  }

  // ------------------------------------------------------------------
  // AUTH STATE LISTENER — single source of truth for session.
  // ------------------------------------------------------------------
  if (supabase) {
    supabase.auth.onAuthStateChange(async (event, session) => {
      currentSession = session; // always keep in sync

      if (event === 'SIGNED_OUT' || !session) {
        // Redirect protected pages to login-page using replace
        if (
          document.getElementById('userName') ||
          document.getElementById('reportsList') ||
          document.getElementById('itemsList') ||
          document.getElementById('auditTableBody') ||
          document.getElementById('reportForm')
        ) {
          window.location.replace('../login-page/login.html');
        }
        return;
      }

      // Only run page-init logic on the very first session resolution
      if (event !== 'INITIAL_SESSION') return;

      // ---- user-dashboard (dashboard.html) ----
      const userNameEl = document.getElementById('userName');
      if (userNameEl) {
        if (!session) {
          window.location.replace('../login-page/login.html');
          return;
        }
        userNameEl.textContent = session.user.user_metadata?.full_name || session.user.email;
        loadMyReports();
      }

      // ---- My-reports page (my-report.html) ----
      const reportsListEl = document.getElementById('reportsList');
      if (reportsListEl && !userNameEl) {
        if (!session) {
          window.location.replace('../login-page/login.html');
          return;
        }
        loadMyReports();
      }

      // ---- Browse-items page (items.html) ----
      if (document.getElementById('itemsList')) {
        loadAllItems();
      }

      // ---- Recent activity ----
      if (document.getElementById('auditTableBody')) {
        loadUserRecentActivity();
      }
    });
  }

  // ------------------------------------------------------------------
  // REPORT FORM (report.html)
  // ------------------------------------------------------------------
  const reportForm = document.getElementById('reportForm');
  if (reportForm) {
    reportForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Use the shared session — guaranteed to be set by now if user reached this page
      const session = currentSession;
      if (!session) {
        window.location.href = '../login-page/login.html';
        return;
      }

      const itemType = document.getElementById('itemType').value;
      const itemName = document.getElementById('itemName') ? document.getElementById('itemName').value : '';
      const category = document.getElementById('category').value;
      const location = document.getElementById('location').value;
      const date = document.getElementById('date').value;
      const description = document.getElementById('description').value;
      const imageFile = document.getElementById('itemImage').files[0];
      const message = document.getElementById('message');

      let imageUrl = null;
      if (imageFile) {
        const filePath = `${session.user.id}/${Date.now()}_${imageFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('item-images')
          .upload(filePath, imageFile);

        if (uploadError) {
          message.style.color = 'red';
          message.textContent = 'Image upload failed: ' + uploadError.message;
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from('item-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      }

      const reportPayload = {
        user_id: session.user.id,
        item_type: itemType,
        category: category,
        location: location,
        date: date,
        description: description,
        image_url: imageUrl
      };
      if (itemName) {
        reportPayload.item_name = itemName;
      }

      let { error } = await supabase.from('Reports').insert(reportPayload);

      // If item_name column is missing on Reports table, fallback to insert without item_name
      if (error && (error.code === '42703' || error.message.includes('item_name'))) {
        delete reportPayload.item_name;
        const { error: retryError } = await supabase.from('Reports').insert(reportPayload);
        error = retryError;
      }

      if (error) {
        message.style.color = 'red';
        message.textContent = error.message;
      } else {
        message.style.color = 'green';
        message.textContent = 'Report submitted successfully!';
        reportForm.reset();
        loadMyReports();
      }
    });
  }

  // ------------------------------------------------------------------
  // MY REPORTS — reads currentSession, never calls getSession()
  // ------------------------------------------------------------------
  async function loadMyReports() {
    const reportsList = document.getElementById('reportsList');
    if (!reportsList) return;

    const session = currentSession;
    if (!session) return; // auth guard already handles the redirect

    reportsList.innerHTML = '';

    const { data: reports, error } = await supabase
      .from('Reports')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    const noReports = document.getElementById('noReports');
    if (error) {
      console.error(error);
      if (noReports) noReports.textContent = 'Failed to load reports.';
      return;
    }

    if (!reports || reports.length === 0) {
      if (noReports) noReports.style.display = 'block';
      return;
    }

    if (noReports) noReports.style.display = 'none';

    reports.forEach((report) => {
      const card = document.createElement('div');
      card.className = 'report-card';
      card.innerHTML = `
        <img src="${report.image_url || 'placeholder.png'}" alt="${report.category}">
        <div class="report-info">
          <h4>${report.category}</h4>
          <p>${report.item_type} — ${report.location} — ${new Date(report.created_at).toLocaleDateString()}</p>
        </div>
        <div class="report-actions">
          <button onclick="deleteReport('${report.id}')">Delete</button>
        </div>
      `;
      reportsList.appendChild(card);
    });
  }

  // Expose so inline onclick can call it
  window.deleteReport = async function (id) {
    if (!confirm('Delete this report?')) return;
    const { error } = await supabase.from('Reports').delete().eq('id', id);
    if (error) {
      alert(error.message);
    } else {
      loadMyReports();
    }
  };

  // ------------------------------------------------------------------
  // ALL ITEMS (items.html)
  // ------------------------------------------------------------------
  async function loadAllItems() {
    const itemsList = document.getElementById('itemsList');
    if (!itemsList) return;

    itemsList.innerHTML = '<p style="color:#cbd5e1;">Loading items…</p>';

    const [itemsRes, reportsRes] = await Promise.all([
      supabase.from('Items').select('*').order('created_at', { ascending: false }),
      supabase.from('Reports').select('*').order('created_at', { ascending: false })
    ]);

    const rawItems = itemsRes.data || [];
    const rawReports = reportsRes.data || [];

    const allItems = [];

    // Map Items table records
    rawItems.forEach(item => {
      allItems.push({
        id: item.id,
        item_name: item.item_name || 'Unnamed Item',
        category: item.category || 'Other',
        type: item.type || 'Found Item',
        location: item.location || 'Campus',
        description: item.description || '',
        image_url: item.image_url || '',
        status: item.status || 'Unclaimed',
        created_at: item.created_at,
        source: 'Items'
      });
    });

    // Map Reports table records
    rawReports.forEach(report => {
      const isLost = (report.item_type || '').toLowerCase().includes('lost');
      const itemTitle = report.item_name || report.category || (isLost ? 'Lost Item' : 'Found Item');
      allItems.push({
        id: report.id,
        item_name: itemTitle,
        category: report.category || 'Report',
        type: isLost ? 'Lost Item' : 'Found Item',
        location: report.location || 'Campus',
        description: report.description || '',
        image_url: report.image_url || '',
        status: report.status || (isLost ? 'Lost' : 'Unclaimed'),
        created_at: report.created_at || report.date,
        source: 'Reports'
      });
    });

    // Sort combined list by created_at descending
    allItems.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    function renderFilteredItems(query = '') {
      const q = (query || '').toLowerCase().trim();

      const filtered = allItems.filter(item => {
        if (!q) return true;
        const nameMatch = (item.item_name || '').toLowerCase().includes(q);
        const locMatch  = (item.location || '').toLowerCase().includes(q);
        const catMatch  = (item.category || '').toLowerCase().includes(q);
        const descMatch = (item.description || '').toLowerCase().includes(q);
        const typeMatch = (item.type || '').toLowerCase().includes(q);
        return nameMatch || locMatch || catMatch || descMatch || typeMatch;
      });

      itemsList.innerHTML = '';

      if (filtered.length === 0) {
        itemsList.innerHTML = `<p style="color:white; font-style:italic;">${q ? 'No items matching "' + escapeHTML(q) + '"' : 'No items found.'}</p>`;
        return;
      }

      filtered.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'report-card';
        const itemStatus = (item.status || 'Unclaimed').toLowerCase();
        const isClaimable = itemStatus === 'unclaimed' || itemStatus === 'found' || itemStatus === 'pending';
        const claimBtnHtml = isClaimable 
          ? `<div class="report-actions"><a href="claim.html?item_id=${item.id}"><button type="button" style="background:#2563eb; color:white; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer;">Claim Item</button></a></div>` 
          : `<span style="color:#94a3b8; font-size:0.85rem; font-style:italic;">${escapeHTML(item.status)}</span>`;

        card.innerHTML = `
          <img src="${item.image_url || 'placeholder.png'}" alt="${escapeHTML(item.item_name)}">
          <div class="report-info">
            <h4 style="margin:0 0 6px 0; color:white;">${escapeHTML(item.item_name)}</h4>
            <p style="margin:0 0 6px 0; color:#cbd5e1;">${escapeHTML(item.type || 'Found Item')} — ${escapeHTML(item.location || 'Campus')} — ${item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}</p>
            <span class="status-badge ${item.status}">${escapeHTML(item.status || 'Unclaimed')}</span>
          </div>
          ${claimBtnHtml}
        `;
        itemsList.appendChild(card);
      });
    }

    // Helper for HTML escaping
    function escapeHTML(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    renderFilteredItems('');

    // Attach search input listener
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.oninput = (e) => {
        renderFilteredItems(e.target.value);
      };
    }
  }

  // ------------------------------------------------------------------
  // RECENT ACTIVITY (user recent activity.html)
  // ------------------------------------------------------------------
  async function loadUserRecentActivity() {
    const auditTableBody = document.getElementById('auditTableBody');
    if (!auditTableBody) return;

    const session = currentSession;
    if (!session) return;

    const userId = session.user.id;

    // Fetch only this user's reports and items concurrently
    const [{ data: reports, error: reportError }, { data: items, error: itemError }] =
      await Promise.all([
        supabase
          .from('Reports')
          .select('created_at, date, user_id, item_type, status')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('Items')
          .select('created_at, date, user_id, item_name, status')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ]);

    if (reportError) console.error('Reports fetch error', reportError);
    if (itemError) console.error('Items fetch error', itemError);

    // DEBUG: log raw data so we can see what fields exist
    console.log('RAW reports from DB:', JSON.stringify(reports));
    console.log('RAW items from DB:', JSON.stringify(items));

    const activities = [];

    if (reports) {
      reports.forEach((r) => {
        const rawDate = r.created_at || r.date || null;
        console.log('Report date fields → created_at:', r.created_at, '| date:', r.date, '| using:', rawDate);
        activities.push({
          date: rawDate,
          description: `Reported ${r.item_type || 'item'}`,
          status: r.status || 'Pending'
        });
      });
    }

    if (items) {
      items.forEach((i) => {
        const rawDate = i.created_at || i.date || null;
        console.log('Item date fields → created_at:', i.created_at, '| date:', i.date, '| using:', rawDate);
        activities.push({
          date: rawDate,
          description: `Added item: ${i.item_name || 'unnamed'}`,
          status: i.status || 'Unclaimed'
        });
      });
    }

    // Sort newest first (nulls go to end)
    activities.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });

    // Format timestamp — handles both full ISO timestamps and plain YYYY-MM-DD date strings
    const formatDateTime = (dateStr) => {
      if (!dateStr) return '—';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr); // return raw if unparseable
      const pad = (n) => n.toString().padStart(2, '0');
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[d.getDay()];
      // If it's a date-only string (no time component), don't show 00:00
      const hasTime = String(dateStr).includes('T') || String(dateStr).includes(' ');
      const timeStr = hasTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
      return `${dayName}, ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${timeStr}`;
    };

    auditTableBody.innerHTML = '';

    if (activities.length === 0) {
      auditTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:24px; color:#94a3b8; font-style:italic;">No recent activity found.</td></tr>`;
      return;
    }

    activities.forEach((act) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${formatDateTime(act.date)}</td>` +
        `<td>${act.description}</td>` +
        `<td>${act.status}</td>`;
      auditTableBody.appendChild(tr);
    });
  }



  // Fallback initializations for pages on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('itemsList')) {
      loadAllItems();
    }
  });
})();
