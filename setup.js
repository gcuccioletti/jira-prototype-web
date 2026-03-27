/* ===========================
   Setup Page Application
   =========================== */

class SetupManager {
    constructor(autoInit = true) {
        this.storagePrefix = 'jira_';
        this.currentEditingTemplateId = null;
        if (autoInit) {
            this.init();
        }
    }

    /**
     * Initialize the setup manager
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
     * Initialize all event listeners
     */
    initializeEventListeners() {
        // Navigation
        document.getElementById('backBtn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        // Server config
        document.getElementById('serverConfigForm').addEventListener('submit', (e) => this.saveServerConfig(e));
        document.getElementById('testConnectionBtn').addEventListener('click', () => this.testConnection());

        // Auth config
        document.getElementById('authType').addEventListener('change', (e) => this.handleAuthTypeChange(e));
        document.getElementById('authConfigForm').addEventListener('submit', (e) => this.saveAuthConfig(e));

        // Query defaults
        document.getElementById('queryConfigForm').addEventListener('submit', (e) => this.saveQueryConfig(e));
        document.getElementById('loadProjectsBtn').addEventListener('click', () => this.loadProjects());
        document.getElementById('projectDropdown').addEventListener('change', (e) => this.handleProjectSelection(e));
        document.getElementById('loadTeamsBtn').addEventListener('click', () => this.loadTeams());
        document.getElementById('teamDropdown').addEventListener('change', (e) => this.handleTeamSelection(e));

        // Preferred projects
        document.getElementById('loadPreferredProjectsBtn').addEventListener('click', () => this.loadPreferredProjects());
        document.getElementById('savePreferredProjectsBtn').addEventListener('click', () => this.savePreferredProjects());
        document.getElementById('clearPreferredProjectsBtn').addEventListener('click', () => this.clearPreferredProjectsSelection());

        // Preferred teams
        document.getElementById('loadPreferredTeamsBtn').addEventListener('click', () => this.loadPreferredTeams());
        document.getElementById('savePreferredTeamsBtn').addEventListener('click', () => this.savePreferredTeams());
        document.getElementById('clearPreferredTeamsBtn').addEventListener('click', () => this.clearPreferredTeamsSelection());

        // JQL templates
        document.getElementById('jqlTemplateForm').addEventListener('submit', (e) => this.saveJqlTemplate(e));
        const templateNameInput = document.getElementById('templateName');
        if (templateNameInput) {
            templateNameInput.addEventListener('input', () => this.autoSaveTemplateDraft());
        }
        const templateQueryInput = document.getElementById('templateQuery');
        if (templateQueryInput) {
            templateQueryInput.addEventListener('input', () => this.autoSaveTemplateDraft());
        }

        // Data management
        document.getElementById('exportConfigBtn').addEventListener('click', () => this.exportConfig());
        document.getElementById('importConfigBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => this.importConfig(e));
        document.getElementById('recoverConfigBtn').addEventListener('click', () => this.recoverConfigFromServer());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllSettings());

        // Auto-save settings on change
        const jiraUrlInput = document.getElementById('jiraUrl');
        if (jiraUrlInput) {
            jiraUrlInput.addEventListener('input', () => this.autoSaveServerConfig());
        }
        const proxyUrlInput = document.getElementById('proxyUrl');
        if (proxyUrlInput) {
            proxyUrlInput.addEventListener('input', () => this.autoSaveServerConfig());
        }

        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.addEventListener('input', () => this.autoSaveAuthConfig());
        }
        const apiTokenInput = document.getElementById('apiToken');
        if (apiTokenInput) {
            apiTokenInput.addEventListener('input', () => this.autoSaveAuthConfig());
        }
        const bearerTokenInput = document.getElementById('bearerToken');
        if (bearerTokenInput) {
            bearerTokenInput.addEventListener('input', () => this.autoSaveAuthConfig());
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
    }

    /**
     * Load stored configuration
     */
    loadStoredConfig() {
        // Server config
        const jiraUrl = this.getStorage('jiraUrl') || '';
        const proxyUrl = this.getStorage('proxyUrl') || 'http://localhost:3000/api/jira';
        document.getElementById('jiraUrl').value = jiraUrl;
        document.getElementById('proxyUrl').value = proxyUrl;

        // Auth config
        const authType = this.getStorage('authType') || 'basic';
        const username = this.getStorage('username') || '';
        const apiToken = this.getStorage('apiToken') || '';
        const bearerToken = this.getStorage('bearerToken') || '';
        
        document.getElementById('authType').value = authType;
        document.getElementById('username').value = username;
        document.getElementById('apiToken').value = apiToken;
        document.getElementById('bearerToken').value = bearerToken;
        this.toggleAuthFields(authType);

        // Query defaults
        const defaultProjectKey = this.getStorage('defaultProjectKey') || '';
        const defaultTeam = this.getStorage('defaultTeam') || '';
        const maxResults = this.getStorage('maxResults') || '1000';
        
        document.getElementById('defaultProjectKey').value = defaultProjectKey;
        document.getElementById('defaultTeam').value = defaultTeam;
        document.getElementById('maxResults').value = maxResults;

        // JQL template draft
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
     * Toggle authentication fields based on auth type
     */
    toggleAuthFields(authType) {
        const basicFields = document.getElementById('basicAuthFields');
        const bearerFields = document.getElementById('bearerAuthFields');

        if (authType === 'basic') {
            basicFields.style.display = 'block';
            bearerFields.style.display = 'none';
        } else if (authType === 'bearer') {
            basicFields.style.display = 'none';
            bearerFields.style.display = 'block';
        } else {
            basicFields.style.display = 'none';
            bearerFields.style.display = 'none';
        }
    }

    /**
     * Handle auth type changes and auto-save
     */
    handleAuthTypeChange(event) {
        const authType = event.target.value;
        this.toggleAuthFields(authType);
        this.autoSaveAuthConfig();
    }

    /**
     * Auto-save server configuration values
     */
    autoSaveServerConfig() {
        const jiraUrlInput = document.getElementById('jiraUrl');
        const proxyUrlInput = document.getElementById('proxyUrl');

        const jiraUrl = jiraUrlInput ? jiraUrlInput.value.trim().replace(/\/$/, '') : '';
        const proxyUrl = proxyUrlInput ? proxyUrlInput.value.trim() : '';

        this.setStorage('jiraUrl', jiraUrl);
        this.setStorage('proxyUrl', proxyUrl);
        this.updateStorageInfo();
    }

    /**
     * Auto-save authentication configuration values
     */
    autoSaveAuthConfig() {
        const authType = document.getElementById('authType')?.value || 'basic';
        this.setStorage('authType', authType);

        if (authType === 'basic') {
            const username = document.getElementById('username')?.value.trim() || '';
            const apiToken = document.getElementById('apiToken')?.value.trim() || '';
            this.setStorage('username', username);
            this.setStorage('apiToken', apiToken);
            this.setStorage('bearerToken', '');
        } else if (authType === 'bearer') {
            const bearerToken = document.getElementById('bearerToken')?.value.trim() || '';
            this.setStorage('bearerToken', bearerToken);
            this.setStorage('username', '');
            this.setStorage('apiToken', '');
        } else {
            this.setStorage('username', '');
            this.setStorage('apiToken', '');
            this.setStorage('bearerToken', '');
        }

        this.updateStorageInfo();
    }

    /**
     * Auto-save query defaults
     */
    autoSaveQueryConfig() {
        const defaultProjectKey = document.getElementById('defaultProjectKey')?.value.trim().toUpperCase() || '';
        const defaultTeam = document.getElementById('defaultTeam')?.value.trim() || '';
        const maxResults = document.getElementById('maxResults')?.value.trim() || '';

        this.setStorage('defaultProjectKey', defaultProjectKey);
        this.setStorage('defaultTeam', defaultTeam);
        this.setStorage('maxResults', maxResults);
        this.updateStorageInfo();
    }

    /**
     * Auto-save JQL template draft
     */
    autoSaveTemplateDraft() {
        const templateName = document.getElementById('templateName')?.value.trim() || '';
        const templateQuery = document.getElementById('templateQuery')?.value.trim() || '';
        this.setStorage('templateDraftName', templateName);
        this.setStorage('templateDraftQuery', templateQuery);
        this.updateStorageInfo();
    }

    /**
     * Save server configuration
     */
    saveServerConfig(event) {
        event.preventDefault();
        
        const jiraUrl = document.getElementById('jiraUrl').value.trim().replace(/\/$/, '');
        const proxyUrl = document.getElementById('proxyUrl').value.trim();

        this.setStorage('jiraUrl', jiraUrl);
        this.setStorage('proxyUrl', proxyUrl);

        this.showMessage('connectionTestResult', 'Server configuration saved successfully!', 'success');
        this.updateStorageInfo();
    }

    /**
     * Test connection to Jira
     */
    async testConnection() {
        const btn = document.getElementById('testConnectionBtn');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = 'Testing...';
            btn.disabled = true;

            const proxyUrl = this.getStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please save server configuration first');
            }

            // Build authentication header - use current form values OR saved values
            const authType = document.getElementById('authType').value || this.getStorage('authType');
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (authType === 'basic') {
                const username = document.getElementById('username').value.trim() || this.getStorage('username');
                const apiToken = document.getElementById('apiToken').value.trim() || this.getStorage('apiToken');
                if (username && apiToken) {
                    headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
                } else {
                    throw new Error('Please enter username and API token for Basic Authentication');
                }
            } else if (authType === 'bearer') {
                const bearerToken = document.getElementById('bearerToken').value.trim() || this.getStorage('bearerToken');
                if (bearerToken) {
                    headers['Authorization'] = `Bearer ${bearerToken}`;
                } else {
                    throw new Error('Please enter a Bearer token');
                }
            } else {
                throw new Error('Please select an authentication type');
            }

            console.log('Testing connection with auth type:', authType);
            console.log('Headers being sent:', { ...headers, Authorization: headers.Authorization ? headers.Authorization.substring(0, 20) + '...' : 'none' });

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    endpoint: '/myself',
                    options: { method: 'GET' }
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.showMessage('connectionTestResult', 
                    `✅ Connection successful! Logged in as: ${data.displayName || data.name || 'User'}`, 
                    'success');
                this.displayUserInfo(data);
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Connection failed');
            }
        } catch (error) {
            this.showMessage('connectionTestResult', 
                `❌ Connection failed: ${error.message}`, 
                'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Load user information from the API
     */
    async loadUserInfo() {
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
                this.displayUserInfo(user);
            }
        } catch (error) {
            // Silently fail - connection not available
            console.debug('Could not load user info:', error.message);
        }
    }

    /**
     * Display user information in header
     */
    displayUserInfo(user) {
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
                const initials = this.generateInitials(displayName);
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
    generateInitials(name) {
        return name.split(' ')
            .map(part => part[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
    }

    /**
     * Save authentication configuration
     */
    saveAuthConfig(event) {
        event.preventDefault();
        
        const authType = document.getElementById('authType').value;
        this.setStorage('authType', authType);

        if (authType === 'basic') {
            const username = document.getElementById('username').value.trim();
            const apiToken = document.getElementById('apiToken').value.trim();
            
            if (!username || !apiToken) {
                this.showMessage('authSaveResult', 'Please fill in all required fields', 'error');
                return;
            }

            this.setStorage('username', username);
            this.setStorage('apiToken', apiToken);
            this.setStorage('bearerToken', '');
        } else if (authType === 'bearer') {
            const bearerToken = document.getElementById('bearerToken').value.trim();
            
            if (!bearerToken) {
                this.showMessage('authSaveResult', 'Please enter a bearer token', 'error');
                return;
            }

            this.setStorage('bearerToken', bearerToken);
            this.setStorage('username', '');
            this.setStorage('apiToken', '');
        } else {
            this.setStorage('username', '');
            this.setStorage('apiToken', '');
            this.setStorage('bearerToken', '');
        }

        this.showMessage('authSaveResult', 
            '✅ Authentication credentials saved securely in browser storage', 
            'success');
        this.updateStorageInfo();
    }

    /**
     * Save query configuration
     */
    saveQueryConfig(event) {
        event.preventDefault();
        
        const defaultProjectKey = document.getElementById('defaultProjectKey').value.trim().toUpperCase();
        const defaultTeam = document.getElementById('defaultTeam').value.trim();
        const maxResults = document.getElementById('maxResults').value.trim();

        this.setStorage('defaultProjectKey', defaultProjectKey);
        this.setStorage('defaultTeam', defaultTeam);
        this.setStorage('maxResults', maxResults);

        this.showMessage('querySaveResult', 'Query defaults saved successfully!', 'success');
        this.updateStorageInfo();
    }

    /**
     * Load projects for preferred projects selection
     */
    async loadPreferredProjects() {
        const btn = document.getElementById('loadPreferredProjectsBtn');
        const container = document.getElementById('preferredProjectsContainer');
        const projectsList = document.getElementById('preferredProjectsList');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            const proxyUrl = this.getStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please save server configuration first');
            }

            // Build authentication header based on saved auth type
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
                throw new Error('Failed to load projects: ' + errorText);
            }

            const data = await response.json();
            console.log('Preferred Projects API response:', data);

            let projects = [];
            if (Array.isArray(data)) {
                projects = data;
            } else if (data.values && Array.isArray(data.values)) {
                projects = data.values;
            } else if (data.projects && Array.isArray(data.projects)) {
                projects = data.projects;
            }

            if (projects.length === 0) {
                throw new Error('No projects found');
            }

            // Sort projects by key
            projects.sort((a, b) => (a.key || '').localeCompare(b.key || ''));

            // Get currently saved preferred projects
            const savedPreferred = this.getStorage('preferredProjects');
            const preferredKeys = savedPreferred ? JSON.parse(savedPreferred) : [];

            // Display projects with checkboxes
            projectsList.innerHTML = projects.map(project => {
                const key = project.key || '';
                const name = project.name || key;
                const isChecked = preferredKeys.includes(key);
                
                return `
                    <label class="project-checkbox-label">
                        <input 
                            type="checkbox" 
                            class="project-checkbox" 
                            value="${this.escapeHtml(key)}"
                            ${isChecked ? 'checked' : ''}
                            data-name="${this.escapeHtml(name)}"
                        >
                        <span class="project-info">
                            <strong>${this.escapeHtml(key)}</strong> - ${this.escapeHtml(name)}
                        </span>
                    </label>
                `;
            }).join('');

            container.hidden = false;
            this.showMessage('preferredProjectsSaveResult', `Loaded ${projects.length} projects. Select your preferred ones.`, 'success');

        } catch (error) {
            console.error('Error loading preferred projects:', error);
            this.showMessage('preferredProjectsSaveResult', `Error: ${error.message}`, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Save preferred projects selection
     */
    savePreferredProjects() {
        const checkboxes = document.querySelectorAll('.project-checkbox:checked');
        const preferredProjects = Array.from(checkboxes).map(cb => ({
            key: cb.value,
            name: cb.dataset.name
        }));

        if (preferredProjects.length === 0) {
            this.showMessage('preferredProjectsSaveResult', 'Please select at least one project', 'error');
            return;
        }

        // Save only the keys for backward compatibility
        const projectKeys = preferredProjects.map(p => p.key);
        this.setStorage('preferredProjects', JSON.stringify(projectKeys));
        
        // Also save full project info for display
        this.setStorage('preferredProjectsInfo', JSON.stringify(preferredProjects));

        this.showMessage('preferredProjectsSaveResult', 
            `Saved ${preferredProjects.length} preferred project(s)!`, 'success');
        
        this.displaySavedPreferredProjects();
        this.updateStorageInfo();
    }

    /**
     * Clear preferred projects selection
     */
    clearPreferredProjectsSelection() {
        const checkboxes = document.querySelectorAll('.project-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
    }

    /**
     * Display saved preferred projects
     */
    displaySavedPreferredProjects() {
        const container = document.getElementById('savedPreferredProjects');
        const listElement = document.getElementById('savedPreferredProjectsList');
        
        const preferredProjectsInfo = this.getStorage('preferredProjectsInfo');
        
        if (!preferredProjectsInfo) {
            container.hidden = true;
            return;
        }

        const projects = JSON.parse(preferredProjectsInfo);
        
        if (projects.length === 0) {
            container.hidden = true;
            return;
        }

        listElement.innerHTML = projects.map(project => `
            <div class="saved-project-item">
                <span class="project-key">${this.escapeHtml(project.key)}</span>
                <span class="project-name">${this.escapeHtml(project.name)}</span>
            </div>
        `).join('');

        container.hidden = false;
    }

    /**
     * Load teams for preferred teams selection
     */
    async loadPreferredTeams() {
        const btn = document.getElementById('loadPreferredTeamsBtn');
        const container = document.getElementById('preferredTeamsContainer');
        const teamsList = document.getElementById('preferredTeamsList');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            const proxyUrl = this.getStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please save server configuration first');
            }

            // Build authentication header based on saved auth type
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

            // Get preferred projects to filter teams by
            const savedPreferredProjects = this.getStorage('preferredProjects');
            const preferredProjectKeys = savedPreferredProjects ? JSON.parse(savedPreferredProjects) : [];
            
            if (preferredProjectKeys.length === 0) {
                throw new Error('Please select and save preferred projects first');
            }

            console.log(`Querying for teams from issues in projects: ${preferredProjectKeys.join(', ')}...`);
            
            // Extract unique team values by querying each project separately
            const teamMap = new Map();
            let totalProcessed = 0;
            let totalTeamsFound = 0;
            
            // Query each preferred project separately to ensure we get teams from all projects
            for (const projectKey of preferredProjectKeys) {
                console.log(`Querying teams for project: ${projectKey}...`);
                const jql = `project = ${projectKey} AND cf[10114] IS NOT EMPTY`;
                
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        endpoint: `/search?jql=${encodeURIComponent(jql)}&maxResults=5000&fields=customfield_10114`,
                        options: { method: 'GET' }
                    })
                });

                if (!response.ok) {
                    console.warn(`Failed to query project ${projectKey}:`, await response.text());
                    continue; // Skip this project and continue with others
                }

                const data = await response.json();
                
                if (!data.issues || !Array.isArray(data.issues)) {
                    console.warn(`No issues returned for project ${projectKey}`);
                    continue;
                }

                console.log(`Processing ${data.issues.length} issues from ${projectKey}...`);
                let projectTeamsFound = 0;

                data.issues.forEach(issue => {
                    totalProcessed++;
                    const teamField = issue.fields.customfield_10114;
                    
                    if (teamField) {
                        projectTeamsFound++;
                        totalTeamsFound++;
                        let teamId = '';
                        let teamValue = '';
                        let teamName = '';
                        
                        if (typeof teamField === 'string') {
                            // If it's just a string, use it as both ID and name
                            teamId = teamField;
                            teamValue = teamField;
                            teamName = teamField;
                        } else if (teamField.id && teamField.value) {
                            // If it's an object with id and value
                            teamId = teamField.id;
                            teamValue = teamField.value;
                            teamName = teamField.name || teamField.value;
                        } else if (teamField.value) {
                            teamValue = teamField.value;
                            teamName = teamField.name || teamField.value;
                            teamId = teamField.id || teamValue;
                        } else if (teamField.name) {
                            teamValue = teamField.name;
                            teamName = teamField.name;
                            teamId = teamField.id || teamName;
                        } else {
                            teamValue = teamField.toString();
                            teamName = teamField.toString();
                            teamId = teamValue;
                        }
                        
                        if (teamValue && !teamMap.has(teamValue)) {
                            teamMap.set(teamValue, { id: teamId, name: teamName });
                        }
                    }
                });
                
                console.log(`Found ${projectTeamsFound} teams in ${projectKey}`);
            }

            console.log(`Processed ${totalProcessed} total issues, found teams in ${totalTeamsFound} issues`);
            console.log(`Extracted ${teamMap.size} unique teams across all projects`);

            if (teamMap.size === 0) {
                throw new Error('No team values found in issues');
            }

            // Convert to array and sort
            const teams = Array.from(teamMap.entries()).map(([value, teamInfo]) => ({
                id: teamInfo.id,
                value,
                name: teamInfo.name
            })).sort((a, b) => a.value.localeCompare(b.value));

            // Get currently saved preferred teams
            const savedPreferred = this.getStorage('preferredTeams');
            const preferredValues = savedPreferred ? JSON.parse(savedPreferred) : [];

            // Display teams with checkboxes
            teamsList.innerHTML = teams.map(team => {
                const isChecked = preferredValues.includes(team.value);
                
                return `
                    <label class="team-checkbox-label">
                        <input 
                            type="checkbox" 
                            class="team-checkbox" 
                            value="${this.escapeHtml(team.value)}"
                            ${isChecked ? 'checked' : ''}
                            data-id="${this.escapeHtml(team.id)}"
                            data-name="${this.escapeHtml(team.name)}"
                        >
                        <span class="team-info">
                            <strong>${this.escapeHtml(team.value)}</strong>${team.value !== team.name ? ' - ' + this.escapeHtml(team.name) : ''}
                        </span>
                    </label>
                `;
            }).join('');

            container.hidden = false;
            this.showMessage('preferredTeamsSaveResult', `Loaded ${teams.length} teams. Select your preferred ones.`, 'success');

            if (data.total > data.maxResults) {
                console.warn(`Warning: Only processed ${data.maxResults} out of ${data.total} total issues. Some teams may be missing.`);
            }

        } catch (error) {
            console.error('Error loading preferred teams:', error);
            this.showMessage('preferredTeamsSaveResult', `Error: ${error.message}`, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Save preferred teams selection
     */
    savePreferredTeams() {
        const checkboxes = document.querySelectorAll('.team-checkbox:checked');
        const preferredTeams = Array.from(checkboxes).map(cb => ({
            id: cb.dataset.id,
            value: cb.value,
            name: cb.dataset.name
        }));

        if (preferredTeams.length === 0) {
            this.showMessage('preferredTeamsSaveResult', 'Please select at least one team', 'error');
            return;
        }

        // Save only the values for backward compatibility
        const teamValues = preferredTeams.map(t => t.value);
        this.setStorage('preferredTeams', JSON.stringify(teamValues));
        
        // Also save full team info for display (including ID)
        this.setStorage('preferredTeamsInfo', JSON.stringify(preferredTeams));

        this.showMessage('preferredTeamsSaveResult', 
            `Saved ${preferredTeams.length} preferred team(s)!`, 'success');
        
        this.displaySavedPreferredTeams();
        this.updateStorageInfo();
    }

    /**
     * Clear preferred teams selection
     */
    clearPreferredTeamsSelection() {
        const checkboxes = document.querySelectorAll('.team-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
    }

    /**
     * Display saved preferred teams
     */
    displaySavedPreferredTeams() {
        const container = document.getElementById('savedPreferredTeams');
        const listElement = document.getElementById('savedPreferredTeamsList');
        
        const preferredTeamsInfo = this.getStorage('preferredTeamsInfo');
        
        if (!preferredTeamsInfo) {
            container.hidden = true;
            return;
        }

        const teams = JSON.parse(preferredTeamsInfo);
        
        if (teams.length === 0) {
            container.hidden = true;
            return;
        }

        listElement.innerHTML = teams.map(team => `
            <div class="saved-team-item">
                <span class="team-value">${this.escapeHtml(team.value)}</span>
                <span class="team-name">${this.escapeHtml(team.name)}</span>
            </div>
        `).join('');

        container.hidden = false;
    }

    /**
     * Load projects from JIRA
     */
    async loadProjects() {
        const btn = document.getElementById('loadProjectsBtn');
        const dropdown = document.getElementById('projectDropdown');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            const proxyUrl = this.getStorage('proxyUrl');
            if (!proxyUrl) {
                throw new Error('Please save server configuration first');
            }

            // Build authentication header based on saved auth type
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

            // Send endpoint without the /rest/api prefix since server adds it
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
                let errorMessage = 'Failed to load projects';
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorJson.message || errorJson.errorMessages?.[0] || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
                console.error('Server error response:', errorText);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log('Projects API response:', data);

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
            }

            console.log(`Found ${projects.length} projects`);

            if (projects.length === 0) {
                this.showMessage('querySaveResult', 
                    '⚠️ No projects found. You may not have access to any projects or the endpoint returned empty results.', 
                    'error');
                return;
            }

            // Clear existing options except the first one
            dropdown.innerHTML = '<option value="">-- Select a project --</option>';

            // Add projects to dropdown
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.key;
                option.textContent = `${project.key} - ${project.name}`;
                option.dataset.projectId = project.id;
                option.dataset.projectName = project.name;
                dropdown.appendChild(option);
            });

            this.showMessage('querySaveResult', 
                `✅ Loaded ${projects.length} project(s) from JIRA`, 
                'success');

        } catch (error) {
            console.error('Error loading projects:', error);
            this.showMessage('querySaveResult', 
                `❌ Failed to load projects: ${error.message}`, 
                'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Handle project selection from dropdown
     */
    handleProjectSelection(event) {
        const selectedKey = event.target.value;
        if (selectedKey) {
            const selectedOption = event.target.options[event.target.selectedIndex];
            const projectName = selectedOption.dataset.projectName;
            
            // Auto-fill the project key input
            const normalizedKey = selectedKey.trim().toUpperCase();
            document.getElementById('defaultProjectKey').value = normalizedKey;
            this.setStorage('defaultProjectKey', normalizedKey);
            this.updateStorageInfo();
            
            // Show feedback
            this.showMessage('querySaveResult', 
                `Selected: ${normalizedKey} - ${projectName}`, 
                'success');
        }
    }

    /**
     * Load teams from JIRA
     */
    async loadTeams() {
        const btn = document.getElementById('loadTeamsBtn');
        const dropdown = document.getElementById('teamDropdown');
        const originalText = btn.textContent;
        
        try {
            btn.textContent = '⏳ Loading...';
            btn.disabled = true;

            const proxyUrl = this.getStorage('proxyUrl');
            const defaultProjectKey = this.getStorage('defaultProjectKey');
            
            if (!proxyUrl) {
                throw new Error('Please save server configuration first');
            }

            // Build authentication header based on saved auth type
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

            // First, get field information to find the team field details
            const fieldResponse = await fetch(proxyUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    endpoint: '/field',
                    options: { method: 'GET' }
                })
            });

            if (!fieldResponse.ok) {
                throw new Error('Failed to fetch field information');
            }

            const fields = await fieldResponse.json();
            console.log('Fields API response:', fields);

            // Find the team field (customfield_10114)
            const teamField = fields.find(f => f.id === 'customfield_10114');

            if (!teamField) {
                throw new Error('Team field (customfield_10114) not found in JIRA.');
            }

            console.log('Team field found:', teamField);

            // Try to get teams from different sources
            let teams = [];

            // Method 1: Check if field has allowedValues
            if (teamField.allowedValues && Array.isArray(teamField.allowedValues)) {
                teams = teamField.allowedValues;
                console.log('Teams from allowedValues:', teams);
            }

            // Method 2: Try getting unique values from actual issues
            if (teams.length === 0) {
                console.log('No allowedValues found, querying issues for unique team values...');
                
                // Build JQL query - get all issues with team field
                let jql = 'cf[10114] IS NOT EMPTY ORDER BY created DESC';
                
                console.log('Executing JQL:', jql);
                
                // Start with higher limit to get more teams
                const maxResults = 5000;
                
                // Encode the full search URL
                const searchParams = new URLSearchParams({
                    jql: jql,
                    fields: 'customfield_10114',
                    maxResults: maxResults.toString()
                });
                
                const issuesResponse = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        endpoint: `/search?${searchParams.toString()}`,
                        options: { method: 'GET' }
                    })
                });

                if (!issuesResponse.ok) {
                    const errorText = await issuesResponse.text();
                    console.error('Issues query failed. Status:', issuesResponse.status);
                    console.error('Error response:', errorText);
                    
                    // Try alternative - just manually enter teams
                    this.showMessage('querySaveResult', 
                        '⚠️ Unable to query issues. Please enter team ID manually or check browser console for details.', 
                        'error');
                    return;
                }

                const issuesData = await issuesResponse.json();
                console.log('Issues response total:', issuesData.total || 0);
                console.log('Issues returned:', issuesData.issues?.length || 0);
                
                if (issuesData.issues && issuesData.issues.length > 0) {
                    console.log('Sample issue fields:', issuesData.issues[0].fields);
                    
                    // Extract unique team values
                    const teamMap = new Map();
                    let processedCount = 0;
                    let skippedCount = 0;
                    
                    issuesData.issues.forEach((issue, index) => {
                        const teamValue = issue.fields?.customfield_10114;
                        
                        if (index < 5) {
                            console.log(`Issue ${issue.key} team value:`, teamValue, 'Type:', typeof teamValue);
                        }
                        
                        if (teamValue) {
                            let teamObj = null;
                            
                            if (typeof teamValue === 'object' && teamValue !== null) {
                                // Handle object format
                                if (teamValue.value || teamValue.name) {
                                    teamObj = {
                                        id: teamValue.id || teamValue.value || teamValue.name,
                                        value: teamValue.value || teamValue.name
                                    };
                                } else if (teamValue.id) {
                                    teamObj = {
                                        id: teamValue.id,
                                        value: teamValue.id
                                    };
                                }
                            } else if (typeof teamValue === 'string') {
                                teamObj = { id: teamValue, value: teamValue };
                            } else if (typeof teamValue === 'number') {
                                teamObj = { id: teamValue.toString(), value: teamValue.toString() };
                            }
                            
                            if (teamObj && teamObj.value) {
                                const key = teamObj.id;
                                if (!teamMap.has(key)) {
                                    teamMap.set(key, teamObj);
                                    processedCount++;
                                }
                            } else {
                                skippedCount++;
                            }
                        }
                    });

                    teams = Array.from(teamMap.values());
                    console.log(`Processing summary: ${processedCount} unique teams, ${skippedCount} skipped values`);
                    console.log('Unique teams extracted:', teams);
                    
                    // Warn if we hit the limit
                    if (issuesData.total > maxResults) {
                        console.warn(`⚠️ Total issues (${issuesData.total}) exceeds query limit (${maxResults}). Some teams may be missing.`);
                    }
                } else {
                    console.log('No issues found with team field populated');
                }
            }

            console.log(`Final team count: ${teams.length}`);

            if (teams.length === 0) {
                this.showMessage('querySaveResult', 
                    '⚠️ No teams found. Check browser console for details. The customfield_10114 may not have values in any issues.', 
                    'error');
                return;
            }

            // Clear existing options except the first one
            dropdown.innerHTML = '<option value="">-- Select a team --</option>';

            // Sort teams alphabetically
            teams.sort((a, b) => {
                const aVal = (a.value || a.name || a.id || '').toString();
                const bVal = (b.value || b.name || b.id || '').toString();
                return aVal.localeCompare(bVal);
            });

            // Add teams to dropdown
            teams.forEach(team => {
                const option = document.createElement('option');
                option.value = team.id || team.value;
                option.textContent = team.value || team.name || team.id;
                option.dataset.teamId = team.id || team.value;
                option.dataset.teamName = team.value || team.name || team.id;
                dropdown.appendChild(option);
            });

            this.showMessage('querySaveResult', 
                `✅ Loaded ${teams.length} team(s) from JIRA`, 
                'success');

        } catch (error) {
            console.error('Error loading teams:', error);
            this.showMessage('querySaveResult', 
                `❌ Failed to load teams: ${error.message}`, 
                'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    /**
     * Handle team selection from dropdown
     */
    handleTeamSelection(event) {
        const selectedId = event.target.value;
        if (selectedId) {
            const selectedOption = event.target.options[event.target.selectedIndex];
            const teamName = selectedOption.dataset.teamName;
            
            // Auto-fill the team ID input
            document.getElementById('defaultTeam').value = selectedId;
            this.setStorage('defaultTeam', selectedId);
            this.updateStorageInfo();
            
            // Show feedback
            this.showMessage('querySaveResult', 
                `Selected: ${teamName} (ID: ${selectedId})`, 
                'success');
        }
    }

    /**
     * Save JQL template (create new or update existing)
     */
    saveJqlTemplate(event) {
        event.preventDefault();
        
        const templateName = document.getElementById('templateName').value.trim();
        const templateQuery = document.getElementById('templateQuery').value.trim();
        const editingId = this.currentEditingTemplateId;

        if (!templateName || !templateQuery) {
            this.showMessage('templateSaveResult', 'Please fill in both template name and query', 'error');
            return;
        }

        const templates = this.getTemplates();
        
        if (editingId) {
            // Update existing template
            const templateIndex = templates.findIndex(t => String(t.id) === String(editingId));
            if (templateIndex !== -1) {
                templates[templateIndex].name = templateName;
                templates[templateIndex].query = templateQuery;
            }
            this.currentEditingTemplateId = null;
            this.showMessage('templateSaveResult', `Template "${templateName}" updated successfully!`, 'success');
        } else {
            // Create new template
            templates.push({
                id: Date.now(),
                name: templateName,
                query: templateQuery,
                createdAt: new Date().toISOString()
            });
            this.showMessage('templateSaveResult', `Template "${templateName}" saved successfully!`, 'success');
        }

        this.setStorage('jqlTemplates', JSON.stringify(templates));
        this.setStorage('templateDraftName', '');
        this.setStorage('templateDraftQuery', '');
        
        document.getElementById('jqlTemplateForm').reset();
        
        // Reset UI after save
        const submitBtn = document.querySelector('#jqlTemplateForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.textContent = '💾 Save Template';
        }
        
        const cancelBtn = document.getElementById('cancelEditTemplateBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
        
        this.currentEditingTemplateId = null;
        
        this.displaySavedTemplates();
        this.updateStorageInfo();
    }

    /**
     * Edit a template - populate form with template data
     */
    editTemplate(id) {
        try {
            console.log('🔧 editTemplate called with ID:', id, 'Type:', typeof id);
            
            const templates = this.getTemplates();
            console.log('📋 Templates found:', templates.length);
            
            const template = templates.find(t => String(t.id) === String(id));
            console.log('🔍 Template found:', !!template);
            
            if (!template) {
                console.warn('❌ Template not found:', id);
                alert('Template not found');
                return;
            }

            // Get form elements
            const templateNameInput = document.getElementById('templateName');
            const templateQueryInput = document.getElementById('templateQuery');
            const jqlTemplateForm = document.getElementById('jqlTemplateForm');
            const submitBtn = jqlTemplateForm ? jqlTemplateForm.querySelector('button[type="submit"]') : null;

            console.log('✅ Form elements found:', {
                templateNameInput: !!templateNameInput,
                templateQueryInput: !!templateQueryInput,
                jqlTemplateForm: !!jqlTemplateForm,
                submitBtn: !!submitBtn
            });

            if (!templateNameInput || !templateQueryInput || !submitBtn) {
                console.warn('❌ Form elements not found');
                alert('Form elements not found. Please ensure the page is fully loaded.');
                return;
            }

            // Populate form with template data
            templateNameInput.value = template.name;
            templateQueryInput.value = template.query;
            
            // Store the ID being edited
            this.currentEditingTemplateId = id;
            
            // Update submit button text
            submitBtn.textContent = '💾 Update Template';
            
            // Add/show cancel button
            let cancelBtn = document.getElementById('cancelEditTemplateBtn');
            if (!cancelBtn) {
                cancelBtn = document.createElement('button');
                cancelBtn.id = 'cancelEditTemplateBtn';
                cancelBtn.type = 'button';
                cancelBtn.className = 'btn btn-secondary';
                cancelBtn.textContent = '❌ Cancel';
                cancelBtn.addEventListener('click', (e) => this.cancelEditTemplate(e));
                submitBtn.insertAdjacentElement('afterend', cancelBtn);
            }
            cancelBtn.style.display = '';
            
            // Scroll to form
            jqlTemplateForm.scrollIntoView({ behavior: 'smooth' });
            
            // Focus on name field
            templateNameInput.focus();
            
            console.log('✅ Edit mode activated for template:', template.name);
        } catch (error) {
            console.error('❌ Error in editTemplate:', error);
            alert('Error editing template: ' + error.message);
        }
    }

    /**
     * Cancel template editing
     */
    cancelEditTemplate(e) {
        if (e) e.preventDefault();
        
        this.currentEditingTemplateId = null;
        
        // Get form elements
        const jqlTemplateForm = document.getElementById('jqlTemplateForm');
        const submitBtn = jqlTemplateForm ? jqlTemplateForm.querySelector('button[type="submit"]') : null;
        const cancelBtn = document.getElementById('cancelEditTemplateBtn');

        if (jqlTemplateForm) {
            jqlTemplateForm.reset();
        }
        
        // Reset submit button text
        if (submitBtn) {
            submitBtn.textContent = '💾 Save Template';
        }
        
        // Hide cancel button
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
    }

    /**
     * Get saved templates
     */
    getTemplates() {
        const templates = this.getStorage('jqlTemplates');
        return templates ? JSON.parse(templates) : [];
    }

    /**
     * Display saved templates
     */
    displaySavedTemplates() {
        const templates = this.getTemplates();
        const templatesList = document.getElementById('templatesList');

        if (templates.length === 0) {
            templatesList.innerHTML = '<p class="no-data">No templates saved yet</p>';
            return;
        }

        templatesList.innerHTML = templates.map(template => {
            const substitutedQuery = this.substituteVariables(template.query);
            const hasVariables = substitutedQuery !== template.query;
            
            return `
            <div class="template-item" data-id="${template.id}">
                <div class="template-info">
                    <h4>${this.escapeHtml(template.name)}</h4>
                    <code>${this.escapeHtml(template.query)}</code>
                    ${hasVariables ? `
                        <div class="template-preview">
                            <small><strong>Preview:</strong> ${this.escapeHtml(substitutedQuery)}</small>
                        </div>
                    ` : ''}
                </div>
                <div class="template-actions">
                    <button class="btn btn-small btn-secondary" data-action="edit-template" data-template-id="${template.id}">
                        ✏️ Edit
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete-template" data-template-id="${template.id}">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
        }).join('');
        
        // Attach event listeners using event delegation
        templatesList.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="edit-template"]')) {
                const templateId = e.target.closest('[data-action="edit-template"]').getAttribute('data-template-id');
                this.editTemplate(templateId);
            } else if (e.target.closest('[data-action="delete-template"]')) {
                const templateId = e.target.closest('[data-action="delete-template"]').getAttribute('data-template-id');
                this.deleteTemplate(templateId);
            }
        });
    }

    /**
     * Replace template variables with saved values
     */
    substituteVariables(query) {
        const defaultProjectKey = this.getStorage('defaultProjectKey') || '';
        const defaultTeam = this.getStorage('defaultTeam') || '';
        
        let result = query;
        result = result.replace(/\{\{PROJECT\}\}/g, defaultProjectKey);
        result = result.replace(/\{\{TEAM\}\}/g, defaultTeam);
        
        return result;
    }

    /**
     * Copy template to clipboard with variable substitution
     */
    copyTemplate(id) {
        const templates = this.getTemplates();
        const template = templates.find(t => t.id === id);
        
        if (template) {
            const substitutedQuery = this.substituteVariables(template.query);
            navigator.clipboard.writeText(substitutedQuery)
                .then(() => {
                    if (substitutedQuery !== template.query) {
                        this.showMessage('templateSaveResult', `Template "${template.name}" copied with variables substituted!`, 'success');
                    } else {
                        this.showMessage('templateSaveResult', `Template "${template.name}" copied to clipboard!`, 'success');
                    }
                })
                .catch(err => this.showMessage('templateSaveResult', 'Failed to copy template', 'error'));
        }
    }

    /**
     * Delete template
     */
    deleteTemplate(id) {
        if (!confirm('Are you sure you want to delete this template?')) {
            return;
        }

        const templates = this.getTemplates();
        const filtered = templates.filter(t => String(t.id) !== String(id));
        
        this.setStorage('jqlTemplates', JSON.stringify(filtered));
        this.displaySavedTemplates();
        this.updateStorageInfo();
    }

    /**
     * Update storage information display
     */
    updateStorageInfo() {
        const storageInfo = document.getElementById('storageInfo');
        const keys = ['jiraUrl', 'proxyUrl', 'authType', 'username', 'apiToken', 
                      'defaultProjectKey', 'defaultTeam', 'maxResults', 'jqlTemplates'];
        
        const stored = keys.filter(key => this.getStorage(key));
        const templates = this.getTemplates();

        storageInfo.innerHTML = `
            <li>Configuration items: ${stored.length}/${keys.length}</li>
            <li>JQL templates: ${templates.length}</li>
            <li>Storage type: localStorage</li>
        `;
    }

    /**
     * Export configuration to JSON file
     */
    exportConfig() {
        const config = {
            jiraUrl: this.getStorage('jiraUrl'),
            proxyUrl: this.getStorage('proxyUrl'),
            authType: this.getStorage('authType'),
            username: this.getStorage('username'),
            apiToken: this.getStorage('apiToken'),
            bearerToken: this.getStorage('bearerToken'),
            defaultProjectKey: this.getStorage('defaultProjectKey'),
            defaultTeam: this.getStorage('defaultTeam'),
            maxResults: this.getStorage('maxResults'),
            jqlTemplates: this.getTemplates(),
            exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jira-config-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showMessage('templateSaveResult', 'Configuration exported successfully!', 'success');
    }

    /**
     * Import configuration from JSON file
     */
    importConfig(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const config = JSON.parse(e.target.result);
                
                if (confirm('This will overwrite your current configuration. Continue?')) {
                    // Import all settings
                    if (config.jiraUrl) this.setStorage('jiraUrl', config.jiraUrl);
                    if (config.proxyUrl) this.setStorage('proxyUrl', config.proxyUrl);
                    if (config.authType) this.setStorage('authType', config.authType);
                    if (config.username) this.setStorage('username', config.username);
                    if (config.apiToken) this.setStorage('apiToken', config.apiToken);
                    if (config.bearerToken) this.setStorage('bearerToken', config.bearerToken);
                    if (config.defaultProjectKey) this.setStorage('defaultProjectKey', config.defaultProjectKey);
                    if (config.defaultTeam) this.setStorage('defaultTeam', config.defaultTeam);
                    if (config.maxResults) this.setStorage('maxResults', config.maxResults);
                    if (config.jqlTemplates) this.setStorage('jqlTemplates', JSON.stringify(config.jqlTemplates));

                    // Reload page to show imported settings
                    this.showMessage('templateSaveResult', 'Configuration imported successfully!', 'success');
                    location.reload();
                }
            } catch (error) {
                this.showMessage('templateSaveResult', 'Failed to import configuration. Invalid file format.', 'error');
            }
        };
        reader.readAsText(file);
    }

    /**
     * Recover configuration from localStorage, then server (.env) if needed
     */
    async recoverConfigFromServer() {
        try {
            this.showMessage('connectionTestResult', '⏳ Recovering configuration...', 'info');

            const localConfig = {
                jiraUrl: this.getStorage('jiraUrl') || '',
                proxyUrl: this.getStorage('proxyUrl') || '',
                authType: this.getStorage('authType') || '',
                username: this.getStorage('username') || '',
                apiToken: this.getStorage('apiToken') || '',
                bearerToken: this.getStorage('bearerToken') || '',
                defaultProjectKey: this.getStorage('defaultProjectKey') || '',
                defaultTeam: this.getStorage('defaultTeam') || '',
                maxResults: this.getStorage('maxResults') || ''
            };

            const requiredKeys = [
                'jiraUrl',
                'proxyUrl',
                'authType',
                'username',
                'apiToken',
                'bearerToken',
                'defaultProjectKey',
                'defaultTeam',
                'maxResults'
            ];
            const missingKeys = requiredKeys.filter((key) => !localConfig[key]);
            const hasLocalValues = Object.values(localConfig).some((value) => value);

            let serverConfig = {};
            if (missingKeys.length > 0) {
                try {
                    const response = await fetch('/api/config/recover');
                    if (!response.ok) {
                        throw new Error('Failed to fetch configuration from server');
                    }
                    serverConfig = await response.json();
                } catch (error) {
                    if (!hasLocalValues) {
                        throw error;
                    }
                    this.showMessage('connectionTestResult', '⚠️ Server recovery failed. Using localStorage values instead.', 'info');
                }
            }

            const config = { ...serverConfig, ...localConfig };

            // Ask for confirmation
            if (!confirm('This will restore your configuration from localStorage and the server if needed. Continue?')) {
                this.showMessage('connectionTestResult', 'Recovery cancelled', 'info');
                return;
            }

            console.log('🔄 Recovering configuration:', config);

            // Restore all settings
            if (config.jiraUrl) this.setStorage('jiraUrl', config.jiraUrl);
            if (config.proxyUrl) this.setStorage('proxyUrl', config.proxyUrl);
            if (config.authType) this.setStorage('authType', config.authType);
            if (config.username) this.setStorage('username', config.username);
            if (config.apiToken) this.setStorage('apiToken', config.apiToken);
            if (config.bearerToken) this.setStorage('bearerToken', config.bearerToken);
            if (config.defaultProjectKey) this.setStorage('defaultProjectKey', config.defaultProjectKey);
            if (config.defaultTeam) this.setStorage('defaultTeam', config.defaultTeam);
            if (config.maxResults) this.setStorage('maxResults', config.maxResults);

            this.showMessage('connectionTestResult', '✅ Configuration recovered from server successfully!', 'success');
            
            // Reload page to show recovered settings
            setTimeout(() => {
                location.reload();
            }, 1500);
        } catch (error) {
            console.error('❌ Recovery error:', error);
            this.showMessage('connectionTestResult', `Error: ${error.message}`, 'error');
        }
    }

    /**
     * Clear all settings
     */
    clearAllSettings() {
        if (!confirm('⚠️ This will delete ALL your saved settings and templates. Are you sure?')) {
            return;
        }

        if (!confirm('This action cannot be undone. Continue?')) {
            return;
        }

        const keys = Object.keys(localStorage).filter(key => key.startsWith(this.storagePrefix));
        keys.forEach(key => localStorage.removeItem(key));

        this.showMessage('templateSaveResult', 'All settings cleared successfully!', 'success');
        location.reload();
    }

    /**
     * Show status message
     */
    showMessage(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `status-message ${type}`;
        element.style.display = 'block';

        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
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
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize setup manager when DOM is loaded
let setupManager;
document.addEventListener('DOMContentLoaded', () => {
    setupManager = new SetupManager();
});
