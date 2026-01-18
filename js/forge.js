/**
 * Forge V2 - Controller & Modular Architecture
 * Refactored for strength, scalability, and UX.
 */

/* ==========================================================================
   COMPONENT: COMBOBOX
   A robust Input + Dropdown hybrid for "Search or Create" UX.
   ========================================================================== */
class Combobox {
    constructor(containerId, options = []) {
        this.container = document.getElementById(containerId);
        this.options = options;
        this.value = '';
        this.onChangeCallback = null;
        this.isOpen = false;

        if (!this.container) return;
        this.render();
        this.bindEvents();
    }

    render() {
        this.container.innerHTML = `
            <input type="text" placeholder="Select or type..." autocomplete="off">
            <span class="material-symbols-outlined chevron">expand_more</span>
            <div class="options-list custom-scrollbar"></div>
        `;
        this.input = this.container.querySelector('input');
        this.list = this.container.querySelector('.options-list');
        this.renderOptions();
    }

    renderOptions() {
        if (!this.list) return;

        const filter = this.input.value.toLowerCase();
        const filtered = this.options.filter(opt => opt.toLowerCase().includes(filter));

        this.list.innerHTML = '';

        if (filtered.length === 0 && this.input.value.trim() !== '') {
            // "Create" option
            const createDiv = document.createElement('div');
            createDiv.className = 'option create-option text-purple-400 font-bold';
            createDiv.innerHTML = `<span class="material-symbols-outlined text-xs mr-1">add</span>Create "${this.input.value}"`;
            createDiv.addEventListener('mousedown', () => this.select(this.input.value));
            this.list.appendChild(createDiv);
        } else {
            filtered.forEach(opt => {
                const div = document.createElement('div');
                div.className = 'option';
                div.textContent = opt;
                if (opt === this.value) div.classList.add('selected');
                div.addEventListener('mousedown', () => this.select(opt));
                this.list.appendChild(div);
            });
        }
    }

    bindEvents() {
        // Input handling
        this.input.addEventListener('input', () => {
            this.value = this.input.value;
            this.open();
            this.renderOptions();
            this.triggerChange();
        });

        // Focus/Blur
        this.input.addEventListener('focus', () => this.open());
        this.input.addEventListener('blur', () => {
            // Delay closing to allow click events to register
            setTimeout(() => this.close(), 200);
        });

        // Toggle on chevron click
        const chevron = this.container.querySelector('.chevron');
        chevron.style.pointerEvents = "auto";
        chevron.style.cursor = "pointer";
        chevron.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent blur from immediate close
            if (this.isOpen) this.close();
            else {
                this.input.focus();
                this.open();
            }
        });
    }

    select(val) {
        this.value = val;
        this.input.value = val;
        this.close();
        this.triggerChange();
    }

    open() {
        this.isOpen = true;
        this.container.classList.add('open');
        this.renderOptions();
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('open');
    }

    setOptions(newOptions) {
        this.options = newOptions;
        this.renderOptions();
    }

    setValue(val) {
        this.value = val;
        this.input.value = val;
    }

    getValue() {
        return this.value;
    }

    onChange(cb) {
        this.onChangeCallback = cb;
    }

    triggerChange() {
        if (this.onChangeCallback) this.onChangeCallback(this.value);
    }
}


/* ==========================================================================
   SERVICE: FORGE API
   Centralized network calls.
   ========================================================================== */
const ForgeAPI = {
    async _safeFetch(url, options = {}) {
        try {
            const res = await fetch(url, options);
            const contentType = res.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || data.message || `Server Error: ${res.status}`);
                }
                return data;
            } else {
                const text = await res.text();
                if (!res.ok) {
                    const match = text.match(/<pre>(.*?)<\/pre>/s) || text.match(/<h1>(.*?)<\/h1>/s);
                    const errorDetails = match ? match[1].trim() : (text.slice(0, 200) + '...');
                    throw new Error(`[${res.status}] ${errorDetails}`);
                }
                return { text };
            }
        } catch (e) {
            console.error(`Fetch error for ${url}:`, e);
            throw e;
        }
    },

    async getSecrets(user) {
        return this._safeFetch('/api/user/secrets', { headers: { 'x-username': user } });
    },

    async getModels() {
        return this._safeFetch('/api/llm/models');
    },

    async getSources(game) {
        if (!game) return { sources: [] };
        return this._safeFetch(`/api/forge/sources/${encodeURIComponent(game)}`);
    },

    async getMetadata() {
        return this._safeFetch('/api/forge/metadata');
    },

    async analyze(text, provider, apiKey, model, taskId) {
        return this._safeFetch('/api/forge/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, provider, apiKey, model, taskId })
        });
    },

    async process(payload) {
        return this._safeFetch('/api/forge/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    async upload(formData) {
        return this._safeFetch('/api/forge/upload', { method: 'POST', body: formData });
    },

    async loadPath(filePath, taskId) {
        return this._safeFetch('/api/forge/load-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, taskId })
        });
    },

    async save(content, type) {
        return this._safeFetch('/api/forge/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, type })
        });
    },

    async extractMultiModal(formData) {
        return this._safeFetch('/api/forge/extract-multimodal', {
            method: 'POST',
            body: formData
        });
    },

    async saveCards(cards, game, contentType, origin) {
        return this._safeFetch('/api/forge/save-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards, game, contentType, origin })
        });
    },

    // NEW: Python Scribe Pipeline - Enhanced extraction with retry logic
    async extractScribe(text, type, game, source, taskId, apiKey, model) {
        return this._safeFetch('/api/forge/extract-scribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, type, game, source, taskId, apiKey, model })
        });
    }
};


/* ==========================================================================
   CONTROLLER: MAIN APP LOGIC
   Orchestrates UI, State, and API.
   ========================================================================== */
class ForgeController {
    constructor() {
        this.state = {
            text: '',
            analysis: null,
            origin: 'official',
            currentStep: 1,
            totalSteps: 5,
            contentTypes: ['monster'],
            contentExtracted: false
        };

        this.currentTaskId = null;
        this.abortController = null;

        // Restore State from LocalStorage
        this.restoreState();

        // Initialize UI Components
        this.initComboboxes();
        this.cardFilters = {
            search: '',
            game: {},
            type: {},
            source: {}  // Source filter
        };
        this.cardSort = {
            field: 'name',
            direction: 'asc'
        };

        // Define filters specifically for generated content
        this.initCardFilters = this.initCardFilters.bind(this);
        this.renderCardList = this.renderCardList.bind(this);
        this.resetCardFilters = this.resetCardFilters.bind(this);
        this.saveAllCards = this.saveAllCards.bind(this);

        // SSE Progress Logging
        this.eventSource = null;
        this._initEventSource();

        this.initUI();
        this.initContentTypeButtons();
        this.initWizardNav();
        this.setupProviderToggle(); // Restored
        this.loadUserConfig();

        // Ensure display templates are loaded for card rendering
        if (typeof window.loadDisplayTemplates === 'function') {
            window.loadDisplayTemplates();
        }

        console.log('ForgeController Initialized');
    }

    _initEventSource() {
        if (this.eventSource) this.eventSource.close();

        this.eventSource = new EventSource('/api/forge/events');

        this.eventSource.onopen = () => {
            this.addLog('Connected to server event stream.', 'info');
        };

        this.eventSource.addEventListener('log', (e) => {
            const data = JSON.parse(e.data);
            this.addLog(data.message, data.level || 'info');
        });

        this.eventSource.addEventListener('progress', (e) => {
            const data = JSON.parse(e.data);
            // Optional: Update a secondary progress bar or status text
            if (data.message) {
                const statusEl = document.getElementById('forgeStatus');
                if (statusEl) statusEl.textContent = `${data.message} (${data.current}/${data.total})`;
            }
        });

        this.eventSource.onerror = (e) => {
            console.error('SSE Error:', e);
            this.addLog('Connection lost. Retrying...', 'error');
            // Browser auto-retries EventSource, so we just log it
        };
    }

    toggleDebugLog() {
        const container = document.getElementById('forgeDebugLogContainer');
        if (!container) return;
        const isHidden = container.classList.contains('hidden');
        container.classList.toggle('hidden');

        // Auto-reconnect if we open it and it's disconnected
        if (!isHidden && (!this.eventSource || this.eventSource.readyState === 2)) {
            this._initEventSource();
        }
    }

    clearDebugLog() {
        const logEl = document.getElementById('forgeDebugLog');
        if (logEl) logEl.innerHTML = '<div class="text-slate-600 italic">Log cleared.</div>';
    }

    addLog(message, type = 'info') {
        const logEl = document.getElementById('forgeDebugLog');
        if (!logEl) return;

        const entry = document.createElement('div');
        entry.className = 'mb-1 break-words flex items-start gap-2';

        // Icon and color coding based on type
        let colorClass = 'text-green-500/80';
        let icon = '○';
        switch (type) {
            case 'warn':
                colorClass = 'text-yellow-500/80';
                icon = '⚠';
                break;
            case 'error':
                colorClass = 'text-red-500/80';
                icon = '✖';
                break;
            case 'info':
                colorClass = 'text-blue-400/80';
                icon = 'ℹ';
                break;
            case 'success':
                colorClass = 'text-green-400/80';
                icon = '✔';
                break;
            case 'progress':
                colorClass = 'text-purple-400/80';
                icon = '⋯';
                break;
            case 'debug':
                colorClass = 'text-slate-400/80';
                icon = '🔧';
                break;
            default:
                colorClass = 'text-slate-300/80';
                icon = '○';
        }

        const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Truncate very long messages with expand option
        let displayMessage = message;
        if (message.length > 200) {
            displayMessage = message.substring(0, 200) + '...';
            entry.title = message; // Full message on hover
        }

        entry.innerHTML = `<span class="text-slate-600 text-xs whitespace-nowrap">[${time}]</span><span class="${colorClass}">${icon}</span><span class="${colorClass} flex-1">${displayMessage}</span>`;

        logEl.appendChild(entry);

        // Auto-scroll to bottom
        logEl.scrollTop = logEl.scrollHeight;

        // Limit log entries to 300
        if (logEl.children.length > 300) {
            logEl.removeChild(logEl.firstChild);
        }
    }

    saveState() {
        const provider = document.getElementById('forgeProvider')?.value;
        const model = document.getElementById('forgeModelSelect')?.value;
        const apiKey = document.getElementById('forgeApiKey')?.value;

        const toSave = {
            currentStep: this.state.currentStep,
            contentExtracted: this.state.contentExtracted,
            currentFile: this.currentFile,
            contentTypes: this.state.contentTypes,
            game: this.gameCombo ? this.gameCombo.getValue() : '',
            source: this.sourceCombo ? this.sourceCombo.getValue() : '',
            provider,
            model,
            apiKey
        };
        localStorage.setItem('forge_state', JSON.stringify(toSave));
    }

    restoreState() {
        try {
            const saved = localStorage.getItem('forge_state');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.state.currentStep = parsed.currentStep || 1;
                this.state.contentExtracted = parsed.contentExtracted || false;
                this.currentFile = parsed.currentFile;
                if (parsed.contentTypes) this.state.contentTypes = parsed.contentTypes;

                // Apply saved settings to UI
                setTimeout(async () => {
                    const p = document.getElementById('forgeProvider');
                    const m = document.getElementById('forgeModelSelect');
                    const a = document.getElementById('forgeApiKey');
                    if (p && parsed.provider) p.value = parsed.provider;
                    if (a && parsed.apiKey) a.value = parsed.apiKey;
                    if (p) this.setupProviderToggle();

                    if (this.gameCombo && parsed.game) this.gameCombo.setValue(parsed.game);
                    if (this.sourceCombo && parsed.source) this.sourceCombo.setValue(parsed.source);

                    // If restored to Gemini provider with an API key, fetch models
                    if (parsed.provider === 'gemini' && parsed.apiKey) {
                        try {
                            const response = await fetch(`/api/llm/gemini-models?apiKey=${parsed.apiKey}`);
                            const data = await response.json();
                            if (data.models && data.models.length > 0 && m) {
                                m.innerHTML = data.models.map(model => {
                                    const name = model.name;
                                    const disp = model.displayName || name;
                                    return `<option value="${name}">${disp}</option>`;
                                }).join('');
                                console.log('[Forge] Restored', data.models.length, 'Gemini models from state');

                                // Restore model selection after populating
                                setTimeout(() => {
                                    if (m && parsed.model) m.value = parsed.model;
                                }, 100);
                            }
                        } catch (e) {
                            console.warn('[Forge] Failed to fetch Gemini models on restore:', e);
                        }
                    } else {
                        // Restore model for local provider
                        setTimeout(() => {
                            if (m && parsed.model) m.value = parsed.model;
                        }, 500);
                    }
                }, 100);
            }
        } catch (e) {
            console.warn('Failed to restore state:', e);
        }
    }

    clearState() {
        if (confirm('Start a new session? Current progress will be lost.')) {
            localStorage.removeItem('forge_state');
            location.reload();
        }
    }

    async initComboboxes() {
        // Fetch available options from database
        let games = ['ShadowDark', 'D&D 5e', 'Knave', 'Cairn', 'Mork Borg', 'OSE', 'DCC'];
        let sources = ['Core Rulebook'];

        try {
            const data = await ForgeAPI.getMetadata();
            if (data.games && data.games.length > 0) games = data.games;
            if (data.sources && data.sources.length > 0) sources = data.sources;
        } catch (e) {
            console.warn('Could not fetch metadata from database:', e);
        }

        // Game Combobox
        this.gameCombo = new Combobox('comboGame', games);

        // Source Combobox
        this.sourceCombo = new Combobox('comboSource', sources);

        // Restore game/source from pending state
        if (this._pendingState) {
            if (this._pendingState.game) this.gameCombo.setValue(this._pendingState.game);
            if (this._pendingState.source) this.sourceCombo.setValue(this._pendingState.source);
            delete this._pendingState;
        }

        // Bind Game change to update Sources
        this.gameCombo.onChange(async (game) => {
            if (!game) return;
            try {
                const data = await ForgeAPI.getSources(game);
                if (data.sources) {
                    // Prepend "Core Rulebook" if likely relevant
                    const sources = data.sources.includes('Core') ? data.sources : ['Core Rulebook', ...data.sources];
                    this.sourceCombo.setOptions(sources);
                }
            } catch (e) {
                console.warn('Failed to update sources:', e);
            }
        });
    }

    initContentTypeButtons() {
        const container = document.getElementById('forgeContentTypes');
        if (!container) return;

        const buttons = container.querySelectorAll('.forge-type-btn');

        // Set initial state (monster selected by default)
        buttons.forEach(btn => {
            const type = btn.dataset.type;
            if (this.state.contentTypes.includes(type)) {
                btn.classList.add('bg-purple-600', 'text-white', 'border-purple-500');
                btn.classList.remove('text-gray-400', 'border-slate-600');
            }

            btn.addEventListener('click', () => {
                this.toggleContentType(type, btn);
            });
        });
    }

    toggleContentType(type, btn) {
        const idx = this.state.contentTypes.indexOf(type);
        if (idx >= 0) {
            // Already selected - remove it (unless it's the last one)
            if (this.state.contentTypes.length > 1) {
                this.state.contentTypes.splice(idx, 1);
                btn.classList.remove('bg-purple-600', 'text-white', 'border-purple-500');
                btn.classList.add('text-gray-400', 'border-slate-600');
            }
        } else {
            // Not selected - add it
            this.state.contentTypes.push(type);
            btn.classList.add('bg-purple-600', 'text-white', 'border-purple-500');
            btn.classList.remove('text-gray-400', 'border-slate-600');
        }
        console.log('Selected content types:', this.state.contentTypes);
    }

    initUI() {
        // Origin Segmented Control
        const segments = document.querySelectorAll('.forge-segment-btn');
        segments.forEach(btn => {
            btn.addEventListener('click', () => {
                segments.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.state.origin = btn.dataset.value;
            });
        });
        // Select first by default
        if (segments[0]) segments[0].classList.add('selected');

        // Drag & Drop
        this.setupDragDrop();

        // Process Button
        const btn = document.getElementById('forgeProcessBtn');
        if (btn) btn.addEventListener('click', () => this.handleProcess());

        // Save Button
        const saveBtn = document.getElementById('forgeSaveBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.handleSave());

        // Editor Live Preview
        const editor = document.getElementById('forgeEditor');
        if (editor) {
            let debounce;
            editor.addEventListener('input', () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => this.updatePreview(editor.value), 500);
            });
        }

        // Load Path Button (Upload/Load)
        const loadBtn = document.getElementById('forgeLoadBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.handleLoadPath());
        }

        // Browse Button
        const browseBtn = document.getElementById('forgeBrowseBtn'); // Optional if onclick is used
        if (browseBtn) {
            browseBtn.addEventListener('click', () => {
                document.getElementById('forgeFileInput')?.click();
            });
        }

        // File Input Change
        const fileInput = document.getElementById('forgeFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) this.handleLoadPath(e.target.files[0]);
            });
        }

        // Remove File Button
        const removeBtn = document.getElementById('forgeRemoveBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this.clearFile());
        }

        // Extract Button
        const extractBtn = document.getElementById('forgeExtractBtn');
        if (extractBtn) extractBtn.addEventListener('click', () => this.handleExtract());

        // Step 5 Filter Listeners
        const cardSearch = document.getElementById('forgeCardSearch');
        if (cardSearch) {
            cardSearch.addEventListener('input', (e) => {
                this.cardFilters.search = e.target.value.toLowerCase();
                this.renderCardList();
            });
        }


        // Char count on raw text
        const rawText = document.getElementById('forgeRawText');
        if (rawText) {
            rawText.addEventListener('input', () => {
                const count = document.getElementById('charCount');
                if (count) count.textContent = `${rawText.value.length} chars`;
            });
        }

        // Generate Cards Button
        const genCardsBtn = document.getElementById('forgeGenerateCardsBtn');
        if (genCardsBtn) {
            genCardsBtn.addEventListener('click', () => this.handleGenerateCards());
        }

        // Scribe Mode Toggle
        const scribeToggle = document.getElementById('forgeUseScribe');
        const modeLabel = document.getElementById('forgeModeLabel');
        if (scribeToggle && modeLabel) {
            scribeToggle.addEventListener('change', () => {
                if (scribeToggle.checked) {
                    modeLabel.textContent = 'SCRIBE (Python)';
                    modeLabel.classList.remove('text-yellow-400');
                    modeLabel.classList.add('text-green-400');
                } else {
                    modeLabel.textContent = 'BATCH LLM';
                    modeLabel.classList.remove('text-green-400');
                    modeLabel.classList.add('text-yellow-400');
                }
            });
        }
    }

    setupDragDrop() {
        const zone = document.getElementById('forgeDropZone');
        if (!zone) return;

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('border-primary', 'bg-primary/10');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('border-primary', 'bg-primary/10');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('border-primary', 'bg-primary/10');
            if (e.dataTransfer.files[0]) {
                this.handleLoadPath(e.dataTransfer.files[0]);
            }
        });

        zone.addEventListener('click', () => {
            document.getElementById('forgeFileInput')?.click();
        });
    }

    initWizardNav() {
        const prevBtn = document.getElementById('forgePrevBtn');
        const nextBtn = document.getElementById('forgeNextBtn');

        if (prevBtn) prevBtn.addEventListener('click', () => this.goToStep(this.state.currentStep - 1));
        if (nextBtn) nextBtn.addEventListener('click', () => this.goToStep(this.state.currentStep + 1));

        // Clickable Steps (Skip functionality)
        const indicators = document.querySelectorAll('.forge-step-indicator');
        indicators.forEach(el => {
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                const step = parseInt(el.dataset.step);
                if (step) this.goToStep(step, true); // Force navigation
            });
        });

        this.updateWizardUI();
    }

    goToStep(step, force = false) {
        if (step < 1 || step > this.state.totalSteps) return;

        // If a task is running, don't allow moving forward unless forced or finished
        if (this.currentTaskId && step > this.state.currentStep && !force) {
            if (!confirm('A process is running. Moving away might hide progress. Continue?')) return;
        }

        // Validation (skipped if force is true)
        if (!force && step > this.state.currentStep) {
            if (!this.validateStep(this.state.currentStep)) return;
        }

        // Auto-Process when entering Step 5 (YAML -> Cards)
        if (step === 5) {
            try {
                this.processCardsFromYaml();
            } catch (e) {
                // If forcing, we might warn but proceed, or block. 
                // Blocking is safer as Step 5 is empty otherwise.
                alert('YAML Error: ' + e.message);
                return;
            }
        }

        this.state.currentStep = step;
        this.saveState(); // PERSIST
        this.updateWizardUI();
    }

    validateStep(step) {
        switch (step) {
            case 1: // Load - must have text extracted
                if (!this.state.contentExtracted) {
                    alert('Please load and extract content first');
                    return false;
                }
                return true;
            case 2: // Extract - text must exist
                return this.state.text && this.state.text.length > 0;
            case 3: // Configure - game must be selected
                return true; // Allow moving forward
            case 4: // YAML - must have generated YAML
                const editor = document.getElementById('forgeEditor');
                if (!editor || !editor.value.trim()) {
                    alert('Please generate YAML first');
                    return false;
                }
                return true;
            default:
                return true;
        }
    }

    updateWizardUI() {
        const step = this.state.currentStep;

        // Update step panels visibility
        for (let i = 1; i <= this.state.totalSteps; i++) {
            const panel = document.getElementById(`forgeStep${i}`);
            if (panel) {
                panel.classList.toggle('hidden', i !== step);
            }
        }

        // Restore File UI if currentFile exists
        if (this.currentFile) {
            const fileNameEl = document.getElementById('forgeFileName');
            const fileSection = document.getElementById('forgeActiveFileSection');
            const inputSection = document.getElementById('forgeInputSection');
            const check = document.getElementById('forgeCheckMark');
            const meta = document.getElementById('forgeFileMeta');

            if (fileNameEl) fileNameEl.textContent = this.currentFile.name || (typeof this.currentFile === 'string' ? this.currentFile : 'Loaded File');
            if (fileSection) fileSection.classList.remove('hidden');
            if (inputSection) inputSection.classList.add('hidden');
            if (check && this.state.contentExtracted) check.classList.remove('hidden');
            if (meta && this.state.contentExtracted) meta.textContent = "Extraction Complete";
        }

        // Show/Hide Steps 1-4 vs Step 5
        const steps1to4Container = document.getElementById('forgeSteps1to4Container');
        if (steps1to4Container) {
            steps1to4Container.classList.toggle('hidden', step === 5);
        }

        // Navigation Buttons Labels
        const prevBtn = document.getElementById('forgePrevBtn');
        const nextBtn = document.getElementById('forgeNextBtn');

        if (prevBtn) {
            prevBtn.disabled = step === 1;
        }
        if (nextBtn) {
            nextBtn.classList.toggle('hidden', step === 5); // Hide Next on final step
        }

        // Update step indicators
        document.querySelectorAll('.forge-step-indicator').forEach(ind => {
            const s = parseInt(ind.dataset.step);
            ind.classList.remove('active', 'completed');
            if (s === step) ind.classList.add('active');
            else if (s < step) ind.classList.add('completed');
        });

        // Update nav buttons
        if (prevBtn) prevBtn.disabled = step === 1;
        if (nextBtn) {
            if (step === this.state.totalSteps) {
                nextBtn.classList.add('hidden');
            } else {
                nextBtn.classList.remove('hidden');

                // Specific validation for Step 1
                if (step === 1) {
                    const isReady = this.state.contentExtracted === true;
                    nextBtn.disabled = !isReady;
                    nextBtn.classList.toggle('opacity-50', !isReady);
                    nextBtn.classList.toggle('cursor-not-allowed', !isReady);
                } else {
                    nextBtn.disabled = false;
                    nextBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        }
    }

    setupProviderToggle() {
        const providerSelect = document.getElementById('forgeProvider');
        const modelContainer = document.getElementById('forgeModelContainer');
        const apiKeyInput = document.getElementById('forgeApiKey');
        const modelSelect = document.getElementById('forgeModelSelect');

        if (!providerSelect) return;

        const updateVisibility = async () => {
            const isGemini = providerSelect.value === 'gemini';

            // Show/hide based on provider
            if (modelContainer) modelContainer.classList.toggle('hidden', false); // Always show
            if (apiKeyInput) apiKeyInput.classList.toggle('hidden', !isGemini);

            // Populate models
            if (isGemini) {
                // Default options if no key yet
                if (modelSelect.options.length === 0 || !modelSelect.innerHTML.includes('gemini')) {
                    modelSelect.innerHTML = `
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Preview) ⚡</option>
                        <option value="gemini-1.5-flash">Gemini 1.5 Flash (Fast)</option>
                        <option value="gemini-1.5-pro">Gemini 1.5 Pro (Best Quality)</option>
                    `;
                }

                // If we have a key, try to fetch real models
                if (apiKeyInput.value.trim()) {
                    fetchGeminiModels(apiKeyInput.value.trim());
                }

            } else {
                // Fetch local Ollama models
                try {
                    const data = await ForgeAPI.getModels();
                    if (data.models && data.models.length > 0) {
                        modelSelect.innerHTML = data.models.map(m => {
                            const name = typeof m === 'string' ? m : m.name;
                            const size = m.size ? ` (${m.size})` : '';
                            return `<option value="${name}">${name}${size}</option>`;
                        }).join('');
                    }
                } catch (e) {
                    console.warn('Failed to fetch models:', e);
                }
            }
        };

        const fetchGeminiModels = async (key) => {
            try {
                const response = await fetch(`/api/llm/gemini-models?apiKey=${key}`);
                const data = await response.json();
                if (data.models && data.models.length > 0) {
                    modelSelect.innerHTML = data.models.map(m => {
                        const name = m.name;
                        const disp = m.displayName || name;
                        return `<option value="${name}">${disp}</option>`;
                    }).join('');
                    // Restore selection if possible
                    // (Optional logic)
                }
            } catch (e) {
                console.error("Error fetching Gemini models", e);
            }
        };

        apiKeyInput.addEventListener('change', (e) => {
            if (providerSelect.value === 'gemini' && e.target.value.trim()) {
                fetchGeminiModels(e.target.value.trim());
            }
        });
        providerSelect.addEventListener('change', updateVisibility);
        updateVisibility(); // Initial call
    }

    async handleLoadPath(fileOrEvent) {
        if (fileOrEvent instanceof Event) {
            fileOrEvent.preventDefault();
        }
        console.log("handleLoadPath triggered", fileOrEvent);
        let filePath = '';
        let fileObj = null;

        // Check if passed a File object directly (from upload)
        if (fileOrEvent instanceof File) {
            fileObj = fileOrEvent;
            filePath = fileObj.name;
        } else {
            // Get from input
            const input = document.getElementById('forgeLocalPath');
            if (input) filePath = input.value.trim();
        }

        if (!filePath && !fileObj) {
            // Trigger browse if nothing entered
            console.log("No path or file, triggering browse");
            document.getElementById('forgeFileInput')?.click();
            return;
        }

        try {
            // Updated: Actually verify the file or at least prepare for extraction
            // 1. Switch Views
            const inputSec = document.getElementById('forgeInputSection');
            const activeSec = document.getElementById('forgeActiveFileSection');
            if (inputSec) inputSec.classList.add('hidden');
            if (activeSec) activeSec.classList.remove('hidden');

            // 2. Update File Info
            const nameDisplay = document.getElementById('forgeFileName');
            if (nameDisplay) nameDisplay.textContent = filePath;

            // 3. Reset State for new file
            const check = document.getElementById('forgeCheckMark');
            if (check) check.classList.add('hidden');
            const successText = document.getElementById('forgeExtractSuccess');
            if (successText) successText.classList.add('hidden');
            const meta = document.getElementById('forgeFileMeta');
            if (meta) meta.textContent = "Validating...";

            // 4. Progress Animation
            const loadProgress = document.getElementById('forgeLoadProgress');
            if (loadProgress) {
                loadProgress.style.width = '0%';
                void loadProgress.offsetWidth;
                loadProgress.style.width = '100%';
            }

            // 5. Ready State (Wait for animation)
            setTimeout(() => {
                if (meta) meta.textContent = "Ready to extract";
                // Enable Extract Button
                const extBtn = document.getElementById('forgeExtractBtn');
                if (extBtn) {
                    extBtn.disabled = false;
                    extBtn.classList.remove('opacity-50');
                }
            }, 600);

            this.currentFile = fileObj || filePath;
            this.state.contentExtracted = false;

        } catch (e) {
            console.error("handleLoadPath Error:", e);
            alert("Error loading file: " + e.message);
        }
    }

    async handleExtract() {
        const btn = document.getElementById('forgeExtractBtn');
        const status = document.getElementById('forgeExtractStatus');
        const success = document.getElementById('forgeExtractSuccess');

        if (!this.currentFile) return;

        // OPEN DEBUG LOG so user sees Docling progress
        const logContainer = document.getElementById('forgeDebugLogContainer');
        if (logContainer && logContainer.classList.contains('hidden')) {
            this.toggleDebugLog();
        }

        // TASK ID & CONTROLS
        this.currentTaskId = 'extract_' + Date.now();
        const controls = document.getElementById('forgeProcessControls');
        if (controls) controls.classList.remove('hidden');

        // UI State: Extracting
        if (btn) btn.disabled = true;
        if (status) status.classList.remove('hidden');
        if (success) success.classList.add('hidden');

        try {
            // Check if it's a File object (upload) or string (path)
            let data;
            if (this.currentFile instanceof File) {
                const fd = new FormData();
                fd.append('file', this.currentFile);
                fd.append('taskId', this.currentTaskId);
                data = await ForgeAPI.upload(fd);
            } else {
                data = await ForgeAPI.loadPath(this.currentFile, this.currentTaskId);
            }

            if (data.error) throw new Error(data.error);

            if (data.text) {
                this.state.text = data.text;
                this.state.contentExtracted = true;

                const editor = document.getElementById('forgeEditor');
                if (editor) editor.value = data.text;

                const rawText = document.getElementById('forgeRawText');
                if (rawText) rawText.value = data.text;

                const count = document.getElementById('charCount');
                if (count) count.textContent = `${data.text.length} chars`;

                if (status) status.classList.add('hidden');
                if (success) success.classList.remove('hidden');

                const check = document.getElementById('forgeCheckMark');
                if (check) check.classList.remove('hidden');

                const meta = document.getElementById('forgeFileMeta');
                if (meta) meta.textContent = "Extraction Complete";

                this.analyzeText(data.text);

                // AUTO-ADVANCE: Move to Step 2 (Review) so user doesn't wonder what's next
                setTimeout(() => this.goToStep(2), 500);
            }

        } catch (e) {
            console.error('Extraction failed:', e);
            alert('Extraction failed: ' + e.message);

            const meta = document.getElementById('forgeFileMeta');
            if (meta) meta.textContent = "Extraction Error";

            if (btn) btn.disabled = false;
            if (status) status.classList.add('hidden');
            this.currentTaskId = null;
            if (controls) controls.classList.add('hidden');
        }
    }
    async handleStop() {
        if (!this.currentTaskId) return;
        this.addLog('Stopping current process...', 'warn');
        try {
            await fetch('/api/forge/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: this.currentTaskId })
            });
            this.currentTaskId = null;
            this.addLog('Process cancellation requested.', 'info');
        } catch (e) {
            console.error('Stop failed:', e);
            this.addLog('Failed to stop process: ' + e.message, 'error');
        }
    }

    handleRestart() {
        if (this.state.currentStep === 1) this.handleExtract();
        else if (this.state.currentStep === 4) this.handleProcess();
        else {
            if (confirm('Restart whole session?')) {
                this.clearState();
            }
        }
    }


    clearFile() {
        this.state.text = '';
        this.state.contentExtracted = false;
        this.currentFile = null;

        document.getElementById('forgeRawText').value = '';
        const pathInput = document.getElementById('forgeLocalPath');
        if (pathInput) pathInput.value = '';

        // Reset Inputs
        const inputSec = document.getElementById('forgeInputSection');
        const activeSec = document.getElementById('forgeActiveFileSection');

        if (inputSec) inputSec.classList.remove('hidden');
        if (activeSec) activeSec.classList.add('hidden');

        // Reset Status Elements
        const loadProgress = document.getElementById('forgeLoadProgress');
        if (loadProgress) loadProgress.style.width = '0%';

        document.getElementById('forgeCheckMark')?.classList.add('hidden');
        document.getElementById('forgeExtractStatus')?.classList.add('hidden');
        document.getElementById('forgeExtractSuccess')?.classList.add('hidden');

        // Disable Extract Button
        const extBtn = document.getElementById('forgeExtractBtn');
        if (extBtn) extBtn.disabled = true;

        this.updateWizardUI();
    }

    async loadUserConfig() {
        // Attempt to load API key
        const userJson = localStorage.getItem('ttrpg_user');
        const user = userJson ? JSON.parse(userJson).username : null;

        if (user) {
            try {
                const data = await ForgeAPI.getSecrets(user);
                if (data.secrets?.geminiApiKey) {
                    const input = document.getElementById('forgeApiKey');
                    const providerSelect = document.getElementById('forgeProvider');
                    const modelSelect = document.getElementById('forgeModelSelect');

                    if (input) {
                        input.value = data.secrets.geminiApiKey;

                        // If provider is set to Gemini, fetch Gemini models directly
                        // Don't rely on change event since provider might not be set yet
                        if (providerSelect?.value === 'gemini') {
                            try {
                                const response = await fetch(`/api/llm/gemini-models?apiKey=${data.secrets.geminiApiKey}`);
                                const modelData = await response.json();
                                if (modelData.models && modelData.models.length > 0 && modelSelect) {
                                    modelSelect.innerHTML = modelData.models.map(m => {
                                        const name = m.name;
                                        const disp = m.displayName || name;
                                        return `<option value="${name}">${disp}</option>`;
                                    }).join('');
                                    console.log('[Forge] Loaded', modelData.models.length, 'Gemini models');
                                }
                            } catch (e) {
                                console.warn('[Forge] Failed to fetch Gemini models:', e);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[Forge] Failed to load user secrets:', e);
            }
        }

        // Fetch Local Models only if provider is local
        const provider = document.getElementById('forgeProvider');
        if (!provider || provider.value !== 'gemini') {
            try {
                const data = await ForgeAPI.getModels();
                const select = document.getElementById('forgeModelSelect');
                if (data.models && select) {
                    select.innerHTML = data.models.map(m =>
                        `<option value="${m.name}">${m.name} (${m.size || ''})</option>`
                    ).join('');
                }
            } catch (e) { }
        }
    }

    async analyzeText(text) {
        // Skip analysis if "AI Suggest" unchecked
        const auto = document.getElementById('forgeAutoDetect');
        if (auto && !auto.checked) return;

        try {
            const provider = document.getElementById('forgeProvider')?.value || 'local';
            const apiKey = document.getElementById('forgeApiKey')?.value || '';
            const model = document.getElementById('forgeModelSelect')?.value || '';

            const data = await ForgeAPI.analyze(text.substring(0, 2000), provider, apiKey, model, this.currentTaskId);

            if (data.analysis) {
                this.handleAnalysisResults(data.analysis);
            }
        } catch (e) {
            console.error("Analysis failed:", e);
        }
    }

    handleAnalysisResults(analysis) {
        // Automatically apply without modal
        this.applyAnalysis(analysis);

        // Show status toast instead
        const status = document.getElementById('forgeFileStatus');
        if (status) {
            status.classList.remove('hidden');
            const analysisInfo = ` <span class="text-purple-400 ml-2 border-l border-gray-600 pl-2 text-xs">Detected: ${analysis.game || '?'} / ${analysis.source || '?'}</span>`;
            if (!status.innerHTML.includes('Detected:')) {
                status.innerHTML += analysisInfo;
            }
        }
    }

    applyAnalysis(analysis) {
        if (analysis.game) this.gameCombo.setValue(analysis.game);
        if (analysis.source) this.sourceCombo.setValue(analysis.source);

        if (analysis.contentType) {
            const map = { 'monster': 'monster', 'spell': 'spell', 'item': 'item', 'table': 'table' };
            const found = Object.keys(map).find(k => analysis.contentType.toLowerCase().includes(k));
            if (found && !this.state.contentTypes.includes(found)) {
                // Add the detected type to selection
                const btn = document.querySelector(`.forge-type-btn[data-type="${found}"]`);
                if (btn) this.toggleContentType(found, btn);
            }
        }
    }

    async handleProcess() {
        const text = document.getElementById('forgeRawText').value;
        if (!text) return alert("Please enter or upload text first.");

        const types = this.state.contentTypes;
        if (types.length === 0) return alert("Please select at least one content type.");

        const btn = document.getElementById('forgeProcessBtn');
        const controls = document.getElementById('forgeProcessControls');
        const originalBtnHtml = btn.innerHTML;
        btn.disabled = true;

        // Check which extraction mode is selected
        const useScribe = document.getElementById('forgeUseScribe')?.checked ?? true;
        const game = this.gameCombo.getValue() || 'ShadowDark';
        const source = this.sourceCombo.getValue() || 'Core';

        // OPEN DEBUG LOG if it's hidden, so user sees what's happening
        const logContainer = document.getElementById('forgeDebugLogContainer');
        if (logContainer && logContainer.classList.contains('hidden')) {
            this.toggleDebugLog();
        }

        // Clear editor initially
        const editor = document.getElementById('forgeEditor');
        editor.value = '';
        this.updatePreview('');

        this.currentTaskId = 'process_' + Date.now();
        if (controls) controls.classList.remove('hidden');

        const modeName = useScribe ? 'Scribe (Python)' : 'Batch LLM';
        console.log(`[Forge] Starting ${modeName} extraction for ${types.length} types:`, types);
        this.addLog(`Using ${modeName} extraction engine...`, 'info');

        // Store extracted cards for Scribe mode
        this.extractedCards = [];

        try {
            for (let i = 0; i < types.length; i++) {
                const type = types[i];
                const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
                btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-purple-400">sync</span> <span class="text-white">Processing ${typeLabel}s (${i + 1}/${types.length})...</span>`;
                console.log(`[Forge] Processing type ${i + 1}/${types.length}: ${type}`);
                this.addLog(`Starting extraction for ${type}...`, 'info');

                try {
                    if (useScribe) {
                        // ===== SCRIBE MODE: Python Pipeline =====
                        const apiKey = document.getElementById('forgeApiKey')?.value || '';
                        const model = document.getElementById('forgeModelSelect')?.value || '';

                        const data = await ForgeAPI.extractScribe(
                            text,
                            type,
                            game,
                            source,
                            this.currentTaskId,
                            apiKey,
                            model
                        );
                        console.log(`[Forge/Scribe] Received response for ${type}:`, data);

                        if (data.cards && data.cards.length > 0) {
                            this.extractedCards.push(...data.cards);
                            // Convert cards to YAML for the editor
                            const yamlContent = jsyaml.dump(data.cards, { lineWidth: -1 });
                            const currentVal = editor.value.trim();
                            editor.value = currentVal ? currentVal + '\n\n' + yamlContent : yamlContent;
                            this.updatePreview(editor.value);
                            this.addLog(`Extracted ${data.cards.length} ${type}(s) via Scribe`, 'success');
                        } else if (data.error) {
                            this.addLog(`Scribe error for ${type}: ${data.error}`, 'error');
                        } else {
                            this.addLog(`No ${type}s found in source text`, 'warn');
                        }
                    } else {
                        // ===== BATCH LLM MODE: Original Flow =====
                        const payload = {
                            text,
                            game,
                            source,
                            type,
                            provider: document.getElementById('forgeProvider')?.value || 'local',
                            apiKey: document.getElementById('forgeApiKey')?.value || '',
                            model: document.getElementById('forgeModelSelect')?.value || '',
                            taskId: this.currentTaskId
                        };

                        const data = await ForgeAPI.process(payload);
                        console.log(`[Forge/Batch] Received response for ${type}:`, data);

                        const yamlContent = data.yaml?.trim() || '';
                        const isEmptyResult = !yamlContent || yamlContent === '[]' || yamlContent === '[ ]';

                        if (yamlContent && !isEmptyResult) {
                            const currentVal = editor.value.trim();
                            editor.value = currentVal ? currentVal + '\n\n' + yamlContent : yamlContent;
                            this.updatePreview(editor.value);
                            this.addLog(`Generated YAML for ${type}`, 'success');
                        } else if (data.error) {
                            this.addLog(`Error for ${type}: ${data.error}`, 'error');
                        } else {
                            this.addLog(`No ${type}s found in source`, 'warn');
                        }
                    }
                } catch (err) {
                    console.error(`[Forge] Error processing ${type}:`, err);
                    this.addLog(`Error processing ${type}: ${err.message}`, 'error');

                    if (err.message.includes('timeout') || err.message.includes('Network Error')) {
                        alert(`Network Timeout during ${type} extraction. Check the Debug Log.`);
                    } else {
                        alert(`Failed to extract ${type}: ${err.message}`);
                    }
                    throw err;
                }
            }

            // Success
            this.state.contentExtracted = true;
            this.saveState();

            btn.innerHTML = `<span class="material-symbols-outlined">check_circle</span> SUCCESS - GO TO CARDS`;
            btn.classList.add('bg-green-600');
            this.addLog(`All ${types.length} content type(s) processed successfully!`, 'success');

            this.updateWizardUI();

        } catch (e) {
            console.error('Process failed:', e);
            btn.innerHTML = originalBtnHtml;
            btn.classList.remove('bg-green-600');
        } finally {
            btn.disabled = false;
            this.currentTaskId = null;
            if (controls) controls.classList.add('hidden');
            if (!this.state.contentExtracted) {
                btn.innerHTML = originalBtnHtml;
            }
        }
        console.log('[Forge] Extraction complete');
    }

    handleGenerateCards() {
        this.goToStep(5);
    }

    processCardsFromYaml() {
        const editor = document.getElementById('forgeEditor');
        if (!editor || !editor.value.trim()) throw new Error("No YAML content found");

        const yaml = editor.value;
        // Basic lenient parsing
        const parsed = jsyaml.load(yaml);

        // Normalize to array
        let content = [];
        if (Array.isArray(parsed)) content = parsed;
        else if (parsed && typeof parsed === 'object') content = [parsed];

        // Assign IDs if missing
        content.forEach(item => {
            if (!item.id) item.id = 'gen-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        });

        this.state.parsed = content;

        // Init filters based on content
        this.initCardFilters();

        // Render List
        this.renderCardList();
    }

    initCardFilters() {
        const content = this.state.parsed || [];

        // Reset filters logic
        this.cardFilters.game = {};
        this.cardFilters.type = {};

        // Populate available options
        const games = new Set();
        const types = new Set();
        const sources = new Set();

        content.forEach(item => {
            if (item.game) games.add(item.game);
            if (item.type) types.add(item.type);
            if (item.source) sources.add(item.source);
        });

        // Render Filter Buttons
        const renderFilterGroup = (containerId, items, filterKey) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';

            items.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'px-2 py-1 text-xs rounded border border-slate-600 text-gray-400 hover:text-white hover:bg-slate-700 transition-colors';
                btn.textContent = item;
                btn.onclick = () => {
                    // Toggle
                    this.cardFilters[filterKey][item] = !this.cardFilters[filterKey][item];
                    btn.classList.toggle('bg-primary/20', this.cardFilters[filterKey][item]);
                    btn.classList.toggle('text-primary', this.cardFilters[filterKey][item]);
                    btn.classList.toggle('border-primary/50', this.cardFilters[filterKey][item]);
                    this.renderCardList();
                };
                container.appendChild(btn);
            });
        };

        renderFilterGroup('forgeGameFilter', Array.from(games), 'game');
        renderFilterGroup('forgeTypeFilter', Array.from(types), 'type');
        renderFilterGroup('forgeSourceFilter', Array.from(sources).sort(), 'source');

        // Render Sort Controls
        this.renderSortControls();
    }

    renderSortControls() {
        const container = document.getElementById('forgeSortContainer');
        if (!container) return;

        // Build options based on types present
        let options = '<option value="name">Name</option>';
        const hasMonster = Object.keys(this.cardFilters.type).some(t => t === 'Monster');
        const hasSpell = Object.keys(this.cardFilters.type).some(t => t === 'Spell');

        if (hasMonster || this.state.parsed?.some(i => i.type === 'Monster')) {
            options += '<option value="level">Level</option>';
            options += '<option value="ac">AC</option>';
            options += '<option value="hp">HP</option>';
        }
        if (hasSpell || this.state.parsed?.some(i => i.type === 'Spell')) {
            options += '<option value="tier">Tier</option>';
        }

        container.innerHTML = `
            <select id="forgeSortField" onchange="window.ForgeApp.updateSort(this.value)"
                class="bg-slate-800 border border-slate-700 rounded py-1 px-2 text-xs text-gray-300">
                ${options}
            </select>
            <button onclick="window.ForgeApp.toggleSortDirection()" 
                class="p-1 rounded hover:bg-slate-700 transition-colors" title="Toggle Sort Direction">
                <span class="material-symbols-outlined text-sm">${this.cardSort.direction === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
            </button>
        `;

        const select = container.querySelector('#forgeSortField');
        if (select) select.value = this.cardSort.field;
    }

    updateSort(field) {
        this.cardSort.field = field;
        this.renderCardList();
    }

    toggleSortDirection() {
        this.cardSort.direction = this.cardSort.direction === 'asc' ? 'desc' : 'asc';
        this.renderSortControls();
        this.renderCardList();
    }

    resetCardFilters() {
        this.cardFilters = { search: '', game: {}, type: {}, source: {} };
        this.cardSort = { field: 'name', direction: 'asc' };
        const searchInput = document.getElementById('forgeCardSearch');
        if (searchInput) searchInput.value = '';
        this.initCardFilters(); // Re-render buttons cleared
        this.renderCardList();
    }

    renderCardList() {
        const container = document.getElementById('forgeGeneratedList');
        if (!container) return;

        container.innerHTML = '';

        const content = this.state.parsed || [];

        // Filter
        const filtered = content.filter(item => {
            // Search
            if (this.cardFilters.search) {
                const term = this.cardFilters.search;
                const inName = item.name?.toLowerCase().includes(term);
                const inDesc = item.description?.toLowerCase().includes(term);
                if (!inName && !inDesc) return false;
            }

            // Game (if any selected, must match one)
            const selectedGames = Object.keys(this.cardFilters.game).filter(k => this.cardFilters.game[k]);
            if (selectedGames.length > 0 && !selectedGames.includes(item.game)) return false;

            // Type
            const selectedTypes = Object.keys(this.cardFilters.type).filter(k => this.cardFilters.type[k]);
            if (selectedTypes.length > 0 && !selectedTypes.includes(item.type)) return false;

            // Source
            const selectedSources = Object.keys(this.cardFilters.source).filter(k => this.cardFilters.source[k]);
            if (selectedSources.length > 0 && !selectedSources.includes(item.source)) return false;

            return true;
        });

        // Sort
        const sortField = this.cardSort.field;
        const sortDir = this.cardSort.direction === 'asc' ? 1 : -1;

        filtered.sort((a, b) => {
            let aVal, bVal;
            if (sortField === 'name') {
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
            } else {
                // Numeric property
                aVal = parseInt(a.properties?.[sortField]) || 0;
                bVal = parseInt(b.properties?.[sortField]) || 0;
            }
            if (aVal < bVal) return -1 * sortDir;
            if (aVal > bVal) return 1 * sortDir;
            return 0;
        });

        // Update Header
        const header = document.getElementById('forgeListHeader');
        if (header) header.textContent = `Generated Content (${filtered.length})`;

        if (filtered.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-500 p-8">No content matches filters.</div>`;
            return;
        }

        filtered.forEach(item => {
            const row = document.createElement('div');
            row.className = "mb-2 bg-slate-800 border border-slate-700 rounded-lg overflow-hidden transition-all hover:border-primary/50 cursor-pointer group";

            // Use global getCardSummaryHtml if available
            let summaryHtml = '';
            if (typeof window.getCardSummaryHtml === 'function') {
                summaryHtml = window.getCardSummaryHtml(item);
            } else {
                // Fallback
                const p = item.properties || {};
                summaryHtml = `<span class="text-xs text-gray-500 ml-2">${p.level ? 'LV ' + p.level : ''} ${p.ac ? 'AC ' + p.ac : ''}</span>`;
            }

            row.innerHTML = `
                <div class="p-3 flex items-center justify-between" onclick="this.parentElement.querySelector('.details').classList.toggle('hidden');">
                    <div class="flex items-center gap-3 flex-wrap">
                        <span class="font-semibold text-sm text-gray-200">${item.name}</span>
                        <div class="flex items-center">${summaryHtml}</div>
                    </div>
                    <span class="material-symbols-outlined text-gray-500">expand_more</span>
                </div>
                <div class="details hidden border-t border-slate-700 bg-slate-900/30 p-4" onclick="event.stopPropagation()">
                    <!-- Card Render Target -->
                </div>
            `;

            // Render Card Body
            const details = row.querySelector('.details');
            if (typeof window.renderContentCard === 'function') {
                window.renderContentCard(item, details, { isEmbedded: true });
            } else {
                details.textContent = "Global renderContentCard not found.";
            }

            container.appendChild(row);
        });
    }

    async saveAllCards() {
        const content = this.state.parsed || [];
        if (content.length === 0) return;

        // Group by Game & Content Type for efficiency
        // (Assuming most imports are processing one type at a time, but handling mixed is safer)
        const batches = {};
        content.forEach(item => {
            const key = `${item.game}|${item.type}`;
            if (!batches[key]) batches[key] = [];
            batches[key].push(item);
        });

        let successCount = 0;
        let failCount = 0;

        // Process batches
        // We use a simple loop to await each save
        for (const key of Object.keys(batches)) {
            const [game, type] = key.split('|');
            const items = batches[key];

            try {
                // 1. Server Persistence
                const result = await ForgeAPI.saveCards(items, game, type, this.state.origin);

                if (result && result.saved) {
                    successCount += items.length;

                    // 2. Client-Side Update (for immediate UI feedback)
                    if (window.contentData) {
                        items.forEach(item => {
                            // Avoid duplicates in memory
                            if (!window.contentData.find(i => i.id === item.id)) {
                                window.contentData.push(item);
                            }
                        });
                    }
                } else {
                    failCount += items.length;
                    console.error("Failed to save batch:", result);
                }
            } catch (e) {
                failCount += items.length;
                console.error("Error saving batch:", e);
            }
        }

        if (successCount > 0) {
            window.showToast(`${successCount} items saved to Library!`);
            if (window.saveContentData) {
                // Try to call legacy save if it exists, just in case (though we likely don't need it if API handled it)
                // Actually, saveContentData usually writes to file from memory. 
                // Since we already wrote to file via API, we DO NOT need to call it.
                // Just refreshing the UI filter might be good.
                if (typeof window.applyFilters === 'function') window.applyFilters();
            } else if (typeof window.applyFilters === 'function') {
                window.applyFilters();
            }
        }

        if (failCount > 0) {
            alert(`Failed to save ${failCount} items. Check console for details.`);
        }
    }
    updatePreview(yamlText) {
        const container = document.getElementById('forgePreview');
        if (!container) return;

        try {
            if (!window.jsyaml) throw new Error("YAML Parser not loaded");
            const doc = window.jsyaml.load(yamlText); // Can be object or array

            container.innerHTML = '';

            const items = Array.isArray(doc) ? doc : [doc];
            items.forEach(item => {
                // Normalize for card renderer
                const cardData = {
                    ...item,
                    game: item.game || this.gameCombo.getValue(),
                    source: item.source || this.sourceCombo.getValue(),
                    type: item.type || document.getElementById('forgeContentType').value
                };

                if (window.renderContentCard) {
                    window.renderContentCard(cardData, container, { previewOnly: true });
                } else {
                    container.innerHTML = `< pre > ${JSON.stringify(cardData, null, 2)}</pre > `;
                }
            });

        } catch (e) {
            // container.innerHTML = `< div class="text-red-500 text-xs" > ${ e.message }</div > `;
        }
    }

    async handleSave() {
        const content = document.getElementById('forgeEditor').value;
        const type = document.getElementById('forgeContentType').value;
        if (!content) return;

        try {
            const res = await ForgeAPI.save(content, type);
            if (res.success) alert("Saved to library!");
            else alert("Save failed.");
        } catch (e) {
            alert("Error saving: " + e.message);
        }
    }

    skipImport() {
        this.state.text = '';
        this.state.contentExtracted = true; // Allow moving forward
        this.goToStep(2);
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.ForgeApp = new ForgeController();
});
