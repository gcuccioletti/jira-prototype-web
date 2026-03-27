/**
 * Status Analyzer Configuration
 * Manages JQL Query templates
 */

function showMessage(message, type = 'info') {
    let el = document.getElementById('statusMessage');
    if (!el) {
        el = document.createElement('div');
        el.id = 'statusMessage';
        el.className = 'status-message';
        document.body.insertBefore(el, document.body.firstChild);
    }
    el.textContent = message;
    el.className = 'status-message ' + (type === 'error' ? 'error' : 'success');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}
class StatusAnalyzerConfig {
    constructor() {
        this.storagePrefix = 'jira_';
        this.templatesKey = 'jql_templates';
        this._initializeEventListeners();
    }

    /**
     * Get item from localStorage
     */
    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
    }

    /**
     * Set item in localStorage
     */
    setStorage(key, value) {
        localStorage.setItem(this.storagePrefix + key, value);
    }

    /**
     * Initialize event listeners
     */
    _initializeEventListeners() {
        const form = document.getElementById('templateForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveTemplate();
            });
        }

        const templateNameInput = document.getElementById('templateName');
        if (templateNameInput) {
            templateNameInput.addEventListener('input', () => this._autoSaveTemplateDraft());
        }

        const templateQueryInput = document.getElementById('templateQuery');
        if (templateQueryInput) {
            templateQueryInput.addEventListener('input', () => this._autoSaveTemplateDraft());
        }

        const exportBtn = document.getElementById('exportConfigBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportConfiguration());
        }

        const importBtn = document.getElementById('importConfigBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importConfiguration());
        }

        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => this.handleImportFile(e));
        }

        const templatesList = document.getElementById('templatesList');
        if (templatesList) {
            templatesList.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof Element)) {
                    return;
                }

                const button = target.closest('button[data-action]');
                if (!button) return;

                const index = Number(button.dataset.index);
                if (Number.isNaN(index)) return;

                if (button.dataset.action === 'use') {
                    this.loadTemplate(index);
                }
                if (button.dataset.action === 'delete') {
                    this.deleteTemplate(index);
                }
            });
        }
    }

    /**
     * Initialize the configuration page
     */
    initializeApp() {
        try {
            this._displayUserInfo();
            this._loadTemplateDraft();
            this._loadTemplates();
            this._updateStorageInfo();
        } catch (error) {
            console.error('❌ Initialization error:', error);
        }
    }

    /**
     * Auto-save template draft
     */
    _autoSaveTemplateDraft() {
        const name = document.getElementById('templateName')?.value.trim() || '';
        const query = document.getElementById('templateQuery')?.value.trim() || '';
        this.setStorage('statusAnalyzerTemplateDraftName', name);
        this.setStorage('statusAnalyzerTemplateDraftQuery', query);
        this._updateStorageInfo();
    }

    /**
     * Load template draft into form
     */
    _loadTemplateDraft() {
        const nameInput = document.getElementById('templateName');
        const queryInput = document.getElementById('templateQuery');
        if (nameInput && !nameInput.value) {
            nameInput.value = this.getStorage('statusAnalyzerTemplateDraftName') || '';
        }
        if (queryInput && !queryInput.value) {
            queryInput.value = this.getStorage('statusAnalyzerTemplateDraftQuery') || '';
        }
    }

    /**
     * Clear template draft
     */
    _clearTemplateDraft() {
        this.setStorage('statusAnalyzerTemplateDraftName', '');
        this.setStorage('statusAnalyzerTemplateDraftQuery', '');
    }

    /**
     * Display user information from localStorage or API
     */
    async _displayUserInfo() {
        try {
            const proxyUrl = this.getStorage('proxyUrl');
            const authType = this.getStorage('authType');
            
            if (!proxyUrl || !authType) {
                return; // Not configured yet
            }

            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authType === 'basic') {
                const username = this.getStorage('username');
                const apiToken = this.getStorage('apiToken');
                if (username && apiToken) {
                    headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
                } else {
                    return;
                }
            } else if (authType === 'bearer') {
                const bearerToken = this.getStorage('bearerToken');
                if (bearerToken) {
                    headers['Authorization'] = `Bearer ${bearerToken}`;
                } else {
                    return;
                }
            } else {
                return;
            }

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    endpoint: '/myself',
                    options: { method: 'GET' }
                })
            });

            if (response.ok) {
                const user = await response.json();
                this._showUserInfo(user);
            }
        } catch (error) {
            // Silently fail - not critical
            console.debug('Could not load user info:', error.message);
        }
    }

    /**
     * Show user information in the header
     */
    _showUserInfo(user) {
        const userInfoDiv = document.getElementById('userInfo');
        const userNameSpan = document.getElementById('userName');
        const userEmailSpan = document.getElementById('userEmail');
        const userAvatar = document.getElementById('userAvatar');
        const userInitials = document.getElementById('userInitials');

        // Set user name and email
        const displayName = user.displayName || user.name || 'User';
        if (userNameSpan) {
            userNameSpan.textContent = displayName;
        }
        if (userEmailSpan) {
            userEmailSpan.textContent = user.emailAddress || '';
        }

        // Set avatar or initials
        if (userAvatar && userInitials) {
            if (user.avatarUrls && user.avatarUrls['48x48']) {
                userAvatar.src = user.avatarUrls['48x48'];
                userAvatar.style.display = 'block';
                userInitials.style.display = 'none';
            } else {
                // Generate initials from display name
                const initials = this._generateInitials(displayName);
                userInitials.textContent = initials;
                userAvatar.style.display = 'none';
                userInitials.style.display = 'flex';
            }
        }

        // Show user info
        if (userInfoDiv) {
            userInfoDiv.hidden = false;
        }
    }

    /**
     * Generate initials from a name
     */
    _generateInitials(name) {
        return name.split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Save a new JQL template
     */
    saveTemplate() {
        const nameInput = document.getElementById('templateName');
        const queryInput = document.getElementById('templateQuery');
        
        const name = nameInput.value.trim();
        const query = queryInput.value.trim();

        if (!name || !query) {
            showMessage('Please fill in both template name and query', 'error');
            return;
        }

        let templates = this._getTemplates();

        // Check if template with same name already exists
        const existingIndex = templates.findIndex(t => t.name === name);
        if (existingIndex >= 0) {
            if (!confirm(`Template "${name}" already exists. Overwrite it?`)) {
                return;
            }
            templates[existingIndex] = { name, query, createdAt: new Date().toISOString() };
        } else {
            templates.push({
                name,
                query,
                createdAt: new Date().toISOString()
            });
        }

        this.setStorage(this.templatesKey, JSON.stringify(templates));
        this._clearTemplateDraft();
        nameInput.value = '';
        queryInput.value = '';
        this._loadTemplates();
        this._updateStorageInfo();
    }

    /**
     * Get all templates from localStorage
     */
    _getTemplates() {
        const templatesJson = this.getStorage(this.templatesKey);
        return templatesJson ? JSON.parse(templatesJson) : [];
    }

    /**
     * Load and display all templates
     */
    _loadTemplates() {
        const templates = this._getTemplates();
        const container = document.getElementById('templatesList');

        if (templates.length === 0) {
            container.innerHTML = '<div class="no-templates">No templates saved yet</div>';
            return;
        }

        container.innerHTML = templates
            .map((template, index) => `
                <div class="template-item">
                    <div class="template-item-content">
                        <div class="template-item-name">${this._escapeHtml(template.name)}</div>
                        <div class="template-item-query">${this._escapeHtml(template.query)}</div>
                    </div>
                    <div class="template-item-actions">
                        <button type="button" class="btn btn-primary btn-small" data-action="use" data-index="${index}">
                            Use
                        </button>
                        <button type="button" class="btn btn-danger btn-small" data-action="delete" data-index="${index}">
                            Delete
                        </button>
                    </div>
                </div>
            `)
            .join('');
    }

    /**
     * Load template into the analyzer
     */
    loadTemplate(index) {
        const templates = this._getTemplates();
        if (index >= 0 && index < templates.length) {
            // Store the selected template in sessionStorage for the analyzer page
            sessionStorage.setItem('jira_selected_jql_template', templates[index].query);
            sessionStorage.setItem('jira_selected_template_name', templates[index].name);
            localStorage.setItem('jira_selected_jql_template', templates[index].query);
            localStorage.setItem('jira_selected_template_name', templates[index].name);
            const encodedQuery = encodeURIComponent(templates[index].query);
            window.location.href = `status-analyzer.html?template=${encodedQuery}#template=${encodedQuery}`;
        }
    }

    /**
     * Delete a template
     */
    deleteTemplate(index) {
        if (!confirm('Are you sure you want to delete this template?')) {
            return;
        }

        let templates = this._getTemplates();
        templates.splice(index, 1);
        this.setStorage(this.templatesKey, JSON.stringify(templates));
        this._loadTemplates();
        this._updateStorageInfo();
    }

    /**
     * Escape HTML special characters
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update storage information display
     */
    _updateStorageInfo() {
        const storageInfo = document.getElementById('storageInfo');
        if (!storageInfo) return;
        
        const templates = this._getTemplates();
        const username = this.getStorage('username');
        const jiraUrl = this.getStorage('jiraUrl');
        
        const configItems = [username, jiraUrl].filter(item => item).length;
        
        storageInfo.innerHTML = `
            <li style="padding: 0.25rem 0; color: var(--text-primary);">JQL templates: <strong>${templates.length}</strong></li>
            <li style="padding: 0.25rem 0; color: var(--text-primary);">Connection settings: <strong>${configItems > 0 ? 'Configured' : 'Not configured'}</strong></li>
            <li style="padding: 0.25rem 0; color: var(--text-primary);">Storage type: <strong>localStorage</strong></li>
        `;
    }

    /**
     * Export configuration to JSON file
     */
    exportConfiguration() {
        const templates = this._getTemplates();
        
        if (templates.length === 0) {
            showMessage('No templates to export', 'error');
            return;
        }

        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            templates: templates
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `status-analyzer-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log(`✅ Exported ${templates.length} template(s) successfully`, exportData);
    }

    /**
     * Trigger file input for import
     */
    importConfiguration() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Handle imported file
     */
    async handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            // Validate import data
            if (!importData.templates || !Array.isArray(importData.templates)) {
                throw new Error('Invalid file format: missing templates array');
            }

            // Validate each template
            for (const template of importData.templates) {
                if (!template.name || !template.query) {
                    throw new Error('Invalid template data: missing required fields (name, query)');
                }
            }

            // Ask user if they want to merge or replace
            const currentTemplates = this._getTemplates();
            let action = 'replace';
            
            if (currentTemplates.length > 0) {
                const userChoice = confirm(
                    `You have ${currentTemplates.length} existing template(s).\n\n` +
                    `Click OK to REPLACE all existing templates with ${importData.templates.length} imported template(s).\n` +
                    `Click Cancel to MERGE (add imported templates to existing ones).`
                );
                action = userChoice ? 'replace' : 'merge';
            }

            let finalTemplates = [];
            
            if (action === 'replace') {
                finalTemplates = importData.templates;
            } else {
                // Merge: add imported templates to existing ones
                finalTemplates = [...currentTemplates];
                
                for (const importTemplate of importData.templates) {
                    const existingIndex = finalTemplates.findIndex(t => t.name === importTemplate.name);
                    
                    if (existingIndex >= 0) {
                        // Ask if they want to overwrite
                        const overwrite = confirm(
                            `Template "${importTemplate.name}" already exists.\n\n` +
                            `Click OK to OVERWRITE it.\n` +
                            `Click Cancel to SKIP it.`
                        );
                        
                        if (overwrite) {
                            finalTemplates[existingIndex] = importTemplate;
                        }
                    } else {
                        finalTemplates.push(importTemplate);
                    }
                }
            }

            // Save templates
            this.setStorage(this.templatesKey, JSON.stringify(finalTemplates));
            this._loadTemplates();
            this._updateStorageInfo();
            
            const message = action === 'replace' 
                ? `Replaced with ${finalTemplates.length} imported template(s)` 
                : `Merged to ${finalTemplates.length} total template(s)`;
            showMessage(message, 'success');
            console.log(`✅ Configuration imported (${action})`, finalTemplates);

        } catch (error) {
            console.error('❌ Import error:', error);
            showMessage(`Import failed: ${error.message}`, 'error');
        }

        // Reset file input
        event.target.value = '';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.configApp = new StatusAnalyzerConfig();
    window.configApp.initializeApp();
});
