
let tablesData = [];
let currentSelectedTable = null;
let generationContexts = {};

// --- Source Filter State ---
// Maps game name -> Set of sources
let sourcesByGame = {};
// Currently selected sources (empty = all selected)
let selectedSources = [];
// Whether we're in "all sources selected" mode
let sourceFilterMode = 'all-selected';

// --- Undo Stack System ---
// Map of cardIndex -> array of undo states (max 100)
const cardUndoStacks = new Map();
const UNDO_STACK_LIMIT = 100;

// --- Table Column Data for Autocomplete ---
// Cached column values per table for autocomplete validation
let currentTableColumnValues = {};



// --- Context Helper ---
function extractContext(result, storage) {
    if (!result || typeof result !== 'object') return;
    if (result.context) {
        Object.assign(storage, result.context);
    }
}
window.extractContext = extractContext;

// --- Undo Stack Helper Functions ---
function getCardState(container) {
    const state = {
        title: container.querySelector('.card-title-text')?.textContent || '',
        contentHtml: container.querySelector('.card-content')?.innerHTML || ''
    };
    return state;
}

function pushUndoState(container) {
    const cardIndex = container.dataset.index;
    if (!cardUndoStacks.has(cardIndex)) {
        cardUndoStacks.set(cardIndex, []);
    }
    const stack = cardUndoStacks.get(cardIndex);
    const state = getCardState(container);
    stack.push(state);
    if (stack.length > UNDO_STACK_LIMIT) {
        stack.shift(); // Remove oldest
    }
    updateUndoButtonState(container);
}

function popUndoState(container) {
    const cardIndex = container.dataset.index;
    const stack = cardUndoStacks.get(cardIndex);
    if (!stack || stack.length === 0) return null;
    const state = stack.pop();
    updateUndoButtonState(container);
    return state;
}

function clearUndoStack(container) {
    const cardIndex = container.dataset.index;
    cardUndoStacks.delete(cardIndex);
    updateUndoButtonState(container);
}

function updateUndoButtonState(container) {
    const cardIndex = container.dataset.index;
    const stack = cardUndoStacks.get(cardIndex);
    const undoBtn = container.querySelector('.undo-btn');
    if (undoBtn) {
        undoBtn.disabled = !stack || stack.length === 0;
        undoBtn.style.opacity = undoBtn.disabled ? '0.3' : '1';
    }
}

function restoreCardState(container, state) {
    if (!state) return;

    // Restore title
    const titleEl = container.querySelector('.card-title-text');
    if (titleEl && state.title) {
        titleEl.textContent = state.title;
    }

    // Restore full card content HTML
    const contentWrapper = container.querySelector('.card-content');
    if (contentWrapper && state.contentHtml) {
        contentWrapper.innerHTML = state.contentHtml;
        attachEditableListeners(container);
    }
}

function updateRowLockIcon(row) {
    const lockBtn = row.querySelector('.lock-btn');
    if (!lockBtn) return;
    const icon = lockBtn.querySelector('.material-symbols-outlined');
    if (icon) {
        icon.textContent = row.classList.contains('locked') ? 'lock' : 'lock_open';
    }
}

function undoCardChange(container) {
    const state = popUndoState(container);
    if (state) {
        restoreCardState(container, state);
    }
}


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
    createAutocompleteContainer();
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
            cardClone.querySelector('.undo-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                undoCardChange(cardClone);
            });

            cardClone.querySelector('.copy-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToMarkdown(cardClone);
            });

            cardClone.querySelector('.reroll-all-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                rerollAllContent(cardClone);
            });

            cardClone.querySelector('.reset-all-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                resetAllContent(cardClone);
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

            attachEditableListeners(cardClone);

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

    // Initialize resizer
    setupSidebarResizer();
});

// New function to populate filter buttons
function populateFilterButtons(tables) {
    console.log('Populating filter buttons');
    const gameSet = new Set();
    const typeSet = new Set();
    const settingSet = new Set();

    // Reset source tracking
    sourcesByGame = {};

    tables.forEach(table => {
        if (table.game) {
            gameSet.add(table.game);

            // Track sources per game
            if (table.source) {
                if (!sourcesByGame[table.game]) {
                    sourcesByGame[table.game] = new Set();
                }
                sourcesByGame[table.game].add(table.source);
            }
        }

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
    updateSourceFilterVisibility();
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
        // For game filter, wrap buttons with source dropdown capability
        if (filterId === 'gameFilter') {
            const wrapper = document.createElement('div');
            wrapper.className = 'game-filter-wrapper';

            const button = createGameFilterButton(option, filterId);
            // Add all-active class for default "on" appearance
            button.classList.add('all-active');
            wrapper.appendChild(button);

            // Add source dropdown if this game has sources
            if (sourcesByGame[option] && sourcesByGame[option].size > 0) {
                button.classList.add('has-sources');

                // Add the dropdown trigger arrow button
                const trigger = createDropdownTrigger(option);
                button.appendChild(trigger);

                // Add the dropdown panel
                const dropdown = createSourceDropdown(option);
                wrapper.appendChild(dropdown);
            }

            filterContainer.appendChild(wrapper);
        } else {
            const button = document.createElement('button');
            button.className = 'filter-btn';
            button.classList.add('px-3', 'py-1', 'rounded-full', 'text-xs', 'font-medium', 'border', 'border-transparent', 'hover:bg-gray-200', 'dark:hover:bg-slate-600', 'transition-colors', 'whitespace-nowrap');
            // Add all-active class for default "on" appearance
            button.classList.add('all-active');

            button.textContent = option;
            button.dataset.value = option;
            button.onclick = function () {
                toggleFilterButton(this, filterId);
            };
            filterContainer.appendChild(button);
        }
    });
}

// Create a game filter button with click and right-click handlers
function createGameFilterButton(option, filterId) {
    const button = document.createElement('button');
    button.className = 'filter-btn';
    button.classList.add('px-3', 'py-1', 'rounded-full', 'text-xs', 'font-medium', 'border', 'border-transparent', 'hover:bg-gray-200', 'dark:hover:bg-slate-600', 'transition-colors', 'whitespace-nowrap');
    // Note: all-active class is added by the caller (createFilterButtons)

    button.textContent = option;
    button.dataset.value = option;

    // Left click: ONLY toggle filter selection (no dropdown)
    button.onclick = function (e) {
        e.stopPropagation();
        toggleFilterButton(this, filterId);
        // Do NOT toggle dropdown on regular click
    };

    // Right click: open dropdown AND filter to only this game
    button.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Show hint on first right-click
        showRightClickHint(e);

        // Filter to only this game (this also opens the dropdown)
        filterOnlyThisGame(this);
    });

    return button;
}

// Create a dropdown trigger arrow button
function createDropdownTrigger(gameName) {
    const trigger = document.createElement('span');
    trigger.className = 'dropdown-trigger';
    trigger.dataset.game = gameName;
    trigger.title = 'Show sources';
    trigger.innerHTML = '<svg viewBox="0 0 10 6"><path d="M1 1l4 4 4-4"/></svg>';

    trigger.onclick = function (e) {
        e.stopPropagation();
        const wrapper = this.closest('.game-filter-wrapper');
        const btn = wrapper.querySelector('.filter-btn');
        toggleSourceDropdown(btn);
        this.classList.toggle('expanded');
    };

    return trigger;
}

// Create source dropdown panel for a game
function createSourceDropdown(gameName) {
    const dropdown = document.createElement('div');
    dropdown.className = 'source-dropdown';
    dropdown.dataset.game = gameName;

    // Header with action buttons only (no title)
    const header = document.createElement('div');
    header.className = 'source-dropdown-header';

    // Select all button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'source-action-btn text-primary';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.onclick = (e) => {
        e.stopPropagation();
        toggleAllSourcesForGame(gameName, true);
    };
    header.appendChild(selectAllBtn);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'source-action-btn clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = (e) => {
        e.stopPropagation();
        toggleAllSourcesForGame(gameName, false);
    };
    header.appendChild(clearBtn);

    dropdown.appendChild(header);

    // Content with checkboxes
    const content = document.createElement('div');
    content.className = 'source-dropdown-content';

    const sources = sourcesByGame[gameName];
    if (sources) {
        Array.from(sources).sort().forEach(source => {
            const item = document.createElement('div');
            item.className = 'source-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `source-${gameName}-${source}`.replace(/\s+/g, '-');
            checkbox.value = source;
            checkbox.dataset.game = gameName;
            checkbox.checked = sourceFilterMode === 'all-selected' || selectedSources.includes(source);
            checkbox.onchange = () => handleSourceCheckChange(checkbox);

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = source;

            item.appendChild(checkbox);
            item.appendChild(label);

            // Click on item toggles checkbox
            item.onclick = (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                    handleSourceCheckChange(checkbox);
                }
            };

            content.appendChild(item);
        });
    }

    dropdown.appendChild(content);

    // Prevent dropdown clicks from bubbling
    dropdown.onclick = (e) => e.stopPropagation();

    return dropdown;
}

// Toggle a source dropdown open/closed
function toggleSourceDropdown(button) {
    const wrapper = button.closest('.game-filter-wrapper');
    const gameName = button.dataset.value;
    // Look for dropdown in wrapper OR body (if already portaled)
    let dropdown = wrapper.querySelector('.source-dropdown') ||
        document.body.querySelector(`.source-dropdown[data-game="${gameName}"]`);
    const backdrop = document.getElementById('sourceDropdownBackdrop');

    if (!dropdown) return;

    // Close all other dropdowns first
    document.querySelectorAll('.source-dropdown.expanded').forEach(dd => {
        if (dd !== dropdown) {
            dd.classList.remove('expanded');
            // Find associated button and trigger
            const associatedBtn = document.querySelector(`.filter-btn[data-value="${dd.dataset.game}"]`);
            if (associatedBtn) {
                associatedBtn.classList.remove('expanded');
                const trigger = associatedBtn.querySelector('.dropdown-trigger');
                if (trigger) trigger.classList.remove('expanded');
            }
            // Return dropdown to its wrapper
            const originalWrapper = document.querySelector(`.game-filter-wrapper .filter-btn[data-value="${dd.dataset.game}"]`)?.closest('.game-filter-wrapper');
            if (originalWrapper && dd.parentElement === document.body) {
                originalWrapper.appendChild(dd);
            }
        }
    });

    // Toggle this dropdown
    const isExpanding = !dropdown.classList.contains('expanded');
    const trigger = button.querySelector('.dropdown-trigger');

    if (isExpanding) {
        // Portal dropdown to body to escape stacking context
        document.body.appendChild(dropdown);

        // Position dropdown below button using fixed positioning
        const rect = button.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.classList.add('expanded');
        button.classList.add('expanded');
        if (trigger) trigger.classList.add('expanded');
        backdrop.classList.add('active');
    } else {
        dropdown.classList.remove('expanded');
        button.classList.remove('expanded');
        if (trigger) trigger.classList.remove('expanded');
        // Return dropdown to wrapper
        wrapper.appendChild(dropdown);
        if (!document.querySelector('.source-dropdown.expanded')) {
            backdrop.classList.remove('active');
        }
    }
}

// Close all source dropdowns
function closeAllSourceDropdowns() {
    document.querySelectorAll('.source-dropdown.expanded').forEach(dropdown => {
        dropdown.classList.remove('expanded');
        // Find the wrapper by game name
        const gameName = dropdown.dataset.game;
        const wrapper = document.querySelector(`.game-filter-wrapper .filter-btn[data-value="${gameName}"]`)?.closest('.game-filter-wrapper');
        const btn = document.querySelector(`.filter-btn[data-value="${gameName}"]`);
        if (btn) {
            btn.classList.remove('expanded');
            const trigger = btn.querySelector('.dropdown-trigger');
            if (trigger) trigger.classList.remove('expanded');
        }
        // Return dropdown to wrapper if it's in body
        if (wrapper && dropdown.parentElement === document.body) {
            wrapper.appendChild(dropdown);
        }
    });
    document.getElementById('sourceDropdownBackdrop').classList.remove('active');
}
// Attach to window for onclick handler
window.closeAllSourceDropdowns = closeAllSourceDropdowns;

// Handle individual source checkbox change
function handleSourceCheckChange(checkbox) {
    const allCheckboxes = document.querySelectorAll('.source-dropdown input[type="checkbox"]');
    const checkedBoxes = document.querySelectorAll('.source-dropdown input[type="checkbox"]:checked');

    if (checkedBoxes.length === allCheckboxes.length) {
        // All checked = all-selected mode
        sourceFilterMode = 'all-selected';
        selectedSources = [];
    } else {
        // Some unchecked = choice mode
        sourceFilterMode = 'choice';
        selectedSources = Array.from(checkedBoxes).map(cb => cb.value);
    }

    applyFilters();
    updateSourceBadges();
}

// Toggle all sources for a specific game
function toggleAllSourcesForGame(gameName, checked) {
    const dropdown = document.querySelector(`.source-dropdown[data-game="${gameName}"]`);
    if (!dropdown) return;

    dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = checked;
    });

    // Recalculate selected sources
    recalculateSelectedSources();
    applyFilters();
    updateSourceBadges();
}

// Recalculate selected sources from all checkboxes
function recalculateSelectedSources() {
    const allCheckboxes = document.querySelectorAll('.source-dropdown input[type="checkbox"]');
    const checkedBoxes = document.querySelectorAll('.source-dropdown input[type="checkbox"]:checked');

    if (checkedBoxes.length === allCheckboxes.length) {
        sourceFilterMode = 'all-selected';
        selectedSources = [];
    } else {
        sourceFilterMode = 'choice';
        selectedSources = Array.from(checkedBoxes).map(cb => cb.value);
    }
}

// Filter to only show this game's sources (right-click action)
function filterOnlyThisGame(button) {
    const gameName = button.dataset.value;

    // First, ensure this game is selected in the filter
    const gameFilter = document.getElementById('gameFilter');
    const currentMode = gameFilter.dataset.mode || 'all-selected';

    // Set to choice mode with only this game
    gameFilter.dataset.mode = 'choice';
    gameFilter.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.value === gameName) {
            btn.classList.add('selected');
            btn.classList.remove('unselected');
        } else {
            btn.classList.add('unselected');
            btn.classList.remove('selected');
        }
    });

    // Select all sources for this game, deselect others
    document.querySelectorAll('.source-dropdown input[type="checkbox"]').forEach(cb => {
        if (cb.dataset.game === gameName) {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });

    // Update source filter state
    sourceFilterMode = 'choice';
    selectedSources = sourcesByGame[gameName] ? Array.from(sourcesByGame[gameName]) : [];

    // Open only this game's dropdown
    closeAllSourceDropdowns();
    if (button.classList.contains('has-sources')) {
        const wrapper = button.closest('.game-filter-wrapper');
        const dropdown = wrapper.querySelector('.source-dropdown');
        const trigger = button.querySelector('.dropdown-trigger');
        if (dropdown) {
            // Portal dropdown to body to escape stacking context
            document.body.appendChild(dropdown);

            // Position dropdown using fixed positioning
            const rect = button.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.top = `${rect.bottom + 4}px`;
            dropdown.style.left = `${rect.left}px`;
            dropdown.classList.add('expanded');
            button.classList.add('expanded');
            if (trigger) trigger.classList.add('expanded');
            document.getElementById('sourceDropdownBackdrop').classList.add('active');
        }
    }

    applyFilters();
    updateSourceBadges();
}

// Show right-click hint tooltip
let rightClickHintShown = localStorage.getItem('rightClickHintShown') === 'true';

function showRightClickHint(e) {
    if (rightClickHintShown) return;

    const hint = document.getElementById('rightClickHint');
    if (!hint) return;

    hint.style.left = `${e.clientX + 10}px`;
    hint.style.top = `${e.clientY + 10}px`;
    hint.classList.add('visible');

    setTimeout(() => {
        hint.classList.remove('visible');
    }, 2000);

    rightClickHintShown = true;
    localStorage.setItem('rightClickHintShown', 'true');
}

// Update source filter badges on game buttons
function updateSourceBadges() {
    document.querySelectorAll('.game-filter-wrapper').forEach(wrapper => {
        const button = wrapper.querySelector('.filter-btn');
        const gameName = button?.dataset.value;
        if (!gameName) return;

        // Remove existing badge
        wrapper.querySelector('.source-filter-badge')?.remove();

        // Count active source filters for this game
        if (sourceFilterMode === 'choice' && sourcesByGame[gameName]) {
            const gameSourcesTotal = sourcesByGame[gameName].size;
            const gameSourcesSelected = selectedSources.filter(s =>
                sourcesByGame[gameName].has(s)
            ).length;

            if (gameSourcesSelected > 0 && gameSourcesSelected < gameSourcesTotal) {
                const badge = document.createElement('span');
                badge.className = 'source-filter-badge';
                badge.textContent = gameSourcesSelected;
                button.style.position = 'relative';
                button.appendChild(badge);
            }
        }
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
        // Transition from all-selected to choice mode
        // Only the clicked button should be "on", others "off"
        filterContainer.dataset.mode = 'choice';
        const buttons = filterContainer.querySelectorAll('.filter-btn');
        buttons.forEach(btn => {
            btn.classList.remove('all-active', 'selected');
            btn.classList.add('unselected');
        });

        button.classList.remove('unselected');
        button.classList.add('selected');
    } else {
        // In choice mode - toggle this button
        const wasSelected = button.classList.contains('selected');

        if (wasSelected) {
            button.classList.remove('selected');
            button.classList.add('unselected');
        } else {
            button.classList.remove('unselected');
            button.classList.add('selected');
        }

        // If no buttons are selected, return to all-selected mode
        if (filterContainer.querySelectorAll('.filter-btn.selected').length === 0) {
            clearFilter(filterId.replace('Filter', ''));
            return; // clearFilter will call applyFilters
        }
    }
    applyFilters();
    updateSourceFilterVisibility();
}

function clearFilter(filterType) {
    const filterId = filterType + 'Filter';
    const filterContainer = document.getElementById(filterId);
    if (!filterContainer) return;

    filterContainer.dataset.mode = 'all-selected';
    const buttons = filterContainer.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.classList.remove('unselected', 'selected');
        btn.classList.add('all-active');
    });
    applyFilters();
}

function resetFilters() {
    clearFilter('game');
    clearFilter('type');
    clearFilter('setting');
    document.getElementById('searchInput').value = '';

    // Reset source filter
    resetSourceFilter();

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

// --- Sidebar Resizer Logic ---
function setupSidebarResizer() {
    const divider = document.getElementById('verticalDivider');
    const sidebar = document.getElementById('savedSidebar');

    if (!divider || !sidebar) return;

    let isResizing = false;

    divider.addEventListener('mousedown', (e) => {
        isResizing = true;
        divider.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection

        // Ensure transition is off during drag
        sidebar.style.transition = 'none';

        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Sidebar is on the right. 
        // Width = Window Width - Mouse X
        // We calculate from the right edge
        const newWidth = window.innerWidth - e.clientX;

        // Constraints (min 200px, max 800px or 50% of screen)
        const maxWidth = Math.min(800, window.innerWidth * 0.6);

        if (newWidth >= 200 && newWidth <= maxWidth) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            divider.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // We can optionally restore transition here if we want it for other interactions
            // sidebar.style.transition = 'width 0.3s ease'; 
        }
    });
}

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

        // Source filter
        const sourceFilter = getSelectedSources();
        const matchesSource = sourceFilter.length === 0 ||
            (table.source && sourceFilter.includes(table.source)) ||
            (!table.source); // Tables without source always match

        return matchesSearch && matchesGame && matchesType && matchesSetting && matchesFavorite && matchesSource;
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

// --- Source Filter Functions ---

// --- Updated Source Filter Functions (Inline Dropdown System) ---

function updateSourceFilterVisibility() {
    // No longer needed - sources are now inline with game buttons
    // This is kept for compatibility with existing calls
    updateSourceBadges();
}

// Old modal-based functions are removed - now handled by inline dropdowns
// buildSourceCheckboxes, handleSourceCheckboxChange, updateSelectAllCheckbox 
// are replaced by the new inline system functions

// Compatibility stub for getSelectedSources
function getSelectedSources() {
    if (sourceFilterMode === 'all-selected') {
        return []; // Empty means all sources
    }
    return selectedSources;
}

function resetSourceFilter() {
    sourceFilterMode = 'all-selected';
    selectedSources = [];

    // Reset all source checkboxes in inline dropdowns
    document.querySelectorAll('.source-dropdown input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });

    closeAllSourceDropdowns();
    updateSourceBadges();
}

// ... Rest of the functions (displayTableDetails, generateContent, etc) 
// I'll skip redeclaring them to save space if they are identical, 
// BUT since I'm creating a new file, I MUST include them.

// IMPORTANT: Implementation of displayTableDetails needs to target the new layout
function displayTableDetails(table) {
    currentSelectedTable = table;

    // Fetch and cache full data for autocomplete
    if (!table.subtables) {
        fetch('/api/table-contents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table: table })
        })
            .then(r => r.json())
            .then(data => {
                if (data.tableData) {
                    Object.assign(table, data.tableData);
                    // Update cache in tablesData
                    const cachedIndex = tablesData.findIndex(t => t.filename === table.filename);
                    if (cachedIndex !== -1) {
                        tablesData[cachedIndex] = table;
                    }
                }
            })
            .catch(e => console.error("Failed to load table details for autocomplete", e));
    }

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
                generationContainer.dataset.tableFilename = selectedTable.filename; // Store for autocomplete
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
                titleText.contentEditable = true;
                titleText.spellcheck = false;
                titleText.addEventListener('input', () => {
                    titleText.dataset.edited = 'true';
                });
                titleText.addEventListener('blur', () => {
                    pushUndoState(generationContainer);
                });
                titleText.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        titleText.blur();
                    }
                });
                cardTitle.appendChild(titleText);

                // Actions
                const cardActions = document.createElement('div');
                cardActions.className = 'card-actions';

                const undoBtn = document.createElement('button');
                undoBtn.className = 'undo-btn';
                undoBtn.title = "Undo";
                undoBtn.onclick = (e) => { e.stopPropagation(); undoCardChange(generationContainer); };
                undoBtn.innerHTML = '<span class="material-symbols-outlined">undo</span>';
                undoBtn.disabled = true;
                undoBtn.style.opacity = '0.3';
                cardActions.appendChild(undoBtn);

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.title = "Copy to Markdown";
                copyBtn.onclick = (e) => { e.stopPropagation(); copyToMarkdown(generationContainer); };
                copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
                cardActions.appendChild(copyBtn);

                const rerollAllBtn = document.createElement('button');
                rerollAllBtn.className = 'reroll-all-btn';
                rerollAllBtn.title = "Reroll All";
                rerollAllBtn.onclick = (e) => { e.stopPropagation(); rerollAllContent(generationContainer); };
                rerollAllBtn.innerHTML = '<span class="material-symbols-outlined">casino</span>';
                cardActions.appendChild(rerollAllBtn);

                const resetAllBtn = document.createElement('button');
                resetAllBtn.className = 'reset-all-btn';
                resetAllBtn.title = "Reset All (Reroll + Unlock All)";
                resetAllBtn.onclick = (e) => { e.stopPropagation(); resetAllContent(generationContainer); };
                resetAllBtn.innerHTML = '<span class="material-symbols-outlined">restart_alt</span>';
                cardActions.appendChild(resetAllBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-card-btn';
                deleteBtn.title = "Delete Card";
                deleteBtn.onclick = (e) => { e.stopPropagation(); deleteCard(generationContainer); };
                deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete_forever</span>';
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
                attachEditableListeners(generationContainer);
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

            attachEditableListeners(resultRow);

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

// --- Autocomplete Logic ---

function getAutocompleteValues(tableFilename, header, colIndex) {
    const table = tablesData.find(t => t.filename === tableFilename);
    if (!table || !table.subtables) return [];

    const subtable = table.subtables.find(st => st.name === header);
    if (!subtable || !subtable.results) return [];

    const values = new Set();
    const index = parseInt(colIndex);

    subtable.results.forEach(res => {
        let val = res;
        if (typeof res === 'string' && (res.startsWith('[') || res.startsWith('{'))) {
            try { val = JSON.parse(res); } catch (e) { }
        }

        if (Array.isArray(val)) {
            // Career or multi-element
            if (index < val.length) values.add(String(val[index]));
        } else if (typeof val === 'object' && val !== null) {
            // Weighted or object
            if (val.result) values.add(String(val.result));
        } else {
            // Simple string
            if (index === 0) values.add(String(val));
        }
    });

    return Array.from(values).sort();
}

let activeAutocomplete = null;

function createAutocompleteContainer() {
    if (document.getElementById('autocomplete-list')) return;
    const ul = document.createElement('ul');
    ul.id = 'autocomplete-list';
    ul.className = 'autocomplete-list';
    ul.style.display = 'none';
    document.body.appendChild(ul);
}

function showAutocomplete(element, values) {
    const list = document.getElementById('autocomplete-list');
    if (!list) return;

    list.innerHTML = '';

    if (values.length === 0) {
        list.style.display = 'none';
        return;
    }

    values.forEach(val => {
        const li = document.createElement('li');
        li.className = 'autocomplete-item';
        li.textContent = val;
        li.onmousedown = (e) => {
            e.preventDefault();
            element.textContent = val;
            checkLockState(element);
            hideAutocomplete();
        };
        list.appendChild(li);
    });

    const rect = element.getBoundingClientRect();
    list.style.top = (rect.bottom + window.scrollY) + 'px';
    list.style.left = (rect.left + window.scrollX) + 'px';
    list.style.width = Math.max(rect.width, 200) + 'px';
    list.style.display = 'block';

    activeAutocomplete = element;
}

function hideAutocomplete() {
    const list = document.getElementById('autocomplete-list');
    if (list) list.style.display = 'none';
    activeAutocomplete = null;
}

function checkLockState(element) {
    const row = element.closest('.result-row');
    if (!row) return;

    const container = row.closest('.generation-container');
    if (!container) return;

    const filename = container.dataset.tableFilename;
    const header = element.dataset.header;
    const colIndex = element.dataset.colIndex;

    if (!filename || !header) return;

    const currentVal = element.textContent.trim();
    const validValues = getAutocompleteValues(filename, header, colIndex);

    const isValid = validValues.includes(currentVal);

    if (isValid) {
        if (row.classList.contains('locked')) {
            row.classList.remove('locked');
            updateRowLockIcon(row);
        }
    } else {
        if (!row.classList.contains('locked')) {
            row.classList.add('locked');
            updateRowLockIcon(row);
        }
    }
}

function attachEditableListeners(container) {
    if (!container) return;
    container.querySelectorAll('.result-content[contenteditable="true"]').forEach(el => {
        el.addEventListener('input', debounce((e) => {
            const val = e.target.textContent;
            const container = el.closest('.generation-container');
            const filename = container.dataset.tableFilename;
            const header = el.dataset.header;
            const colIndex = el.dataset.colIndex;

            if (filename && header) {
                const allValues = getAutocompleteValues(filename, header, colIndex);
                if (val.length > 0) {
                    const matches = allValues.filter(v => v.toLowerCase().includes(val.toLowerCase()));
                    showAutocomplete(el, matches);
                } else {
                    hideAutocomplete();
                }
            }

            checkLockState(el);

            // Sync title if first row
            const row = el.closest('.result-row');
            if (row && container && row === container.querySelector('.result-row:first-child')) {
                let newVal = '';
                if (row.dataset.format === 'career') {
                    newVal = row.querySelector('.career-value').textContent;
                } else {
                    newVal = row.querySelector('.result-content').textContent;
                }
                updateCardTitle(container, newVal);
            }
        }, 200));

        el.addEventListener('focus', () => {
            // Optional: Show suggestions on focus?
        });

        el.addEventListener('blur', () => {
            setTimeout(() => hideAutocomplete(), 200);
            checkLockState(el);
            pushUndoState(container);
        });

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
                hideAutocomplete();
            }
            if (e.key === 'Escape') {
                hideAutocomplete();
            }
        });
    });

    // Also re-attach title listeners if needed (already handled in generateContent)
}

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
            <div class="result-content career-value" contenteditable="true" data-header="${item.header}" data-col-index="0" spellcheck="false">${escapeHtml(String(item.result[0]))}</div>
            <div class="result-content career-description" contenteditable="true" data-header="${item.header}" data-col-index="1" spellcheck="false">${escapeHtml(String(item.result[1]))}</div>
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
            <div class="result-content" contenteditable="true" data-header="${item.header}" data-col-index="0" spellcheck="false">${escapeHtml(String(item.result))}</div>
            ${btnGroup}
        </div>`;
    }

    return String(item);
}

function getButtonGroup() {
    return `
    <div class="button-group">
        <button class="lock-btn" onclick="toggleRowLock(this)" title="Lock/Unlock">
             <span class="material-symbols-outlined">lock_open</span>
        </button>
        <button class="reroll-btn" onclick="rerollContent(this)" title="Reroll">
             <span class="material-symbols-outlined">casino</span>
        </button>
        <button class="reset-row-btn" onclick="resetRow(this)" title="Reset (Reroll + Unlock)">
             <span class="material-symbols-outlined">refresh</span>
        </button>
        <button class="delete-row-btn" onclick="deleteRow(this)" title="Delete Row">
             <span class="material-symbols-outlined">delete</span>
        </button>
    </div>`;
}

function toggleRowLock(btn) {
    const row = btn.closest('.result-row');
    const container = row.closest('.generation-container');
    if (container) pushUndoState(container);

    row.classList.toggle('locked');
    updateRowLockIcon(row);
}

function deleteRow(btn) {
    const row = btn.closest('.result-row');
    const container = row.closest('.generation-container');
    if (container) pushUndoState(container);
    row.remove();
    showToast('Row deleted');
}

async function resetRow(btn) {
    const row = btn.closest('.result-row');
    const container = row.closest('.generation-container');
    if (container) pushUndoState(container);

    // Unlock first
    row.classList.remove('locked');
    updateRowLockIcon(row);

    // Then reroll
    await rerollContent(btn);
}


function updateCardTitle(container, val) {
    const t = container.querySelector('.card-title-text');
    if (!t) return;
    if (t.dataset.edited === 'true') return;

    let tableName = 'Unknown Table';
    const filename = container.dataset.tableFilename;
    if (filename) {
        const table = tablesData.find(t => t.filename === filename);
        if (table) tableName = table.tablename;
    } else if (currentSelectedTable) {
        tableName = currentSelectedTable.tablename;
    }

    t.textContent = `${tableName} - ${val}`;
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
    clearUndoStack(card);
    card.remove();
}
function toggleCardCollapse(btn) {
    btn.closest('.generation-container').classList.toggle('collapsed');
}


async function rerollAllContent(container) {
    pushUndoState(container);
    // Sequential implementation to ensure context updates propagate correctly
    const rows = container.querySelectorAll('.result-row:not(.locked)');
    for (const row of rows) {
        const btn = row.querySelector('.reroll-btn');
        if (btn) await rerollContent(btn);
    }
}

async function resetAllContent(container) {
    pushUndoState(container);
    // Unlock all rows first
    container.querySelectorAll('.result-row').forEach(row => {
        row.classList.remove('locked');
        updateRowLockIcon(row);
    });
    // Then reroll all
    const rows = container.querySelectorAll('.result-row');
    for (const row of rows) {
        const btn = row.querySelector('.reroll-btn');
        if (btn) await rerollContent(btn);
    }
    // Clear undo stack after full reset
    clearUndoStack(container);
    showToast('Card reset');
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
// (debounce function defined earlier in file)

function checkFilterBarOverflow() {
    // Check each filter-wrap container and add scrollable class if content overflows
    document.querySelectorAll('.filter-wrap').forEach(container => {
        // Get computed max-height
        const maxHeight = parseFloat(getComputedStyle(container).maxHeight);
        // Get actual scroll height
        const scrollHeight = container.scrollHeight;

        if (scrollHeight > maxHeight) {
            container.classList.add('scrollable');
        } else {
            container.classList.remove('scrollable');
        }
    });
}

function checkFilterOverflow(filterId) {
    // Compatibility - call main function
    checkFilterBarOverflow();
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


// ==========================================
// CONTENT BROWSER LOGIC
// ==========================================

let contentData = [];
let displayTemplates = {};

// Refined Filter & Sort State
let contentState = {
    filters: {
        game: 'ShadowDark',
        type: {}, // e.g. { 'Monster': true }
        source: 'all', // 'all' or specific source name (legacy)
        sources: {}, // e.g. { 'Core': true, 'Cursed Scroll 1': true }
        search: '',
        alignment: {}, // e.g. { 'L': true, 'N': true, 'C': true }
        spellClass: {}, // e.g. { 'Wizard': true }
        props: {} // numeric ranges { level: {min, max} }
    },
    sort: {
        field: 'name',
        direction: 'asc'
    },
    meta: {
        types: new Set(),
        sources: new Set(),
        alignments: new Set(),
        spellClasses: new Set(),
        ranges: {}
    }
};

function initContentBrowser() {
    const savedArea = document.getElementById('contentSavedArea');
    if (savedArea) {
        savedArea.addEventListener('dragover', e => {
            e.preventDefault();
            savedArea.classList.add('border-primary', 'bg-primary/5');
            e.dataTransfer.dropEffect = 'copy';
        });
        savedArea.addEventListener('dragleave', e => {
            savedArea.classList.remove('border-primary', 'bg-primary/5');
        });
        savedArea.addEventListener('drop', handleContentDrop);
    }

    // Initialize sidebar resizer
    setupContentSidebarResizer();
}

function setupContentSidebarResizer() {
    const divider = document.getElementById('contentVerticalDivider');
    const sidebar = document.getElementById('contentSavedSidebar');

    if (!divider || !sidebar) return;

    let isResizing = false;

    divider.addEventListener('mousedown', (e) => {
        isResizing = true;
        divider.classList.add('bg-primary');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        sidebar.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const newWidth = window.innerWidth - e.clientX;
        const maxWidth = Math.min(800, window.innerWidth * 0.6);

        if (newWidth >= 200 && newWidth <= maxWidth) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            divider.classList.remove('bg-primary');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function handleContentDrop(e) {
    e.preventDefault();
    const savedArea = document.getElementById('contentSavedArea');
    savedArea.classList.remove('border-primary', 'bg-primary/5');

    const source = e.dataTransfer.getData('application/ttrpg-source');

    // Handle Reordering (Source is Saved Area)
    if (source === 'saved') {
        const id = e.dataTransfer.getData('application/ttrpg-id');
        const draggedEl = savedArea.querySelector(`[data-saved-id="${id}"]`);
        if (!draggedEl) return;

        // Find drop target
        const targetEl = e.target.closest('[data-saved-id]');

        // If dropped on empty space, append to end
        if (!targetEl) {
            savedArea.appendChild(draggedEl);
            return;
        }

        // Calculate position relative to target
        const rect = targetEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
            savedArea.insertBefore(draggedEl, targetEl);
        } else {
            savedArea.insertBefore(draggedEl, targetEl.nextSibling);
        }
        return;
    }

    // Handle New Save (Source is Content List)
    const data = e.dataTransfer.getData('application/ttrpg-content');
    if (!data) return;

    try {
        const item = JSON.parse(data);
        saveContentItem(item);
    } catch (err) {
        console.error("Invalid drop data", err);
    }
}

function handleSavedDragStart(e) {
    const row = e.target.closest('[data-saved-id]');
    e.dataTransfer.setData('application/ttrpg-source', 'saved');
    e.dataTransfer.setData('application/ttrpg-id', row.dataset.savedId);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('opacity-50');
}

function handleSavedDragEnd(e) {
    const row = e.target.closest('[data-saved-id]');
    if (row) row.classList.remove('opacity-50');
}

function saveContentItem(item) {
    const savedArea = document.getElementById('contentSavedArea');
    const existing = savedArea.querySelector(`[data-saved-id="${item.id}"]`);
    if (existing) {
        showToast("Item already saved");
        return;
    }

    const p = item.properties || {};

    // Build summary details using helper
    const summaryDetails = getCardSummaryHtml(item);

    // Create row with IDENTICAL structure to content list
    const wrapper = document.createElement('div');
    wrapper.dataset.savedId = item.id;
    wrapper.className = "content-row mb-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg overflow-hidden transition-all hover:border-primary/50 cursor-pointer group";
    wrapper.dataset.id = item.id;

    // Make Draggable for Reordering
    wrapper.setAttribute('draggable', 'true');
    wrapper.addEventListener('dragstart', handleSavedDragStart);
    wrapper.addEventListener('dragend', handleSavedDragEnd);

    wrapper.innerHTML = `
        <div class="content-row-header p-3 flex items-center justify-between" onclick="toggleSavedCard(this)">
            <div class="flex items-center gap-3 flex-wrap">
                <span class="material-symbols-outlined text-text-muted-light dark:text-text-muted-dark cursor-grab text-lg opacity-50 group-hover:opacity-100" title="Drag to reorder">drag_indicator</span>
                <span class="font-semibold text-sm">${item.name}</span>
                <div class="flex items-center">${summaryDetails}</div>
            </div>
            <div class="flex items-center gap-1">
                <button class="delete-saved-btn p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600" 
                        onclick="event.stopPropagation(); this.closest('[data-saved-id]').remove(); showToast('Removed from Saved');">
                    <span class="material-symbols-outlined text-sm">close</span>
                </button>
                <span class="material-symbols-outlined text-text-muted-light dark:text-text-muted-dark expand-icon shrink-0">expand_more</span>
            </div>
        </div>
        <div class="content-details hidden border-t border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-[#131b2e]/50 p-4" onclick="event.stopPropagation()">
        </div>
    `;

    savedArea.appendChild(wrapper);
    showToast("Content Saved!");

    const hint = savedArea.querySelector('.border-dashed');
    if (hint) hint.style.display = 'none';
}

function toggleSavedCard(headerEl) {
    const row = headerEl.closest('[data-saved-id]');
    const details = row.querySelector('.content-details');
    const icon = row.querySelector('.expand-icon');
    const id = row.dataset.savedId;
    const item = contentData.find(i => i.id === id);

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.textContent = 'expand_less';
        row.classList.add('ring-1', 'ring-primary');

        // Render content if not already rendered
        if (!details.innerHTML.trim() && item) {
            renderContentCard(item, details, { isEmbedded: true });
        }
    } else {
        details.classList.add('hidden');
        icon.textContent = 'expand_more';
        row.classList.remove('ring-1', 'ring-primary');
    }
}

async function loadContent() {
    try {
        // Load Templates
        try {
            const tmplRes = await fetch('/api/templates');
            const tmplData = await tmplRes.json();
            if (tmplData && tmplData.types) {
                displayTemplates = tmplData.types;
                console.log("Loaded display templates for:", Object.keys(displayTemplates));
            }
        } catch (e) {
            console.warn("Failed to load templates, using defaults", e);
        }

        const response = await fetch('/api/content');
        const data = await response.json();
        if (data.content) {
            contentData = data.content;
            console.log(`Loaded ${contentData.length} content items`);
            initContentFilters();
            renderContentUi();
        }
    } catch (e) {
        console.error("Failed to load content:", e);
        showToast("Error loading content");
    }
}

function initContentFilters() {
    const meta = {
        types: new Set(),
        sources: new Set(),
        alignments: new Set(),
        spellClasses: new Set(),
        ranges: {
            level: { min: Number.MAX_SAFE_INTEGER, max: 0 },
            tier: { min: Number.MAX_SAFE_INTEGER, max: 0 },
            ac: { min: Number.MAX_SAFE_INTEGER, max: 0 },
            hp: { min: Number.MAX_SAFE_INTEGER, max: 0 }
        }
    };

    contentData.forEach(item => {
        if (item.game !== contentState.filters.game) return;

        if (item.type) meta.types.add(item.type);
        if (item.source) meta.sources.add(item.source);

        const p = item.properties || {};

        if (item.type === 'Monster') {
            const lvl = parseInt(p.level) || 0;
            const ac = parseInt(p.ac) || 0;
            const hp = parseInt(p.hp) || 0;
            const al = p.alignment;

            if (al) meta.alignments.add(al);

            meta.ranges.level.min = Math.min(meta.ranges.level.min, lvl);
            meta.ranges.level.max = Math.max(meta.ranges.level.max, lvl);
            meta.ranges.ac.min = Math.min(meta.ranges.ac.min, ac);
            meta.ranges.ac.max = Math.max(meta.ranges.ac.max, ac);
            meta.ranges.hp.min = Math.min(meta.ranges.hp.min, hp);
            meta.ranges.hp.max = Math.max(meta.ranges.hp.max, hp);
        } else if (item.type === 'Spell') {
            const tier = parseInt(p.tier) || 0;
            const cls = p.class;

            if (cls) {
                // Handle comma-separated classes like "Priest, Wizard"
                cls.split(',').map(c => c.trim()).forEach(c => meta.spellClasses.add(c));
            }

            meta.ranges.tier.min = Math.min(meta.ranges.tier.min, tier);
            meta.ranges.tier.max = Math.max(meta.ranges.tier.max, tier);
        }
    });

    contentState.meta = meta;
    console.log("DEBUG: initContentFilters META CALCULATED", {
        metaRanges: JSON.parse(JSON.stringify(meta.ranges)),
        itemsProcessed: contentData.filter(i => i.game === contentState.filters.game).length
    });

    // Default: Monster selected
    if (!Object.keys(contentState.filters.type).length) {
        contentState.filters.type = { 'Monster': true };
    }

    // Default: All sources enabled (multi-select)
    contentState.filters.source = 'all';
    meta.sources.forEach(s => contentState.filters.sources[s] = true);

    // Default: All alignments enabled
    meta.alignments.forEach(a => contentState.filters.alignment[a] = true);

    // Default: All spell classes enabled
    meta.spellClasses.forEach(c => contentState.filters.spellClass[c] = true);

    // Default ranges
    contentState.filters.props.level = { ...meta.ranges.level };
    contentState.filters.props.tier = { ...meta.ranges.tier };
    contentState.filters.props.ac = { ...meta.ranges.ac };
    contentState.filters.props.hp = { ...meta.ranges.hp };

    console.log("DEBUG: initContentFilters END", {
        finalProps: JSON.parse(JSON.stringify(contentState.filters.props))
    });
}

function renderContentUi() {
    renderFilterSidebar();
    renderSortControls();
    renderContentList();
}

// --- FILTER UI ---
function renderFilterSidebar() {
    const container = document.getElementById('contentFilterContainer');
    if (!container) return;

    container.innerHTML = '';

    // 1. GAME - Single-select pill buttons
    const gameSection = document.createElement('div');
    gameSection.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">Game</label>
        <div class="flex flex-wrap gap-2">
            <button onclick="selectContentGame('ShadowDark')" 
                class="filter-btn ${contentState.filters.game === 'ShadowDark' ? 'selected' : ''}">ShadowDark</button>
        </div>
    `;
    container.appendChild(gameSection);

    // 2. SOURCE - Dropdown popup (like Tables page)
    renderSourceDropdown(container);

    // 3. TYPE - Single-select pill buttons (exclusive)
    const typeSection = document.createElement('div');
    typeSection.className = 'mt-4';
    const selectedType = Object.keys(contentState.filters.type).find(t => contentState.filters.type[t]) || '';
    typeSection.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">Type</label>
        <div class="flex flex-wrap gap-2">
            <button onclick="selectContentType('Monster')" 
                class="filter-btn ${selectedType === 'Monster' ? 'selected' : ''}">Monsters</button>
            <button onclick="selectContentType('Spell')" 
                class="filter-btn ${selectedType === 'Spell' ? 'selected' : ''}">Spells</button>
        </div>
    `;
    container.appendChild(typeSection);

    // 4. MONSTER-SPECIFIC FILTERS
    if (contentState.filters.type['Monster']) {
        // Level Range - Dual-handle slider
        renderDualSlider(container, 'Level', 'level', contentState.meta.ranges.level);
        // AC Range
        renderDualSlider(container, 'AC', 'ac', contentState.meta.ranges.ac);
        // HP Range
        renderDualSlider(container, 'HP', 'hp', contentState.meta.ranges.hp);

        // Alignment Multi-select pill buttons
        const alSection = document.createElement('div');
        alSection.className = 'mt-4';
        const alLabels = { 'L': 'Lawful', 'N': 'Neutral', 'C': 'Chaotic' };
        let alButtons = '';
        Array.from(contentState.meta.alignments).sort().forEach(al => {
            const selected = contentState.filters.alignment[al] ? 'selected' : '';
            alButtons += `<button onclick="toggleAlignment('${al}')" class="filter-btn ${selected}">${alLabels[al] || al}</button>`;
        });
        if (alButtons) {
            alSection.innerHTML = `
                <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">Alignment</label>
                <div class="flex flex-wrap gap-2">${alButtons}</div>
            `;
            container.appendChild(alSection);
        }
    }

    // 5. SPELL-SPECIFIC FILTERS
    if (contentState.filters.type['Spell']) {
        // Tier Range
        renderDualSlider(container, 'Tier', 'tier', contentState.meta.ranges.tier);

        // Class Multi-select pill buttons
        const clsSection = document.createElement('div');
        clsSection.className = 'mt-4';
        let clsButtons = '';
        Array.from(contentState.meta.spellClasses).sort().forEach(cls => {
            const selected = contentState.filters.spellClass[cls] ? 'selected' : '';
            clsButtons += `<button onclick="toggleSpellClass('${cls}')" class="filter-btn ${selected}">${cls}</button>`;
        });
        if (clsButtons) {
            clsSection.innerHTML = `
                <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">Class</label>
                <div class="flex flex-wrap gap-2">${clsButtons}</div>
            `;
            container.appendChild(clsSection);
        }
    }
}

function renderSourceDropdown(container) {
    const section = document.createElement('div');
    section.className = 'mt-4 relative';

    const sources = Array.from(contentState.meta.sources).sort();
    const allSelected = Object.values(contentState.filters.sources).every(v => v);
    const selectedCount = Object.values(contentState.filters.sources).filter(v => v).length;
    const btnLabel = contentState.filters.source === 'all' ? 'All Sources' :
        (selectedCount === sources.length ? 'All Sources' : `${selectedCount} Selected`);

    section.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">Source</label>
        <button onclick="toggleContentSourceDropdown(event)" 
            class="filter-btn selected flex items-center gap-1 w-full justify-between">
            <span>${btnLabel}</span>
            <span class="material-symbols-outlined text-sm">expand_more</span>
        </button>
        <div id="contentSourceDropdown" class="hidden absolute left-0 right-0 top-full mt-1 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg shadow-lg z-50 p-3">
            <div class="flex justify-between mb-2 text-xs font-bold uppercase">
                <button onclick="selectAllContentSources()" class="text-primary hover:underline">Select All</button>
                <button onclick="clearAllContentSources()" class="text-red-500 hover:underline">Clear</button>
            </div>
            <div class="space-y-1 max-h-40 overflow-y-auto">
                ${sources.map(s => `
                    <label class="flex items-center gap-2 text-sm cursor-pointer hover:text-primary">
                        <input type="checkbox" onchange="toggleContentSourceItem('${s}')" ${contentState.filters.sources[s] ? 'checked' : ''} 
                            class="rounded text-primary focus:ring-primary">
                        <span>${s}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
    container.appendChild(section);
}

function renderDualSlider(container, label, propKey, metaRange) {
    if (!metaRange || metaRange.min >= metaRange.max) return;

    const current = contentState.filters.props[propKey] || metaRange;
    const range = metaRange.max - metaRange.min;
    const minPct = ((current.min - metaRange.min) / range) * 100;
    const maxPct = ((current.max - metaRange.min) / range) * 100;

    const section = document.createElement('div');
    section.className = 'mt-4';
    section.innerHTML = `
        <div class="flex justify-between items-center mb-1">
            <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider">${label}</label>
            <span class="text-xs text-primary font-mono">${current.min} – ${current.max}</span>
        </div>
        <div class="range-slider-container" data-prop="${propKey}" data-min="${metaRange.min}" data-max="${metaRange.max}">
            <div class="range-slider-track"></div>
            <div class="range-slider-fill" style="left: ${minPct}%; width: ${maxPct - minPct}%"></div>
            <div class="range-slider-handle" data-handle="min" style="left: ${minPct}%"></div>
            <div class="range-slider-handle" data-handle="max" style="left: ${maxPct}%"></div>
        </div>
    `;
    container.appendChild(section);

    // Add drag listeners
    const sliderContainer = section.querySelector('.range-slider-container');
    const handles = sliderContainer.querySelectorAll('.range-slider-handle');
    handles.forEach(handle => {
        handle.addEventListener('mousedown', startSliderDrag);
        handle.addEventListener('touchstart', startSliderDrag, { passive: false });
    });
}

let activeSlider = null;

function startSliderDrag(e) {
    e.preventDefault();
    const handle = e.target;
    const container = handle.closest('.range-slider-container');
    const handleType = handle.dataset.handle; // 'min' or 'max'
    const propKey = container.dataset.prop;
    const minVal = parseInt(container.dataset.min);
    const maxVal = parseInt(container.dataset.max);

    activeSlider = { handle, container, handleType, propKey, minVal, maxVal };

    document.addEventListener('mousemove', dragSlider);
    document.addEventListener('mouseup', endSliderDrag);
    document.addEventListener('touchmove', dragSlider, { passive: false });
    document.addEventListener('touchend', endSliderDrag);
}

function dragSlider(e) {
    if (!activeSlider) return;
    e.preventDefault();

    const { container, handleType, propKey, minVal, maxVal } = activeSlider;
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;

    // Safety check if element was detached (though we shouldn't detach it now)
    if (rect.width === 0) return;

    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));

    const newVal = Math.round(minVal + pct * (maxVal - minVal));

    // Update state
    if (handleType === 'min') {
        contentState.filters.props[propKey].min = Math.min(newVal, contentState.filters.props[propKey].max);
    } else {
        contentState.filters.props[propKey].max = Math.max(newVal, contentState.filters.props[propKey].min);
    }

    // Update Visuals Directly (Performant)
    updateSliderVisuals(container, propKey, minVal, maxVal);

    // Re-render list content (filtering)
    renderContentList();
}

function updateSliderVisuals(container, propKey, minVal, maxVal) {
    const current = contentState.filters.props[propKey];
    const range = maxVal - minVal;
    // Guard potential divide by zero if range is 0 (though unlikely to be dragged then)
    if (range <= 0) return;

    const minPct = ((current.min - minVal) / range) * 100;
    const maxPct = ((current.max - minVal) / range) * 100;

    const fill = container.querySelector('.range-slider-fill');
    const handleMin = container.querySelector('.range-slider-handle[data-handle="min"]');
    const handleMax = container.querySelector('.range-slider-handle[data-handle="max"]');

    if (fill) {
        fill.style.left = `${minPct}%`;
        fill.style.width = `${maxPct - minPct}%`;
    }
    if (handleMin) handleMin.style.left = `${minPct}%`;
    if (handleMax) handleMax.style.left = `${maxPct}%`;

    // Update text label (previous sibling -> header div -> span)
    const labelSpan = container.previousElementSibling?.querySelector('span');
    if (labelSpan) {
        labelSpan.textContent = `${current.min} – ${current.max}`;
    }
}

function endSliderDrag() {
    activeSlider = null;
    document.removeEventListener('mousemove', dragSlider);
    document.removeEventListener('mouseup', endSliderDrag);
    document.removeEventListener('touchmove', dragSlider);
    document.removeEventListener('touchend', endSliderDrag);

    // Final re-render to ensure consistency
    renderFilterSidebar();
}

function appendFilterSection(container, label, contentHtml) {
    const section = document.createElement('div');
    section.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">${label}</label>
        ${contentHtml}
    `;
    container.appendChild(section);
}

function renderRangeInputs(container, label, propKey, metaRange) {
    if (!metaRange || metaRange.min > metaRange.max) return;

    const current = contentState.filters.props[propKey] || metaRange;

    const section = document.createElement('div');
    section.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">${label}</label>
        <div class="flex gap-2 items-center">
            <input type="number" min="${metaRange.min}" max="${metaRange.max}" value="${current.min}"
                onchange="updateRangeInput('${propKey}', 'min', this.value)"
                class="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded p-1.5 text-sm text-center">
            <span class="text-text-muted-light dark:text-text-muted-dark">to</span>
            <input type="number" min="${metaRange.min}" max="${metaRange.max}" value="${current.max}"
                onchange="updateRangeInput('${propKey}', 'max', this.value)"
                class="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded p-1.5 text-sm text-center">
        </div>
    `;
    container.appendChild(section);
}

function appendFilterSection(container, label, contentHtml) {
    const section = document.createElement('div');
    section.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">${label}</label>
        ${contentHtml}
    `;
    container.appendChild(section);
}

function renderRangeInputs(container, label, propKey, metaRange) {
    if (!metaRange || metaRange.min > metaRange.max) return;

    const current = contentState.filters.props[propKey] || metaRange;

    const section = document.createElement('div');
    section.innerHTML = `
        <label class="text-xs font-bold text-text-muted-light dark:text-text-muted-dark uppercase tracking-wider block mb-2">${label}</label>
        <div class="flex gap-2 items-center">
            <input type="number" min="${metaRange.min}" max="${metaRange.max}" value="${current.min}"
                onchange="updateRangeInput('${propKey}', 'min', this.value)"
                class="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded p-1.5 text-sm text-center">
            <span class="text-text-muted-light dark:text-text-muted-dark">to</span>
            <input type="number" min="${metaRange.min}" max="${metaRange.max}" value="${current.max}"
                onchange="updateRangeInput('${propKey}', 'max', this.value)"
                class="w-full bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded p-1.5 text-sm text-center">
        </div>
    `;
    container.appendChild(section);
}

function renderSortControls() {
    const header = document.querySelector('#contentBrowser .py-3.px-6');
    if (!header) return;

    // Check if sort already exists
    let sortContainer = header.querySelector('#contentSortContainer');
    if (!sortContainer) {
        sortContainer = document.createElement('div');
        sortContainer.id = 'contentSortContainer';
        sortContainer.className = 'flex items-center gap-2';

        const searchInput = header.querySelector('#contentSearchInput');
        if (searchInput) {
            searchInput.parentElement.insertBefore(sortContainer, searchInput);
        }
    }

    // Build sort options based on active types
    let options = '<option value="name">Name</option>';
    if (contentState.filters.type['Monster']) {
        options += '<option value="level">Level</option>';
        options += '<option value="ac">AC</option>';
        options += '<option value="hp">HP</option>';
    }
    if (contentState.filters.type['Spell']) {
        options += '<option value="tier">Tier</option>';
    }

    sortContainer.innerHTML = `
        <select id="contentSortField" onchange="updateSort(this.value, contentState.sort.direction)"
            class="bg-background-light dark:bg-background-dark border border-border-light dark:border-border-dark rounded py-1.5 px-2 text-sm">
            ${options}
        </select>
        <button onclick="toggleSortDirection()" class="p-1.5 rounded hover:bg-surface-highlight-light dark:hover:bg-surface-highlight-dark transition-colors"
            title="Toggle Sort Direction">
            <span class="material-symbols-outlined text-lg">${contentState.sort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
        </button>
    `;

    // Set current selection
    const select = sortContainer.querySelector('#contentSortField');
    if (select) select.value = contentState.sort.field;
}

// --- FILTER ACTIONS ---
function selectContentGame(game) {
    contentState.filters.game = game;
    initContentFilters();
    renderContentUi();
}

function updateContentGame(game) {
    selectContentGame(game);
}

function selectContentType(type) {
    // Single-select: clear all, then select this one
    contentState.filters.type = {};
    contentState.filters.type[type] = true;
    renderFilterSidebar();
    renderSortControls();
    renderContentList();
}

function toggleContentType(type) {
    contentState.filters.type[type] = !contentState.filters.type[type];
    renderFilterSidebar();
    renderSortControls();
    renderContentList();
}

function toggleContentSourceDropdown(e) {
    e.stopPropagation();
    const dropdown = document.getElementById('contentSourceDropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

function selectAllContentSources() {
    Array.from(contentState.meta.sources).forEach(s => {
        contentState.filters.sources[s] = true;
    });
    renderFilterSidebar();
    renderContentList();
}

function clearAllContentSources() {
    Object.keys(contentState.filters.sources).forEach(s => {
        contentState.filters.sources[s] = false;
    });
    renderFilterSidebar();
    renderContentList();
}

function toggleContentSourceItem(source) {
    contentState.filters.sources[source] = !contentState.filters.sources[source];
    renderFilterSidebar();
    renderContentList();
}

function updateContentSource(source) {
    contentState.filters.source = source;
    renderContentList();
}

function toggleAlignment(al) {
    contentState.filters.alignment[al] = !contentState.filters.alignment[al];
    renderContentList();
}

function toggleSpellClass(cls) {
    contentState.filters.spellClass[cls] = !contentState.filters.spellClass[cls];
    renderContentList();
}

function updateRangeInput(prop, bound, value) {
    const val = parseInt(value) || 0;
    contentState.filters.props[prop][bound] = val;
    renderContentList();
}

function updateSort(field, direction) {
    contentState.sort.field = field;
    contentState.sort.direction = direction;
    renderContentList();
}

function toggleSortDirection() {
    contentState.sort.direction = contentState.sort.direction === 'asc' ? 'desc' : 'asc';
    renderSortControls();
    renderContentList();
}

function resetContentFilters() {
    contentState.filters.type = {};
    contentState.filters.source = 'all';
    contentState.filters.sources = {};
    contentState.filters.alignment = {};
    contentState.filters.spellClass = {};
    contentState.filters.props = {};
    contentState.sort = { field: 'name', direction: 'asc' };
    initContentFilters();
    renderContentUi();
    showToast("Filters Reset");
}

// Helper to render summary based on templates
function getCardSummaryHtml(item) {
    const p = item.properties || {};
    const tmpl = displayTemplates[item.type];

    if (tmpl && tmpl.header) {
        return tmpl.header.map(field => {
            const val = p[field.key] || (field.key === 'alignment' && p.alignment ? p.alignment : '');
            if (!val && !field.label) return '';

            const label = field.label ? `${field.label} ` : '';
            if (field.badge) {
                // Map logical colors to classes
                let colorClass = 'text-primary bg-primary/10'; // Default
                const c = field.color || tmpl.colorAccent;
                if (c === 'purple') colorClass = 'text-purple-600 dark:text-purple-400 bg-purple-500/10';
                else if (c === 'amber') colorClass = 'text-amber-600 dark:text-amber-400 bg-amber-500/10';

                return `<span class="text-xs ${colorClass} px-2 py-0.5 rounded font-bold">${label}${val}</span>`;
            }
            return `<span class="text-xs text-text-muted-light dark:text-text-muted-dark ml-2">${label}${val}</span>`;
        }).join('');
    }

    // Fallback Defaults
    if (item.type === 'Monster') {
        const lvl = p.level || '?';
        const ac = p.ac || '-';
        const hp = p.hp || '-';
        const al = p.alignment || '';
        return `
            <span class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">LV ${lvl}</span>
            <span class="text-xs text-text-muted-light dark:text-text-muted-dark ml-2">AC ${ac} • HP ${hp} • ${al}</span>
        `;
    } else if (item.type === 'Spell') {
        const tier = p.tier || 0;
        const cls = p.class || '';
        return `
            <span class="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded font-bold">Tier ${tier}</span>
            <span class="text-xs text-text-muted-light dark:text-text-muted-dark ml-2">${cls}</span>
        `;
    }
    return '';
}

// --- CONTENT LIST RENDERER ---
function renderContentList() {
    const listContainer = document.getElementById('contentListContainer');
    const searchInput = document.getElementById('contentSearchInput');
    const search = searchInput ? searchInput.value.toLowerCase().trim() : '';

    // Filter
    let filtered = contentData.filter(item => {
        if (item.game !== contentState.filters.game) return false;
        if (!contentState.filters.type[item.type]) return false;

        // Multi-select source filter
        const anySourceSelected = Object.values(contentState.filters.sources).some(v => v);
        if (anySourceSelected && !contentState.filters.sources[item.source]) return false;


        if (search) {
            const inName = item.name.toLowerCase().includes(search);
            const inDesc = item.description && item.description.toLowerCase().includes(search);
            if (!inName && !inDesc) return false;
        }

        const props = item.properties;
        const r = contentState.filters.props;

        if (item.type === 'Monster') {
            const lvl = parseInt(props.level) || 0;
            const ac = parseInt(props.ac) || 0;
            const hp = parseInt(props.hp) || 0;
            const al = props.alignment;

            if (lvl < r.level.min || lvl > r.level.max) return false;
            if (ac < r.ac.min || ac > r.ac.max) return false;
            if (hp < r.hp.min || hp > r.hp.max) return false;
            if (al && !contentState.filters.alignment[al]) return false;
        } else if (item.type === 'Spell') {
            const tier = parseInt(props.tier) || 0;
            const cls = props.class;

            if (tier < r.tier.min || tier > r.tier.max) return false;

            // Check if any of the spell's classes are enabled
            if (cls) {
                const classes = cls.split(',').map(c => c.trim());
                const anyEnabled = classes.some(c => contentState.filters.spellClass[c]);
                if (!anyEnabled) return false;
            }
        }

        return true;
    });

    // Sort
    const sortField = contentState.sort.field;
    const sortDir = contentState.sort.direction === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
        let aVal, bVal;

        if (sortField === 'name') {
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
        } else {
            aVal = parseInt(a.properties[sortField]) || 0;
            bVal = parseInt(b.properties[sortField]) || 0;
        }

        if (aVal < bVal) return -1 * sortDir;
        if (aVal > bVal) return 1 * sortDir;
        return 0;
    });

    listContainer.innerHTML = '';

    // Update header
    const title = document.getElementById('contentHeaderTitle');
    const activeTypes = Object.keys(contentState.filters.type).filter(k => contentState.filters.type[k]);
    if (title) {
        title.textContent = activeTypes.length === 1 ? activeTypes[0] + 's' : 'Content';
        title.textContent += ` (${filtered.length})`;
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="text-center text-text-muted-light dark:text-text-muted-dark p-8">No matching content found.</div>`;
        return;
    }

    filtered.forEach(item => {
        const row = document.createElement('div');
        row.className = "content-row mb-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg overflow-hidden transition-all hover:border-primary/50 cursor-pointer group";
        row.dataset.id = item.id;
        row.setAttribute('draggable', 'true');
        row.addEventListener('dragstart', handleContentDragStart);

        const summaryDetails = getCardSummaryHtml(item);

        row.innerHTML = `
            <div class="content-row-header p-3 flex items-center justify-between" onclick="toggleContentRow(this)">
                <div class="flex items-center gap-3 flex-wrap">
                    <span class="material-symbols-outlined text-text-muted-light dark:text-text-muted-dark cursor-grab text-lg opacity-50 group-hover:opacity-100" title="Drag to Save">drag_indicator</span>
                    <span class="font-semibold text-sm">${item.name}</span>
                    <div class="flex items-center">${summaryDetails}</div>
                </div>
                <span class="material-symbols-outlined text-text-muted-light dark:text-text-muted-dark expand-icon shrink-0">expand_more</span>
            </div>
            <div class="content-details hidden border-t border-border-light dark:border-border-dark bg-gray-50/50 dark:bg-[#131b2e]/50 p-4" onclick="event.stopPropagation()">
            </div>
        `;

        listContainer.appendChild(row);
    });
}

function toggleContentRow(headerEl) {
    const row = headerEl.parentElement;
    const details = row.querySelector('.content-details');
    const icon = row.querySelector('.expand-icon');

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.textContent = 'expand_less';
        row.classList.add('ring-1', 'ring-primary');

        if (!details.innerHTML.trim()) {
            const id = row.dataset.id;
            const item = contentData.find(i => i.id === id);
            if (item) renderContentCard(item, details, { isEmbedded: true });
        }
    } else {
        details.classList.add('hidden');
        icon.textContent = 'expand_more';
        row.classList.remove('ring-1', 'ring-primary');
    }
}

function renderConfigurableBody(item, container, tmpl, options) {
    const p = item.properties || {};
    const color = tmpl.colorAccent || 'primary';
    const colorClass = color === 'amber' ? 'text-amber-500 dark:text-amber-400'
        : color === 'purple' ? 'text-purple-500 dark:text-purple-400'
            : 'text-primary';

    let contentHtml = '';

    if (tmpl.layout) {
        tmpl.layout.forEach(section => {
            if (section.type === 'flavor' && p.flavor) {
                contentHtml += `<div class="italic text-sm text-text-muted-light dark:text-text-muted-dark mb-3 border-l-2 border-${color}-500/40 pl-3">${p.flavor}</div>`;
            }
            else if (section.type === 'properties') {
                const keys = section.keys || [];
                if (keys.length > 0) {
                    const fields = keys.map(k => {
                        let val = p[k] || 'N/A';
                        let label = k.toUpperCase();

                        // Helper: Handle alignment specifically? or generic?
                        if (k === 'level') label = 'LV';
                        if (k === 'alignment') label = 'AL';

                        return `<div><strong class="${colorClass}">${label}</strong> ${val}</div>`;
                    }).join('');
                    contentHtml += `<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">${fields}</div>`;
                }
            }
            else if (section.type === 'actions' && item.actions && item.actions.length > 0) {
                const title = section.title || 'Actions';
                contentHtml += `
                    <div class="mb-3">
                        <h4 class="font-bold text-xs uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark mb-1">${title}</h4>
                        ${item.actions.map(a => `<div class="text-sm"><strong class="text-red-500 dark:text-red-400">${a.name || 'Action'}.</strong> ${formatAttacks(a.desc)}</div>`).join('')}
                    </div>`;
            }
            else if (section.type === 'stats' && p.stats) {
                const s = p.stats;
                contentHtml += `
                    <div class="grid grid-cols-6 gap-0 text-center my-2 text-xs bg-background-light dark:bg-background-dark p-1.5 rounded border border-border-light dark:border-border-dark">
                        <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">STR</div><div class="font-semibold">${s.str || '0'}</div></div>
                        <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">DEX</div><div class="font-semibold">${s.dex || '0'}</div></div>
                        <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">CON</div><div class="font-semibold">${s.con || '0'}</div></div>
                        <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">INT</div><div class="font-semibold">${s.int || '0'}</div></div>
                        <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">WIS</div><div class="font-semibold">${s.wis || '0'}</div></div>
                        <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">CHA</div><div class="font-semibold">${s.cha || '0'}</div></div>
                    </div>`;
            }
            else if (section.type === 'abilities' && item.abilities && item.abilities.length > 0) {
                contentHtml += `
                <div class="space-y-1 mt-2">
                    <h4 class="font-bold text-xs uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark">Abilities</h4>
                    ${item.abilities.map(a => `<div class="text-sm"><strong class="${colorClass}">${a.name || 'Ability'}.</strong> ${a.desc || ''}</div>`).join('')}
                </div>`;
            }
            else if (section.type === 'description' && item.description) {
                contentHtml += `<div class="text-sm text-text-muted-light dark:text-text-muted-dark mb-3">${item.description}</div>`;
            }
        });
    }

    // Footer
    contentHtml += `
        <div class="mt-3 pt-2 border-t border-border-light dark:border-border-dark flex justify-between text-xs text-text-muted-light dark:text-text-muted-dark uppercase">
            <span>${item.game}</span>
            <span>${item.source}</span>
        </div>
    `;

    container.innerHTML = `
        <div class="content-card rounded-lg bg-surface-light dark:bg-surface-dark p-4"
                data-id="${item.id}" data-type="${item.type}">
            ${contentHtml}
        </div>
    `;
}

function renderContentCard(item, container, options = {}) {
    const { isEmbedded = true, isStandalone = false } = options;

    // Check for display template
    const tmpl = displayTemplates[item.type];
    if (tmpl && tmpl.layout) {
        renderConfigurableBody(item, container, tmpl, options);
        return;
    }

    // Fallback: Dispatch to type-specific renderer
    if (item.type === 'Monster') {
        renderMonsterCard(item, container, options);
    } else if (item.type === 'Spell') {
        renderSpellCard(item, container, options);
    } else {
        // Generic fallback
        renderGenericCard(item, container, options);
    }
}

// Attack formatter helper
function formatAttacks(desc) {
    if (!desc) return '';
    let formatted = desc.replace(/^(\d+)\s+/g, '$1 × ');
    formatted = formatted.replace(/\b(or|and)\s+(\d+)\s+/gi, (match, conj, num) => {
        return `<strong class="text-white/90 mx-1">${conj.toUpperCase()}</strong> ${num} × `;
    });
    return formatted;
}

function renderMonsterCard(item, container, options = {}) {
    const { isEmbedded = true } = options;
    const p = item.properties || {};

    // Props line (AC, HP, MV, AL)
    const propsHtml = `
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
            <div><strong class="text-amber-500 dark:text-amber-400">AC</strong> ${p.ac || 'N/A'}</div>
            <div><strong class="text-amber-500 dark:text-amber-400">HP</strong> ${p.hp || 'N/A'}</div>
            <div><strong class="text-amber-500 dark:text-amber-400">MV</strong> ${p.mv || 'N/A'}</div>
            <div><strong class="text-amber-500 dark:text-amber-400">AL</strong> ${p.alignment || 'N/A'}</div>
        </div>
    `;

    // Flavor text
    let flavorHtml = '';
    if (p.flavor) {
        flavorHtml = `<div class="italic text-sm text-text-muted-light dark:text-text-muted-dark mb-3 border-l-2 border-amber-500/40 pl-3">${p.flavor}</div>`;
    }

    // Actions with formatted attacks (MOVED UP)
    let actionsHtml = '';
    if (item.actions && item.actions.length > 0) {
        actionsHtml = `
            <div class="mb-3">
                <h4 class="font-bold text-xs uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark mb-1">Actions</h4>
                ${item.actions.map(a => `<div class="text-sm"><strong class="text-red-500 dark:text-red-400">${a.name || 'Action'}.</strong> ${formatAttacks(a.desc)}</div>`).join('')}
            </div>
        `;
    }

    // Compact stats block (MOVED DOWN)
    let statsBlock = '';
    if (p.stats) {
        const s = p.stats;
        statsBlock = `
            <div class="grid grid-cols-6 gap-0 text-center my-2 text-xs bg-background-light dark:bg-background-dark p-1.5 rounded border border-border-light dark:border-border-dark">
                <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">STR</div><div class="font-semibold">${s.str || '0'}</div></div>
                <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">DEX</div><div class="font-semibold">${s.dex || '0'}</div></div>
                <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">CON</div><div class="font-semibold">${s.con || '0'}</div></div>
                <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">INT</div><div class="font-semibold">${s.int || '0'}</div></div>
                <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">WIS</div><div class="font-semibold">${s.wis || '0'}</div></div>
                <div><div class="font-bold uppercase text-text-muted-light dark:text-text-muted-dark" style="font-size: 9px;">CHA</div><div class="font-semibold">${s.cha || '0'}</div></div>
            </div>
        `;
    }

    // Abilities
    let abilitiesHtml = '';
    if (item.abilities && item.abilities.length > 0) {
        abilitiesHtml = `
            <div class="space-y-1 mt-2">
                <h4 class="font-bold text-xs uppercase tracking-wide text-text-muted-light dark:text-text-muted-dark">Abilities</h4>
                ${item.abilities.map(a => `<div class="text-sm"><strong class="text-amber-500 dark:text-amber-400">${a.name || 'Ability'}.</strong> ${a.desc || ''}</div>`).join('')}
            </div>
        `;
    }

    // Layout: Flavor → Props → Actions → Stats → Abilities → Footer
    container.innerHTML = `
        <div class="content-card rounded-lg bg-surface-light dark:bg-surface-dark p-4"
             data-id="${item.id}" data-type="${item.type}">
            ${flavorHtml}
            ${propsHtml}
            ${actionsHtml}
            ${statsBlock}
            ${abilitiesHtml}
            <div class="mt-3 pt-2 border-t border-border-light dark:border-border-dark flex justify-between text-xs text-text-muted-light dark:text-text-muted-dark uppercase">
                <span>${item.game}</span>
                <span>${item.source}</span>
            </div>
        </div>
    `;
}

function renderSpellCard(item, container, options = {}) {
    const p = item.properties || {};

    // Spell props
    const propsHtml = `
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
            <div><strong class="text-purple-500 dark:text-purple-400">Tier</strong> ${p.tier || 'N/A'}</div>
            <div><strong class="text-purple-500 dark:text-purple-400">Class</strong> ${p.class || 'N/A'}</div>
            <div><strong class="text-purple-500 dark:text-purple-400">Duration</strong> ${p.duration || 'N/A'}</div>
            <div><strong class="text-purple-500 dark:text-purple-400">Range</strong> ${p.range || 'N/A'}</div>
        </div>
    `;

    // Description
    let descHtml = '';
    if (item.description) {
        descHtml = `<div class="text-sm mb-3">${item.description}</div>`;
    }

    container.innerHTML = `
        <div class="content-card rounded-lg bg-surface-light dark:bg-surface-dark p-4"
             data-id="${item.id}" data-type="${item.type}">
            ${propsHtml}
            ${descHtml}
            <div class="mt-3 pt-2 border-t border-border-light dark:border-border-dark flex justify-between text-xs text-text-muted-light dark:text-text-muted-dark uppercase">
                <span>${item.game}</span>
                <span>${item.source}</span>
            </div>
        </div>
    `;
}

function renderGenericCard(item, container, options = {}) {
    const p = item.properties || {};

    let descHtml = '';
    if (item.description) {
        descHtml = `<div class="text-sm mb-3">${item.description}</div>`;
    }

    container.innerHTML = `
        <div class="content-card rounded-lg bg-surface-light dark:bg-surface-dark p-4"
             data-id="${item.id}" data-type="${item.type}">
            ${descHtml}
            <div class="mt-3 pt-2 border-t border-border-light dark:border-border-dark flex justify-between text-xs text-text-muted-light dark:text-text-muted-dark uppercase">
                <span>${item.game}</span>
                <span>${item.source}</span>
            </div>
        </div>
    `;
}

function handleContentDragStart(e) {
    const target = e.currentTarget;
    const id = target.dataset.id;
    const item = contentData.find(i => i.id === id);
    if (item) {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.setData('application/ttrpg-content', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
    }
}

function downloadSavedContent() {
    const savedIds = Array.from(document.querySelectorAll('#contentSavedArea [data-saved-id]')).map(el => el.dataset.savedId);
    console.log("Saving IDs:", savedIds);
    showToast("Download feature coming soon!");
}

function switchMode(mode) {
    const generatorView = document.getElementById('generatorView');
    const contentBrowser = document.getElementById('contentBrowser');
    const btnGen = document.getElementById('nav-btn-generator');
    const btnContent = document.getElementById('nav-btn-content');

    if (mode === 'generator') {
        generatorView.style.display = 'flex';
        contentBrowser.style.display = 'none';
        btnGen.classList.add('active', 'bg-primary/10', 'text-primary', 'shadow-md');
        btnGen.classList.remove('text-text-muted-light', 'dark:text-text-muted-dark', 'hover:bg-surface-highlight-light');
        btnContent.classList.remove('active', 'bg-primary/10', 'text-primary', 'shadow-md');
        btnContent.classList.add('text-text-muted-light', 'dark:text-text-muted-dark', 'hover:bg-surface-highlight-light');
    } else {
        generatorView.style.display = 'none';
        contentBrowser.style.display = 'flex';
        btnContent.classList.add('active', 'bg-primary/10', 'text-primary', 'shadow-md');
        btnContent.classList.remove('text-text-muted-light', 'dark:text-text-muted-dark', 'hover:bg-surface-highlight-light');
        btnGen.classList.remove('active', 'bg-primary/10', 'text-primary', 'shadow-md');
        btnGen.classList.add('text-text-muted-light', 'dark:text-text-muted-dark', 'hover:bg-surface-highlight-light');

        if (contentData.length === 0) {
            loadContent();
        }

        // Ensure resizer is setup after DOM is visible
        setupContentSidebarResizer();
    }
}

// Initialize
initContentBrowser();

