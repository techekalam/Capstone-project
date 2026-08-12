/* =========================================
   MANAGE REPORTS - Stat Cards & Reports Table
   Populates the reports stat cards and table
   from the Supabase "Reports" table.
========================================= */

let allReports = [];

// Load all reports from the database and render stats + table
async function loadReports(providedSession) {
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
    if (!session) {
        return;
    }

    const { data: reports, error } = await supabase
        .from('Reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load reports:', error);
        return;
    }

    allReports = reports || [];

    // Update the result count header
    const resultsCount = document.getElementById('results-count');
    if (resultsCount) resultsCount.textContent = `${allReports.length} reports`;

    updateReportStats();
    renderReportsTable();
}

// Update the stat cards based on report statuses
function updateReportStats() {
    const total = allReports.length;
    const pending = allReports.filter(r => (r.status || '').toLowerCase() === 'pending' || (r.status || '').toLowerCase() === 'unclaimed').length;
    const approved = allReports.filter(r => (r.status || '').toLowerCase() === 'approved').length;
    const claimed = allReports.filter(r => (r.status || '').toLowerCase() === 'claimed' || (r.status || '').toLowerCase() === 'returned').length;
    const closed = allReports.filter(r => (r.status || '').toLowerCase() === 'closed').length;

    const setStat = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setStat('stat-total', total);
    setStat('stat-pending', pending);
    setStat('stat-approved', approved);
    setStat('stat-claimed', claimed);
    setStat('stat-closed', closed);
}

// Render the reports table body with filtering
function renderReportsTable() {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    const statusFilter = document.getElementById('report-filter-status')?.value || 'all';
    const typeFilter = document.getElementById('report-filter-type')?.value || 'all';

    let filtered = allReports;

    if (statusFilter !== 'all') {
        filtered = filtered.filter(r => r.status === statusFilter);
    }
    if (typeFilter !== 'all') {
        filtered = filtered.filter(r => (r.item_type || r.type || '') === typeFilter);
    }

    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No reports found.</td></tr>`;
        return;
    }

    filtered.forEach(report => {
        const tr = document.createElement('tr');
        const dateStr = report.created_at ? new Date(report.created_at).toLocaleDateString() : (report.date || '');
        const type = report.item_type || report.type || 'Lost';
        const status = report.status || 'Pending';

        tr.innerHTML = `
            <td><strong>${escapeHTML(report.item_name || report.category || 'Unnamed item')}</strong></td>
            <td>${escapeHTML(type)}</td>
            <td>${escapeHTML(report.category || 'Other')}</td>
            <td>${escapeHTML(report.location || '')}</td>
            <td>${dateStr}</td>
            <td>${escapeHTML(report.user_id || '')}</td>
            <td><span class="status-text status-${(status || '').toLowerCase()}">${escapeHTML(status)}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// Update a report's status in the database
async function updateReport(reportId, newStatus) {
    const supabase = window.supabaseClient;
    if (!supabase) return;

    const { error } = await supabase
        .from('Reports')
        .update({ status: newStatus })
        .eq('id', reportId);

    if (error) {
        console.error('Failed to update report:', error);
        alert('Failed to update report status.');
        return;
    }

    // Refresh local data and re-render
    await loadReports();
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

// Wire up filter listeners
document.addEventListener('DOMContentLoaded', () => {
    const statusFilter = document.getElementById('report-filter-status');
    const typeFilter = document.getElementById('report-filter-type');
    if (statusFilter) statusFilter.addEventListener('change', renderReportsTable);
    if (typeFilter) typeFilter.addEventListener('change', renderReportsTable);

    // Export CSV button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportCSV);

    if (window.supabaseClient) {
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session) loadReports(session);
        });
    }
});

// Export the current reports to a CSV file
function exportCSV() {
    if (allReports.length === 0) {
        alert('No reports to export.');
        return;
    }

    const header = ['Item', 'Type', 'Category', 'Location', 'Date', 'Submitted By', 'Status'];
    const rows = allReports.map(r => [
        r.item_name || r.category || 'Unnamed item',
        r.item_type || r.type || '',
        r.category || '',
        r.location || '',
        r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
        r.user_id || '',
        r.status || 'Pending'
    ]);

    const csvContent = [header, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'reports.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
