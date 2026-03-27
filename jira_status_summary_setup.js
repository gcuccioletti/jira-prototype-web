/* ===========================
   Status Summary Setup Page
   =========================== */

class StatusSummarySetupManager extends SetupManager {
    constructor() {
        // Call parent constructor first (skip auto-init)
        super(false);
        // Override storage prefix for status summary
        this.storagePrefix = 'jira_status_summary_';
        // Migrate values from main setup (excluding connection details)
        this.migrateFromMainSetup();
        this.init();
    }

    /**
     * Migrate configuration from main setup (skip connection settings)
     */
    migrateFromMainSetup() {
        const mainPrefix = 'jira_';
        const summaryPrefix = 'jira_status_summary_';
        
        // Keys to migrate (excluding jiraUrl, username, apiToken, bearerToken, authType)
        const keysToMigrate = [
            'defaultProjectKey',
            'defaultTeam',
            'maxResults',
            'preferredProjects',
            'preferredTeams',
            'jqlTemplates'
        ];

        // Only migrate if status summary storage is empty
        const alreadyMigrated = localStorage.getItem(summaryPrefix + 'migrated');
        if (alreadyMigrated) {
            return; // Already migrated, skip
        }

        console.log('🔄 Migrating configuration from main setup...');
        
        keysToMigrate.forEach(key => {
            const mainValue = localStorage.getItem(mainPrefix + key);
            if (mainValue !== null) {
                localStorage.setItem(summaryPrefix + key, mainValue);
                console.log(`✅ Migrated ${key}`);
            }
        });

        // Mark as migrated
        localStorage.setItem(summaryPrefix + 'migrated', 'true');
        console.log('✅ Migration complete');
    }

    /**
     * Override init to skip connection-related initializations
     */
    init() {
        this.loadStoredConfig();
        this.initializeEventListeners();
        this.updateStorageInfo();
        this.displaySavedTemplates();
        this.displaySavedPreferredProjects();
        this.displaySavedPreferredTeams();
        this.loadUserInfo();
    }

    /**
     * Override event listeners to remove connection-related handlers
     */
    initializeEventListeners() {
        // Navigation - go back to status summary page
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            // Remove existing listener and add new one
            backBtn.replaceWith(backBtn.cloneNode(true));
            document.getElementById('backBtn').addEventListener('click', () => {
                window.location.href = 'jira_status_summary.html';
            });
        }

        // Skip server config and auth config listeners (sections removed)

        // Query defaults
        const queryForm = document.getElementById('queryConfigForm');
        if (queryForm) {
            queryForm.addEventListener('submit', (e) => this.saveQueryConfig(e));
        }

        const defaultProjectKeyInput = document.getElementById('defaultProjectKey');
        if (defaultProjectKeyInput) {
            defaultProjectKeyInput.addEventListener('input', () => this.autoSaveQueryConfig());
        }
        const defaultTeamInput = document.getElementById('defaultTeam');
        if (defaultTeamInput) {
            defaultTeamInput.addEventListener('input', () => this.autoSaveQueryConfig());
        }
        const maxResultsInput = document.getElementById('maxResults');
        if (maxResultsInput) {
            maxResultsInput.addEventListener('input', () => this.autoSaveQueryConfig());
        }
        
        const loadProjectsBtn = document.getElementById('loadProjectsBtn');
        if (loadProjectsBtn) {
            loadProjectsBtn.addEventListener('click', () => this.loadProjects());
        }
        
        const projectDropdown = document.getElementById('projectDropdown');
        if (projectDropdown) {
            projectDropdown.addEventListener('change', (e) => this.handleProjectSelection(e));
        }
        
        const loadTeamsBtn = document.getElementById('loadTeamsBtn');
        if (loadTeamsBtn) {
            loadTeamsBtn.addEventListener('click', () => this.loadTeams());
        }
        
        const teamDropdown = document.getElementById('teamDropdown');
        if (teamDropdown) {
            teamDropdown.addEventListener('change', (e) => this.handleTeamSelection(e));
        }

        // Preferred projects
        const loadPreferredProjectsBtn = document.getElementById('loadPreferredProjectsBtn');
        if (loadPreferredProjectsBtn) {
            loadPreferredProjectsBtn.addEventListener('click', () => this.loadPreferredProjects());
        }
        
        const savePreferredProjectsBtn = document.getElementById('savePreferredProjectsBtn');
        if (savePreferredProjectsBtn) {
            savePreferredProjectsBtn.addEventListener('click', () => this.savePreferredProjects());
        }
        
        const clearPreferredProjectsBtn = document.getElementById('clearPreferredProjectsBtn');
        if (clearPreferredProjectsBtn) {
            clearPreferredProjectsBtn.addEventListener('click', () => this.clearPreferredProjectsSelection());
        }

        // Preferred teams
        const loadPreferredTeamsBtn = document.getElementById('loadPreferredTeamsBtn');
        if (loadPreferredTeamsBtn) {
            loadPreferredTeamsBtn.addEventListener('click', () => this.loadPreferredTeams());
        }
        
        const savePreferredTeamsBtn = document.getElementById('savePreferredTeamsBtn');
        if (savePreferredTeamsBtn) {
            savePreferredTeamsBtn.addEventListener('click', () => this.savePreferredTeams());
        }
        
        const clearPreferredTeamsBtn = document.getElementById('clearPreferredTeamsBtn');
        if (clearPreferredTeamsBtn) {
            clearPreferredTeamsBtn.addEventListener('click', () => this.clearPreferredTeamsSelection());
        }

        // JQL Templates
        const jqlTemplateForm = document.getElementById('jqlTemplateForm');
        if (jqlTemplateForm) {
            jqlTemplateForm.addEventListener('submit', (e) => this.saveJqlTemplate(e));
        }
        const templateNameInput = document.getElementById('templateName');
        if (templateNameInput) {
            templateNameInput.addEventListener('input', () => this.autoSaveTemplateDraft());
        }
        const templateQueryInput = document.getElementById('templateQuery');
        if (templateQueryInput) {
            templateQueryInput.addEventListener('input', () => this.autoSaveTemplateDraft());
        }

        // Data management
        const exportConfigBtn = document.getElementById('exportConfigBtn');
        if (exportConfigBtn) {
            exportConfigBtn.addEventListener('click', () => this.exportConfig());
        }
        
        const importConfigBtn = document.getElementById('importConfigBtn');
        if (importConfigBtn) {
            importConfigBtn.addEventListener('click', () => this.importConfig());
        }
        
        const importFileInput = document.getElementById('importFileInput');
        if (importFileInput) {
            importFileInput.addEventListener('change', (e) => this.handleImportFile(e));
        }
        
        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => this.clearAllSettings());
        }
    }

    /**
     * Override loadStoredConfig to skip connection settings
     */
    loadStoredConfig() {
        // Query defaults
        const defaultProjectKey = this.getStorage('defaultProjectKey');
        const defaultTeam = this.getStorage('defaultTeam');
        const maxResults = this.getStorage('maxResults');

        const projectKeyInput = document.getElementById('defaultProjectKey');
        const teamInput = document.getElementById('defaultTeam');
        const maxResultsInput = document.getElementById('maxResults');

        if (defaultProjectKey && projectKeyInput) projectKeyInput.value = defaultProjectKey;
        if (defaultTeam && teamInput) teamInput.value = defaultTeam;
        if (maxResults && maxResultsInput) maxResultsInput.value = maxResults;

        const draftName = this.getStorage('templateDraftName') || '';
        const draftQuery = this.getStorage('templateDraftQuery') || '';
        const templateNameInput = document.getElementById('templateName');
        const templateQueryInput = document.getElementById('templateQuery');
        if (templateNameInput && !templateNameInput.value) {
            templateNameInput.value = draftName;
        }
        if (templateQueryInput && !templateQueryInput.value) {
            templateQueryInput.value = draftQuery;
        }
    }

    /**
     * Get connection settings from main jira storage (not status summary storage)
     */
    getConnectionStorage(key) {
        return localStorage.getItem('jira_' + key);
    }

    /**
     * Override loadPreferredProjects to use main connection settings
     */
    async loadPreferredProjects() {
        const btn = document.getElementById('loadPreferredProjectsBtn');
        const container = document.getElementById('preferredProjectsContainer');
        const projectsList = document.getElementById('preferredProjectsList');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            // Use main jira connection settings
            const proxyUrl = this.getConnectionStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please configure JIRA connection in the main setup page first');
            }

            // Build authentication header based on saved auth type
            const authType = this.getConnectionStorage('authType');
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authType === 'basic') {
                const username = this.getConnectionStorage('username');
                const apiToken = this.getConnectionStorage('apiToken');
                if (username && apiToken) {
                    headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
                }
            } else if (authType === 'bearer') {
                const bearerToken = this.getConnectionStorage('bearerToken');
                if (bearerToken) {
                    headers['Authorization'] = `Bearer ${bearerToken}`;
                }
            }

            const requestOptions = {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    endpoint: '/project',
                    options: {
                        method: 'GET'
                    }
                })
            };

            console.log('🔍 Loading preferred projects with endpoint:', '/project');
            const response = await fetch(proxyUrl, requestOptions);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Projects load error:', errorText);
                throw new Error(`Failed to load projects: ${errorText}`);
            }
            
            const data = await response.json();

            // Handle different response formats
            let projects = [];
            if (Array.isArray(data)) {
                // Direct array of projects
                projects = data;
            } else if (data.values && Array.isArray(data.values)) {
                // Paginated response with values array
                projects = data.values;
            } else if (data.projects && Array.isArray(data.projects)) {
                // Response with projects array
                projects = data.projects;
            } else {
                throw new Error('Invalid projects response from server');
            }

            if (projects.length === 0) {
                throw new Error('No projects found');
            }

            projects.sort((a, b) => a.name.localeCompare(b.name));

            // Get previously saved preferred projects
            const savedPreferred = this.getStorage('preferredProjects');
            const preferredKeys = savedPreferred ? JSON.parse(savedPreferred) : [];

            projectsList.innerHTML = projects
                .map(project => {
                    const isPreferred = preferredKeys.includes(project.key);
                    return `
                        <label class="project-checkbox-label">
                            <input 
                                type="checkbox" 
                                class="project-checkbox" 
                                value="${this.escapeHtml(project.key)}"
                                data-name="${this.escapeHtml(project.name)}"
                                ${isPreferred ? 'checked' : ''}
                            >
                            <span class="project-key">${this.escapeHtml(project.key)}</span>
                            <span class="project-name">${this.escapeHtml(project.name)}</span>
                        </label>
                    `;
                })
                .join('');

            container.hidden = false;
            this.showMessage('preferredProjectsSaveResult', `Loaded ${projects.length} projects. Select your preferred ones.`, 'success');

        } catch (error) {
            console.error('Error loading projects:', error);
            this.showMessage('preferredProjectsSaveResult', `Error: ${error.message}`, 'error');
            container.hidden = true;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Override loadPreferredTeams to use main connection settings
     */
    async loadPreferredTeams() {
        const btn = document.getElementById('loadPreferredTeamsBtn');
        const container = document.getElementById('preferredTeamsContainer');
        const teamsList = document.getElementById('preferredTeamsList');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            // Use main jira connection settings
            const proxyUrl = this.getConnectionStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please configure JIRA connection in the main setup page first');
            }

            // Build authentication header based on saved auth type
            const authType = this.getConnectionStorage('authType');
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authType === 'basic') {
                const username = this.getConnectionStorage('username');
                const apiToken = this.getConnectionStorage('apiToken');
                if (username && apiToken) {
                    headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
                }
            } else if (authType === 'bearer') {
                const bearerToken = this.getConnectionStorage('bearerToken');
                if (bearerToken) {
                    headers['Authorization'] = `Bearer ${bearerToken}`;
                }
            }

            // Get preferred projects to filter teams by
            const savedPreferredProjects = this.getStorage('preferredProjects');
            const preferredProjectKeys = savedPreferredProjects ? JSON.parse(savedPreferredProjects) : [];
            
            if (preferredProjectKeys.length === 0) {
                throw new Error('Please save preferred projects first in the Preferred Projects section');
            }

            console.log(`🔍 Loading teams from projects: ${preferredProjectKeys.join(', ')}...`);
            
            // Extract unique team values from issues in preferred projects
            const teamMap = new Map();
            
            // Query each preferred project separately
            for (const projectKey of preferredProjectKeys) {
                console.log(`Querying teams for project: ${projectKey}...`);
                const jql = `project = ${projectKey} AND cf[10114] IS NOT EMPTY`;
                
                const searchResponse = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        endpoint: `/search?jql=${encodeURIComponent(jql)}&maxResults=5000&fields=customfield_10114`,
                        options: { method: 'GET' }
                    })
                });

                if (!searchResponse.ok) {
                    console.warn(`Failed to query project ${projectKey}:`, await searchResponse.text());
                    continue; // Skip this project and continue with others
                }

                const searchData = await searchResponse.json();
                console.log(`Processing ${searchData.issues?.length || 0} issues from ${projectKey}...`);

                // Extract unique team values from this project's issues
                if (searchData.issues && Array.isArray(searchData.issues)) {
                    searchData.issues.forEach(issue => {
                        const teamField = issue.fields.customfield_10114;
                        if (teamField) {
                            let teamValue = '';
                            if (typeof teamField === 'string') {
                                teamValue = teamField;
                            } else if (teamField.value) {
                                teamValue = teamField.value;
                            } else if (teamField.name) {
                                teamValue = teamField.name;
                            }
                            if (teamValue && !teamMap.has(teamValue)) {
                                teamMap.set(teamValue, {
                                    value: teamValue,
                                    id: teamField.id || teamValue
                                });
                            }
                        }
                    });
                }
            }

            const teamOptions = Array.from(teamMap.values());
            if (teamOptions.length === 0) {
                console.warn('⚠️ No team values found in issues');
                throw new Error('No teams found in issues. Ensure issues have the Team field populated.');
            }
            console.log('✅ Found ' + teamOptions.length + ' unique teams');

            teamOptions.sort((a, b) => a.value.localeCompare(b.value));

            // Get previously saved preferred teams
            const savedPreferred = this.getStorage('preferredTeams');
            const preferredTeams = savedPreferred ? JSON.parse(savedPreferred) : [];

            teamsList.innerHTML = teamOptions
                .map(team => {
                    const isPreferred = preferredTeams.includes(team.value);
                    return `
                        <label class="team-checkbox-label">
                            <input 
                                type="checkbox" 
                                class="team-checkbox" 
                                value="${this.escapeHtml(team.value)}"
                                data-id="${this.escapeHtml(team.id)}"
                                data-name="${this.escapeHtml(team.value)}"
                                ${isPreferred ? 'checked' : ''}
                            >
                            <span class="team-name">${this.escapeHtml(team.value)}</span>
                        </label>
                    `;
                })
                .join('');

            container.hidden = false;
            this.showMessage('preferredTeamsSaveResult', `Loaded ${teamOptions.length} teams. Select your preferred ones.`, 'success');

        } catch (error) {
            console.error('Error loading teams:', error);
            this.showMessage('preferredTeamsSaveResult', `Error: ${error.message}`, 'error');
            container.hidden = true;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Override loadProjects to use main connection settings (for query defaults)
     */
    async loadProjects() {
        const btn = document.getElementById('loadProjectsBtn');
        const dropdown = document.getElementById('projectDropdown');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            // Use main jira connection settings
            const proxyUrl = this.getConnectionStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please configure JIRA connection in the main setup page first');
            }

            // Build authentication header based on saved auth type
            const authType = this.getConnectionStorage('authType');
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authType === 'basic') {
                const username = this.getConnectionStorage('username');
                const apiToken = this.getConnectionStorage('apiToken');
                if (username && apiToken) {
                    headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
                }
            } else if (authType === 'bearer') {
                const bearerToken = this.getConnectionStorage('bearerToken');
                if (bearerToken) {
                    headers['Authorization'] = `Bearer ${bearerToken}`;
                }
            }

            console.log('🔍 Loading projects (query defaults) with endpoint:', '/project');
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    endpoint: '/project',
                    options: { method: 'GET' }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Projects (query defaults) load error:', errorText);
                throw new Error(`Failed to fetch projects: ${errorText}`);
            }

            const data = await response.json();

            // Handle different response formats
            let projects = [];
            if (Array.isArray(data)) {
                // Direct array of projects
                projects = data;
            } else if (data.values && Array.isArray(data.values)) {
                // Paginated response with values array
                projects = data.values;
            } else if (data.projects && Array.isArray(data.projects)) {
                // Response with projects array
                projects = data.projects;
            } else {
                throw new Error('Invalid projects response format');
            }

            if (projects.length === 0) {
                throw new Error('No projects found');
            }

            projects.sort((a, b) => a.name.localeCompare(b.name));

            dropdown.innerHTML = '<option value="">-- Select a Project --</option>' +
                projects.map(p => `<option value="${this.escapeHtml(p.key)}">${this.escapeHtml(p.name)} (${this.escapeHtml(p.key)})</option>`).join('');

            const currentValue = this.getStorage('defaultProjectKey');
            if (currentValue) {
                dropdown.value = currentValue;
            }

            this.showMessage('queryConfigResult', `Loaded ${projects.length} projects`, 'success');

        } catch (error) {
            console.error('Error loading projects:', error);
            this.showMessage('queryConfigResult', `Error: ${error.message}`, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Override loadTeams to use main connection settings (for query defaults)
     */
    async loadTeams() {
        const btn = document.getElementById('loadTeamsBtn');
        const dropdown = document.getElementById('teamDropdown');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            // Use main jira connection settings
            const proxyUrl = this.getConnectionStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please configure JIRA connection in the main setup page first');
            }

            // Build authentication header based on saved auth type
            const authType = this.getConnectionStorage('authType');
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authType === 'basic') {
                const username = this.getConnectionStorage('username');
                const apiToken = this.getConnectionStorage('apiToken');
                if (username && apiToken) {
                    headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
                }
            } else if (authType === 'bearer') {
                const bearerToken = this.getConnectionStorage('bearerToken');
                if (bearerToken) {
                    headers['Authorization'] = `Bearer ${bearerToken}`;
                }
            }

            // Get preferred projects to filter teams by
            const savedPreferredProjects = this.getStorage('preferredProjects');
            const preferredProjectKeys = savedPreferredProjects ? JSON.parse(savedPreferredProjects) : [];
            
            if (preferredProjectKeys.length === 0) {
                throw new Error('Please save preferred projects first in the Preferred Projects section');
            }

            console.log(`🔍 Loading teams for query defaults from projects: ${preferredProjectKeys.join(', ')}...`);
            
            // Extract unique team values from issues in preferred projects
            const teamMap = new Map();
            
            // Query each preferred project separately
            for (const projectKey of preferredProjectKeys) {
                console.log(`Querying teams for project: ${projectKey}...`);
                const jql = `project = ${projectKey} AND cf[10114] IS NOT EMPTY`;
                
                const searchResponse = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        endpoint: `/search?jql=${encodeURIComponent(jql)}&maxResults=5000&fields=customfield_10114`,
                        options: { method: 'GET' }
                    })
                });

                if (!searchResponse.ok) {
                    console.warn(`Failed to query project ${projectKey}:`, await searchResponse.text());
                    continue; // Skip this project and continue with others
                }

                const searchData = await searchResponse.json();
                console.log(`Processing ${searchData.issues?.length || 0} issues from ${projectKey}...`);

                // Extract unique team values from this project's issues
                if (searchData.issues && Array.isArray(searchData.issues)) {
                    searchData.issues.forEach(issue => {
                        const teamField = issue.fields.customfield_10114;
                        if (teamField) {
                            let teamValue = '';
                            if (typeof teamField === 'string') {
                                teamValue = teamField;
                            } else if (teamField.value) {
                                teamValue = teamField.value;
                            } else if (teamField.name) {
                                teamValue = teamField.name;
                            }
                            if (teamValue && !teamMap.has(teamValue)) {
                                teamMap.set(teamValue, {
                                    value: teamValue,
                                    id: teamField.id || teamValue
                                });
                            }
                        }
                    });
                }
            }

            const teamOptions = Array.from(teamMap.values());
            if (teamOptions.length === 0) {
                console.warn('⚠️ No team values found in issues');
                throw new Error('No teams found in issues. Ensure issues have the Team field populated.');
            }
            console.log('✅ Found ' + teamOptions.length + ' unique teams (query defaults)');

            teamOptions.sort((a, b) => a.value.localeCompare(b.value));

            dropdown.innerHTML = '<option value="">-- Select a Team --</option>' +
                teamOptions.map(t => `<option value="${this.escapeHtml(t.value)}">${this.escapeHtml(t.value)}</option>`).join('');

            const currentValue = this.getStorage('defaultTeam');
            if (currentValue) {
                dropdown.value = currentValue;
            }

            this.showMessage('queryConfigResult', `Loaded ${teamOptions.length} teams`, 'success');

        } catch (error) {
            console.error('Error loading teams:', error);
            this.showMessage('queryConfigResult', `Error: ${error.message}`, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Trigger file input for import
     */
    importConfig() {
        const fileInput = document.getElementById('importFileInput');
        if (fileInput) {
            fileInput.click();
        }
    }

    /**
     * Export configuration to JSON file (override to exclude connection settings)
     */
    exportConfig() {
        // Get preferred projects info
        const preferredProjectsInfo = this.getStorage('preferredProjectsInfo');
        const preferredProjects = preferredProjectsInfo ? JSON.parse(preferredProjectsInfo) : [];
        
        // Get preferred teams info
        const preferredTeamsInfo = this.getStorage('preferredTeamsInfo');
        const preferredTeams = preferredTeamsInfo ? JSON.parse(preferredTeamsInfo) : [];
        
        const config = {
            version: '1.0',
            defaultProjectKey: this.getStorage('defaultProjectKey'),
            defaultTeam: this.getStorage('defaultTeam'),
            maxResults: this.getStorage('maxResults'),
            jqlTemplates: this.getTemplates(),
            preferredProjects: preferredProjects,
            preferredTeams: preferredTeams,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jira-status-summary-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage('Configuration exported successfully!', 'success');
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

            // Validate import data - check if it has at least some configuration data
            const hasValidData = importData.defaultProjectKey || 
                                 importData.defaultTeam || 
                                 importData.maxResults || 
                                 importData.jqlTemplates || 
                                 importData.preferredProjects || 
                                 importData.preferredTeams;
            
            if (!hasValidData) {
                throw new Error('Invalid file format: no configuration data found');
            }

            // Ask user if they want to merge or replace
            const userChoice = confirm(
                'This will import the configuration.\\n\\n' +
                'Click OK to REPLACE current settings.\\n' +
                'Click Cancel to abort.'
            );

            if (!userChoice) {
                return;
            }

            // Import configuration (excluding connection settings)
            if (importData.defaultProjectKey) {
                this.setStorage('defaultProjectKey', importData.defaultProjectKey);
            }
            if (importData.defaultTeam) {
                this.setStorage('defaultTeam', importData.defaultTeam);
            }
            if (importData.maxResults) {
                this.setStorage('maxResults', importData.maxResults);
            }
            if (importData.jqlTemplates) {
                this.setStorage('jqlTemplates', JSON.stringify(importData.jqlTemplates));
            }
            if (importData.preferredProjects && Array.isArray(importData.preferredProjects)) {
                // Extract just the keys for backward compatibility
                const projectKeys = importData.preferredProjects.map(p => typeof p === 'string' ? p : p.key);
                this.setStorage('preferredProjects', JSON.stringify(projectKeys));
                // Save full info if available
                this.setStorage('preferredProjectsInfo', JSON.stringify(importData.preferredProjects));
            }
            if (importData.preferredTeams && Array.isArray(importData.preferredTeams)) {
                // Extract just the values for backward compatibility
                const teamValues = importData.preferredTeams.map(t => typeof t === 'string' ? t : t.value);
                this.setStorage('preferredTeams', JSON.stringify(teamValues));
                // Save full info if available
                this.setStorage('preferredTeamsInfo', JSON.stringify(importData.preferredTeams));
            }

            // Reload page to show imported settings
            showMessage('Configuration imported successfully!', 'success');
            location.reload();

        } catch (error) {
            console.error('❌ Import error:', error);
            showMessage(`Import failed: ${error.message}`, 'error');
        }

        // Reset file input
        event.target.value = '';
    }
}

// Helper for showing status messages on this page
function showMessage(message, type = 'info') {
    const el = document.getElementById('querySaveResult') || document.getElementById('preferredProjectsSaveResult') || document.getElementById('templateSaveResult');
    if (el) {
        el.textContent = message;
        el.className = 'status-message ' + (type === 'error' ? 'error' : 'success');
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    } else {
        console.log(message);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.setupManager = new StatusSummarySetupManager();
});
