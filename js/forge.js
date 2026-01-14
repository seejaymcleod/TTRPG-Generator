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
    async getSecrets(user) {
        const res = await fetch('/api/user/secrets', { headers: { 'x-username': user } });
        return res.json();
    },

    async getModels() {
        const res = await fetch('/api/llm/models');
        return res.json();
    },

    async getSources(game) {
        if (!game) return { sources: [] };
        const res = await fetch(`/api/forge/sources/${encodeURIComponent(game)}`);
        return res.json();
    },

    async getMetadata() {
        const res = await fetch('/api/forge/metadata');
        return res.json();
    },

    async analyze(text, provider, apiKey, model) {
        const res = await fetch('/api/forge/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, provider, apiKey, model })
        });
        return res.json();
    },

    async process(payload) {
        const res = await fetch('/api/forge/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.json();
    },

    async upload(formData) {
        const res = await fetch('/api/forge/upload', { method: 'POST', body: formData });
        return res.json();
    },

    async loadPath(filePath) {
        const res = await fetch('/api/forge/load-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
        return res.json();
    },

    async save(content, type) {
        const res = await fetch('/api/forge/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, type })
        });
        return res.json();
    },

    /**
     * Multi-modal extraction: Combines Docling text + Vision for entity extraction.
     * @param {FormData} formData - Must include: file (PDF), doclingText, type, game, source, apiKey, model
     */
    async extractMultiModal(formData) {
        const res = await fetch('/api/forge/extract-multimodal', {
            method: 'POST',
            body: formData
        });
        return res.json();
    },

    /**
     * Save verified cards to content YAML file.
     * @param {Array} cards - Array of card objects
     * @param {string} game - Game system (e.g., "ShadowDark")
     * @param {string} contentType - Content type (e.g., "Monster")
     */
    async saveCards(cards, game, contentType) {
        const res = await fetch('/api/forge/save-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cards, game, contentType })
        });
        return res.json();
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
            totalSteps: 5
        };

        // Initialize UI Components
        this.initComboboxes();
        this.cardFilters = {
            search: '',
            game: {},
            type: {}
        };

        // Define filters specifically for generated content
        this.initCardFilters = this.initCardFilters.bind(this);
        this.renderCardList = this.renderCardList.bind(this);
        this.resetCardFilters = this.resetCardFilters.bind(this);
        this.saveAllCards = this.saveAllCards.bind(this);

        this.initUI();
        this.initWizardNav();
        this.setupProviderToggle(); // Restored
        this.loadUserConfig();

        console.log('ForgeController Initialized');
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

        // Toggle visibility of Steps 1-4 container vs Step 5
        const steps1to4Container = document.getElementById('forgeSteps1to4Container');
        if (steps1to4Container) {
            steps1to4Container.classList.toggle('hidden', step === 5);
        }

        // Update step indicators
        document.querySelectorAll('.forge-step-indicator').forEach(ind => {
            const s = parseInt(ind.dataset.step);
            ind.classList.remove('active', 'completed');
            if (s === step) ind.classList.add('active');
            else if (s < step) ind.classList.add('completed');
        });

        // Update nav buttons
        const prevBtn = document.getElementById('forgePrevBtn');
        const nextBtn = document.getElementById('forgeNextBtn');

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
                        <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast & Cheap) ⭐</option>
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (New Standard)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Best Quality)</option>
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
            // --- Simulate "Loading" state (Instant verification) ---

            // 1. Switch Views
            const inputSec = document.getElementById('forgeInputSection');
            const activeSec = document.getElementById('forgeActiveFileSection');
            if (inputSec) inputSec.classList.add('hidden');
            if (activeSec) activeSec.classList.remove('hidden');

            // 2. Update File Info
            const nameDisplay = document.getElementById('forgeFileName');
            if (nameDisplay) nameDisplay.textContent = filePath;

            // 3. Fake Progress Animation
            const loadProgress = document.getElementById('forgeLoadProgress');
            if (loadProgress) {
                loadProgress.style.width = '0%';
                // Force reflow
                void loadProgress.offsetWidth;
                loadProgress.style.width = '100%';
            }

            // 4. Show Ready State
            setTimeout(() => {
                const check = document.getElementById('forgeCheckMark');
                if (check) check.classList.remove('hidden');

                // Enable Extract Button
                const extBtn = document.getElementById('forgeExtractBtn');
                if (extBtn) {
                    extBtn.disabled = false;
                    extBtn.classList.remove('opacity-50');
                }

                // Update Meta
                const meta = document.getElementById('forgeFileMeta');
                if (meta) meta.textContent = "Ready to extract";

            }, 600);

            // Store path/file in controller instance for the Extract step
            this.currentFile = fileObj || filePath;
            console.log("File loaded:", this.currentFile);

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

        // UI State: Extracting
        if (btn) btn.disabled = true;
        if (status) status.classList.remove('hidden');
        if (success) success.classList.add('hidden');

        try {
            // Check if it's a File object (upload) or string (path)
            let data;
            if (this.currentFile instanceof File) {
                // Upload logic
                const fd = new FormData();
                fd.append('file', this.currentFile);
                fd.append('type', 'auto');
                data = await ForgeAPI.upload(fd);
            } else {
                // Load Path logic (which extracts text)
                data = await ForgeAPI.loadPath(this.currentFile);
            }

            if (data.error) throw new Error(data.error);

            if (data.text) {
                // Update State
                this.state.text = data.text;
                this.state.contentExtracted = true;

                document.getElementById('forgeRawText').value = data.text;

                // Update char count
                const count = document.getElementById('charCount');
                if (count) count.textContent = `${data.text.length} chars`;

                // Success UI
                if (status) status.classList.add('hidden');
                if (success) success.classList.remove('hidden');

                // Enable Next Button
                this.updateWizardUI();

                // Trigger Background Analysis
                this.analyzeText(data.text);
            }

        } catch (e) {
            alert('Extraction failed: ' + e.message);
            if (btn) btn.disabled = false; // Re-enable on failure
            if (status) status.classList.add('hidden');
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
                    if (input) {
                        input.value = data.secrets.geminiApiKey;
                        // Trigger change to load models if provider is gemini
                        input.dispatchEvent(new Event('change'));
                    }
                }
            } catch (e) { }
        }

        // Fetch Local Models
        try {
            const data = await ForgeAPI.getModels();
            const select = document.getElementById('forgeModelSelect');
            if (data.models && select) {
                select.innerHTML = data.models.map(m =>
                    `<option value="${m.name}">${m.name} (${m.size})</option>`
                ).join('');
            }
        } catch (e) { }
    }

    async analyzeText(text) {
        // Skip analysis if "AI Suggest" unchecked
        const auto = document.getElementById('forgeAutoDetect');
        if (auto && !auto.checked) return;

        try {
            const provider = document.getElementById('forgeProvider')?.value || 'local';
            const apiKey = document.getElementById('forgeApiKey')?.value || '';
            const model = document.getElementById('forgeModelSelect')?.value || '';

            const data = await ForgeAPI.analyze(text.substring(0, 2000), provider, apiKey, model);

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
            const select = document.getElementById('forgeContentType');
            const map = { 'monster': 'monster', 'spell': 'spell', 'item': 'item', 'table': 'table' };
            const found = Object.keys(map).find(k => analysis.contentType.toLowerCase().includes(k));
            if (found) select.value = map[found];
        }
    }

    async handleProcess() {
        const text = document.getElementById('forgeRawText').value;
        if (!text) return alert("Please enter or upload text first.");

        const btn = document.getElementById('forgeProcessBtn');
        const originals = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Generating...`;

        try {
            const payload = {
                text,
                game: this.gameCombo.getValue(),
                source: this.sourceCombo.getValue(),
                type: document.getElementById('forgeContentType').value,
                provider: document.getElementById('forgeProvider')?.value || 'local',
                apiKey: document.getElementById('forgeApiKey')?.value || '',
                model: document.getElementById('forgeModelSelect')?.value || ''
            };

            const data = await ForgeAPI.process(payload);

            if (data.yaml) {
                const editor = document.getElementById('forgeEditor');
                editor.value = data.yaml;
                this.updatePreview(data.yaml);
            } else if (data.error) {
                alert("Error: " + data.error);
            }
        } catch (e) {
            console.error(e);
            alert("Processing failed. See console.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originals;
        }
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

        content.forEach(item => {
            if (item.game) games.add(item.game);
            if (item.type) types.add(item.type);
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
    }

    resetCardFilters() {
        this.cardFilters = { search: '', game: {}, type: {} };
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

            return true;
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
                const result = await ForgeAPI.saveCards(items, game, type);

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
