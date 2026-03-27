/* ===========================
   JQL Status Summary Setup Page
   =========================== */

class JQLStatusSummarySetupManager extends SetupManager {
    constructor() {
        // Call parent constructor first (skip auto-init)
        super(false);
        // Override storage prefix for JQL status summary
        this.storagePrefix = 'jql_status_summary_';
        // Initialize editing state
        this.currentEditingTemplateId = null;
        // Migrate values from main setup (excluding connection details)
        this.migrateFromMainSetup();
        this.init();
    }

    /**
     * Migrate configuration from main setup (skip connection settings)
     */
    migrateFromMainSetup() {
        const mainPrefix = 'jira_';
        const summaryPrefix = 'jql_status_summary_';
        
        // Keys to migrate (excluding jiraUrl, username, apiToken, bearerToken, authType)
        const keysToMigrate = [
            'defaultProjectKey',
            'defaultTeam',
            'maxResults',
            'preferredProjects',
            'preferredTeams',
            'jqlTemplates'
        ];

        // Only migrate if JQL status summary storage is empty
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
        this.displaySavedPreferredStatuses();
        this.loadUserInfo();
    }

    /**
     * Override getStorage to use page-specific prefix for templates
     */
    getStorage(key) {
        // Use JQL-specific prefix for all settings including jqlTemplates
        return localStorage.getItem(this.storagePrefix + key);
    }

    /**
     * Override setStorage to use page-specific prefix for templates
     */
    setStorage(key, value) {
        // Use JQL-specific prefix for all settings including jqlTemplates
        localStorage.setItem(this.storagePrefix + key, value);
    }

    /**
     * Override event listeners to remove connection-related handlers
     */
    initializeEventListeners() {
        // Navigation - go back to JQL status summary page
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            // Remove existing listener and add new one
            backBtn.replaceWith(backBtn.cloneNode(true));
            document.getElementById('backBtn').addEventListener('click', () => {
                window.location.href = 'jql_status_summary.html';
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

        // Preferred statuses
        const loadPreferredStatusesBtn = document.getElementById('loadPreferredStatusesBtn');
        if (loadPreferredStatusesBtn) {
            loadPreferredStatusesBtn.addEventListener('click', () => this.loadPreferredStatuses());
        }

        const savePreferredStatusesBtn = document.getElementById('savePreferredStatusesBtn');
        if (savePreferredStatusesBtn) {
            savePreferredStatusesBtn.addEventListener('click', () => this.savePreferredStatuses());
        }

        const clearPreferredStatusesBtn = document.getElementById('clearPreferredStatusesBtn');
        if (clearPreferredStatusesBtn) {
            clearPreferredStatusesBtn.addEventListener('click', () => this.clearPreferredStatusesSelection());
        }

        const preferredStatusesSearch = document.getElementById('preferredStatusesSearch');
        if (preferredStatusesSearch) {
            preferredStatusesSearch.addEventListener('input', (e) => this.filterPreferredStatuses(e.target.value));
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
     * Get connection settings from main jira storage (not JQL status summary storage)
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
     * Load statuses for preferred status selection
     */
    async loadPreferredStatuses() {
        const btn = document.getElementById('loadPreferredStatusesBtn');
        const container = document.getElementById('preferredStatusesContainer');
        const statusesList = document.getElementById('preferredStatusesList');
        const originalText = btn.textContent;

        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            const proxyUrl = this.getConnectionStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please configure JIRA connection in the main setup page first');
            }

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

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    endpoint: '/status',
                    options: { method: 'GET' }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Statuses load error:', errorText);
                throw new Error(`Failed to load statuses: ${errorText}`);
            }

            const data = await response.json();
            const statusArray = Array.isArray(data) ? data : (data.values || []);

            if (!Array.isArray(statusArray) || statusArray.length === 0) {
                throw new Error('No statuses found');
            }

            const statusMap = new Map();
            statusArray.forEach(status => {
                const id = status.id != null ? String(status.id) : status.name;
                if (!statusMap.has(id)) {
                    statusMap.set(id, status);
                }
            });

            const statuses = Array.from(statusMap.values()).sort((a, b) => {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });

            const savedPreferred = this.getStorage('preferredStatuses');
            const preferredIds = savedPreferred ? JSON.parse(savedPreferred) : [];

            statusesList.innerHTML = statuses
                .map(status => {
                    const id = status.id != null ? String(status.id) : status.name;
                    const name = status.name || id;
                    const category = status.statusCategory?.name || 'Unknown';
                    const isPreferred = preferredIds.includes(id);
                    return `
                        <label class="team-checkbox-label">
                            <input
                                type="checkbox"
                                class="status-checkbox"
                                value="${this.escapeHtml(id)}"
                                data-name="${this.escapeHtml(name)}"
                                data-category="${this.escapeHtml(category)}"
                                ${isPreferred ? 'checked' : ''}
                            >
                            <span class="team-info">
                                <strong>${this.escapeHtml(name)}</strong>
                                <span>${this.escapeHtml(category)}</span>
                            </span>
                        </label>
                    `;
                })
                .join('');

            const searchInput = document.getElementById('preferredStatusesSearch');
            if (searchInput) {
                searchInput.value = '';
            }

            container.hidden = false;
            this.showMessage('preferredStatusesSaveResult', `Loaded ${statuses.length} statuses. Select your preferred ones.`, 'success');

        } catch (error) {
            console.error('Error loading statuses:', error);
            this.showMessage('preferredStatusesSaveResult', `Error: ${error.message}`, 'error');
            container.hidden = true;
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Filter preferred status list by search query
     */
    filterPreferredStatuses(query) {
        const statusesList = document.getElementById('preferredStatusesList');
        if (!statusesList) {
            return;
        }

        const normalized = String(query || '').trim().toLowerCase();
        const items = statusesList.querySelectorAll('.status-checkbox');

        items.forEach(checkbox => {
            const label = checkbox.closest('label');
            if (!label) return;

            const name = checkbox.dataset.name || '';
            const category = checkbox.dataset.category || '';
            const haystack = `${name} ${category}`.toLowerCase();
            label.style.display = normalized === '' || haystack.includes(normalized) ? '' : 'none';
        });
    }

    /**
     * Save preferred statuses selection
     */
    savePreferredStatuses() {
        const checkboxes = document.querySelectorAll('.status-checkbox:checked');
        const newSelectedIds = new Set(Array.from(checkboxes).map(cb => String(cb.value)));

        if (newSelectedIds.size === 0) {
            this.showMessage('preferredStatusesSaveResult', 'Please select at least one status', 'error');
            return;
        }

        // Get the currently saved statuses to preserve their order
        const currentSavedInfo = this.getStorage('preferredStatusesInfo');
        let preferredStatuses = [];

        if (currentSavedInfo) {
            // Start with existing saved statuses that are still checked, preserving their order
            const currentSaved = JSON.parse(currentSavedInfo);
            const preservedStatuses = currentSaved.filter(status => newSelectedIds.has(String(status.id)));
            preferredStatuses = preservedStatuses;
            
            console.log('📦 Preserved order:', preferredStatuses.map(s => s.name || s.id));
        }

        // Add any newly selected statuses that weren't in the saved list
        const existingIds = new Set(preferredStatuses.map(s => String(s.id)));
        const newCheckboxes = Array.from(checkboxes).filter(cb => !existingIds.has(String(cb.value)));
        
        newCheckboxes.forEach(cb => {
            preferredStatuses.push({
                id: cb.value,
                name: cb.dataset.name,
                category: cb.dataset.category
            });
        });

        console.log('✅ Final order:', preferredStatuses.map(s => s.name || s.id));

        const statusIds = preferredStatuses.map(status => status.id);
        this.setStorage('preferredStatuses', JSON.stringify(statusIds));
        this.setStorage('preferredStatusesInfo', JSON.stringify(preferredStatuses));

        this.showMessage('preferredStatusesSaveResult', `Saved ${preferredStatuses.length} preferred status(es)!`, 'success');
        this.displaySavedPreferredStatuses();
        this.updateStorageInfo();
    }

    /**
     * Clear preferred statuses selection
     */
    clearPreferredStatusesSelection() {
        const checkboxes = document.querySelectorAll('.status-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
    }

    /**
     * Display saved preferred statuses
     */
    displaySavedPreferredStatuses() {
        const container = document.getElementById('savedPreferredStatuses');
        const listElement = document.getElementById('savedPreferredStatusesList');

        if (!container || !listElement) {
            return;
        }

        const preferredStatusesInfo = this.getStorage('preferredStatusesInfo');
        console.log('📦 Loading preferredStatusesInfo:', preferredStatusesInfo);
        
        if (!preferredStatusesInfo) {
            container.hidden = true;
            return;
        }

        const statuses = JSON.parse(preferredStatusesInfo);
        console.log('✅ Parsed statuses (order):', statuses.map(s => s.name || s.id));
        
        if (statuses.length === 0) {
            container.hidden = true;
            return;
        }

        listElement.innerHTML = statuses.map(status => `
            <div class="saved-team-item" data-status-id="${this.escapeHtml(status.id)}" draggable="true">
                <span class="drag-handle">⋮⋮</span>
                <span class="team-name">${this.escapeHtml(status.name)}</span>
                <button class="btn btn-small btn-danger" data-action="delete-status" data-status-id="${this.escapeHtml(status.id)}">
                    🗑️ Delete
                </button>
            </div>
        `).join('');

        // Attach drag and drop event listeners to new items
        this.attachDragDropListeners();
        
        // Attach delete button event listener using event delegation
        this.attachDeleteListener();

        container.hidden = false;
    }

    /**
     * Attach drag and drop listeners to status items
     */
    attachDragDropListeners() {
        const listElement = document.getElementById('savedPreferredStatusesList');
        if (!listElement) return;
        
        const items = listElement.querySelectorAll('.saved-team-item');
        items.forEach(item => {
            item.addEventListener('dragstart', (e) => this.handleStatusDragStart(e));
            item.addEventListener('dragover', (e) => this.handleStatusDragOver(e));
            item.addEventListener('drop', (e) => this.handleStatusDrop(e));
            item.addEventListener('dragend', (e) => this.handleStatusDragEnd(e));
        });
    }

    /**
     * Attach delete button event listener
     */
    attachDeleteListener() {
        const listElement = document.getElementById('savedPreferredStatusesList');
        if (!listElement) return;
        
        listElement.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="delete-status"]')) {
                const statusId = e.target.closest('[data-action="delete-status"]').getAttribute('data-status-id');
                this.deletePreferredStatus(statusId);
            }
        });
    }

    /**
     * Handle drag start for status items
     */
    handleStatusDragStart(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
        e.currentTarget.classList.add('dragging');
        this.draggedStatusItem = e.currentTarget;
    }

    /**
     * Handle drag over for status items
     */
    handleStatusDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const item = e.currentTarget;
        if (item !== this.draggedStatusItem) {
            item.classList.add('drag-over');
        }
    }

    /**
     * Handle drop for status items
     */
    handleStatusDrop(e) {
        e.preventDefault();
        const dropTarget = e.currentTarget;
        
        if (dropTarget === this.draggedStatusItem) {
            console.log('🎯 Same item - ignoring drop');
            return;
        }

        // Get all items and find indices
        const listElement = document.getElementById('savedPreferredStatusesList');
        const items = Array.from(listElement.querySelectorAll('.saved-team-item'));
        const draggedIndex = items.indexOf(this.draggedStatusItem);
        const targetIndex = items.indexOf(dropTarget);

        console.log('🎯 Drop event:', {
            draggedIndex,
            targetIndex,
            draggedId: this.draggedStatusItem?.getAttribute('data-status-id'),
            targetId: dropTarget?.getAttribute('data-status-id')
        });

        if (draggedIndex !== -1 && targetIndex !== -1) {
            // Insert dragged item before or after target based on position
            if (draggedIndex < targetIndex) {
                console.log('📍 Inserting after target');
                dropTarget.parentNode.insertBefore(this.draggedStatusItem, dropTarget.nextSibling);
            } else {
                console.log('📍 Inserting before target');
                dropTarget.parentNode.insertBefore(this.draggedStatusItem, dropTarget);
            }

            console.log('📋 New DOM order:', 
                Array.from(listElement.querySelectorAll('.saved-team-item'))
                    .map(item => item.getAttribute('data-status-id')));

            // Update storage with new order
            this.reorderPreferredStatuses();
        }

        dropTarget.classList.remove('drag-over');
    }

    /**
     * Handle drag end for status items
     */
    handleStatusDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        const listElement = document.getElementById('savedPreferredStatusesList');
        const items = listElement.querySelectorAll('.saved-team-item');
        items.forEach(item => item.classList.remove('drag-over'));
    }

    /**
     * Reorder preferred statuses based on DOM order and save
     */
    reorderPreferredStatuses() {
        try {
            const listElement = document.getElementById('savedPreferredStatusesList');
            if (!listElement) {
                console.warn('List element not found');
                return;
            }
            
            const items = listElement.querySelectorAll('.saved-team-item');
            const reorderedIds = Array.from(items).map(item => {
                const id = item.getAttribute('data-status-id');
                // Keep as string for consistency
                return String(id);
            });

            console.log('📋 Reordered IDs (from DOM):', reorderedIds);

            // Get current info and reorder it
            const preferredStatusesInfo = this.getStorage('preferredStatusesInfo');
            if (!preferredStatusesInfo) {
                console.warn('No preferred statuses info found');
                return;
            }

            const allStatuses = JSON.parse(preferredStatusesInfo);
            console.log('📦 All statuses before reordering:', allStatuses.map(s => ({ id: s.id, name: s.name })));
            
            const reorderedStatuses = reorderedIds.map(id => {
                const found = allStatuses.find(status => String(status.id) === String(id));
                console.log(`🔍 Looking for ID "${id}", found:`, !!found);
                return found;
            }).filter(status => status !== undefined);

            console.log('📦 Reordered statuses:', reorderedStatuses.map(s => s.name || s.id));

            this.setStorage('preferredStatuses', JSON.stringify(reorderedIds));
            this.setStorage('preferredStatusesInfo', JSON.stringify(reorderedStatuses));
            
            // Show success message
            this.showMessage('preferredStatusesSaveResult', 'Status order updated.', 'success');
            console.log('✅ Status order saved successfully');
        } catch (error) {
            console.error('❌ Error in reorderPreferredStatuses:', error);
            this.showMessage('preferredStatusesSaveResult', 'Error updating order: ' + error.message, 'error');
        }
    }

    /**
     * Delete a preferred status from storage
     */
    deletePreferredStatus(statusId) {
        try {
            console.log('🗑️ deletePreferredStatus called with ID:', statusId);
            
            const preferredStatusesInfo = this.getStorage('preferredStatusesInfo');
            if (!preferredStatusesInfo) {
                console.warn('No preferred statuses found');
                return;
            }

            const statuses = JSON.parse(preferredStatusesInfo);
            const filteredStatuses = statuses.filter(status => String(status.id) !== String(statusId));
            const statusIds = filteredStatuses.map(status => status.id);

            this.setStorage('preferredStatuses', JSON.stringify(statusIds));
            this.setStorage('preferredStatusesInfo', JSON.stringify(filteredStatuses));

            const checkbox = document.querySelector(`.status-checkbox[value="${CSS.escape(String(statusId))}"]`);
            if (checkbox) {
                checkbox.checked = false;
            }

            this.displaySavedPreferredStatuses();
            this.updateStorageInfo();
            this.showMessage('preferredStatusesSaveResult', 'Preferred status removed.', 'success');
            console.log('✅ Status removed successfully');
        } catch (error) {
            console.error('❌ Error in deletePreferredStatus:', error);
            this.showMessage('preferredStatusesSaveResult', 'Error removing status: ' + error.message, 'error');
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

        // Get preferred statuses info
        const preferredStatusesInfo = this.getStorage('preferredStatusesInfo');
        const preferredStatuses = preferredStatusesInfo ? JSON.parse(preferredStatusesInfo) : [];
        
        const config = {
            version: '1.0',
            defaultProjectKey: this.getStorage('defaultProjectKey'),
            defaultTeam: this.getStorage('defaultTeam'),
            maxResults: this.getStorage('maxResults'),
            jqlTemplates: this.getTemplates(),
            preferredProjects: preferredProjects,
            preferredTeams: preferredTeams,
            preferredStatuses: preferredStatuses,
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jql-status-summary-config-${new Date().toISOString().split('T')[0]}.json`;
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
                                 importData.preferredTeams ||
                                 importData.preferredStatuses;
            
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
            if (importData.preferredStatuses && Array.isArray(importData.preferredStatuses)) {
                const statusIds = importData.preferredStatuses.map(s => typeof s === 'string' ? s : s.id);
                this.setStorage('preferredStatuses', JSON.stringify(statusIds));
                this.setStorage('preferredStatusesInfo', JSON.stringify(importData.preferredStatuses));
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
    const el = document.getElementById('querySaveResult') ||
        document.getElementById('preferredProjectsSaveResult') ||
        document.getElementById('preferredStatusesSaveResult') ||
        document.getElementById('templateSaveResult');
    if (el) {
        el.textContent = message;
        el.className = 'status-message ' + (type === 'error' ? 'error' : 'success');
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    } else {
        console.log(message);
    }
}

// Initialize immediately (DOMContentLoaded may have already fired since this script loads after setup.js)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.setupManager = new JQLStatusSummarySetupManager();
    });
} else {
    window.setupManager = new JQLStatusSummarySetupManager();
}
