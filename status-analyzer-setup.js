/**
 * Status Analyzer Setup
 * Manages status patterns
 */
class StatusAnalyzerSetup {
    constructor() {
        this.proxyUrl = 'http://localhost:3000/api/jira';
        this.storagePrefix = 'jira_';
        this.patternsKey = 'status_patterns';
        this.statusesCache = [];
        this.editingPatternIndex = null;
        this._initializeEventListeners();
        // Always run priority migration on page load
        this._migratePatternsWithPriority();
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
     * Save patterns with verification
     */
    _savePatternsWithVerification(patterns) {
        const dataStr = JSON.stringify(patterns);
        this.setStorage(this.patternsKey, dataStr);
        
        // Verify data was saved
        const verified = this.getStorage(this.patternsKey);
        if (verified !== dataStr) {
            console.error('❌ Failed to save patterns to localStorage');
            this._showMessage('Error: Failed to save patterns to localStorage. Please try again.', 'error');
            return false;
        }
        
        console.log('✅ Patterns saved and verified in localStorage');
        return true;
    }

    /**
     * Build authentication header based on saved configuration
     */
    getAuthHeaders() {
        const authType = this.getStorage('authType');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (authType === 'basic') {
            const username = this.getStorage('username');
            const apiToken = this.getStorage('apiToken');
            if (username && apiToken) {
                headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
            }
        } else if (authType === 'bearer') {
            const bearerToken = this.getStorage('bearerToken');
            if (bearerToken) {
                headers['Authorization'] = `Bearer ${bearerToken}`;
            }
        }
        
        return headers;
    }

    /**
     * Initialize event listeners
     */
    _initializeEventListeners() {
        const addBtn = document.getElementById('addPatternBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addPattern());
        }

        const patternNameInput = document.getElementById('patternName');
        if (patternNameInput) {
            patternNameInput.addEventListener('input', () => this._autoSavePatternDraft());
        }

        const patternPriorityInput = document.getElementById('patternPriority');
        if (patternPriorityInput) {
            patternPriorityInput.addEventListener('input', () => this._autoSavePatternDraft());
        }

        const fromStatusSelect = document.getElementById('fromStatus');
        if (fromStatusSelect) {
            fromStatusSelect.addEventListener('change', () => this._autoSavePatternDraft());
        }

        const toStatusSelect = document.getElementById('toStatus');
        if (toStatusSelect) {
            toStatusSelect.addEventListener('change', () => this._autoSavePatternDraft());
        }

        const exportBtn = document.getElementById('exportSetupBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportSetup());
        }

        const importBtn = document.getElementById('importSetupBtn');
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importSetup());
        }

        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => this.handleImportFile(e));
        }
    }

    /**
     * Initialize the setup page
     */
    async initializeApp() {
        try {
            this._displayUserInfo();
            // Priority migration is already run in constructor, ensuring it always executes
            await this.fetchStatuses();
            this._loadPatternDraft();
            this._loadPatterns();
            this._updateStorageInfo();
        } catch (error) {
            console.error('❌ Initialization error:', error);
            this._showMessage(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Auto-save pattern draft
     */
    _autoSavePatternDraft() {
        const name = document.getElementById('patternName')?.value.trim() || '';
        const priority = document.getElementById('patternPriority')?.value.trim() || '';
        const fromStatus = document.getElementById('fromStatus')?.value || '';
        const toStatus = document.getElementById('toStatus')?.value || '';
        this.setStorage('statusPatternDraftName', name);
        this.setStorage('statusPatternDraftPriority', priority);
        this.setStorage('statusPatternDraftFrom', fromStatus);
        this.setStorage('statusPatternDraftTo', toStatus);
    }

    /**
     * Load pattern draft into the add form
     */
    _loadPatternDraft() {
        if (this.editingPatternIndex !== null) {
            return;
        }
        const nameInput = document.getElementById('patternName');
        const priorityInput = document.getElementById('patternPriority');
        const fromStatusSelect = document.getElementById('fromStatus');
        const toStatusSelect = document.getElementById('toStatus');

        if (nameInput && !nameInput.value) {
            nameInput.value = this.getStorage('statusPatternDraftName') || '';
        }
        if (priorityInput && !priorityInput.value) {
            priorityInput.value = this.getStorage('statusPatternDraftPriority') || '';
        }
        if (fromStatusSelect && !fromStatusSelect.value) {
            fromStatusSelect.value = this.getStorage('statusPatternDraftFrom') || '';
        }
        if (toStatusSelect && !toStatusSelect.value) {
            toStatusSelect.value = this.getStorage('statusPatternDraftTo') || '';
        }
    }

    /**
     * Clear pattern draft
     */
    _clearPatternDraft() {
        this.setStorage('statusPatternDraftName', '');
        this.setStorage('statusPatternDraftPriority', '');
        this.setStorage('statusPatternDraftFrom', '');
        this.setStorage('statusPatternDraftTo', '');
    }

    /**
     * Migrate existing patterns to include priority if missing and fix duplicates
     * Always reassigns all patterns starting from priority 1 in current order
     */
    _migratePatternsWithPriority() {
        const patterns = this._getPatterns();
        
        if (patterns.length === 0) {
            return;
        }
        
        console.log('🔄 Migrating patterns and assigning priorities starting from 1...');
        
        // First, assign priority to patterns missing it temporarily
        patterns.forEach((pattern, index) => {
            if (pattern.priority === undefined || pattern.priority === null) {
                pattern.priority = index + 1;
            }
        });
        
        // Sort by current priority to maintain order
        patterns.sort((a, b) => a.priority - b.priority);
        
        // Reassign all priorities sequentially starting from 1
        patterns.forEach((pattern, index) => {
            const newPriority = index + 1;
            if (pattern.priority !== newPriority) {
                console.log(`  ✓ Reassigned priority from ${pattern.priority} to ${newPriority} for pattern "${pattern.name}"`);
            } else {
                console.log(`  ✓ Priority ${newPriority} confirmed for pattern "${pattern.name}"`);
            }
            pattern.priority = newPriority;
        });
        
        // Save updated patterns with verification
        if (this._savePatternsWithVerification(patterns)) {
            console.log('✅ Pattern migration complete! All patterns now have sequential priorities starting from 1.');
        }
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
     * Fetch available statuses from JIRA
     */
    async fetchStatuses() {
        try {
            const endpoint = '/status';
            
            const requestOptions = {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    endpoint: endpoint,
                    options: {
                        method: 'GET'
                    }
                })
            };

            const response = await fetch(this.proxyUrl, requestOptions);
            const data = await response.json();

            if (!response.ok) {
                const errorMessage = data.errorMessages?.[0] || data.error || `API Error: ${response.status}`;
                throw new Error(errorMessage);
            }

            this.statusesCache = data;
            this._displayStatuses();
            this._populateStatusSelects();
        } catch (error) {
            console.error('❌ Error fetching statuses:', error);
            this._showMessage(`Error fetching statuses: ${error.message}`, 'error');
        }
    }

    /**
     * Display available statuses
     */
    _displayStatuses() {
        // Statuses are only used internally for dropdowns, not displayed
    }

    /**
     * Populate status select dropdowns
     */
    _populateStatusSelects() {
        const fromSelect = document.getElementById('fromStatus');
        const toSelect = document.getElementById('toStatus');
        const editFromSelect = document.getElementById('editFromStatus');
        const editToSelect = document.getElementById('editToStatus');

        // Sort statuses alphabetically by name
        const sortedStatuses = [...this.statusesCache].sort((a, b) => 
            a.name.localeCompare(b.name)
        );

        const options = sortedStatuses
            .map(status => `<option value="${this._escapeHtml(status.name)}">${this._escapeHtml(status.name)}</option>`)
            .join('');

        if (fromSelect) {
            fromSelect.innerHTML = '<option value="">-- Select Status --</option>' + options;
        }
        if (toSelect) {
            toSelect.innerHTML = '<option value="">-- Select Status --</option>' + options;
        }
        if (editFromSelect) {
            editFromSelect.innerHTML = '<option value="">-- Select Status --</option>' + options;
        }
        if (editToSelect) {
            editToSelect.innerHTML = '<option value="">-- Select Status --</option>' + options;
        }
    }

    /**
     * Add a new pattern
     */
    addPattern() {
        const patternNameInput = document.getElementById('patternName');
        const patternPriorityInput = document.getElementById('patternPriority');
        const fromStatusSelect = document.getElementById('fromStatus');
        const toStatusSelect = document.getElementById('toStatus');
        
        const patternName = patternNameInput.value.trim();
        const priority = parseInt(patternPriorityInput.value) || 1;
        const fromStatus = fromStatusSelect.value;
        const toStatus = toStatusSelect.value;

        if (!patternName || !fromStatus || !toStatus) {
            this._showMessage('Please fill in all fields', 'error');
            return;
        }

        if (fromStatus === toStatus) {
            this._showMessage('From and To statuses must be different', 'error');
            return;
        }

        let patterns = this._getPatterns();

        // Check if pattern name already exists
        const nameExists = patterns.some(p => p.name === patternName);
        if (nameExists) {
            this._showMessage('A pattern with this name already exists', 'error');
            return;
        }

        // Check if pattern transition already exists
        const exists = patterns.some(p => p.from === fromStatus && p.to === toStatus);
        if (exists) {
            this._showMessage('This status transition pattern already exists', 'error');
            return;
        }

        // Reassign priorities: increment priorities >= the new priority
        patterns.forEach(pattern => {
            if ((pattern.priority || 999) >= priority) {
                pattern.priority = (pattern.priority || 999) + 1;
            }
        });

        // Add the new pattern with the specified priority
        patterns.push({
            name: patternName,
            priority: priority,
            from: fromStatus,
            to: toStatus,
            createdAt: new Date().toISOString()
        });

        if (this._savePatternsWithVerification(patterns)) {
            patternNameInput.value = '';
            patternPriorityInput.value = '1';
            fromStatusSelect.value = '';
            toStatusSelect.value = '';
            this._clearPatternDraft();
            this._loadPatterns();
            this._showMessage('Pattern added successfully with priority adjustments', 'success');
        }
    }

    /**
     * Get all patterns from localStorage
     */
    _getPatterns() {
        const patternsJson = this.getStorage(this.patternsKey);
        return patternsJson ? JSON.parse(patternsJson) : [];
    }

    /**
     * Load and display all patterns
     */
    _loadPatterns() {
        let patterns = this._getPatterns();
        const container = document.getElementById('patternsContainer');

        if (patterns.length === 0) {
            container.innerHTML = '<div class="no-patterns">No patterns defined yet</div>';
            this._updateStorageInfo();
            return;
        }

        // Sort patterns by priority (ascending)
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));

        container.innerHTML = `
            <table class="patterns-table">
                <thead>
                    <tr>
                        <th>Priority</th>
                        <th>Pattern Name</th>
                        <th>From Status</th>
                        <th>To Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${patterns
                        .map((pattern, index) => `
                            <tr>
                                <td style="text-align: center; font-weight: 600;">${pattern.priority || '-'}</td>
                                <td>${this._escapeHtml(pattern.name)}</td>
                                <td>${this._escapeHtml(pattern.from)}</td>
                                <td>${this._escapeHtml(pattern.to)}</td>
                                <td>
                                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                                        <button class="btn-reorder" onclick="window.setupApp.movePatternUp(${index})" ${index === 0 ? 'disabled' : ''} title="Move Up">
                                            ↑
                                        </button>
                                        <button class="btn-reorder" onclick="window.setupApp.movePatternDown(${index})" ${index === patterns.length - 1 ? 'disabled' : ''} title="Move Down">
                                            ↓
                                        </button>
                                        <button class="btn-secondary" onclick="window.setupApp.showEditPatternModal(${index})" title="Edit Pattern">
                                            ✏️ Edit
                                        </button>
                                        <button class="btn-danger" onclick="window.setupApp.deletePattern(${index})">
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `)
                        .join('')}
                </tbody>
            </table>
        `;
        
        this._updateStorageInfo();
    }

    /**
     * Update storage info display
     */
    _updateStorageInfo() {
        const storageInfoElement = document.getElementById('storageInfo');
        if (!storageInfoElement) {
            return;
        }

        const patterns = this._getPatterns();
        const connectionUrl = localStorage.getItem('jira_proxyUrl');
        const connectionStatus = connectionUrl ? 'Configured' : 'Not Configured';
        
        storageInfoElement.innerHTML = `
            <li>Status patterns: <strong>${patterns.length}</strong></li>
            <li>Connection settings: <strong>${connectionStatus}</strong></li>
            <li>Storage type: <strong>localStorage</strong></li>
        `;
    }

    /**
     * Delete a pattern
     */
    deletePattern(index) {
        if (!confirm('Are you sure you want to delete this pattern?')) {
            return;
        }

        let patterns = this._getPatterns();
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        patterns.splice(index, 1);
        
        if (this._savePatternsWithVerification(patterns)) {
            // Run migration to reassign priorities and ensure no gaps
            this._migratePatternsWithPriority();
            
            this._loadPatterns();
            this._showMessage('Pattern deleted successfully and priorities reassigned', 'success');
        }
    }

    /**
     * Show modal to edit all pattern fields
     */
    showEditPatternModal(index) {
        let patterns = this._getPatterns();
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        const pattern = patterns[index];

        // Store the index for later use in save function
        this.editingPatternIndex = index;

        // Populate modal fields with current pattern data
        document.getElementById('editPatternName').value = pattern.name;
        document.getElementById('editPatternPriority').value = pattern.priority || 1;
        document.getElementById('editFromStatus').value = pattern.from;
        document.getElementById('editToStatus').value = pattern.to;

        // Show the modal
        const modal = document.getElementById('editPatternModal');
        modal.classList.add('show');
    }

    /**
     * Close the edit pattern modal
     */
    closeEditModal() {
        const modal = document.getElementById('editPatternModal');
        modal.classList.remove('show');
        this.editingPatternIndex = null;
    }

    /**
     * Save edited pattern
     */
    saveEditPattern() {
        if (this.editingPatternIndex === null) {
            this._showMessage('Error: No pattern selected for editing', 'error');
            return;
        }

        const patternName = document.getElementById('editPatternName').value.trim();
        const priority = parseInt(document.getElementById('editPatternPriority').value) || 1;
        const fromStatus = document.getElementById('editFromStatus').value;
        const toStatus = document.getElementById('editToStatus').value;

        // Validation
        if (!patternName || !fromStatus || !toStatus) {
            this._showMessage('Please fill in all fields', 'error');
            return;
        }

        if (fromStatus === toStatus) {
            this._showMessage('From and To statuses must be different', 'error');
            return;
        }

        if (priority < 1) {
            this._showMessage('Priority must be 1 or higher', 'error');
            return;
        }

        let patterns = this._getPatterns();
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        const currentPattern = patterns[this.editingPatternIndex];

        // Check if pattern name already exists (but allow same name for current pattern)
        const nameExists = patterns.some((p, i) => i !== this.editingPatternIndex && p.name === patternName);
        if (nameExists) {
            this._showMessage('A pattern with this name already exists', 'error');
            return;
        }

        // Check if pattern transition already exists (but allow same transition for current pattern)
        const transitionExists = patterns.some((p, i) => 
            i !== this.editingPatternIndex && p.from === fromStatus && p.to === toStatus
        );
        if (transitionExists) {
            this._showMessage('This status transition pattern already exists', 'error');
            return;
        }

        // Update the pattern
        currentPattern.name = patternName;
        currentPattern.priority = priority;
        currentPattern.from = fromStatus;
        currentPattern.to = toStatus;
        currentPattern.updatedAt = new Date().toISOString();

        // Save changes with verification
        if (this._savePatternsWithVerification(patterns)) {
            this._loadPatterns();
            this.closeEditModal();
            this._showMessage('Pattern updated successfully', 'success');
        }
    }

    /**
     * Move pattern up in priority
     */
    movePatternUp(index) {
        let patterns = this._getPatterns();
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        
        if (index > 0) {
            const currentPriority = patterns[index].priority;
            const abovePriority = patterns[index - 1].priority;
            
            patterns[index].priority = abovePriority;
            patterns[index - 1].priority = currentPriority;
            
            if (this._savePatternsWithVerification(patterns)) {
                this._loadPatterns();
                this._showMessage('Pattern priority updated', 'success');
            }
        }
    }

    /**
     * Move pattern down in priority
     */
    movePatternDown(index) {
        let patterns = this._getPatterns();
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        
        if (index < patterns.length - 1) {
            const currentPriority = patterns[index].priority;
            const belowPriority = patterns[index + 1].priority;
            
            patterns[index].priority = belowPriority;
            patterns[index + 1].priority = currentPriority;
            
            if (this._savePatternsWithVerification(patterns)) {
                this._loadPatterns();
                this._showMessage('Pattern priority updated', 'success');
            }
        }
    }

    /**
     * Show message
     */
    _showMessage(message, type = 'info') {
        const container = document.getElementById('messageContainer');
        if (container) {
            const className = type === 'error' ? 'error-message' : 'success-message';
            container.innerHTML = `<div class="${className}">${this._escapeHtml(message)}</div>`;
            
            // Auto-hide success messages
            if (type === 'success') {
                setTimeout(() => {
                    container.innerHTML = '';
                }, 3000);
            }
        }
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
     * Export setup configuration to JSON file
     */
    exportSetup() {
        const patterns = this._getPatterns();
        
        if (patterns.length === 0) {
            this._showMessage('No patterns to export', 'error');
            return;
        }

        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            patterns: patterns
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `status-analyzer-setup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this._showMessage(`Exported ${patterns.length} pattern(s) successfully`, 'success');
        console.log('✅ Setup configuration exported', exportData);
    }

    /**
     * Trigger file input for import
     */
    importSetup() {
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
            if (!importData.patterns || !Array.isArray(importData.patterns)) {
                throw new Error('Invalid file format: missing patterns array');
            }

            // Validate each pattern
            for (const pattern of importData.patterns) {
                if (!pattern.name || !pattern.from || !pattern.to) {
                    throw new Error('Invalid pattern data: missing required fields (name, from, to)');
                }
            }

            // Ask user if they want to merge or replace
            const currentPatterns = this._getPatterns();
            let action = 'replace';
            
            if (currentPatterns.length > 0) {
                const userChoice = confirm(
                    `You have ${currentPatterns.length} existing pattern(s).\n\n` +
                    `Click OK to REPLACE all existing patterns with ${importData.patterns.length} imported pattern(s).\n` +
                    `Click Cancel to MERGE (add imported patterns to existing ones).`
                );
                action = userChoice ? 'replace' : 'merge';
            }

            let finalPatterns = [];
            
            if (action === 'replace') {
                finalPatterns = importData.patterns;
            } else {
                // Merge: add imported patterns to existing ones, avoiding duplicates
                finalPatterns = [...currentPatterns];
                
                for (const importPattern of importData.patterns) {
                    const exists = finalPatterns.some(p => 
                        p.name === importPattern.name || 
                        (p.from === importPattern.from && p.to === importPattern.to)
                    );
                    
                    if (!exists) {
                        finalPatterns.push(importPattern);
                    }
                }
            }

            // Ensure all patterns have priorities and reassign them sequentially
            finalPatterns.forEach((pattern, index) => {
                pattern.priority = index + 1;
            });

            // Save with verification
            if (this._savePatternsWithVerification(finalPatterns)) {
                this._loadPatterns();
                const message = action === 'replace' 
                    ? `Replaced with ${finalPatterns.length} imported pattern(s)` 
                    : `Merged to ${finalPatterns.length} total pattern(s)`;
                this._showMessage(message, 'success');
                console.log(`✅ Setup configuration imported (${action})`, finalPatterns);
            }

        } catch (error) {
            console.error('❌ Import error:', error);
            this._showMessage(`Import failed: ${error.message}`, 'error');
        }

        // Reset file input
        event.target.value = '';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.setupApp = new StatusAnalyzerSetup();
    window.setupApp.initializeApp();
});
