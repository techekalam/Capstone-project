(function () {
  const supabase = window.supabaseClient;
  let currentUser = null;

  const claimForm = document.getElementById('claimForm');
  const messageEl = document.getElementById('message');
  const submitBtn = document.getElementById('submitClaimBtn');

  const itemIdInput = document.getElementById('itemId');
  const itemNameInput = document.getElementById('itemName');
  const claimReasonInput = document.getElementById('claimReason');
  const itemDescriptionInput = document.getElementById('itemDescription');
  const proofDetailsInput = document.getElementById('proofDetails');
  const contactPhoneInput = document.getElementById('contactPhone');

  const itemPreviewCard = document.getElementById('itemPreviewCard');
  const previewImage = document.getElementById('previewImage');
  const previewName = document.getElementById('previewName');
  const previewMeta = document.getElementById('previewMeta');

  // Initialize Page & Session
  async function init() {
    if (!supabase) {
      if (messageEl) {
        messageEl.style.color = '#ef4444';
        messageEl.textContent = 'Database client failed to load. Please refresh the page.';
      }
      return;
    }

    // Check user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      window.location.href = '../login-page/login.html';
      return;
    }

    currentUser = session.user;

    // Load profile to pre-fill contact phone
    try {
      const { data: profile } = await supabase
        .from('Profiles')
        .select('phone, full_name')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (profile && profile.phone && contactPhoneInput) {
        contactPhoneInput.value = profile.phone;
      }
    } catch (e) {
      console.warn('Could not pre-fill phone from profile:', e);
    }

    // Check URL query parameters for item_id
    const urlParams = new URLSearchParams(window.location.search);
    const targetItemId = urlParams.get('item_id') || urlParams.get('itemId');

    if (targetItemId) {
      itemIdInput.value = targetItemId;
      loadItemDetails(targetItemId);
    }
  }

  // Load details of item being claimed
  async function loadItemDetails(id) {
    try {
      const { data: item, error } = await supabase
        .from('Items')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching item details:', error);
        return;
      }

      if (item) {
        if (itemNameInput) {
          itemNameInput.value = item.item_name || item.name || '';
        }
        if (itemPreviewCard) {
          itemPreviewCard.style.display = 'flex';
          if (previewImage) {
            previewImage.src = item.image_url || item.imageUrl || 'placeholder.png';
          }
          if (previewName) {
            previewName.textContent = item.item_name || 'Found Item';
          }
          if (previewMeta) {
            const itemDate = item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent';
            previewMeta.textContent = `${item.category || 'Item'} — ${item.location || 'Campus'} — ${itemDate}`;
          }
        }
      }
    } catch (e) {
      console.error('Failed to load item:', e);
    }
  }

  // Handle Claim Form Submission
  if (claimForm) {
    claimForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!currentUser) {
        messageEl.style.color = '#ef4444';
        messageEl.textContent = 'Session expired. Please log in again.';
        setTimeout(() => (window.location.href = '../login-page/login.html'), 1500);
        return;
      }

      const itemIdVal = itemIdInput.value.trim() || null;
      const itemNameVal = itemNameInput.value.trim();
      const claimReasonVal = claimReasonInput.value.trim();
      const itemDescriptionVal = itemDescriptionInput.value.trim();
      const proofDetailsVal = proofDetailsInput.value.trim();
      const contactPhoneVal = contactPhoneInput.value.trim();

      if (!itemNameVal || !claimReasonVal || !itemDescriptionVal || !proofDetailsVal || !contactPhoneVal) {
        messageEl.style.color = '#ef4444';
        messageEl.textContent = 'Please complete all required fields.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Claim…';
      messageEl.style.color = '#38bdf8';
      messageEl.textContent = 'Sending claim verification request…';

      // Check if itemIdVal is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validItemId = (itemIdVal && uuidRegex.test(itemIdVal)) ? itemIdVal : null;

      const claimPayload = {
        user_id: currentUser.id,
        item_id: validItemId,
        item_name: itemNameVal,
        claim_reason: claimReasonVal,
        item_description: itemDescriptionVal,
        proof_details: proofDetailsVal,
        contact_phone: contactPhoneVal,
        status: 'Pending'
      };

      let { data, error } = await supabase.from('Claims').insert(claimPayload);

      // If foreign key constraint on item_id fails (e.g. item ID from Reports table or non-matching ID), retry with item_id = null
      if (error && (error.code === '23503' || error.message.includes('foreign key') || error.message.includes('Claims_item_id_fkey'))) {
        console.warn('Foreign key constraint on item_id. Retrying claim submission with item_id = null.');
        claimPayload.item_id = null;
        const retryRes = await supabase.from('Claims').insert(claimPayload);
        error = retryRes.error;
      }

      if (error) {
        console.error('Supabase Claims insert error:', error);
        
        // Fallback: If Claims table does not exist in Supabase yet, insert as a report entry
        if (error.code === '42P01' || error.message.includes('relation "public.Claims" does not exist')) {
          console.warn('Claims table missing. Attempting fallback to Reports table.');
          
          const { error: fallbackErr } = await supabase.from('Reports').insert({
            user_id: currentUser.id,
            item_type: 'Claim Request',
            category: itemNameVal,
            location: 'Campus Security Office',
            date: new Date().toISOString().split('T')[0],
            description: `[CLAIM] Reason: ${claimReasonVal} | Desc: ${itemDescriptionVal} | Proof: ${proofDetailsVal} | Phone: ${contactPhoneVal}`,
            status: 'Pending'
          });

          if (fallbackErr) {
            messageEl.style.color = '#ef4444';
            messageEl.textContent = 'Submission failed: ' + fallbackErr.message;
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Claim Request';
            return;
          }
        } else {
          messageEl.style.color = '#ef4444';
          messageEl.textContent = 'Submission failed: ' + error.message;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Claim Request';
          return;
        }
      }

      messageEl.style.color = '#4ade80';
      messageEl.textContent = '✅ Claim request submitted successfully! Your claim has been sent to the Lost & Found Officer for verification.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Claim Request';
      claimForm.reset();

      const itemPreviewCard = document.getElementById('itemPreviewCard');
      if (itemPreviewCard) {
        itemPreviewCard.style.display = 'none';
      }

      // Redirect user to their Student Dashboard (dashboard.html)
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 2500);
    });
  }

  // Logout button handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (supabase) await supabase.auth.signOut();
      window.location.href = '../login-page/login.html';
    });
  }

  // Run initialization
  document.addEventListener('DOMContentLoaded', init);
})();
