(function () {
  const supabase = window.supabaseClient;

  const claimsContainer = document.getElementById('claims-container');
  const claimsCountEl = document.getElementById('claims-count');

  let profilesMap = {};
  let itemsMap = {};

  async function init() {
    if (!supabase) {
      console.error('Supabase client is missing.');
      if (claimsContainer) claimsContainer.innerHTML = '<p style="color:red;">Error: Database connection lost.</p>';
      return;
    }

    // Auth check
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !session) {
      window.location.href = '../login-page/login.html';
      return;
    }

    // Role check
    const user = session.user;
    const emailLower = (user.email || '').toLowerCase();
    const { data: profile } = await supabase
      .from('Profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile && profile.role) ? profile.role.toLowerCase() : '';
    const isStaff = role === 'admin' || role === 'officer' || emailLower.includes('admin') || emailLower.includes('officer');

    if (!isStaff) {
      alert('Access denied. Officers and Admins only.');
      window.location.href = '../user-dashboard/dashboard.html';
      return;
    }

    // Initial load
    await loadDataAndRender();

    // Subscribe to realtime updates on Claims table
    try {
      supabase
        .channel('claims-verify-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'Claims' }, () => {
          loadDataAndRender();
        })
        .subscribe();
    } catch (e) {
      console.warn('Realtime subscription error:', e);
    }
  }

  async function loadDataAndRender() {
    if (!claimsContainer) return;

    claimsContainer.innerHTML = '<p style="color:#64748b;">Loading claim verification requests…</p>';

    // Fetch Profiles map
    const { data: profiles } = await supabase.from('Profiles').select('id, full_name, email, student_id, phone');
    profilesMap = {};
    if (profiles) {
      profiles.forEach(p => {
        profilesMap[p.id] = p;
      });
    }

    // Fetch Items map
    const { data: items } = await supabase.from('Items').select('id, item_name, image_url, location');
    itemsMap = {};
    if (items) {
      items.forEach(i => {
        itemsMap[i.id] = i;
      });
    }

    // Fetch Claims
    const { data: claims, error: claimsErr } = await supabase
      .from('Claims')
      .select('*')
      .order('created_at', { ascending: false });

    if (claimsErr) {
      console.error('Error fetching claims:', claimsErr);
      claimsContainer.innerHTML = `<p style="color:#ef4444;">Failed to load claims: ${claimsErr.message}</p>`;
      return;
    }

    if (!claims || claims.length === 0) {
      if (claimsCountEl) claimsCountEl.textContent = '0 Claims';
      claimsContainer.innerHTML = '<p style="color:#64748b; font-style:italic;">No claim verification requests found.</p>';
      return;
    }

    const pendingCount = claims.filter(c => (c.status || 'Pending').toLowerCase() === 'pending').length;
    if (claimsCountEl) {
      claimsCountEl.textContent = `${pendingCount} Pending Claim${pendingCount === 1 ? '' : 's'}`;
    }

    claimsContainer.innerHTML = '';

    claims.forEach(claim => {
      const claimantProfile = profilesMap[claim.user_id] || {};
      const claimantName = claimantProfile.full_name || claimantProfile.email || 'User (' + (claim.user_id ? claim.user_id.slice(0, 6) : 'Unknown') + ')';
      const studentId = claimantProfile.student_id || 'N/A';
      const claimantEmail = claimantProfile.email || 'N/A';
      const phone = claim.contact_phone || claimantProfile.phone || 'N/A';
      const linkedItem = itemsMap[claim.item_id] || {};
      const itemName = claim.item_name || linkedItem.item_name || 'Unspecified Item';
      const dateStr = claim.created_at ? new Date(claim.created_at).toLocaleDateString() : 'N/A';
      const statusClass = (claim.status || 'pending').toLowerCase();

      const card = document.createElement('div');
      card.className = 'claim-card';
      card.setAttribute('data-claim-id', claim.id);

      card.innerHTML = `
        <div class="claim-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; font-size:1.1rem; color:#0f172a;">Claim #${claim.id.slice(0, 6).toUpperCase()}</h3>
          <span class="status ${statusClass}" style="padding:4px 10px; border-radius:12px; font-weight:bold; font-size:0.75rem; text-transform:capitalize;">${claim.status || 'Pending'}</span>
        </div>
        <div class="claim-details" style="font-size:0.9rem; line-height:1.6; color:#334155;">
          <p style="margin:4px 0;"><strong>Item Being Claimed:</strong> <span style="color:#0284c7; font-weight:600;">${escapeHTML(itemName)}</span></p>
          <p style="margin:4px 0;"><strong>Claimant:</strong> ${escapeHTML(claimantName)}</p>
          <p style="margin:4px 0;"><strong>Student ID:</strong> ${escapeHTML(studentId)} | <strong>Email:</strong> ${escapeHTML(claimantEmail)} | <strong>Phone:</strong> ${escapeHTML(phone)}</p>
          <p style="margin:4px 0;"><strong>Date Submitted:</strong> ${dateStr}</p>
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:8px 0;">
          <p style="margin:4px 0;"><strong>Reason:</strong> ${escapeHTML(claim.claim_reason)}</p>
          <p style="margin:4px 0;"><strong>Item Description:</strong> ${escapeHTML(claim.item_description)}</p>
          <p style="margin:4px 0;"><strong>Proof of Ownership:</strong> ${escapeHTML(claim.proof_details)}</p>
        </div>
        <div class="claim-actions" style="margin-top:14px; display:flex; gap:10px;">
          ${(statusClass === 'pending') ? `
            <button class="approve-btn" onclick="processClaimAction('${claim.id}', '${claim.item_id || ''}', 'Approved')" style="background:#16a34a; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold;">Approve Claim</button>
            <button class="reject-btn" onclick="processClaimAction('${claim.id}', '${claim.item_id || ''}', 'Rejected')" style="background:#dc2626; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:bold;">Reject Claim</button>
          ` : `
            <span style="color:#64748b; font-size:0.85rem; font-style:italic;">Status: ${claim.status}</span>
          `}
        </div>
      `;

      claimsContainer.appendChild(card);
    });
  }

  // Global action handler for Approve / Reject buttons
  window.processClaimAction = async function (claimId, itemId, actionStatus) {
    if (!confirm(`Are you sure you want to mark this claim as ${actionStatus}?`)) return;

    try {
      // 1. Update Claim status
      const { error: claimErr } = await supabase
        .from('Claims')
        .update({ status: actionStatus })
        .eq('id', claimId);

      if (claimErr) {
        alert('Failed to update claim: ' + claimErr.message);
        return;
      }

      // 2. If approved and linked to an Item, mark Item as Claimed
      if (actionStatus === 'Approved' && itemId) {
        const { error: itemErr } = await supabase
          .from('Items')
          .update({ status: 'Claimed' })
          .eq('id', itemId);

        if (itemErr) {
          console.warn('Item status update error:', itemErr.message);
        }
      }

      alert(`Claim successfully updated to ${actionStatus}.`);
      await loadDataAndRender();
    } catch (err) {
      console.error('Action error:', err);
      alert('An unexpected error occurred: ' + err.message);
    }
  };

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
