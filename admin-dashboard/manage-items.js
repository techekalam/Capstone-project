// ── Auth guard: only allow admins ──────────────────────────────────────
(function() {
    const sb = window.supabaseClient;
    if (!sb) return;

    let currentUserId = null;

    sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.replace('../login-page/login.html');
            return;
        }
        if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return;

        currentUserId = session.user.id;

        const { data: profile } = await sb
            .from('Profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

        const role = (profile && profile.role ? profile.role : '').toLowerCase();
        const emailLower = session.user.email.toLowerCase();
        const isAdmin = role === 'admin' || emailLower.includes('admin');

        if (!isAdmin) {
            window.location.replace('../login-page/login.html');
            return;
        }

        // Wire logout buttons
        document.querySelectorAll('#logoutBtn, .logout-btn, #logout-sidebar-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await sb.auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                window.location.replace('../login-page/login.html');
            });
        });

        // Initialize item data loading
        loadItemsData();
    });

    let allItemsStore = [];

    async function loadItemsData() {
        const grid = document.getElementById('items-grid');
        if (!grid) return;

        grid.innerHTML = '<p style="color: white; grid-column: span 2; text-align: center;">Loading items from database...</p>';

        try {
            const [itemsRes, reportsRes] = await Promise.all([
                sb.from('Items').select('*').order('created_at', { ascending: false }),
                sb.from('Reports').select('*').order('created_at', { ascending: false })
            ]);

            const itemsData = itemsRes.data || [];
            const reportsData = reportsRes.data || [];

            const combined = [];

            // 1) Process Items table records
            itemsData.forEach(item => {
                combined.push({
                    id: item.id,
                    name: item.item_name || 'Unnamed Item',
                    category: item.category || 'Other',
                    type: item.type || 'Found Item',
                    location: item.location || 'Campus',
                    description: item.description || '',
                    image: item.image_url || '../login-page/images/logo.jpg',
                    status: item.status || 'Unclaimed',
                    created_at: item.created_at,
                    source: 'Items'
                });
            });

            // 2) Process Reports table records
            reportsData.forEach(report => {
                const isLost = (report.item_type || '').toLowerCase().includes('lost');
                const title = report.item_name || report.category || (isLost ? 'Lost Item' : 'Found Item');
                combined.push({
                    id: report.id,
                    name: title,
                    category: report.category || 'Report',
                    type: isLost ? 'Lost Item' : 'Found Item',
                    location: report.location || 'Campus',
                    description: report.description || '',
                    image: report.image_url || '../login-page/images/logo.jpg',
                    status: report.status || (isLost ? 'Lost' : 'Unclaimed'),
                    created_at: report.created_at || report.date,
                    source: 'Reports'
                });
            });

            // Sort newest first
            combined.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            allItemsStore = combined;

            renderItems();
        } catch (err) {
            console.error('Failed to load items:', err);
            grid.innerHTML = `<p style="color: #ef4444; grid-column: span 2; text-align: center;">Error loading items: ${err.message}</p>`;
        }
    }

    function renderItems() {
        const grid = document.getElementById('items-grid');
        if (!grid) return;

        const searchVal = (document.getElementById('search-item')?.value || '').toLowerCase().trim();
        const filterVal = (document.getElementById('filter-item')?.value || 'all').toLowerCase();

        const filtered = allItemsStore.filter(item => {
            // Status Filter match
            if (filterVal !== 'all') {
                const itemStatus = (item.status || '').toLowerCase();
                const itemType = (item.type || '').toLowerCase();
                if (filterVal === 'lost' && !itemStatus.includes('lost') && !itemType.includes('lost')) return false;
                if (filterVal === 'found' && !itemStatus.includes('found') && !itemType.includes('found') && !itemStatus.includes('unclaimed')) return false;
                if (filterVal === 'claimed' && !itemStatus.includes('claimed')) return false;
                if (filterVal === 'pending' && !itemStatus.includes('pending')) return false;
            }

            // Search Query match
            if (searchVal) {
                const nameMatch = (item.name || '').toLowerCase().includes(searchVal);
                const catMatch = (item.category || '').toLowerCase().includes(searchVal);
                const locMatch = (item.location || '').toLowerCase().includes(searchVal);
                const descMatch = (item.description || '').toLowerCase().includes(searchVal);
                return nameMatch || catMatch || locMatch || descMatch;
            }

            return true;
        });

        grid.innerHTML = '';

        if (filtered.length === 0) {
            grid.innerHTML = `<p style="color: #cbd5e1; grid-column: span 2; text-align: center; font-style: italic; padding: 20px;">No matching items found.</p>`;
            return;
        }

        filtered.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';

            const rawStatus = (item.status || 'Unclaimed').toLowerCase();
            let statusClass = 'found';
            if (rawStatus.includes('lost')) statusClass = 'lost';
            else if (rawStatus.includes('claimed')) statusClass = 'claimed';

            card.innerHTML = `
                <img src="${item.image}" alt="${escapeHTML(item.name)}" style="cursor: pointer;">
                <div class="item-details" style="flex: 1;">
                    <h3 style="margin-top:0;">${escapeHTML(item.name)}</h3>
                    <p><strong>Category:</strong> ${escapeHTML(item.category)}</p>
                    <p><strong>Location:</strong> ${escapeHTML(item.location)}</p>
                    <p><strong>Type:</strong> ${escapeHTML(item.type)}</p>
                    <span class="status ${statusClass}">
                        ${escapeHTML(item.status)}
                    </span>
                    <div class="card-buttons">
                        <button class="view-btn" data-id="${item.id}">View</button>
                        <button class="delete-btn" data-id="${item.id}" data-source="${item.source}">Delete</button>
                    </div>
                </div>
            `;

            // View Button
            card.querySelector('.view-btn').onclick = () => {
                document.getElementById('view-image').src = item.image;
                document.getElementById('view-name').textContent = item.name;
                document.getElementById('view-category').innerHTML = `<strong>Category:</strong> ${escapeHTML(item.category)}`;
                document.getElementById('view-location').innerHTML = `<strong>Location:</strong> ${escapeHTML(item.location)}`;
                document.getElementById('view-status').innerHTML = `<strong>Status:</strong> ${escapeHTML(item.status)}`;
                document.getElementById('view-description').textContent = item.description ? `"${item.description}"` : 'No description provided.';
                
                const viewModal = document.getElementById('view-item-modal');
                if (viewModal) viewModal.style.display = 'flex';
            };

            // Delete Button
            card.querySelector('.delete-btn').onclick = async () => {
                if (!confirm(`Delete "${item.name}"?`)) return;

                // Delete from both Items and Reports tables to ensure full cleanup
                const [resItems, resReports] = await Promise.all([
                    sb.from('Items').delete().eq('id', item.id),
                    sb.from('Reports').delete().eq('id', item.id)
                ]);

                const error = resItems.error || resReports.error;

                if (error) {
                    alert('Failed to delete item: ' + error.message);
                } else {
                    allItemsStore = allItemsStore.filter(i => i.id !== item.id);
                    renderItems();
                }
            };

            // Image click preview modal
            card.querySelector('img').onclick = function() {
                const imgModal = document.getElementById('image-modal');
                const fullImg = document.getElementById('full-image');
                if (imgModal && fullImg) {
                    fullImg.src = this.src;
                    imgModal.style.display = 'flex';
                }
            };

            grid.appendChild(card);
        });
    }

    // Search and Filter Listeners
    document.getElementById('search-item')?.addEventListener('input', renderItems);
    document.getElementById('filter-item')?.addEventListener('change', renderItems);

    // Modal toggles
    const addItemBtn = document.getElementById("add-item-btn");
    const addModal = document.getElementById("add-item-modal");
    const viewModal = document.getElementById("view-item-modal");

    if (addItemBtn && addModal) {
        addItemBtn.onclick = () => { addModal.style.display = "flex"; };
    }

    document.querySelectorAll(".close").forEach(el => {
        el.onclick = () => { if (addModal) addModal.style.display = "none"; };
    });

    const closeView = document.querySelector(".close-view");
    if (closeView && viewModal) {
        closeView.onclick = () => { viewModal.style.display = "none"; };
    }

    const imageModal = document.getElementById("image-modal");
    if (imageModal) {
        document.getElementById("close-image")?.addEventListener('click', () => {
            imageModal.style.display = "none";
        });
        imageModal.onclick = () => { imageModal.style.display = "none"; };
    }

    // Save New Item Handler
    const addItemForm = document.getElementById("add-item-form");
    if (addItemForm) {
        addItemForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById("new-name").value.trim();
            const type = document.getElementById("new-type").value;
            const category = document.getElementById("new-category").value.trim();
            const location = document.getElementById("new-location").value.trim();
            const description = document.getElementById("new-description").value.trim();
            const imageFile = document.getElementById("new-image")?.files[0];

            if (!name || !category || !location) {
                alert("Please fill in all required fields.");
                return;
            }

            let imageUrl = null;
            if (imageFile) {
                try {
                    const filePath = `admin/${Date.now()}_${imageFile.name}`;
                    const { error: uploadErr } = await sb.storage.from('item-images').upload(filePath, imageFile);
                    if (!uploadErr) {
                        const { data: publicUrlData } = sb.storage.from('item-images').getPublicUrl(filePath);
                        imageUrl = publicUrlData.publicUrl;
                    }
                } catch (err) {
                    console.warn('Image upload error:', err);
                }
            }

            // 1) Insert into Reports table first to create the master report and satisfy report_id FK
            const reportPayload = {
                user_id: currentUserId,
                item_name: name,
                category: category,
                location: location,
                description: description,
                item_type: type,
                status: 'Unclaimed',
                ...(imageUrl ? { image_url: imageUrl } : {})
            };

            let createdReportId = null;
            const { data: createdReports, error: reportErr } = await sb
                .from('Reports')
                .insert(reportPayload)
                .select();

            if (!reportErr && createdReports && createdReports.length > 0) {
                createdReportId = createdReports[0].id;
            } else if (reportErr) {
                console.warn('Reports table insert warning:', reportErr.message);
            }

            // 2) Insert into Items table with report_id foreign key
            const newItemObj = {
                item_name: name,
                category: category,
                type: type,
                location: location,
                status: 'Unclaimed',
                ...(createdReportId ? { report_id: createdReportId } : {}),
                ...(description ? { description: description } : {}),
                ...(imageUrl ? { image_url: imageUrl } : {}),
                ...(currentUserId ? { user_id: currentUserId } : {})
            };

            let { error: insertErr } = await sb.from('Items').insert(newItemObj);

            // Fallback: if extra columns cause error, strip optional fields and retry
            if (insertErr) {
                delete newItemObj.user_id;
                delete newItemObj.description;
                const { error: retryErr } = await sb.from('Items').insert(newItemObj);
                insertErr = retryErr;
            }

            if (insertErr && !createdReportId) {
                alert('Failed to add item: ' + insertErr.message);
            } else {
                alert('Item added successfully!');
                addItemForm.reset();
                if (addModal) addModal.style.display = "none";
                loadItemsData();
            }
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();