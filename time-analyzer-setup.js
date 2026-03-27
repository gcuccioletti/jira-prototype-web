const TIME_ANALYZER_SETUP_TITLE = 'Time Analyzer Setup';

class TimeAnalyzerSetup {
        // Status Groups
        statusGroupsKey = 'time_status_groups';

        displayStatusGroups() {
            const container = document.getElementById('statusGroupsContainer');
            if (!container) return;
            const groups = this.getStatusGroups();
            if (groups.length === 0) {
                container.innerHTML = '<div class="no-patterns">No status groups defined yet</div>';
                return;
            }
            // Show groups ordered by priority (lowest number = highest priority)
            const indexed = groups.map((g, i) => ({ group: g, originalIndex: i }));
            indexed.sort((a, b) => (a.group.priority || 0) - (b.group.priority || 0));
            container.innerHTML = '<h4>Saved Status Groups</h4>' +
                '<ul id="statusGroupsList" class="status-groups-list" style="list-style:none;padding-left:0;">' +
                indexed.map(({ group, originalIndex }, displayIdx) => {
                    const priority = typeof group.priority === 'number' ? group.priority : displayIdx;
                    return `<li draggable="true" data-display-idx="${displayIdx}" data-original-idx="${originalIndex}" style="padding:0.5rem 0;border-bottom:1px solid #eee;display:flex;align-items:center;gap:0.5rem;">
                        <input type="number" class="group-priority-input" data-original-idx="${originalIndex}" value="${priority}" min="0" style="width:3rem;padding:0.2rem;margin-right:0.5rem;" />
                        <div style="flex:1;"><strong>${this.escapeHtml(group.name)}</strong>: ${group.statuses.map(s => this.escapeHtml(s)).join(', ')}</div>
                        <div style="display:flex;gap:0.3rem;">
                            <button onclick="window.timeSetup.editStatusGroup(${originalIndex})">✏️</button>
                            <button onclick="window.timeSetup.deleteStatusGroup(${originalIndex})">❌</button>
                        </div>
                    </li>`;
                }).join('') +
                '</ul>';
            // Attach drag/drop and priority change handlers
            const listEl = document.getElementById('statusGroupsList');
            if (listEl) {
                listEl.addEventListener('dragstart', (e) => {
                    const li = e.target.closest('li');
                    if (!li) return;
                    e.dataTransfer.setData('text/plain', li.dataset.displayIdx);
                    e.dataTransfer.effectAllowed = 'move';
                });
                listEl.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
                listEl.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    const toLi = e.target.closest('li');
                    const to = toLi ? Number(toLi.dataset.displayIdx) : null;
                    if (Number.isFinite(from)) this.reorderGroupsByDisplayIndexes(from, to);
                });
                // Priority input change
                const inputs = listEl.querySelectorAll('.group-priority-input');
                inputs.forEach(inp => {
                    inp.addEventListener('change', (ev) => {
                        const origIdx = Number(ev.target.dataset.originalIdx);
                        const val = Number(ev.target.value);
                        if (!Number.isFinite(val) || val < 0) {
                            ev.target.value = '';
                            return;
                        }
                        this.setStatusGroupPriority(origIdx, Math.floor(val));
                    });
                });
            }
        }

        getStatusGroups() {
            const json = localStorage.getItem(this.statusGroupsKey);
            return json ? JSON.parse(json) : [];
        }

        saveStatusGroup(name, statuses, replaceIndex = null) {
            if (!name || !statuses.length) {
                this.showMessage('Group name and at least one status required.', 'error');
                return false;
            }
            const groups = this.getStatusGroups();
            if (Number.isInteger(replaceIndex) && replaceIndex >= 0 && replaceIndex < groups.length) {
                // preserve priority when updating
                const priority = groups[replaceIndex].priority || replaceIndex;
                groups[replaceIndex] = { name, statuses, priority };
                this.showMessage('Status group updated!', 'success');
            } else {
                const maxPriority = groups.reduce((m, g) => Math.max(m, (g.priority || 0)), -1);
                groups.push({ name, statuses, priority: maxPriority + 1 });
                this.showMessage('Status group saved!', 'success');
            }
            localStorage.setItem(this.statusGroupsKey, JSON.stringify(groups));
            this.displayStatusGroups();
            return true;
        }

        deleteStatusGroup(idx) {
            const groups = this.getStatusGroups();
            groups.splice(idx, 1);
            // normalize priorities after deletion
            this.normalizePriorities(groups);
            this.displayStatusGroups();
        }
    constructor() {
        this.storagePrefix = 'jira_';
        this.statusesKey = 'time_selected_statuses';
        this.statusesCache = [];
        this.editingGroupIndex = null; // index of group being edited, or null
        this.statusGroupsKey = 'time_status_groups';
        // Try to get connection config from localStorage first
        this.proxyUrl = this.getStorage('proxyUrl') || 'http://localhost:3000/api/jira';
        this.authType = this.getStorage('authType') || 'basic';
        this.username = this.getStorage('username') || '';
        this.apiToken = this.getStorage('apiToken') || '';
        this.bearerToken = this.getStorage('bearerToken') || '';
    }

    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
    }
    setStorage(key, value) {
        localStorage.setItem(this.storagePrefix + key, value);
    }

    getAuthHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        if (this.authType === 'basic') {
            if (this.username && this.apiToken) {
                headers['Authorization'] = 'Basic ' + btoa(`${this.username}:${this.apiToken}`);
            }
        } else if (this.authType === 'bearer') {
            if (this.bearerToken) {
                headers['Authorization'] = `Bearer ${this.bearerToken}`;
            }
        }
        return headers;
    }

    _initializeEventListeners() {
        const saveBtn = document.getElementById('saveStatusBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSelectedStatus());
        }
    }

    async initializeApp() {
        document.title = TIME_ANALYZER_SETUP_TITLE;
        // Fallback: update instance variables from localStorage if available
        const proxyUrl = this.getStorage('proxyUrl');
        const authType = this.getStorage('authType');
        const username = this.getStorage('username');
        const apiToken = this.getStorage('apiToken');
        const bearerToken = this.getStorage('bearerToken');
        if (proxyUrl) this.proxyUrl = proxyUrl;
        if (authType) this.authType = authType;
        if (username) this.username = username;
        if (apiToken) this.apiToken = apiToken;
        if (bearerToken) this.bearerToken = bearerToken;
        // Show error if config is missing
        if (!this.proxyUrl || (!this.username && !this.bearerToken)) {
            this.showMessage('JIRA connection configuration missing. Please set up your connection in the Setup page.', 'error');
            return;
        }
        // Retrieve selected statuses from localStorage (do not clear them)
        this.renderSelectedStatusesSection();
        this.displayStatusGroups();
    }

    renderSelectedStatusesSection() {
        const container = document.getElementById('selectedStatusContainer');
        if (!container) return;
        const selected = this.getSelectedStatuses();
        let html = '';
        // Always show the section, even if empty
        html += '<strong>Selected Statuses:</strong>';
        if (selected.length > 0) {
            html += '<form id="selectedStatusesForm" style="display:inline-block;margin-left:0.5rem;">' +
                selected.map(s => `<label style="margin-right:1rem;display:inline-flex;align-items:center;gap:0.3rem;">
                    <input type="checkbox" class="selected-status-checkbox" data-status="${this.escapeHtml(s)}" checked />${this.escapeHtml(s)}
                </label>`).join('') +
                '</form>';
        } else {
            html += '<em>No statuses selected</em>';
        }
        // Add SAVE STATUS GROUP form below Selected Statuses
        const isEditing = Number.isInteger(this.editingGroupIndex) && this.editingGroupIndex >= 0;
        const draftName = this.getStorage('timeStatusGroupDraftName') || '';
        const groupNameValue = isEditing
            ? this.escapeHtml(this.getStatusGroups()[this.editingGroupIndex].name || '')
            : this.escapeHtml(draftName);
        html += '<form id="statusGroupForm" style="margin-top:1rem;margin-bottom:1rem;">' +
            `<input type="text" id="statusGroupName" placeholder="Status Group Name" style="margin-right:0.5rem;" value="${groupNameValue}" />` +
            `<button type="submit" class="btn btn-secondary">${isEditing ? 'Update Status Group' : 'Save Status Group'}</button>` +
            `${isEditing ? '<button type="button" id="cancelStatusEditBtn" class="btn btn-link" style="margin-left:0.5rem;">Cancel</button>' : ''}` +
            '<div style="margin-top:0.5rem;font-size:0.95rem;color:#666;">Status group will be created from the statuses in the <strong>Selected Statuses</strong> list above.</div>' +
            '</form>';
        container.innerHTML = html;
        // Add event listener for status group form
        const groupForm = document.getElementById('statusGroupForm');
        if (groupForm) {
            groupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const groupName = document.getElementById('statusGroupName').value.trim();
                const selectedForm = document.getElementById('selectedStatusesForm');
                let statuses = [];
                if (selectedForm) {
                    const checked = selectedForm.querySelectorAll('.selected-status-checkbox:checked');
                    statuses = Array.from(checked).map(cb => cb.getAttribute('data-status'));
                } else {
                    statuses = this.getSelectedStatuses();
                }
                const isEditing = Number.isInteger(this.editingGroupIndex) && this.editingGroupIndex >= 0;
                const saved = this.saveStatusGroup(groupName, statuses, isEditing ? this.editingGroupIndex : null);
                if (saved) {
                    this.setStorage('timeStatusGroupDraftName', '');
                    if (isEditing) {
                        // finished editing
                        this.editingGroupIndex = null;
                        this.displayStatusGroups();
                        this.renderSelectedStatusesSection();
                        if (typeof this.displayStatuses === 'function') this.displayStatuses();
                    } else {
                        groupForm.reset();
                        // Unselect all statuses after creating group
                        this.setStorage(this.statusesKey, JSON.stringify([]));
                        this.renderSelectedStatusesSection();
                        // Also refresh the main status list if it's displayed
                        if (typeof this.displayStatuses === 'function') this.displayStatuses();
                    }
                }
            });
            const nameInput = document.getElementById('statusGroupName');
            if (nameInput) {
                nameInput.addEventListener('input', (event) => {
                    this.setStorage('timeStatusGroupDraftName', event.target.value.trim());
                });
            }
            // Cancel button if present
            const cancelBtn = document.getElementById('cancelStatusEditBtn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    this.setStorage('timeStatusGroupDraftName', '');
                    this.cancelEditStatusGroup();
                });
            }
        }
    }

    async fetchStatuses() {
        try {
            const endpoint = '/status';
            const requestOptions = {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ endpoint, options: { method: 'GET' } })
            };
            const response = await fetch(this.proxyUrl, requestOptions);
            const data = await response.json();
            if (!response.ok) throw new Error(data.errorMessages?.[0] || data.error || `API Error: ${response.status}`);
            this.statusesCache = data;
            this.displayStatuses();
        } catch (error) {
            this.showMessage(`Error fetching statuses: ${error.message}`, 'error');
        }
    }

    editStatusGroup(idx) {
        const groups = this.getStatusGroups();
        if (!groups[idx]) return;
        const group = groups[idx];
        // Set selected statuses to the group's statuses so checkboxes reflect them
        this.setStorage(this.statusesKey, JSON.stringify(group.statuses));
        this.editingGroupIndex = idx;
        // Re-render selected statuses and groups UI
        this.renderSelectedStatusesSection();
        this.displayStatusGroups();
        if (typeof this.displayStatuses === 'function') this.displayStatuses();
    }

    cancelEditStatusGroup() {
        this.editingGroupIndex = null;
        // Clear any group name field and leave selected statuses as-is
        const nameInput = document.getElementById('statusGroupName'); if (nameInput) nameInput.value = '';
        this.renderSelectedStatusesSection();
        this.displayStatusGroups();
    }

    // Move group up in priority order
    moveStatusGroupUp(origIdx) {
        const groups = this.getStatusGroups();
        if (!groups[origIdx]) return;
        const sorted = groups.map((g,i) => ({ g, i })).sort((a,b) => (a.g.priority||0) - (b.g.priority||0));
        const pos = sorted.findIndex(x => x.i === origIdx);
        if (pos <= 0) return;
        const a = sorted[pos - 1].i;
        const b = sorted[pos].i;
        const tmp = groups[a].priority;
        groups[a].priority = groups[b].priority;
        groups[b].priority = tmp;
        this.normalizePriorities(groups);
    }

    // Move group down in priority order
    moveStatusGroupDown(origIdx) {
        const groups = this.getStatusGroups();
        if (!groups[origIdx]) return;
        const sorted = groups.map((g,i) => ({ g, i })).sort((a,b) => (a.g.priority||0) - (b.g.priority||0));
        const pos = sorted.findIndex(x => x.i === origIdx);
        if (pos < 0 || pos >= sorted.length - 1) return;
        const a = sorted[pos].i;
        const b = sorted[pos + 1].i;
        const tmp = groups[a].priority;
        groups[a].priority = groups[b].priority;
        groups[b].priority = tmp;
        this.normalizePriorities(groups);
    }

    normalizePriorities(groups) {
        if (!Array.isArray(groups)) groups = this.getStatusGroups();
        groups.sort((x, y) => (x.priority || 0) - (y.priority || 0));
        groups.forEach((g, i) => { g.priority = i; });
        localStorage.setItem(this.statusGroupsKey, JSON.stringify(groups));
        this.displayStatusGroups();
    }

    // Reorder groups using display positions (positions in the sorted-by-priority list)
    reorderGroupsByDisplayIndexes(fromDisplayIdx, toDisplayIdx) {
        const groups = this.getStatusGroups();
        const indexed = groups.map((g, i) => ({ g, i }));
        indexed.sort((a, b) => (a.g.priority || 0) - (b.g.priority || 0));
        // Move element
        const [item] = indexed.splice(fromDisplayIdx, 1);
        const insertAt = (toDisplayIdx === null || toDisplayIdx === undefined) ? indexed.length : toDisplayIdx;
        indexed.splice(insertAt, 0, item);
        // Write back priorities
        indexed.forEach((entry, idx) => {
            groups[entry.i].priority = idx;
        });
        localStorage.setItem(this.statusGroupsKey, JSON.stringify(groups));
        this.displayStatusGroups();
    }

    setStatusGroupPriority(origIndex, newPriority) {
        const groups = this.getStatusGroups();
        if (!groups[origIndex]) return;
        groups[origIndex].priority = Number(newPriority);
        this.normalizePriorities(groups);
    }

    displayStatuses() {
        const container = document.getElementById('statusListContainer');
        if (!container) return;
        const selectedStatuses = this.getSelectedStatuses();
        let html = '';
        // Show selected statuses at the top with checkboxes and SAVE button
        if (selectedStatuses.length > 0) {
            html += '<div class="status-info"><strong>Selected Statuses:</strong>' +
                '<form id="selectedStatusesForm" style="display:inline-block;margin-left:0.5rem;">' +
                selectedStatuses.map(s => `<label style="margin-right:1rem;display:inline-flex;align-items:center;gap:0.3rem;">
                    <input type="checkbox" class="selected-status-checkbox" data-status="${this.escapeHtml(s)}" checked />${this.escapeHtml(s)}
                </label>`).join('') +
                '</form>';
            html += '<button class="btn btn-primary" id="saveSelectedStatusesBtn" style="margin-bottom:1rem;">Save Selected Statuses</button>';
            // Display all saved statuses in a list after the button
            html += '<ul id="savedStatusesList">' +
                selectedStatuses.map(s => `<li>${this.escapeHtml(s)}</li>`).join('') +
                '</ul>';
            html += '</div>';
        }
        // Sort statuses alphabetically by name
        const sortedStatuses = [...this.statusesCache].sort((a, b) => a.name.localeCompare(b.name));
        const statusListHtml = '<div class="status-list">' +
            sortedStatuses.map(status => {
                const isSelected = selectedStatuses.includes(status.name);
                return `<div class="status-badge" style="background:${isSelected ? '#d1fae5' : ''}">
                    <label style="display:flex;align-items:center;gap:0.5rem;">
                        <input type="checkbox" class="status-checkbox" data-status="${this.escapeHtml(status.name)}" ${isSelected ? 'checked' : ''} />
                        ${this.escapeHtml(status.name)}
                    </label>
                </div>`;
            }).join('') + '</div>';

        // Note: Status group form lives under the Selected Statuses section (renderSelectedStatusesSection)
        container.innerHTML = statusListHtml + html;
        // Add event listeners for checkboxes
        const checkboxes = container.querySelectorAll('.status-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const statusName = e.target.getAttribute('data-status');
                if (e.target.checked) {
                    this.selectStatus(statusName);
                } else {
                    this.deleteStatus(statusName);
                }
            });
        });
        // Add event listener for SAVE SELECTED STATUSES button
        const saveBtn = document.getElementById('saveSelectedStatusesBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveSelectedStatus();
            });
        }
        // Add event listener for status group form
        const groupForm = document.getElementById('statusGroupForm');
        if (groupForm) {
            groupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const groupName = document.getElementById('statusGroupName').value.trim();
                const selectedForm = document.getElementById('selectedStatusesForm');
                let statuses = [];
                if (selectedForm) {
                    const checked = selectedForm.querySelectorAll('.selected-status-checkbox:checked');
                    statuses = Array.from(checked).map(cb => cb.getAttribute('data-status'));
                } else {
                    statuses = this.getSelectedStatuses();
                }
                const saved = this.saveStatusGroup(groupName, statuses);
                if (saved) {
                    groupForm.reset();
                    // Unselect all checkboxes from the status list
                    const statusCheckboxes = document.querySelectorAll('.status-checkbox');
                    statusCheckboxes.forEach(cb => { cb.checked = false; });
                    // Clear selected statuses
                    this.setStorage(this.statusesKey, JSON.stringify([]));
                    this.renderSelectedStatusesSection();
                    this.displayStatuses();
                }
            });
        }
        this.displayStatusGroups();
    }

    selectStatus(statusName) {
        let selected = this.getSelectedStatuses();
        if (!selected.includes(statusName)) {
            selected.push(statusName);
            this.setStorage(this.statusesKey, JSON.stringify(selected));
            this.displayStatuses();
            this.renderSelectedStatusesSection();
        }
    }

    deleteStatus(statusName) {
        let selected = this.getSelectedStatuses();
        selected = selected.filter(s => s !== statusName);
        this.setStorage(this.statusesKey, JSON.stringify(selected));
        this.displayStatuses();
        this.renderSelectedStatusesSection();
    }

    saveSelectedStatus() {
        // Save selected statuses to localStorage
        const selectedForm = document.getElementById('selectedStatusesForm');
        let selectedStatuses = [];
        if (selectedForm) {
            const checked = selectedForm.querySelectorAll('.selected-status-checkbox:checked');
            selectedStatuses = Array.from(checked).map(cb => cb.getAttribute('data-status'));
        } else {
            selectedStatuses = this.getSelectedStatuses();
        }
        this.setStorage(this.statusesKey, JSON.stringify(selectedStatuses));
        this.showMessage('Selected statuses saved!', 'success');
        // Re-render sections to reflect saved selection (do not clear storage)
        this.renderSelectedStatusesSection();
        this.displayStatuses();
    }

    getSelectedStatuses() {
        const json = this.getStorage(this.statusesKey);
        return json ? JSON.parse(json) : [];
    }

    displaySelectedStatuses() {
        // Re-render the selected statuses section so UI stays in sync
        this.renderSelectedStatusesSection();
    }

    exportConfiguration() {
        // Export ALL localStorage data, not just status groups
        const allData = {};
        
        // Get all localStorage keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                try {
                    // Try to parse as JSON first, fallback to string
                    const value = localStorage.getItem(key);
                    try {
                        allData[key] = JSON.parse(value);
                    } catch {
                        allData[key] = value;
                    }
                } catch (error) {
                    console.warn(`Could not export key ${key}:`, error);
                }
            }
        }

        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            description: 'Complete JIRA Integration Tool Configuration Export',
            localStorage: allData
        };

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `jira_tool_config_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.showMessage(`Exported complete configuration (${Object.keys(allData).length} settings)!`, 'success');
    }

    importConfiguration(file) {
        if (!file) {
            this.showMessage('Please select a file to import', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const data = JSON.parse(content);

                // Validate the imported data structure
                if (!data.localStorage && !data.statusGroups) {
                    throw new Error('Invalid file format. Expected localStorage data or legacy statusGroups array.');
                }

                let importData = {};
                let isLegacyFormat = false;

                if (data.localStorage) {
                    // New format: complete configuration export
                    importData = data.localStorage;
                } else if (data.statusGroups) {
                    // Legacy format: only status groups
                    isLegacyFormat = true;
                    importData = {
                        'time_status_groups': data.statusGroups
                    };
                }

                // Ask user for confirmation
                const keyCount = Object.keys(importData).length;
                const confirmMsg = isLegacyFormat 
                    ? `Import ${data.statusGroups.length} status group(s)? This will replace existing status groups.`
                    : `Import complete configuration (${keyCount} settings)? This will replace ALL existing configuration data.`;

                if (confirm(confirmMsg)) {
                    // Clear existing localStorage and import new data
                    localStorage.clear();
                    
                    // Import all the data
                    Object.entries(importData).forEach(([key, value]) => {
                        try {
                            // Store as JSON string if it's an object/array, otherwise as string
                            const valueStr = (typeof value === 'object' && value !== null) 
                                ? JSON.stringify(value) 
                                : String(value);
                            localStorage.setItem(key, valueStr);
                        } catch (error) {
                            console.warn(`Could not import key ${key}:`, error);
                        }
                    });

                    // Refresh the UI
                    this.displayStatusGroups();
                    this.renderSelectedStatusesSection();
                    this.displayStatuses();
                    
                    this.showMessage(`Successfully imported ${keyCount} configuration setting(s)!`, 'success');
                }
            } catch (error) {
                this.showMessage(`Error importing file: ${error.message}`, 'error');
            }
        };

        reader.onerror = () => {
            this.showMessage('Error reading file', 'error');
        };

        reader.readAsText(file);
    }

    showMessage(message, type = 'info') {
        const container = document.getElementById('messageContainer');
        if (container) {
            const className = type === 'error' ? 'error-message' : 'success-message';
            container.innerHTML = `<div class="${className}">${this.escapeHtml(message)}</div>`;
            if (type === 'success') {
                setTimeout(() => { container.innerHTML = ''; }, 3000);
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.timeSetup = new TimeAnalyzerSetup();
    window.timeSetup._initializeEventListeners();
    window.timeSetup.initializeApp();
    // Add event listener for LOAD STATUSES button
    const loadBtn = document.getElementById('loadStatusesBtn');
    if (loadBtn) {
        loadBtn.addEventListener('click', () => window.timeSetup.fetchStatuses());
    }
    
    // Add event listeners for export/import buttons
    const exportBtn = document.getElementById('exportConfigBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => window.timeSetup.exportConfiguration());
    }
    
    const importBtn = document.getElementById('importConfigBtn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('importConfigFile');
            if (fileInput) fileInput.click();
        });
    }
    
    const fileInput = document.getElementById('importConfigFile');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                window.timeSetup.importConfiguration(e.target.files[0]);
                // Reset file input
                e.target.value = '';
            }
        });
    }
});
