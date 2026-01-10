
let tablesData = [];
let currentSelectedTable = null;
let generationContexts = {};


// --- Context Helper ---
function extractContext(result, storage) {
    if (!result || typeof result !== 'object') return;
    if (result.context) {
        Object.assign(storage, result.context);
    }
}
window.extractContext = extractContext;

// --- User System State & Logic ---
window.currentUser = null;

// Check for session on load
function checkSession() {
    const savedUser = localStorage.getItem('ttrpg_user');
    if (savedUser) {
        try {
            window.currentUser = JSON.parse(savedUser);
            updateUserUI();
        } catch (e) {
            console.error("Error parsing saved user:", e);
            localStorage.removeItem('ttrpg_user');
        }
    }
}

function updateUserUI() {
    const userSection = document.getElementById('userSection');
    const userDisplay = document.getElementById('userDisplay');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminBtn = document.getElementById('adminBtn');

    // Need to update these IDs based on new layout or keep them
    // The new layout will have these IDs inserted.

    if (window.currentUser) {
        if (userDisplay) {
            userDisplay.textContent = `Hello, ${window.currentUser.username}`;
            userDisplay.style.display = 'inline';
        }
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline';

        if (adminBtn) {
            if (window.currentUser.isAdmin) {
                adminBtn.style.display = 'inline';
            } else {
                adminBtn.style.display = 'none';
            }
        }

    } else {
        if (userDisplay) userDisplay.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'inline';
        if (registerBtn) registerBtn.style.display = 'inline';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (adminBtn) adminBtn.style.display = 'none';
    }

    // Re-apply filters in case favorites changed or login state changed
    // Check if applyFilters exists yet (it might be called before definition if not careful, but function hoisting helps)
    if (typeof applyFilters === 'function') applyFilters();
}

// Modal Logic
function openAuthModal(mode) {
    // Close all other modals first
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');

    if (mode === 'forgot-password') {
        document.getElementById('forgotPasswordModal').style.display = 'block';
        return;
    }
    if (mode === 'reset-password') {
        document.getElementById('resetPasswordModal').style.display = 'block';
        return;
    }

    const modal = document.getElementById('authModal');
    const title = document.getElementById('authTitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const switchText = document.getElementById('authSwitchText');
    const emailInput = document.getElementById('email');
    const forgotLink = document.getElementById('forgotPasswordLink');

    modal.style.display = 'block';
    document.getElementById('authError').style.display = 'none';
    document.getElementById('authForm').reset();

    if (mode === 'login') {
        title.textContent = 'Login';
        submitBtn.textContent = 'Login';
        switchText.innerHTML = 'Don\'t have an account? <a onclick="toggleAuthMode()" class="text-primary hover:underline cursor-pointer">Sign up</a>';
        emailInput.style.display = 'none';
        emailInput.required = false;
        forgotLink.style.display = 'inline-block';
        modal.dataset.mode = 'login';
    } else {
        title.textContent = 'Sign Up';
        submitBtn.textContent = 'Sign Up';
        switchText.innerHTML = 'Already have an account? <a onclick="toggleAuthMode()" class="text-primary hover:underline cursor-pointer">Login</a>';
        emailInput.style.display = 'block';
        emailInput.required = true;
        forgotLink.style.display = 'none';
        modal.dataset.mode = 'register';
    }
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function toggleAuthMode() {
    const currentMode = document.getElementById('authModal').dataset.mode;
    openAuthModal(currentMode === 'login' ? 'register' : 'login');
}

// Close modal if clicked outside
window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

async function handleAuth(event) {
    event.preventDefault();
    const mode = document.getElementById('authModal').dataset.mode; // 'login' or 'register'
    const username = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const email = document.getElementById('email').value;
    const errorDiv = document.getElementById('authError');

    if (!username || !pass) {
        errorDiv.textContent = "Please fill in all fields.";
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const endpoint = mode === 'login' ? '/api/login' : '/api/register';
        const body = { username, password: pass };
        if (mode === 'register') body.email = email;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Authentication failed');
        }

        // Success
        window.currentUser = data.user;
        localStorage.setItem('ttrpg_user', JSON.stringify(data.user));
        updateUserUI();
        closeAuthModal();
        showToast(`Successfully ${mode === 'login' ? 'logged in' : 'registered'}!`);

    } catch (e) {
        errorDiv.textContent = e.message;
        errorDiv.style.display = 'block';
    }
}

async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    const msgDiv = document.getElementById('forgotPasswordMessage');
    const errDiv = document.getElementById('forgotPasswordError');

    msgDiv.style.display = 'none';
    errDiv.style.display = 'none';

    try {
        const response = await fetch('/api/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to request reset');

        msgDiv.textContent = data.message;
        msgDiv.style.display = 'block';

    } catch (e) {
        errDiv.textContent = e.message;
        errDiv.style.display = 'block';
    }
}

async function handleResetPassword(event) {
    event.preventDefault();
    const token = document.getElementById('resetToken').value;
    const newPassword = document.getElementById('newPassword').value;
    const msgDiv = document.getElementById('resetPasswordMessage');
    const errDiv = document.getElementById('resetPasswordError');

    msgDiv.style.display = 'none';
    errDiv.style.display = 'none';

    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to reset password');

        msgDiv.textContent = data.message;
        msgDiv.style.display = 'block';

        // Auto close after 2s and show login
        setTimeout(() => {
            closeModal('resetPasswordModal');
            openAuthModal('login');
            showToast('Password reset! Please log in.');
        }, 2000);

    } catch (e) {
        errDiv.textContent = e.message;
        errDiv.style.display = 'block';
    }
}

function logout() {
    window.currentUser = null;
    localStorage.removeItem('ttrpg_user');
    updateUserUI();
    // Reset favorites filter if it was active
    const favBtn = document.getElementById('favoritesFilterBtn');
    if (favBtn && favBtn.classList.contains('active')) {
        toggleFavoritesFilter();
    }
    showToast('Logged out');
}

// Favorites Logic
async function toggleFavorite(filename, btnElement) {
    if (!window.currentUser) {
        // Prompt to login
        openAuthModal('login');
        return;
    }

    try {
        const response = await fetch('/api/user/favorites/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: window.currentUser.username,
                tableFilename: filename
            })
        });

        if (!response.ok) throw new Error("Failed to toggle favorite");

        const data = await response.json();

        // Update local state
        window.currentUser.favorites = data.favorites;
        localStorage.setItem('ttrpg_user', JSON.stringify(window.currentUser));

        // Update UI
        if (data.isFavorite) {
            btnElement.classList.add('active');
        } else {
            btnElement.classList.remove('active');
        }

        // If we are currently filtering by favorites and we removed one, 
        // we might need to refresh the list, but applyFilters handles general filtering.
        if (document.getElementById('favoritesFilterBtn').classList.contains('active')) {
            applyFilters();
        }

    } catch (e) {
        console.error(e);
        showToast("Error updating favorite");
    }
}

function toggleFavoritesFilter() {
    const btn = document.getElementById('favoritesFilterBtn');
    if (!window.currentUser && !btn.classList.contains('active')) {
        openAuthModal('login');
        return;
    }

    btn.classList.toggle('active');
    const icon = btn.querySelector('.material-symbols-outlined');

    if (btn.classList.contains('active')) {
        btn.innerHTML = `<span class="material-symbols-outlined text-lg filled text-yellow-500">star</span><span>Favorites Only</span>`;
        // Add visual indicator of active state
        btn.classList.add('bg-background-light', 'dark:bg-surface-highlight-dark');
    } else {
        btn.innerHTML = `<span class="material-symbols-outlined text-lg">star</span><span>Favorites Only</span>`;
        btn.classList.remove('bg-background-light', 'dark:bg-surface-highlight-dark');
    }
    applyFilters();
}


// Admin Logic
async function openAdminDashboard() {
    if (!window.currentUser || !window.currentUser.isAdmin) return;

    document.getElementById('adminDashboardModal').style.display = 'block';
    loadUsers();
}

async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'x-username': window.currentUser.username }
        });
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        renderUserTable(data.users);
    } catch (e) {
        document.getElementById('adminError').textContent = e.message;
        document.getElementById('adminError').style.display = 'block';
    }
}

function renderUserTable(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-border-light dark:border-border-dark";

        tr.innerHTML = `
            <td class="p-2">${escapeHtml(u.username)}</td>
            <td class="p-2">${escapeHtml(u.email || '-')}</td>
            <td class="p-2">${u.isAdmin ? '✅' : ''}</td>
            <td class="p-2">
                <button onclick="openEditUser('${escapeHtml(u.username)}')" class="px-2 py-1 bg-primary text-white text-xs rounded mr-1">Edit</button>
                ${u.username !== window.currentUser.username ? `<button onclick="deleteUser('${escapeHtml(u.username)}', this)" class="px-2 py-1 bg-red-600 text-white text-xs rounded">Delete</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Helper to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let currentEditingUser = null;

async function openEditUser(username) {
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'x-username': window.currentUser.username }
        });
        const data = await response.json();
        const user = data.users.find(u => u.username === username);

        if (!user) return;

        currentEditingUser = user;
        document.getElementById('editOriginalUsername').value = user.username;
        document.getElementById('editUsername').value = user.username;
        document.getElementById('editEmail').value = user.email || '';
        document.getElementById('editPassword').value = ''; // Don't show hash
        document.getElementById('editIsAdmin').checked = !!user.isAdmin;

        document.getElementById('editUserModal').style.display = 'block';
        document.getElementById('editUserError').style.display = 'none';

    } catch (e) {
        console.error(e);
    }
}

async function handleEditUser(event) {
    event.preventDefault();
    const originalUsername = document.getElementById('editOriginalUsername').value;
    const newUsername = document.getElementById('editUsername').value;
    const email = document.getElementById('editEmail').value;
    const password = document.getElementById('editPassword').value;
    const isAdmin = document.getElementById('editIsAdmin').checked;

    try {
        const body = {
            newUsername,
            email,
            isAdmin
        };
        if (password) body.password = password;

        const response = await fetch(`/api/admin/users/${originalUsername}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-username': window.currentUser.username
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        closeModal('editUserModal');
        showToast('User updated successfully');
        loadUsers(); // Refresh list

        // If we edited ourselves, update local session
        if (originalUsername === window.currentUser.username) {
            window.currentUser = { ...window.currentUser, ...data.user };
            localStorage.setItem('ttrpg_user', JSON.stringify(window.currentUser));
            updateUserUI();
        }

    } catch (e) {
        document.getElementById('editUserError').textContent = e.message;
        document.getElementById('editUserError').style.display = 'block';
    }
}

async function deleteUser(username, btnElement) {
    if (!btnElement) return;

    // Check if we are in confirmation state
    if (btnElement.dataset.confirming === 'true') {
        // Perform delete
        console.log('Sending delete request for:', username);
        // Disable button
        btnElement.disabled = true;
        btnElement.textContent = 'Deleting...';

        try {
            const response = await fetch(`/api/admin/users/${username}`, {
                method: 'DELETE',
                headers: { 'x-username': window.currentUser.username }
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            console.log('Delete success');
            showToast('User deleted');
            loadUsers();
        } catch (e) {
            console.error('Delete failed:', e);
            alert("Error deleting user: " + e.message);
            // Restore button
            btnElement.disabled = false;
            btnElement.textContent = 'Delete';
            btnElement.classList.remove('bg-red-800');
            btnElement.classList.add('bg-red-600');
            delete btnElement.dataset.confirming;
        }
    } else {
        // Switch to confirmation state
        btnElement.dataset.confirming = 'true';
        btnElement.textContent = 'Confirm?';
        btnElement.classList.remove('bg-red-600');
        btnElement.classList.add('bg-red-800'); // Darker red

        // Auto-revert after 3 seconds
        setTimeout(() => {
            // Check if still in document and hasn't been clicked (which would remove or disable it)
            if (document.body.contains(btnElement) && !btnElement.disabled && btnElement.dataset.confirming === 'true') {
                btnElement.textContent = 'Delete';
                btnElement.classList.remove('bg-red-800');
                btnElement.classList.add('bg-red-600');
                delete btnElement.dataset.confirming;
            }
        }, 3000);
    }
}
// Explicitly attach to window
window.deleteUser = deleteUser;

document.addEventListener('DOMContentLoaded', async function () {
    checkSession(); // Check for logged in user
    try {
        const response = await fetch('/api/tables');
        tablesData = await response.json();
        console.log('Tables Data:', tablesData);
        populateFilterButtons(tablesData);
        applyFilters();
    } catch (error) {
        console.error('Error fetching tables:', error);
    }

    // Set up drag and drop for saved cards
    const savedArea = document.getElementById('savedGenerations');

    if (savedArea) {
        savedArea.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.classList.add('drop-target-highlight');
            e.dataTransfer.dropEffect = 'copy';
        });

        savedArea.addEventListener('dragleave', function (e) {
            this.classList.remove('drop-target-highlight');
        });

        savedArea.addEventListener('drop', function (e) {
            e.preventDefault();
            this.classList.remove('drop-target-highlight');
            const cardIndex = e.dataTransfer.getData('text/plain');
            const originalCard = document.querySelector(`.generation-container[data-index="${cardIndex}"]`);

            if (!originalCard) return;

            // Check if this card already exists in the saved area by comparing content
            const cardTitle = originalCard.querySelector('.card-title-text').textContent;

            // Get all headers and contents from the original card to create a unique signature
            const originalHeaders = Array.from(originalCard.querySelectorAll('.result-header')).map(h => h.textContent);
            const originalContents = Array.from(originalCard.querySelectorAll('.result-content')).map(c => c.textContent);
            const cardSignature = JSON.stringify({ title: cardTitle, headers: originalHeaders, contents: originalContents });

            // Check if a card with the same signature already exists
            let isDuplicate = false;
            const savedCards = savedArea.querySelectorAll('.generation-container');
            savedCards.forEach(savedCard => {
                const savedHeaders = Array.from(savedCard.querySelectorAll('.result-header')).map(h => h.textContent);
                const savedContents = Array.from(savedCard.querySelectorAll('.result-content')).map(c => c.textContent);
                const savedSignature = JSON.stringify({
                    title: savedCard.querySelector('.card-title-text').textContent,
                    headers: savedHeaders,
                    contents: savedContents
                });

                if (savedSignature === cardSignature) {
                    isDuplicate = true;
                }
            });

            if (isDuplicate) {
                showToast('Card already exists in Saved Cards');
                return;
            }

            // Clone the card and add to saved area
            const cardClone = originalCard.cloneNode(true);
            const newIndex = `saved-${Date.now()}`;
            cardClone.dataset.index = newIndex;

            // Reattach event handlers for all buttons in the cloned card
            cardClone.querySelector('.copy-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToMarkdown(cardClone);
            });

            cardClone.querySelector('.reroll-all-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                rerollAllContent(cardClone);
            });

            cardClone.querySelector('.delete-card-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteCard(cardClone);
            });

            // Make the clone draggable too
            cardClone.addEventListener('dragstart', handleCardDragStart);
            cardClone.addEventListener('dragend', handleCardDragEnd);

            // Update collapse button handlers
            cardClone.querySelector('.collapse-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleCardCollapse(e.currentTarget);
            });

            // Add the card to the saved area
            this.appendChild(cardClone);

            // Show confirmation
            showToast('Card saved!');
        });
    }

    // Check filter overflow on window resize
    window.addEventListener('resize', debounce(() => {
        checkFilterBarOverflow();
    }, 250));
});

// New function to populate filter buttons
function populateFilterButtons(tables) {
    console.log('Populating filter buttons');
    const gameSet = new Set();
    const typeSet = new Set();
    const settingSet = new Set();

    tables.forEach(table => {
        if (table.game) gameSet.add(table.game);

        if (Array.isArray(table.type)) {
            table.type.forEach(t => {
                if (t) typeSet.add(t);
            });
        } else if (table.type) {
            typeSet.add(table.type);
        }

        if (table.setting) settingSet.add(table.setting);
    });

    createFilterButtons('gameFilter', Array.from(gameSet));
    createFilterButtons('typeFilter', Array.from(typeSet));
    createFilterButtons('settingFilter', Array.from(settingSet));

    populateSearchSuggestions(tables);
}

// Helper function to create filter buttons
function createFilterButtons(filterId, options) {
    const filterContainer = document.getElementById(filterId);
    if (!filterContainer) {
        console.error(`Filter container not found: ${filterId}`);
        return;
    }

    filterContainer.innerHTML = '';

    if (options.length === 0) {
        const noOptionsMsg = document.createElement('span');
        noOptionsMsg.textContent = 'None available';
        noOptionsMsg.className = 'text-xs italic text-gray-500';
        filterContainer.appendChild(noOptionsMsg);
        return;
    }

    options.sort().forEach(option => {
        const button = document.createElement('button');
        button.className = 'filter-btn'; // Uses our CSS class
        // Add Tailwind classes for basic styling as fallback/augment
        button.classList.add('px-3', 'py-1', 'rounded-full', 'text-xs', 'font-medium', 'border', 'border-transparent', 'hover:bg-gray-200', 'dark:hover:bg-slate-600', 'transition-colors', 'whitespace-nowrap');

        button.textContent = option;
        button.dataset.value = option;
        button.onclick = function () {
            toggleFilterButton(this, filterId);
        };
        filterContainer.appendChild(button);
    });
}


function populateSearchSuggestions(tables) {
    const suggestions = new Set();
    tables.forEach(table => {
        if (table.tablename) suggestions.add(table.tablename);
        if (table.game) suggestions.add(table.game);
        if (table.setting) suggestions.add(table.setting);
        if (table.type) {
            if (Array.isArray(table.type)) {
                table.type.forEach(t => suggestions.add(t));
            } else {
                suggestions.add(table.type);
            }
        }
    });

    const dataList = document.getElementById('searchSuggestions');
    if (dataList) {
        dataList.innerHTML = '';
        Array.from(suggestions).sort().forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            dataList.appendChild(option);
        });
    }
}

// Reuse toggleFilterButton, clearFilter, etc. from legacy
function checkFilterOverflow(filterId) {
    // Basic implementation or empty if layout handles it
}

function toggleFilterButton(button, filterId) {
    const filterContainer = document.getElementById(filterId);
    const currentMode = filterContainer.dataset.mode || 'all-selected';

    if (currentMode === 'all-selected') {
        filterContainer.dataset.mode = 'choice';
        const buttons = filterContainer.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            btn.classList.add('unselected');
            btn.classList.remove('selected', 'bg-primary', 'text-white');
        });

        button.classList.remove('unselected');
        button.classList.add('selected');
    } else {
        button.classList.toggle('unselected');
        button.classList.toggle('selected');

        if (filterContainer.querySelectorAll('.filter-btn.selected').length === 0) {
            clearFilter(filterId.replace('Filter', ''));
        }
    }
    applyFilters();
}

function clearFilter(filterType) {
    const filterId = filterType + 'Filter';
    const filterContainer = document.getElementById(filterId);
    if (!filterContainer) return;

    filterContainer.dataset.mode = 'all-selected';
    const buttons = filterContainer.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.remove('unselected', 'selected');
    });
    applyFilters();
}

function resetFilters() {
    clearFilter('game');
    clearFilter('type');
    clearFilter('setting');
    document.getElementById('searchInput').value = '';

    const favBtn = document.getElementById('favoritesFilterBtn');
    if (favBtn && favBtn.classList.contains('active')) {
        toggleFavoritesFilter();
    }

    applyFilters();
}

function performSearch() {
    applyFilters();
}

function handleSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const query = document.getElementById('searchInput').value.trim();
        if (!query) return;

        // check if query matches a filter option
        if (tryApplySmartFilter(query)) {
            document.getElementById('searchInput').value = '';
            applyFilters();
        }
    }
}

function tryApplySmartFilter(query) {
    // Try Game Filter
    if (attemptFilterMatch('gameFilter', query)) return true;
    // Try Setting Filter
    if (attemptFilterMatch('settingFilter', query)) return true;
    // Try Type Filter
    if (attemptFilterMatch('typeFilter', query)) return true;

    return false;
}

function attemptFilterMatch(filterId, query) {
    const container = document.getElementById(filterId);
    if (!container) return false;

    // Find a button that matches the query case-insensitive
    const buttons = Array.from(container.querySelectorAll('.filter-btn'));
    const match = buttons.find(btn => btn.dataset.value.toLowerCase() === query.toLowerCase());

    if (match) {
        // If already selected, do nothing? Or maybe ensure it IS selected.
        // The logic says "Accept my entry". Usually implies "Set this filter".
        // Use existing toggle logic.

        // If we are in 'all-selected' mode, we need to switch to 'choice' mode.
        // toggleFilterButton handles this.

        // However, if it's ALREADY selected in choice mode, toggling it might Deselect it.
        // We probably want to ENSURE it is selected.

        const isSelected = match.classList.contains('selected');
        if (!isSelected) {
            toggleFilterButton(match, filterId);
        } else {
            // If already selected, maybe we just want to focus it? 
            // But for "Smart Search", if I type "Knave" and it's already "Knave", 
            // clearing the search box is still the right visual feedback that "I understood you".
        }
        return true;
    }
    return false;
}

function applyFilters() {
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    const gameFilter = getSelectedValues('gameFilter');
    const typeFilter = getSelectedValues('typeFilter');
    const settingFilter = getSelectedValues('settingFilter');

    const matchingTablesContainer = document.getElementById('matchingTablesContainer');
    matchingTablesContainer.innerHTML = '';

    const filteredTables = tablesData.filter(table => {
        const matchesSearch = searchQuery === '' ||
            (table.tablename && table.tablename.toLowerCase().includes(searchQuery)) ||
            (table.filename && table.filename.toLowerCase().includes(searchQuery)) ||
            (table.game && table.game.toLowerCase().includes(searchQuery)) ||
            (table.setting && table.setting.toLowerCase().includes(searchQuery)) ||
            (Array.isArray(table.type)
                ? table.type.some(t => t.toLowerCase().includes(searchQuery))
                : (table.type && table.type.toLowerCase().includes(searchQuery)));
        const matchesGame = gameFilter.length === 0 ||
            (table.game && gameFilter.includes(table.game));

        let matchesType = false;
        if (typeFilter.length === 0) {
            matchesType = true;
        } else if (Array.isArray(table.type)) {
            matchesType = table.type.some(t => typeFilter.includes(t));
        } else {
            matchesType = table.type && typeFilter.includes(table.type);
        }

        const matchesSetting = settingFilter.length === 0 ||
            (table.setting && settingFilter.includes(table.setting));

        const showFavoritesOnly = document.getElementById('favoritesFilterBtn') && document.getElementById('favoritesFilterBtn').classList.contains('active');
        const matchesFavorite = !showFavoritesOnly ||
            (window.currentUser && window.currentUser.favorites && window.currentUser.favorites.includes(table.filename));

        return matchesSearch && matchesGame && matchesType && matchesSetting && matchesFavorite;
    });

    filteredTables.forEach(table => {
        const button = document.createElement('button');
        button.className = 'matching-table-button';
        button.innerHTML = `<span class="">${table.tablename ?? 'Undefined'}</span> <span class="text-xs text-muted-light dark:text-muted-dark opacity-70 ml-2">${table.game ?? ''}</span>`;
        button.title = `Filename: ${table.filename}`;

        button.onclick = () => {
            displayTableDetails(table);
            clearGeneratedList();
            generateContent();
        };

        matchingTablesContainer.appendChild(button);
    });

    updateAvailableOptions(filteredTables);
}

function getSelectedValues(filterId) {
    const filterContainer = document.getElementById(filterId);
    const mode = filterContainer.dataset.mode;
    if (mode === 'all-selected') return [];
    const selectedButtons = filterContainer.querySelectorAll('.filter-btn.selected');
    return Array.from(selectedButtons).map(btn => btn.dataset.value);
}

// ... Rest of the functions (displayTableDetails, generateContent, etc) 
// I'll skip redeclaring them to save space if they are identical, 
// BUT since I'm creating a new file, I MUST include them.

// IMPORTANT: Implementation of displayTableDetails needs to target the new layout
function displayTableDetails(table) {
    const tableHeadersContainer = document.getElementById('tableHeaders');
    tableHeadersContainer.innerHTML = '';

    // Title with Favorite
    const wrapper = document.createElement('div');
    wrapper.className = "flex items-center justify-between mb-4 border-b border-border-light dark:border-border-dark pb-4";

    const titleDiv = document.createElement('div');
    titleDiv.className = "flex items-center gap-3";
    const h2 = document.createElement('h2');
    h2.className = "text-2xl font-bold text-text-main-light dark:text-white";
    h2.textContent = table.tablename ?? 'Unnamed Table';
    titleDiv.appendChild(h2);

    const favBtn = document.createElement('button');
    favBtn.className = "favorite-toggle text-yellow-500 hover:text-yellow-400 transform transition-transform hover:scale-110";
    favBtn.innerHTML = '<span class="material-symbols-outlined filled">star</span>';
    favBtn.onclick = (e) => { e.stopPropagation(); toggleFavorite(table.filename, favBtn); };
    if (window.currentUser?.favorites?.includes(table.filename)) favBtn.classList.add('active');
    titleDiv.appendChild(favBtn);
    wrapper.appendChild(titleDiv);

    // Tags
    const tagsDiv = document.createElement('div');
    tagsDiv.className = "flex gap-2 text-xs text-text-muted-light dark:text-text-muted-dark";
    ['game', 'type', 'setting'].forEach(key => {
        if (table[key]) {
            const tag = document.createElement('span');
            tag.className = "bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded";
            tag.textContent = table[key];
            tagsDiv.appendChild(tag);
        }
    });
    // wrap title and tags in one div? No, separate.

    // Actually, let's put tags below title in the wrapper?
    // Let's structure nicely.
    const infoDiv = document.createElement('div');
    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(tagsDiv);
    wrapper.innerHTML = ''; // Request clear
    wrapper.appendChild(infoDiv);

    // Controls (Slider)
    const controlsDiv = document.createElement('div');
    controlsDiv.className = "flex flex-col gap-4 max-w-lg";
    controlsDiv.innerHTML = `
    <div class="flex items-center gap-4">
        <label class="text-sm font-medium text-text-muted-light dark:text-text-muted-dark whitespace-nowrap">Count: <span id="generationValue" class="text-primary font-bold ml-1">1</span></label>
        <input class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700" id="generationSlider" type="range" min="1" max="100" value="1" oninput="updateGenerationValue()">
    </div>
  `;

    // Add input fields if needed
    if (table.inputField && table.inputField.length >= 2) {
        const inputDiv = document.createElement('div');
        inputDiv.className = "flex items-center gap-2 text-sm";
        const lbl = document.createElement('label');
        lbl.className = "text-text-muted-light dark:text-text-muted-dark";
        lbl.textContent = table.inputField[0] + ":";
        const inp = document.createElement('input');
        inp.id = `input-${table.inputField[0]}`;
        inp.type = table.inputField[1] === 'number' ? 'number' : 'text';
        inp.className = "w-20 bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded px-2 py-1 text-sm focus:ring-primary focus:border-primary";
        inputDiv.appendChild(lbl);
        inputDiv.appendChild(inp);
        controlsDiv.appendChild(inputDiv);
    }

    wrapper.appendChild(controlsDiv);
    tableHeadersContainer.appendChild(wrapper);

    // Store metadata on the header for generation
    h2.dataset.filename = table.filename;
    h2.dataset.game = table.game;

    document.getElementById('generationControls').style.display = 'block';
    document.getElementById('generationSlider').value = 1;
}

function updateGenerationValue() {
    document.getElementById('generationValue').textContent = document.getElementById('generationSlider').value;
}

function clearGeneratedList() {
    document.getElementById('results').innerHTML = '';
}

function displayErrorMessage(message) {
    const d = document.createElement('div');
    d.className = "p-4 text-red-500 bg-red-100 rounded";
    d.textContent = message;
    document.getElementById('results').appendChild(d);
}

// ... Include generateContent, rerollContent, rerollAllContent, extractDisplayValueForTitle, etc.
// Since I cannot rely on 'include' in text, I must provide them.
// I will output the Rest of the Logic in a second write if needed, or simply trust the Context filtering.

/* Part 2 of JS */

function generateContent() {
    clearGeneratedList();

    const numberOfGenerations = document.getElementById('generationSlider').value;
    // Get the header element with the table name from the new layout
    const tableHeader = document.querySelector('#tableHeaders h2');

    if (!tableHeader) {
        console.error('No table header found');
        displayErrorMessage('Error: No table selected for generation.');
        return;
    }

    // Get the filename and game from data attributes
    const selectedTableName = tableHeader.textContent;
    const selectedFileName = tableHeader.dataset.filename;
    const selectedGameName = tableHeader.dataset.game;

    const selectedTable = tablesData.find(t => {
        if (selectedFileName && t.filename === selectedFileName) return true;
        if (t.tablename === selectedTableName && t.game === selectedGameName) return true;
        return false;
    });

    if (!selectedTable) {
        displayErrorMessage(`Error: Table "${selectedTableName}" not found.`);
        return;
    }

    currentSelectedTable = selectedTable;
    generationContexts = {};

    // Show loading indicator
    const resultsContainer = document.getElementById('results');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'p-4 text-center text-muted-light dark:text-muted-dark animate-pulse';
    loadingDiv.id = 'loading-indicator';
    loadingDiv.textContent = 'Generating...';
    resultsContainer.appendChild(loadingDiv);

    // Collect input field values
    const inputValues = {};
    if (selectedTable.inputField && Array.isArray(selectedTable.inputField)) {
        const inputFieldName = selectedTable.inputField[0];
        const inputField = document.getElementById(`input-${inputFieldName}`);
        if (inputField) {
            if (selectedTable.inputField[1] === 'number') {
                inputValues[inputFieldName] = parseFloat(inputField.value) || 0;
            } else {
                inputValues[inputFieldName] = inputField.value;
            }
        }
    }

    fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            table: selectedTable,
            number: parseInt(numberOfGenerations),
            inputValues: inputValues
        })
    })
        .then(response => {
            document.getElementById('loading-indicator')?.remove();
            if (!response.ok) throw new Error('Generation failed');
            return response.json();
        })
        .then(data => {
            if (!data.results || data.results.length === 0) throw new Error('Empty results');

            const resultsContainer = document.getElementById('results');

            data.results.forEach((result, index) => {
                generationContexts[index] = {};
                const generationContainer = document.createElement('div');
                generationContainer.className = 'generation-container'; // CSS class handles style
                generationContainer.dataset.index = index;
                generationContainer.draggable = true;
                generationContainer.addEventListener('dragstart', handleCardDragStart);
                generationContainer.addEventListener('dragend', handleCardDragEnd);

                // Title Bar
                const cardTitle = document.createElement('div');
                cardTitle.className = 'card-title';

                // Collapse Button
                const collapseBtn = document.createElement('button');
                collapseBtn.className = 'collapse-btn';
                collapseBtn.onclick = (e) => { e.stopPropagation(); toggleCardCollapse(collapseBtn); };
                collapseBtn.innerHTML = '<span class="down-arrow">▼</span><span class="up-arrow">▲</span>';
                cardTitle.appendChild(collapseBtn);

                // Title Text
                const titleText = document.createElement('span');
                titleText.className = 'card-title-text';
                let firstValue = extractDisplayValueForTitle(result).trim();
                titleText.textContent = firstValue ? `${selectedTable.tablename} - ${firstValue}` : selectedTable.tablename;
                cardTitle.appendChild(titleText);

                // Actions
                const cardActions = document.createElement('div');
                cardActions.className = 'card-actions';

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.title = "Copy to Markdown";
                copyBtn.onclick = (e) => { e.stopPropagation(); copyToMarkdown(generationContainer); };
                copyBtn.innerHTML = '<img src="./Images/Icons/stack.png" alt="Copy">';
                cardActions.appendChild(copyBtn);

                const rerollAllBtn = document.createElement('button');
                rerollAllBtn.className = 'reroll-all-btn';
                rerollAllBtn.title = "Reroll All";
                rerollAllBtn.onclick = (e) => { e.stopPropagation(); rerollAllContent(generationContainer); };
                rerollAllBtn.innerHTML = '<img src="./Images/Icons/perspective-dice-six-faces-random.png" alt="Reroll All">';
                cardActions.appendChild(rerollAllBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-card-btn';
                deleteBtn.title = "Delete Card";
                deleteBtn.onclick = (e) => { e.stopPropagation(); deleteCard(generationContainer); };
                deleteBtn.innerHTML = '<img src="./Images/Icons/trash-can.png" alt="Delete">';
                cardActions.appendChild(deleteBtn);

                cardTitle.appendChild(cardActions);
                generationContainer.appendChild(cardTitle);

                // Content
                extractContext(result, generationContexts[index]);
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'card-content';

                if (Array.isArray(result)) {
                    result.forEach(subResult => {
                        extractContext(subResult, generationContexts[index]);
                        contentWrapper.innerHTML += renderResultItem(subResult, false, index, true);
                    });
                } else {
                    contentWrapper.innerHTML = renderResultItem(result, true, index);
                }

                generationContainer.appendChild(contentWrapper);
                resultsContainer.appendChild(generationContainer);
            });
        })
        .catch(error => {
            displayErrorMessage(error.message);
        });
}


function rerollContent(button) {
    // Legacy reroll logic - reusing code structure
    const resultRow = button.closest('.result-row');
    if (!resultRow || resultRow.classList.contains('locked')) return Promise.resolve();

    const header = resultRow.querySelector('.result-header').textContent;
    const generationContainer = button.closest('.generation-container');
    if (!generationContainer) return Promise.resolve();


    const generationIndex = generationContainer.dataset.index;
    const context = generationContexts[generationIndex] || {};
    // Add input vals
    const inputValues = {};
    if (currentSelectedTable && currentSelectedTable.inputField) {
        const field = currentSelectedTable.inputField[0];
        const el = document.getElementById('input-' + field);
        if (el) inputValues[field] = currentSelectedTable.inputField[1] === 'number' ? parseFloat(el.value) : el.value;
        if (inputValues[field]) context[field] = inputValues[field];
    }

    resultRow.style.opacity = '0.5';

    return fetch('/api/reroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            table: currentSelectedTable, header: header, context: context, inputValues: inputValues
        })
    })
        .then(r => r.json())
        .then(data => {
            if (data.context) Object.assign(context, data.context);

            // Update DOM
            // Clear contents
            resultRow.querySelectorAll('.result-content').forEach(e => e.remove());
            const headerDiv = resultRow.querySelector('.result-header');

            let newResult = data.result.result;
            // Logic to reconstruct DOM based on result type (string, array, career object)
            // Simplified re-implementation:
            let contentHTML = '';
            let valForTitle = '';

            // Check format
            if (Array.isArray(newResult) && newResult.length === 2 && typeof newResult[0] === 'string' && typeof newResult[1] === 'string') {
                // Career
                const cDiv = document.createElement('div'); cDiv.className = 'result-content'; cDiv.textContent = newResult[0];
                const iDiv = document.createElement('div'); iDiv.className = 'result-content'; iDiv.textContent = newResult[1];
                headerDiv.after(iDiv); headerDiv.after(cDiv); // Insert in order
                valForTitle = newResult[0];
            } else {
                // String or other
                const val = (typeof newResult === 'object') ? (newResult.result || JSON.stringify(newResult)) : String(newResult);
                const div = document.createElement('div'); div.className = 'result-content'; div.textContent = val;
                headerDiv.after(div);
                valForTitle = val;
            }

            // Update title if first row
            if (resultRow === generationContainer.querySelector('.result-row:first-child')) {
                updateCardTitle(generationContainer, valForTitle);
            }

            resultRow.style.opacity = '1';
        })
        .catch(e => {
            console.error(e);
            resultRow.style.opacity = '1';
        });
}
// Add rerollAllContent, updateCardTitle, updateCardTitleFromFirstRow, extractDisplayValueForTitle
// copyToMarkdown, renderResultItem... duplicating legacy logic.
// I'll define renderResultItem specifically since it generates the HTML structure that CSS depends on.

function renderResultItem(item, isTopLevel = true, generationIndex = 0, isNestedContent = false) {
    // Generate the HTML for a row
    // Simplified version of legacy logic
    if (!item) return '';

    let desc = '';
    let titleDesc = '';
    if (isTopLevel) {
        if (item._titleDescription) titleDesc = `<div class="text-xs text-muted-light dark:text-muted-dark italic mb-1">${item._titleDescription}</div>`;
        if (item._description) desc = `<div class="text-xs text-muted-light dark:text-muted-dark mb-2">${item._description}</div>`;
    }

    // Check types
    if (item._isCareer && Array.isArray(item.result)) {
        const btnGroup = !isNestedContent ? getButtonGroup() : '';
        return `${titleDesc}${desc}
        <div class="result-row" data-format="career">
            <div class="result-header">${item.header}</div>
            <div class="result-content">${item.result[0]}</div>
            <div class="result-content">${item.result[1]}</div>
            ${btnGroup}
        </div>`;
    }

    // Standard
    if (item.header && item.result !== undefined) {
        if (Array.isArray(item.result) && item.result.some(x => typeof x === 'object')) {
            // Nested
            let out = titleDesc + desc;
            item.result.forEach(sub => out += renderResultItem(sub, false, generationIndex));
            return out;
        }

        // Simple
        const btnGroup = !isNestedContent ? getButtonGroup() : '';
        return `${titleDesc}${desc}
        <div class="result-row" data-format="simple">
            <div class="result-header">${item.header}</div>
            <div class="result-content">${String(item.result)}</div>
            ${btnGroup}
        </div>`;
    }

    return String(item);
}

function getButtonGroup() {
    return `
    <div class="button-group">
        <button class="lock-btn" onclick="toggleRowLock(this)" title="Lock/Unlock">
             <img src="./Images/Icons/padlock-open.png" alt="Unlock">
        </button>
        <button class="reroll-btn" onclick="rerollContent(this)" title="Reroll">
             <img src="./Images/Icons/perspective-dice-six-faces-random.png" alt="Reroll">
        </button>
    </div>`;
}

function toggleRowLock(btn) {
    const row = btn.closest('.result-row');
    row.classList.toggle('locked');
    const img = btn.querySelector('img');
    if (row.classList.contains('locked')) {
        img.src = './Images/Icons/padlock.png';
    } else {
        img.src = './Images/Icons/padlock-open.png';
    }
}

function updateCardTitle(container, val) {
    const t = container.querySelector('.card-title-text');
    if (t) t.textContent = `${currentSelectedTable.tablename} - ${val}`;
}

function extractDisplayValueForTitle(res) {
    if (Array.isArray(res)) return res.length > 0 ? extractDisplayValueForTitle(res[0]) : '';
    if (typeof res === 'object' && res.result !== undefined) {
        if (typeof res.result === 'string') return res.result;
        return extractDisplayValueForTitle(res.result);
    }
    return String(res || '');
}

function copyToMarkdown(container) {
    let md = '';
    container.querySelectorAll('.result-row').forEach(row => {
        const h = row.querySelector('.result-header').textContent;
        const c = Array.from(row.querySelectorAll('.result-content')).map(x => x.textContent).join(', ');
        md += `*${h}*: ${c}\n`;
    });
    navigator.clipboard.writeText(md).then(() => showToast('Copied to markdown'));
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast-message toast-visible';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
}

function handleCardDragStart(e) {
    if (e.target.closest('.reroll-all-btn, .copy-btn, .delete-card-btn')) {
        e.preventDefault(); return;
    }
    e.dataTransfer.setData('text/plain', this.dataset.index);
    this.classList.add('opacity-50');
}
function handleCardDragEnd(e) { this.classList.remove('opacity-50'); }

function deleteCard(card) {
    if (confirm('Delete card?')) card.remove();
}
function toggleCardCollapse(btn) {
    btn.closest('.generation-container').classList.toggle('collapsed');
}


async function rerollAllContent(container) {
    // Sequential implementation to ensure context updates propagate correctly
    const rows = container.querySelectorAll('.result-row:not(.locked)');
    for (const row of rows) {
        const btn = row.querySelector('.reroll-btn');
        if (btn) await rerollContent(btn);
    }
}

function toggleTheme() {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
        html.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        html.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
}
// Init theme
if (localStorage.getItem('theme') === 'light') {
    document.documentElement.classList.remove('dark');
}

// Helper Utilities
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function checkFilterBarOverflow() {
    // No-op for now as Tailwind handles overflow with scroll
}

function checkFilterOverflow(filterId) {
    // No-op compatibility
}

function updateAvailableOptions(filteredTables) {
    const gameFilter = document.getElementById('gameFilter');
    const typeFilter = document.getElementById('typeFilter');
    const settingFilter = document.getElementById('settingFilter');
    // Get currently selected values
    const selectedGames = getSelectedValues('gameFilter');
    const selectedTypes = getSelectedValues('typeFilter');
    const selectedSettings = getSelectedValues('settingFilter');
    // Create sets to store available options
    const availableGames = new Set();
    const availableTypes = new Set();
    const availableSettings = new Set();

    // Populate available options based on filtered tables
    filteredTables.forEach(table => {
        if (table.game) availableGames.add(table.game);

        if (Array.isArray(table.type)) {
            table.type.forEach(t => {
                if (t) availableTypes.add(t);
            });
        } else if (table.type) {
            availableTypes.add(table.type);
        }

        if (table.setting) availableSettings.add(table.setting);
    });

    // Update filter buttons to reflect available options
    if (gameFilter) updateFilterButtons(gameFilter, availableGames, selectedGames);
    if (typeFilter) updateFilterButtons(typeFilter, availableTypes, selectedTypes);
    if (settingFilter) updateFilterButtons(settingFilter, availableSettings, selectedSettings);
}

function updateFilterButtons(filterContainer, availableOptions, selectedOptions) {
    const buttons = filterContainer.querySelectorAll('.filter-btn');
    buttons.forEach(button => {
        const value = button.dataset.value;
        if (availableOptions.has(value)) {
            button.classList.remove('unavailable');
            button.disabled = false;
        } else {
            button.classList.add('unavailable');
            button.disabled = true;
        }

        // Restore selected state if previously selected
        if (selectedOptions.includes(value)) {
            button.classList.add('selected');
            button.classList.remove('unselected');
        }
    });
}

function showTableContent() {
    if (!currentSelectedTable) {
        console.error('No table currently selected');
        displayErrorMessage('Error: No table selected to display.');
        return;
    }

    // Clear existing content
    clearGeneratedList();

    // Show loading indicator
    const resultsContainer = document.getElementById('results');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'p-4 text-center text-muted-light dark:text-muted-dark animate-pulse';
    loadingDiv.id = 'loading-indicator';
    loadingDiv.textContent = 'Loading table structure...';
    resultsContainer.appendChild(loadingDiv);

    // Fetch the table structure
    fetch('/api/table-contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: currentSelectedTable })
    })
        .then(response => {
            document.getElementById('loading-indicator')?.remove();
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(`Server error: ${err.error || 'Unknown server error'}`);
                });
            }
            return response.json();
        })
        .then(data => {
            // Expecting { tableData: ... }
            if (!data.tableData) {
                throw new Error('No table structure returned from server');
            }

            // Create a container for the table display
            const tableContainer = document.createElement('div');
            tableContainer.className = 'generation-container table-display';

            // Add title
            const cardTitle = document.createElement('div');
            cardTitle.className = 'card-title';

            const titleText = document.createElement('span');
            titleText.className = 'card-title-text';
            titleText.textContent = `Table: ${currentSelectedTable.tablename || 'Unnamed Table'}`;
            cardTitle.appendChild(titleText);

            // Actions
            const cardActions = document.createElement('div');
            cardActions.className = 'card-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.title = "Copy to Markdown";
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                copyTableToMarkdown(tableContainer);
            };
            copyBtn.innerHTML = '<img src="./Images/Icons/stack.png" alt="Copy">';
            cardActions.appendChild(copyBtn);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-card-btn';
            deleteBtn.title = "Close Table View";
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                tableContainer.remove();
            };
            deleteBtn.innerHTML = '<img src="./Images/Icons/trash-can.png" alt="Close">';
            cardActions.appendChild(deleteBtn);

            cardTitle.appendChild(cardActions);
            tableContainer.appendChild(cardTitle);

            // Add collapse button
            const collapseBtn = document.createElement('button');
            collapseBtn.className = 'collapse-btn';
            collapseBtn.onclick = (e) => {
                e.stopPropagation();
                toggleCardCollapse(collapseBtn);
            };
            collapseBtn.innerHTML = '<span class="down-arrow">▼</span><span class="up-arrow">▲</span>';
            tableContainer.appendChild(collapseBtn);

            // Content
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'card-content p-4 space-y-4';

            const tableData = data.tableData;

            if (tableData.description) {
                const descriptionDiv = document.createElement('div');
                descriptionDiv.className = 'text-sm text-text-muted-light dark:text-text-muted-dark italic';
                descriptionDiv.textContent = tableData.description;
                contentWrapper.appendChild(descriptionDiv);
            }

            const entriesDiv = document.createElement('div');
            entriesDiv.className = 'space-y-4';

            if (tableData.subtables && tableData.subtables.length > 0) {
                const mainTable = tableData.subtables.find(t => t.name === "Main Results") || tableData.subtables[0];
                processTableEntries(entriesDiv, mainTable);

                tableData.subtables.forEach(subtable => {
                    if (subtable === mainTable) return;

                    const subtableContainer = document.createElement('div');
                    subtableContainer.className = 'border-t border-border-light dark:border-border-dark pt-4 mt-4';

                    const subtableHeader = document.createElement('div');
                    subtableHeader.className = 'font-bold text-sm mb-2';
                    subtableHeader.textContent = subtable.name;
                    subtableContainer.appendChild(subtableHeader);

                    if (subtable.description) {
                        const subDesc = document.createElement('div');
                        subDesc.className = 'text-xs text-muted-light mb-2';
                        subDesc.textContent = subtable.description;
                        subtableContainer.appendChild(subDesc);
                    }

                    processTableEntries(subtableContainer, subtable);

                    if (subtable.nestedSubtables && subtable.nestedSubtables.length > 0) {
                        subtable.nestedSubtables.forEach(nested => {
                            const nestedDiv = document.createElement('div');
                            nestedDiv.className = 'pl-4 border-l-2 border-border-light dark:border-border-dark mt-2';
                            const nHeader = document.createElement('div');
                            nHeader.className = 'font-bold text-xs mb-1';
                            nHeader.textContent = nested.name;
                            nestedDiv.appendChild(nHeader);
                            processTableEntries(nestedDiv, nested);
                            subtableContainer.appendChild(nestedDiv);
                        });
                    }
                    entriesDiv.appendChild(subtableContainer);
                });
            } else {
                processTableEntries(entriesDiv, tableData);
            }

            contentWrapper.appendChild(entriesDiv);
            tableContainer.appendChild(contentWrapper);
            resultsContainer.appendChild(tableContainer);
        })
        .catch(error => {
            console.error('Error displaying table structure:', error);
            displayErrorMessage(`Error: ${error.message || 'Unable to display table structure.'}`);
        });
}

function processTableEntries(container, tableData) {
    const entries = tableData.results || tableData.entries || [];
    if (!entries || entries.length === 0) {
        if (tableData.table) {
            processTableEntries(container, { entries: tableData.table });
        }
        return;
    }

    // Create a list container
    const list = document.createElement('div');
    list.className = 'flex flex-col gap-1 text-sm';

    entries.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'flex gap-2 table-entry';

        const indexSpan = document.createElement('div');
        indexSpan.className = 'font-mono text-muted-light dark:text-muted-dark w-8 text-right shrink-0 entry-number';
        indexSpan.textContent = (index + 1) + '.';
        row.appendChild(indexSpan);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'flex-1 entry-content';

        if (typeof entry === 'object' && entry !== null) {
            if (entry.isCareer) {
                contentDiv.innerHTML = `<span class="font-bold">${entry.career}</span> - ${entry.items}`;
            } else if (entry.isWeighted) {
                contentDiv.textContent = typeof entry.value === 'object' ? JSON.stringify(entry.value) : entry.value;
                const w = document.createElement('span');
                w.className = 'text-xs text-muted-light ml-2';
                w.textContent = `(wt: ${entry.weight})`;
                contentDiv.appendChild(w);
            } else if (entry.value !== undefined) {
                contentDiv.textContent = typeof entry.value === 'object' ? JSON.stringify(entry.value) : entry.value;
            } else {
                contentDiv.textContent = JSON.stringify(entry);
            }
        } else if (Array.isArray(entry)) {
            if (entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
                contentDiv.innerHTML = `<span class="font-bold">${entry[0]}</span> - ${entry[1]}`;
            } else if (entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'number') {
                contentDiv.textContent = entry[0];
                const w = document.createElement('span');
                w.className = 'text-xs text-muted-light ml-2';
                w.textContent = `(wt: ${entry[1]})`;
                contentDiv.appendChild(w);
            } else {
                contentDiv.textContent = entry.join(', ');
            }
        } else {
            contentDiv.textContent = String(entry);
        }

        row.appendChild(contentDiv);
        list.appendChild(row);
    });

    container.appendChild(list);

    if (tableData.displayFormat || tableData.customDisplay) {
        const f = document.createElement('div');
        f.className = 'text-xs italic mt-2 text-muted-light';
        f.textContent = `Format: ${tableData.displayFormat || tableData.customDisplay}`;
        container.appendChild(f);
    }
}

function copyTableToMarkdown(container) {
    let md = '';
    const title = container.querySelector('.card-title-text')?.textContent || 'Table';
    md += `# ${title}\n\n`;

    const entries = container.querySelectorAll('.table-entry');
    entries.forEach(entry => {
        const num = entry.querySelector('.entry-number')?.textContent || '-';
        const content = entry.querySelector('.entry-content')?.textContent || '';
        md += `${num} ${content}\n`;
    });

    navigator.clipboard.writeText(md)
        .then(() => showToast('Copied to markdown'))
        .catch(err => {
            console.error(err);
            showToast('Failed to copy');
        });
}


