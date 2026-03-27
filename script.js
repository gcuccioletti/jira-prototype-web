/* ===========================
   Jira Integration Application
   =========================== */

class JiraClient {
    constructor() {
        // Use proxy server instead of direct JIRA API calls
        this.proxyUrl = 'http://localhost:3000/api/jira';
        // Use different storage prefix for status summary pages
        const currentPage = window.location.pathname;
        this.storagePrefix = currentPage.includes('jira_status_summary.html') ? 'jira_status_summary_' : (currentPage.includes('jql_status_summary.html') ? 'jql_status_summary_' : 'jira_');
    }

    /**
     * Get item from localStorage
     */
    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
    }

    /**
     * Build authentication header based on saved configuration
     * Always uses main 'jira_' prefix for connection credentials
     */
    getAuthHeaders() {
        // Always read auth from main setup, not status summary
        const mainPrefix = 'jira_';
        const authType = localStorage.getItem(mainPrefix + 'authType');
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (authType === 'basic') {
            const username = localStorage.getItem(mainPrefix + 'username');
            const apiToken = localStorage.getItem(mainPrefix + 'apiToken');
            if (username && apiToken) {
                headers['Authorization'] = 'Basic ' + btoa(`${username}:${apiToken}`);
            }
        } else if (authType === 'bearer') {
            const bearerToken = localStorage.getItem(mainPrefix + 'bearerToken');
            if (bearerToken) {
                headers['Authorization'] = `Bearer ${bearerToken}`;
            }
        }
        
        return headers;
    }

    /**
     * Make authenticated request to Jira API through proxy server
     */
    async request(endpoint, options = {}) {
        const requestOptions = {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({
                endpoint: endpoint,
                options: {
                    ...options,
                    method: options.method || 'GET'
                }
            })
        };

        try {
            console.log('📡 Proxying request to:', endpoint);
            const response = await fetch(this.proxyUrl, requestOptions);
            const data = await response.json();
            
            if (!response.ok) {
                const errorMessage = data.errorMessages?.[0] || data.error || `API Error: ${response.status}`;
                console.error('❌ Server returned error:', errorMessage);
                throw new Error(errorMessage);
            }
            
            console.log('✅ Connection successful');
            return data;
        } catch (error) {
            console.error('❌ Connection failed:', error.message);
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Cannot connect to proxy server. Make sure Node.js server is running on http://localhost:3000');
            }
            throw error;
        }
    }

    /**
     * Test connection to Jira server
     */
    async testConnection() {
        return this.request('/myself');
    }

    /**
     * Get list of boards
     */
    async getBoards() {
        return this.request('/boards');
    }

    /**
     * Get board by name
     */
    async getBoardByName(name) {
        const boards = await this.getBoards();
        return boards.values.find(board => 
            board.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    /**
     * Get list of boards
     */
    async getBoards() {
        return this.request('/boards');
    }

    /**
     * Get board by name
     */
    async getBoardByName(name) {
        const boards = await this.getBoards();
        return boards.values.find(board => 
            board.name.toLowerCase().includes(name.toLowerCase())
        );
    }

    /**
     * Execute JQL query and get issues
     */
    async searchIssues(jql, maxResults = 1000, includeChangelog = true) {
        const pageSize = 100;
        let startAt = 0;
        let total = Infinity;
        let allIssues = [];
        let lastResponse = null;

        while (startAt < total) {
            const params = new URLSearchParams({
                jql,
                startAt,
                maxResults: pageSize,
                fields: 'key,summary,issuetype,status,priority,assignee,customfield_10200,customfield_10114,customfield_11500,customfield_10115,customfield_17903,project,created,updated,description,fixVersions'
            });

            if (includeChangelog) {
                params.set('expand', 'changelog');
            }

            lastResponse = await this.request(`/search?${params}`);
            const issues = Array.isArray(lastResponse.issues) ? lastResponse.issues : [];
            allIssues = allIssues.concat(issues);

            total = typeof lastResponse.total === 'number' ? lastResponse.total : allIssues.length;
            if (issues.length === 0) {
                break;
            }

            startAt += issues.length;
        }

        return {
            ...lastResponse,
            startAt: 0,
            maxResults: allIssues.length,
            total: allIssues.length,
            issues: allIssues
        };
    }

    /**
     * Get backlog for a project
     */
    async getBacklog(projectKey, teamName = null) {
        let jqlParts = [];
        
        if (projectKey) {
            jqlParts.push(`project = "${projectKey}"`);
        }
        
        jqlParts.push(`type in (Story, Bug, Spike)`);
        
        if (teamName) {
            jqlParts.push(`Team = ${teamName}`);
        }
        
        const jql = jqlParts.join(' AND ') + ' ORDER BY rank ASC';
        return this.searchIssues(jql);
    }

    /**
     * Get in-progress issues
     */
    async getInProgressIssues(projectKey, teamName = null) {
        let jqlParts = [];
        
        if (projectKey) {
            jqlParts.push(`project = "${projectKey}"`);
        }
        jqlParts.push(`type in (Story, Bug, Spike)`);
        jqlParts.push(`statuscategory = "In Progress"`);
        
        if (teamName) {
            jqlParts.push(`Team = ${teamName}`);
        }
        
        const jql = jqlParts.join(' AND ') + ' ORDER BY rank ASC';
        return this.searchIssues(jql);
    }

    /**
     * Get open issues (not closed or done)
     */
    async getOpenIssues(projectKey, teamName = null) {
        let jqlParts = [];
        
        if (projectKey) {
            jqlParts.push(`project = "${projectKey}"`);
        }
        jqlParts.push(`type in (Story, Bug, Spike)`);
        jqlParts.push(`statuscategory NOT IN (Done)`);
        
        if (teamName) {
            jqlParts.push(`Team = ${teamName}`);
        }
        
        const jql = jqlParts.join(' AND ') + ' ORDER BY rank ASC';
        return this.searchIssues(jql);
    }

    /**
     * Get team field
     */
    static getTeam(issue) {
        const team = issue.fields.customfield_10114;
        if (!team) return '-';
        if (typeof team === 'string') return team;
        if (team.value) return team.value;
        if (team.name) return team.name;
        return team.toString();
    }

    /**
     * Get platform field
     */
    static getPlatform(issue) {
        const platform = issue.fields.customfield_11500;
        if (!platform) return '-';
        if (typeof platform === 'string') return platform;
        if (platform.value) return platform.value;
        if (platform.name) return platform.name;
        return platform.toString();
    }

    /**
     * Get project key or name
     */
    static getProject(issue) {
        const project = issue.fields.project;
        if (!project) return '-';
        return project.key || project.name || '-';
    }

    /**
     * Format story points from custom field
     */
    static getStoryPoints(issue) {
        // Customfield_10200 is Story Points in Jira Data Center
        const points = issue.fields.customfield_10200;
        return points || '-';
    }

    /**
     * Get assignee name
     */
    static getAssignee(issue) {
        return issue.fields.assignee?.displayName || 'Unassigned';
    }

    /**
     * Get issue type
     */
    static getIssueType(issue) {
        return issue.fields.issuetype?.name || 'Unknown';
    }

    /**
     * Get status
     */
    static getStatus(issue) {
        return issue.fields.status?.name || 'Unknown';
    }

    /**
     * Get priority
     */
    static getPriority(issue) {
        return issue.fields.priority?.name || 'None';
    }

    /**
     * Get created date
     */
    static getCreatedDate(issue) {
        const created = issue.fields.created;
        if (!created) return '-';
        return new Date(created).toLocaleDateString();
    }

    /**
     * Get last status changed from Jira custom field
     */
    static getLastStatusChanged(issue) {
        const value = issue.fields.customfield_17903;
        if (!value) return '-';
        const parsed = new Date(value);
        if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleString();
        }
        return String(value);
    }

    /**
     * Get aging in days since last status changed
     */
    static getAgingDays(issue) {
        const value = issue.fields.customfield_17903;
        if (!value) return null;

        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
            return null;
        }

        const elapsedMs = Date.now() - parsed.getTime();
        const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
        return Math.max(0, elapsedDays);
    }

    /**
     * Get fix versions
     */
    static getFixVersions(issue) {
        const versions = issue.fields.fixVersions;
        if (!versions || versions.length === 0) return '-';
        return versions.map(v => v.name).join(', ');
    }

    /**
     * Get sprint
     */
    static getSprint(issue) {
        // customfield_10115 is Sprint in this Jira instance
        const sprint = issue.fields.customfield_10115;
        
        if (!sprint) return '-';
        
        // Sprint can be an array of sprint objects
        if (Array.isArray(sprint)) {
            if (sprint.length === 0) return '-';
            // Get the last sprint (most recent)
            const lastSprint = sprint[sprint.length - 1];
            if (typeof lastSprint === 'string') {
                // Parse sprint string format
                const nameMatch = lastSprint.match(/name=([^,\]]+)/);
                return nameMatch ? nameMatch[1] : '-';
            }
            return lastSprint.name || lastSprint.toString();
        }
        
        // Single sprint object
        if (typeof sprint === 'object' && sprint.name) {
            return sprint.name;
        }
        
        // Sprint as string
        if (typeof sprint === 'string') {
            const nameMatch = sprint.match(/name=([^,\]]+)/);
            return nameMatch ? nameMatch[1] : sprint;
        }
        
        return sprint.toString();
    }
}

/**
 * UI Controller for Jira Integration
 */
class JiraUI {
    constructor() {
        this.jiraClient = null;
        this.currentResults = [];
        this.currentPlatformSummary = null;
        this.lastExecutionInfo = null; // Store execution details for export
        this.hasLoadedResults = false; // Track if results have been loaded from a query
        // Use different storage prefix for status summary pages
        const currentPage = window.location.pathname;
        this.storagePrefix = currentPage.includes('jira_status_summary.html') ? 'jira_status_summary_' : (currentPage.includes('jql_status_summary.html') ? 'jql_status_summary_' : 'jira_');
        this.summarySortState = { column: 'platform', ascending: true };
        this.platformStatusSortState = { column: 'platform', ascending: true };
        this.projectStatusSortState = { column: 'total', ascending: false };
        this.projectTeamStatusSortState = { column: 'project', ascending: true };
        this.issuesTableSortState = { column: null, ascending: true };
        this.summaryChartInstance = null;
        this.platformStatusChartInstance = null;
        this.currentPlatformStatusSummary = null;
        this.initializeEventListeners();
        this.loadTemplates();
        this.loadPreferredProjects();
        this.loadPreferredTeams();
        this.loadCheckboxPreferences();
        
        // Ensure export button is hidden on page load (with slight delay to ensure it runs after any other initialization)
        setTimeout(() => {
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.hidden = true;
                exportBtn.style.display = 'none';
            }
        }, 0);
        
        // Auto-connect on page load
        this.autoConnect();
    }

    /**
     * Load checkbox preferences
     */
    loadCheckboxPreferences() {
        const showPlatformSummary = this.getStorage('showPlatformSummary');
        const summaryCheckbox = document.getElementById('showPlatformSummary');
        if (summaryCheckbox) {
            summaryCheckbox.checked = showPlatformSummary === null || showPlatformSummary === 'true';
        }

        // Load project/team/status summary preference
        const showProjectTeamStatusSummary = this.getStorage('showProjectTeamStatusSummary');
        const projectTeamStatusCheckbox = document.getElementById('showProjectTeamStatusSummary');
        if (projectTeamStatusCheckbox) {
            projectTeamStatusCheckbox.checked = showProjectTeamStatusSummary === null || showProjectTeamStatusSummary === 'true';
        }

        // Load project/status summary preference
        const showProjectStatusSummary = this.getStorage('showProjectStatusSummary');
        const projectStatusCheckbox = document.getElementById('showProjectStatusSummary');
        if (projectStatusCheckbox) {
            projectStatusCheckbox.checked = showProjectStatusSummary === null || showProjectStatusSummary === 'true';
        }

        // Load platform/status summary preference
        const showPlatformStatusSummaryByStatus = this.getStorage('showPlatformStatusSummaryByStatus');
        const platformStatusByStatusCheckbox = document.getElementById('showPlatformStatusSummaryByStatus');
        if (platformStatusByStatusCheckbox) {
            platformStatusByStatusCheckbox.checked = showPlatformStatusSummaryByStatus === null || showPlatformStatusSummaryByStatus === 'true';
        }

        const showPlatformStatusCategorySummary = this.getStorage('showPlatformStatusCategorySummary');
        const platformStatusCategoryCheckbox = document.getElementById('showPlatformStatusCategorySummary');
        if (platformStatusCategoryCheckbox) {
            platformStatusCategoryCheckbox.checked = showPlatformStatusCategorySummary === null || showPlatformStatusCategorySummary === 'true';
        }
    }

    /**
     * Load saved templates into dropdown
     */
    loadTemplates() {
        const templatesJson = this.getStorage('jqlTemplates');
        const templates = templatesJson ? JSON.parse(templatesJson) : [];
        const templateSelect = document.getElementById('templateSelect');

        if (!templateSelect) return;

        // Clear existing options except the first one
        templateSelect.innerHTML = '<option value="">-- Select a template --</option>';

        // Add template options
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = template.name;
            templateSelect.appendChild(option);
        });
    }

    /**
     * Load preferred projects into dropdown
     */
    loadPreferredProjects() {
        const preferredProjectsInfo = this.getStorage('preferredProjectsInfo');
        const projects = preferredProjectsInfo ? JSON.parse(preferredProjectsInfo) : [];
        const projectSelect = document.getElementById('projectKey');

        if (!projectSelect) return;

        // Clear existing options and add default
        projectSelect.innerHTML = '<option value="">-- All Projects --</option>';

        // Add project options
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.key;
            option.textContent = `${project.key} - ${project.name}`;
            projectSelect.appendChild(option);
        });

        // Set default value if saved
        const defaultProjectKey = this.getStorage('defaultProjectKey');
        if (defaultProjectKey && projectSelect) {
            projectSelect.value = defaultProjectKey;
        }
    }

    /**
     * Load preferred teams into dropdown
     */
    loadPreferredTeams() {
        const preferredTeamsInfo = this.getStorage('preferredTeamsInfo');
        const teams = preferredTeamsInfo ? JSON.parse(preferredTeamsInfo) : [];
        const teamSelect = document.getElementById('teamName');

        if (!teamSelect) return;

        // Clear existing options and add default
        teamSelect.innerHTML = '<option value="">-- Select a team --</option>';

        // Add team options - use ID as value for JQL, show name as display
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id || team.value;  // Use ID if available, fallback to value
            option.textContent = team.name;
            option.dataset.teamValue = team.value;  // Store the team value for reference
            teamSelect.appendChild(option);
        });

        // Set default value if saved
        const defaultTeam = this.getStorage('defaultTeam');
        if (defaultTeam && teamSelect) {
            teamSelect.value = defaultTeam;
        }
    }

    /**
     * Handle template selection change
     */
    handleTemplateSelection(event) {
        const loadTemplateBtn = document.getElementById('loadTemplateBtn');
        if (!loadTemplateBtn) return;
        
        const selectedValue = event.target.value;
        
        // Enable/disable load button based on selection
        loadTemplateBtn.disabled = !selectedValue;
    }

    /**
     * Replace template variables with currently selected values
     */
    substituteVariables(query) {
        // Get currently selected values from the form
        const projectKey = document.getElementById('projectKey')?.value || '';
        const team = document.getElementById('teamName')?.value || '';
        
        let result = query;
        result = result.replace(/\{\{PROJECT\}\}/g, projectKey);
        result = result.replace(/\{\{TEAM\}\}/g, team);
        
        return result;
    }

    /**
     * Load selected template into JQL query field
     */
    loadSelectedTemplate() {
        const templateSelect = document.getElementById('templateSelect');
        const selectedId = parseInt(templateSelect.value);
        
        if (!selectedId) return;

        // Clear previous results
        this.clearResults();
        
        // Clear status message
        const statusDiv = document.getElementById('queryStatus');
        statusDiv.style.display = 'none';
        statusDiv.className = '';
        statusDiv.textContent = '';

        const templatesJson = this.getStorage('jqlTemplates');
        const templates = templatesJson ? JSON.parse(templatesJson) : [];
        const template = templates.find(t => t.id === selectedId);

        if (template) {
            const jqlQueryField = document.getElementById('jqlQuery');
            
            jqlQueryField.value = template.query;
            jqlQueryField.focus();
            
            // Show feedback
            this.showNotification(`Template "${template.name}" loaded!`, 'success');
        }
    }

    /**
     * Handle project/team/status summary checkbox toggle
     */
    handleProjectTeamStatusSummaryToggle(event) {
        const isChecked = event.target.checked;
        this.setStorage('showProjectTeamStatusSummary', isChecked.toString());

        const summarySection = document.getElementById('projectTeamStatusSummarySection');
        if (summarySection && !summarySection.hidden) {
            summarySection.hidden = !isChecked;
        }

        this.updateStatusFilterVisibility();
    }

    /**
     * Handle project/status summary checkbox toggle
     */
    handleProjectStatusSummaryToggle(event) {
        const isChecked = event.target.checked;
        this.setStorage('showProjectStatusSummary', isChecked.toString());

        const summarySection = document.getElementById('projectStatusSummarySection');
        if (summarySection && !summarySection.hidden) {
            summarySection.hidden = !isChecked;
        }

        this.updateStatusFilterVisibility();
    }

    /**
     * Handle platform/status summary checkbox toggle
     */
    handlePlatformStatusSummaryByStatusToggle(event) {
        const isChecked = event.target.checked;
        this.setStorage('showPlatformStatusSummaryByStatus', isChecked.toString());

        const summarySection = document.getElementById('platformStatusSummaryByStatusSection');
        if (summarySection && !summarySection.hidden) {
            summarySection.hidden = !isChecked;
        }

        this.updateStatusFilterVisibility();
    }

    /**
     * Handle platform summary checkbox toggle
     */
    handlePlatformSummaryToggle(event) {
        const isChecked = event.target.checked;
        this.setStorage('showPlatformSummary', isChecked.toString());

        const summarySection = document.getElementById('summarySection');
        if (summarySection && !summarySection.hidden) {
            summarySection.hidden = !isChecked;
        }
    }

    /**
     * Handle platform status category summary checkbox toggle
     */
    handlePlatformStatusCategorySummaryToggle(event) {
        const isChecked = event.target.checked;
        this.setStorage('showPlatformStatusCategorySummary', isChecked.toString());

        const summarySection = document.getElementById('platformStatusSummarySection');
        if (summarySection && !summarySection.hidden) {
            summarySection.hidden = !isChecked;
        }
    }

    /**
     * Show or hide the shared status filter section
     */
    updateStatusFilterVisibility() {
        const statusFilterSection = document.getElementById('statusFilterSection');
        const statusCategoryFilterSection = document.getElementById('statusCategoryFilterSection');
        const platformFilterSection = document.getElementById('platformFilterSection');
        const projectFilterSection = document.getElementById('projectFilterSection');
        const teamFilterSection = document.getElementById('teamFilterSection');
        const fixVersionFilterSection = document.getElementById('fixVersionFilterSection');
        const exportBtn = document.getElementById('exportBtn');
        if (!statusFilterSection) return;

        const showProjectTeam = document.getElementById('showProjectTeamStatusSummary');
        const showProject = document.getElementById('showProjectStatusSummary');
        const showPlatform = document.getElementById('showPlatformStatusSummaryByStatus');
        const shouldShow = this.hasLoadedResults && this.currentResults.length > 0 &&
            ((showProjectTeam && showProjectTeam.checked) ||
            (showProject && showProject.checked) ||
            (showPlatform && showPlatform.checked));

        statusFilterSection.hidden = !shouldShow;
        if (statusCategoryFilterSection) {
            statusCategoryFilterSection.hidden = !shouldShow;
        }
        if (platformFilterSection) {
            platformFilterSection.hidden = !shouldShow;
        }
        if (projectFilterSection) {
            projectFilterSection.hidden = !shouldShow;
        }
        if (teamFilterSection) {
            teamFilterSection.hidden = !shouldShow;
        }
        if (fixVersionFilterSection) {
            fixVersionFilterSection.hidden = !shouldShow;
        }
        // Only show export button if results have been loaded and filters are visible
        if (exportBtn) {
            exportBtn.hidden = !shouldShow;
            exportBtn.style.display = shouldShow ? 'inline-block' : 'none';
        }
        
        // Re-initialize collapsible headers when filters are shown
        if (shouldShow) {
            this.initializeCollapsibleHeaders();
        }
    }

    /**
     * Handle sort click on summary table headers
     */
    handleSortClick(event) {
        const header = event.currentTarget;
        const sortColumn = header.dataset.sort;
        const tableType = header.dataset.table;
        
        // Get the appropriate sort state
        let sortState;
        if (tableType === 'summary') {
            sortState = this.summarySortState;
        } else if (tableType === 'platformStatus') {
            sortState = this.platformStatusSortState;
        } else if (tableType === 'projectStatus') {
            sortState = this.projectStatusSortState;
        } else if (tableType === 'projectTeamStatus') {
            sortState = this.projectTeamStatusSortState;
        }
        
        // Toggle direction if same column, otherwise default to ascending
        if (sortState.column === sortColumn) {
            sortState.ascending = !sortState.ascending;
        } else {
            sortState.column = sortColumn;
            sortState.ascending = true;
        }
        
        // Update sort arrows
        const table = header.closest('table');
        table.querySelectorAll('.sortable').forEach(th => {
            const arrow = th.querySelector('.sort-arrow');
            arrow.textContent = '';
            th.classList.remove('sorted-asc', 'sorted-desc');
        });
        
        const arrow = header.querySelector('.sort-arrow');
        arrow.textContent = sortState.ascending ? ' ▲' : ' ▼';
        header.classList.add(sortState.ascending ? 'sorted-asc' : 'sorted-desc');
        
        // Re-render the appropriate summary table
        if (tableType === 'summary') {
            this.displaySummary();
        } else if (tableType === 'platformStatus') {
            this.displayPlatformStatusSummary();
        } else if (tableType === 'projectStatus') {
            this.displayProjectStatusSummary(false);
        } else if (tableType === 'projectTeamStatus') {
            this.displayProjectTeamStatusSummary(false);
        }
    }

    /**
     * Show notification message
     */
    showNotification(message, type = 'info') {
        const statusDiv = document.getElementById('queryStatus');
        statusDiv.className = `query-status ${type}`;
        statusDiv.innerHTML = `<p>${message}</p>`;
        statusDiv.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }

    /**
     * Get item from localStorage
     */
    getStorage(key) {
        // For jql_status_summary page, use jql_ prefix for templates
        // For jira_status_summary page, use jira_ prefix for templates (shared)
        if (key === 'jqlTemplates') {
            const currentPage = window.location.pathname;
            if (currentPage.includes('jql_status_summary.html')) {
                return localStorage.getItem('jql_status_summary_' + key);
            } else {
                return localStorage.getItem('jira_' + key);
            }
        }
        // Use page-specific prefix for other settings
        return localStorage.getItem(this.storagePrefix + key);
    }

    /**
     * Set item in localStorage
     */
    setStorage(key, value) {
        localStorage.setItem(this.storagePrefix + key, value);
    }

    /**
     * Initialize all event listeners
     */
    initializeEventListeners() {
        // Query form (only on pages that have it, like jira_status_summary.html)
        const queryForm = document.getElementById('queryForm');
        if (queryForm) {
            queryForm.addEventListener('submit', (e) => this.handleQuery(e));
        }
        
        const disconnectBtn = document.getElementById('disconnectBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.handleDisconnect());
        }
        
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportToExcel());
        }
        
        const showInJiraBtn = document.getElementById('showInJiraBtn');
        if (showInJiraBtn) {
            showInJiraBtn.addEventListener('click', () => this.showInJira());
        }
        
        const setupBtn = document.getElementById('setupBtn');
        if (setupBtn) {
            setupBtn.addEventListener('click', () => this.handleSetup());
        }
        
        const templateSelect = document.getElementById('templateSelect');
        if (templateSelect) {
            templateSelect.addEventListener('change', (e) => this.handleTemplateSelection(e));
        }
        
        const loadTemplateBtn = document.getElementById('loadTemplateBtn');
        if (loadTemplateBtn) {
            loadTemplateBtn.addEventListener('click', () => this.loadSelectedTemplate());
        }
        
        const showProjectTeamStatusSummary = document.getElementById('showProjectTeamStatusSummary');
        if (showProjectTeamStatusSummary) {
            showProjectTeamStatusSummary.addEventListener('change', (e) => this.handleProjectTeamStatusSummaryToggle(e));
        }

        const showProjectStatusSummary = document.getElementById('showProjectStatusSummary');
        if (showProjectStatusSummary) {
            showProjectStatusSummary.addEventListener('change', (e) => this.handleProjectStatusSummaryToggle(e));
        }

        const showPlatformStatusSummaryByStatus = document.getElementById('showPlatformStatusSummaryByStatus');
        if (showPlatformStatusSummaryByStatus) {
            showPlatformStatusSummaryByStatus.addEventListener('change', (e) => this.handlePlatformStatusSummaryByStatusToggle(e));
        }

        const showPlatformSummary = document.getElementById('showPlatformSummary');
        if (showPlatformSummary) {
            showPlatformSummary.addEventListener('change', (e) => this.handlePlatformSummaryToggle(e));
        }

        const showPlatformStatusCategorySummary = document.getElementById('showPlatformStatusCategorySummary');
        if (showPlatformStatusCategorySummary) {
            showPlatformStatusCategorySummary.addEventListener('change', (e) => this.handlePlatformStatusCategorySummaryToggle(e));
        }
        
        // Add sort listeners to summary table headers
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', (e) => this.handleSortClick(e));
        });
        
        // Add sort listeners to issues table headers
        document.querySelectorAll('.sortable-header').forEach(header => {
            header.addEventListener('click', (e) => this.handleIssuesTableSort(e));
        });
        
        // Add collapse/expand listeners to collapsible headers
        this.initializeCollapsibleHeaders();
    }

    /**
     * Initialize collapsible headers for summary sections
     */
    initializeCollapsibleHeaders() {
        document.querySelectorAll('.collapsible-header').forEach(header => {
            // Skip if already initialized
            if (header.dataset.collapsibleInitialized === 'true') {
                return;
            }
            
            const handleClick = (e) => {
                const targetId = header.getAttribute('data-target');
                const targetContent = document.getElementById(targetId);
                
                if (targetContent) {
                    const isCollapsed = header.classList.contains('collapsed');
                    
                    if (isCollapsed) {
                        header.classList.remove('collapsed');
                        targetContent.classList.remove('collapsed');
                        this.setStorage(`${targetId}_collapsed`, 'false');
                    } else {
                        header.classList.add('collapsed');
                        targetContent.classList.add('collapsed');
                        this.setStorage(`${targetId}_collapsed`, 'true');
                    }
                }
            };
            
            header.addEventListener('click', handleClick);
            header.dataset.collapsibleInitialized = 'true';
            
            // Restore collapsed state from localStorage
            const targetId = header.getAttribute('data-target');
            const isCollapsed = this.getStorage(`${targetId}_collapsed`) === 'true';
            if (isCollapsed) {
                header.classList.add('collapsed');
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('collapsed');
                }
            }
        });
    }

    /**
     * Handle setup button click
     */
    handleSetup() {
        // Check if on jira_status_summary page and navigate to appropriate setup page
        const currentPage = window.location.pathname;
        if (currentPage.includes('jql_status_summary.html')) {
            window.location.href = 'jql_status_summary_setup.html';
        } else if (currentPage.includes('jira_status_summary.html')) {
            window.location.href = 'jira_status_summary_setup.html';
        } else {
            window.location.href = 'setup.html';
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
        const connectedUserName = document.getElementById('connectedUserName');

        // Set user name and email
        const displayName = user.displayName || user.name || 'User';
        if (userNameSpan) {
            userNameSpan.textContent = displayName;
        }
        if (userEmailSpan) {
            userEmailSpan.textContent = user.emailAddress || '';
        }
        
        // Set connected user name in query section (legacy support)
        if (connectedUserName) {
            connectedUserName.textContent = displayName;
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
     * Generate initials from name
     */
    generateInitials(name) {
        return name
            .split(' ')
            .map(part => part.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');
    }

    /**
     * Auto-connect to Jira on page load
     */
    async autoConnect() {
        const statusDiv = document.getElementById('connectionStatus');
        const sectionTitle = document.querySelector('#connectionSection h2');
        
        try {
            this.jiraClient = new JiraClient();
            const user = await this.jiraClient.testConnection();

            // Success - hide connection section and show query section
            sectionTitle.textContent = '✅ Connected to Jira';
            statusDiv.className = 'connection-status success';
            statusDiv.innerHTML = `Connected as <strong>${user.displayName}</strong>`;

            // Display user info in header
            this.displayUserInfo(user);

            // Hide connection section after a brief moment
            setTimeout(() => {
                document.getElementById('connectionSection').style.display = 'none';
                document.getElementById('querySection').hidden = false;
            }, 1500);

        } catch (error) {
            // Error - show helpful message with setup link
            sectionTitle.textContent = '❌ Connection Failed';
            statusDiv.className = 'connection-status error';
            statusDiv.innerHTML = `
                <p><strong>Unable to connect to Jira server</strong></p>
                <p class="error-details">${error.message}</p>
                <div class="error-actions">
                    <p>Please check your configuration in the Setup page:</p>
                    <button onclick="window.location.href='setup.html'" class="btn btn-primary">
                        ⚙️ Open Setup Page
                    </button>
                    <button onclick="location.reload()" class="btn btn-secondary">
                        🔄 Retry Connection
                    </button>
                </div>
                <details class="error-help">
                    <summary>Common Issues</summary>
                    <ul>
                        <li>Verify your Jira URL is correct</li>
                        <li>Check your API token or credentials</li>
                        <li>Ensure the proxy server is running (node server.js)</li>
                        <li>Confirm your firewall allows the connection</li>
                    </ul>
                </details>
            `;
            this.jiraClient = null;
        }
    }

    /**
     * Handle JQL query
     */
    async handleQuery(event) {
        event.preventDefault();

        // Check if JiraClient is initialized
        if (!this.jiraClient) {
            const statusDiv = document.getElementById('queryStatus');
            statusDiv.className = 'query-status error';
            statusDiv.textContent = '⚠️ Still connecting to Jira. Please wait a moment and try again.';
            return;
        }

        const projectKey = document.getElementById('projectKey')?.value.trim().toUpperCase() || '';
        const teamName = document.getElementById('teamName')?.value.trim() || '';
        let jqlQuery = document.getElementById('jqlQuery')?.value.trim() || '';

        // Disable button and show loading spinner
        const loadBtn = document.getElementById('loadIssuesBtn');
        const btnText = loadBtn?.querySelector('.btn-text');
        const btnSpinner = loadBtn?.querySelector('.btn-spinner');
        if (loadBtn) {
            loadBtn.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (btnSpinner) btnSpinner.style.display = 'inline';
        }

        // Show loading message first
        const statusDiv = document.getElementById('queryStatus');
        statusDiv.className = 'query-status loading';
        statusDiv.textContent = '⏳ Loading issues. Please wait...';
        
        // Force a reflow to ensure the loading message is displayed before async operation
        statusDiv.offsetHeight;
        
        // Clear previous results after showing loading message
        this.clearResults();
        this.hasLoadedResults = false;
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.hidden = true;
            exportBtn.style.display = 'none';
        }

        try {
            // Build JQL if custom query not provided
            if (!jqlQuery) {
                let jqlParts = [];
                
                if (projectKey) {
                    jqlParts.push(`project = "${projectKey}"`);
                }
                
                if (teamName) {
                    jqlParts.push(`Team = ${teamName}`);
                }
                
                if (jqlParts.length > 0) {
                    jqlQuery = jqlParts.join(' AND ') + ' ORDER BY rank ASC';
                } else {
                    throw new Error('Please provide a custom JQL query');
                }
            }

            const results = await this.jiraClient.searchIssues(jqlQuery, 100, false);
            this.currentResults = results.issues || [];
            this.hasLoadedResults = true;

            // Store execution info for export
            this.lastExecutionInfo = {
                templateName: document.getElementById('templateSelect')?.selectedOptions[0]?.text || 'Custom Query',
                jqlQuery: jqlQuery,
                executionTime: new Date().toLocaleString(),
                projectKey: projectKey,
                teamName: teamName
            };

            // Clear loading message before showing results
            statusDiv.className = '';
            statusDiv.textContent = '';

            this.displayResults();

        } catch (error) {
            statusDiv.className = 'query-status error';
            statusDiv.textContent = `❌ Query failed: ${error.message}`;
            this.clearResults();
        } finally {
            // Re-enable button and restore text
            const loadBtn = document.getElementById('loadIssuesBtn');
            const btnText = loadBtn?.querySelector('.btn-text');
            const btnSpinner = loadBtn?.querySelector('.btn-spinner');
            if (loadBtn) {
                loadBtn.disabled = false;
                if (btnText) btnText.style.display = 'inline';
                if (btnSpinner) btnSpinner.style.display = 'none';
            }
        }
    }



    /**
     * Handle disconnect
     */
    handleDisconnect() {
        if (confirm('Are you sure you want to disconnect? This will reload the page.')) {
            // Reload the page to reset everything and reconnect
            location.reload();
        }
    }

    /**
     * Display query results
     */
    displayResults() {
        document.getElementById('resultsSection').hidden = false;

        if (this.currentResults.length === 0) {
            document.getElementById('noResults').hidden = false;
            document.getElementById('issuesTable').hidden = true;
            document.getElementById('cardView').hidden = true;
            document.getElementById('summarySection').hidden = true;
            document.getElementById('platformStatusSummarySection').hidden = true;
            document.getElementById('projectStatusSummarySection').hidden = true;
            document.getElementById('projectTeamStatusSummarySection').hidden = true;
            document.getElementById('platformStatusSummaryByStatusSection').hidden = true;
            const statusFilterSection = document.getElementById('statusFilterSection');
            if (statusFilterSection) statusFilterSection.hidden = true;
            const platformFilterSection = document.getElementById('platformFilterSection');
            if (platformFilterSection) platformFilterSection.hidden = true;
            const projectFilterSection = document.getElementById('projectFilterSection');
            if (projectFilterSection) projectFilterSection.hidden = true;
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.hidden = true;
                exportBtn.style.display = 'none';
            }
            return;
        }

        document.getElementById('noResults').hidden = true;
        document.getElementById('issuesTable').hidden = false;

        this.populateTable();
        this.displaySummary();
        this.displayPlatformStatusSummary();
        this.displayProjectStatusSummary();
        this.displayPlatformStatusSummaryByStatus();
        this.displayProjectTeamStatusSummary();
        this.updateStatusFilterVisibility();
        
        // Re-initialize collapsible headers after summaries are displayed
        this.initializeCollapsibleHeaders();
    }

    /**
     * Handle sort click for issues table
     */
    handleIssuesTableSort(event) {
        const header = event.currentTarget;
        const sortColumn = header.dataset.sort;
        const sortState = this.issuesTableSortState;
        
        // Toggle direction or set new column
        if (sortState.column === sortColumn) {
            sortState.ascending = !sortState.ascending;
        } else {
            sortState.column = sortColumn;
            sortState.ascending = true;
        }
        
        // Update arrow indicators
        document.querySelectorAll('.sortable-header').forEach(sortHeader => {
            sortHeader.classList.remove('sorted-asc', 'sorted-desc');
            sortHeader.removeAttribute('aria-sort');
            const arrow = sortHeader.querySelector('.sort-arrow');
            if (arrow) {
                arrow.textContent = '';
            }
        });
        
        header.classList.add(sortState.ascending ? 'sorted-asc' : 'sorted-desc');
        header.setAttribute('aria-sort', sortState.ascending ? 'ascending' : 'descending');
        const arrow = header.querySelector('.sort-arrow');
        if (arrow) {
            arrow.textContent = sortState.ascending ? ' ▲' : ' ▼';
        }
        
        // Sort and re-render
        this.sortIssuesTable();
        this.populateTable();
    }

    /**
     * Sort the currentResults array based on issuesTableSortState
     */
    sortIssuesTable() {
        const sortState = this.issuesTableSortState;
        if (!sortState.column) return;
        
        this.currentResults.sort((a, b) => {
            let valueA, valueB;
            
            // Extract values based on column
            switch (sortState.column) {
                case 'key':
                    valueA = a.key;
                    valueB = b.key;
                    break;
                case 'summary':
                    valueA = a.fields.summary;
                    valueB = b.fields.summary;
                    break;
                case 'type':
                    valueA = JiraClient.getIssueType(a);
                    valueB = JiraClient.getIssueType(b);
                    break;
                case 'project':
                    valueA = JiraClient.getProject(a);
                    valueB = JiraClient.getProject(b);
                    break;
                case 'status':
                    valueA = JiraClient.getStatus(a);
                    valueB = JiraClient.getStatus(b);
                    break;
                case 'statuscategory':
                    valueA = a.fields.status?.statusCategory?.name || 'Unknown';
                    valueB = b.fields.status?.statusCategory?.name || 'Unknown';
                    break;
                case 'priority':
                    valueA = JiraClient.getPriority(a);
                    valueB = JiraClient.getPriority(b);
                    break;
                case 'platform':
                    valueA = JiraClient.getPlatform(a);
                    valueB = JiraClient.getPlatform(b);
                    break;
                case 'team':
                    valueA = JiraClient.getTeam(a);
                    valueB = JiraClient.getTeam(b);
                    break;
                case 'assignee':
                    valueA = JiraClient.getAssignee(a);
                    valueB = JiraClient.getAssignee(b);
                    break;
                case 'created':
                    valueA = a.fields.created;
                    valueB = b.fields.created;
                    break;
                case 'laststatuschanged':
                    valueA = a.fields.customfield_17903 ? new Date(a.fields.customfield_17903).getTime() : null;
                    valueB = b.fields.customfield_17903 ? new Date(b.fields.customfield_17903).getTime() : null;
                    break;
                case 'aging':
                    valueA = JiraClient.getAgingDays(a);
                    valueB = JiraClient.getAgingDays(b);
                    break;
                case 'fixversions':
                    valueA = JiraClient.getFixVersions(a);
                    valueB = JiraClient.getFixVersions(b);
                    break;
                case 'sprint':
                    valueA = JiraClient.getSprint(a);
                    valueB = JiraClient.getSprint(b);
                    break;
                case 'points':
                    valueA = JiraClient.getStoryPoints(a);
                    valueB = JiraClient.getStoryPoints(b);
                    // Convert to numbers, treating "-" and empty as 0
                    valueA = valueA === '-' || valueA === '' ? 0 : parseFloat(valueA) || 0;
                    valueB = valueB === '-' || valueB === '' ? 0 : parseFloat(valueB) || 0;
                    break;
                default:
                    return 0;
            }
            
            // Handle null/undefined/"-" values (push to end)
            const isEmptyA = valueA === '-' || valueA === '' || valueA === null || valueA === undefined;
            const isEmptyB = valueB === '-' || valueB === '' || valueB === null || valueB === undefined;
            
            if (isEmptyA && !isEmptyB) return 1;
            if (!isEmptyA && isEmptyB) return -1;
            if (isEmptyA && isEmptyB) return 0;
            
            // Compare values
            let comparison = 0;
            if (sortState.column === 'points' || sortState.column === 'created' || sortState.column === 'laststatuschanged' || sortState.column === 'aging') {
                // Numeric/date comparison
                comparison = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
            } else {
                // String comparison (case-insensitive)
                comparison = String(valueA).toLowerCase().localeCompare(String(valueB).toLowerCase());
            }
            
            return sortState.ascending ? comparison : -comparison;
        });
    }

    /**
     * Populate results table
     */
    populateTable() {
        const tbody = document.getElementById('issuesTableBody');
        tbody.innerHTML = '';

        // Get filtered issues based on status checkboxes
        const issuesToDisplay = this.getFilteredIssues();
        
        // Update issue count
        const issueCountElem = document.getElementById('issueCount');
        if (issueCountElem) {
            issueCountElem.textContent = `${issuesToDisplay.length} issue${issuesToDisplay.length !== 1 ? 's' : ''}`;
        }

        issuesToDisplay.forEach(issue => {
            const row = document.createElement('tr');

            const key = issue.key;
            const project = JiraClient.getProject(issue);
            const summary = issue.fields.summary;
            const type = JiraClient.getIssueType(issue);
            const status = JiraClient.getStatus(issue);
            const statusCategory = issue.fields.status?.statusCategory?.name || 'To Do';
            const priority = JiraClient.getPriority(issue);
            const platform = JiraClient.getPlatform(issue);
            const team = JiraClient.getTeam(issue);
            const assignee = JiraClient.getAssignee(issue);
            const created = JiraClient.getCreatedDate(issue);
            const lastStatusChanged = JiraClient.getLastStatusChanged(issue);
            const agingDays = JiraClient.getAgingDays(issue);
            const aging = agingDays === null ? '-' : `${agingDays.toFixed(1)}d`;
            const fixVersions = JiraClient.getFixVersions(issue);
            const sprint = JiraClient.getSprint(issue);
            const points = JiraClient.getStoryPoints(issue);

            const statusCellClass = status.toUpperCase() === 'READY FOR SIGNOFF' ? 'status-ready-for-signoff' : '';
            const jiraUrl = localStorage.getItem('jira_jiraUrl') || 'https://jira.rccl.com';
            
            row.innerHTML = `
                <td data-key="${this.escapeHtml(key)}"><a href="${jiraUrl}/browse/${this.escapeHtml(key)}" target="_blank" class="issue-key">${this.escapeHtml(key)}</a></td>
                <td>${this.escapeHtml(project)}</td>
                <td>${this.escapeHtml(team)}</td>
                <td><span class="issue-summary" title="${this.escapeHtml(summary)}">${this.escapeHtml(summary)}</span></td>
                <td><span class="badge badge-type">${this.escapeHtml(type)}</span></td>
                <td><span class="badge badge-priority ${this.getPriorityClass(priority)}">${this.escapeHtml(priority)}</span></td>
                <td class="${statusCellClass}"><span class="badge badge-status ${this.getStatusClass(statusCategory)}">${this.escapeHtml(status)}</span></td>
                <td class="status-category-column" style="display: none;"><span class="badge badge-status ${this.getStatusClass(statusCategory)}">${this.escapeHtml(statusCategory)}</span></td>
                <td>${this.escapeHtml(platform)}</td>
                <td>${this.escapeHtml(assignee)}</td>
                <td data-date="${issue.fields.created || ''}">${this.escapeHtml(created)}</td>
                <td data-last-status-changed="${this.escapeHtml(issue.fields.customfield_17903 || '')}">${this.escapeHtml(lastStatusChanged)}</td>
                <td data-aging="${agingDays === null ? '' : agingDays.toFixed(1)}">${this.escapeHtml(aging)}</td>
                <td>${this.escapeHtml(fixVersions)}</td>
                <td>${this.escapeHtml(sprint)}</td>
                <td><strong>${points}</strong></td>
            `;

            tbody.appendChild(row);
        });
    }

    /**
     * Display summary table grouped by platform (customfield_11500)
     */
    displaySummary() {
        const summarySection = document.getElementById('summarySection');
        const summaryCheckbox = document.getElementById('showPlatformSummary');
        const resultsToUse = this.getPlatformFilteredResults();

        if (!summaryCheckbox || !summaryCheckbox.checked) {
            summarySection.hidden = true;
            return;
        }

        if (resultsToUse.length === 0) {
            summarySection.hidden = true;
            return;
        }
        
        const summaryTableBody = document.getElementById('summaryTableBody');
        
        // Group issues by platform (customfield_11500)
        const platformSummary = new Map();
        
        resultsToUse.forEach(issue => {
            const platformField = JiraClient.getPlatform(issue);
            const platform = platformField === '-' ? 'Unassigned' : platformField;
            const points = JiraClient.getStoryPoints(issue);
            const numericPoints = points === '-' ? 0 : parseFloat(points) || 0;
            
            if (!platformSummary.has(platform)) {
                platformSummary.set(platform, { count: 0, points: 0 });
            }
            
            const summary = platformSummary.get(platform);
            summary.count++;
            summary.points += numericPoints;
        });
        
        // Sort based on current sort state
        const sortedPlatforms = Array.from(platformSummary.entries()).sort((a, b) => {
            const sortState = this.summarySortState;
            let compareResult = 0;
            
            if (sortState.column === 'platform') {
                if (a[0] === 'Unassigned' && b[0] !== 'Unassigned') return 1;
                if (a[0] !== 'Unassigned' && b[0] === 'Unassigned') return -1;
                compareResult = a[0].localeCompare(b[0]);
            } else if (sortState.column === 'issues') {
                compareResult = a[1].count - b[1].count;
            } else if (sortState.column === 'points') {
                compareResult = a[1].points - b[1].points;
            }
            
            return sortState.ascending ? compareResult : -compareResult;
        });
        
        // Clear and populate summary table
        summaryTableBody.innerHTML = '';
        
        let totalCount = 0;
        let totalPoints = 0;
        
        sortedPlatforms.forEach(([platform, summary]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.escapeHtml(platform)}</td>
                <td><strong>${summary.count}</strong></td>
                <td><strong>${summary.points.toFixed(1)}</strong></td>
            `;
            summaryTableBody.appendChild(row);
            
            totalCount += summary.count;
            totalPoints += summary.points;
        });
        
        // Add total row
        const totalRow = document.createElement('tr');
        totalRow.className = 'summary-total-row';
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td><strong>${totalCount}</strong></td>
            <td><strong>${totalPoints.toFixed(1)}</strong></td>
        `;
        summaryTableBody.appendChild(totalRow);
        
        // Store platform summary for chart updates
        this.currentPlatformSummary = platformSummary;
        
        // Show summary section
        summarySection.hidden = false;
        
        // Update sort arrow
        this.updateSortArrow('summaryTable', this.summarySortState);
    }

    /**
     * Display summary chart for platform data
     */
    displaySummaryChart(platformSummary) {
        const canvas = document.getElementById('summaryChart');
        if (!canvas) {
            console.log('Canvas not found');
            return;
        }
        
        // ALWAYS destroy existing chart first
        if (this.summaryChartInstance) {
            console.log('Destroying existing chart');
            this.summaryChartInstance.destroy();
            this.summaryChartInstance = null;
        }
        
        // Get selected metric
        const metricSelect = document.getElementById('chartMetricSelect');
        const selectedMetric = metricSelect ? metricSelect.value : 'both';
        
        console.log('Creating chart with selected metric:', selectedMetric);
        
        // Prepare data for chart (exclude Unassigned from chart)
        const platforms = Array.from(platformSummary.keys())
            .filter(p => p !== 'Unassigned')
            .sort();
        const issuesData = platforms.map(platform => platformSummary.get(platform).count);
        const pointsData = platforms.map(platform => platformSummary.get(platform).points);
        
        // Build datasets based on selection
        const datasets = [];
        
        if (selectedMetric === 'both' || selectedMetric === 'issues') {
            datasets.push({
                label: 'Issues',
                data: issuesData,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                yAxisID: selectedMetric === 'both' ? 'y' : 'y-single'
            });
        }
        
        if (selectedMetric === 'both' || selectedMetric === 'points') {
            datasets.push({
                label: 'Story Points',
                data: pointsData,
                backgroundColor: 'rgba(255, 159, 64, 0.6)',
                borderColor: 'rgba(255, 159, 64, 1)',
                borderWidth: 1,
                yAxisID: selectedMetric === 'both' ? 'y1' : 'y-single'
            });
        }
        
        console.log('Creating chart with', datasets.length, 'dataset(s):', datasets.map(d => d.label));
        
        // Configure scales based on metric selection
        let scales = {};
        if (selectedMetric === 'both') {
            scales = {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Number of Issues'
                    },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Story Points'
                    },
                    beginAtZero: true,
                    grid: {
                        drawOnChartArea: false
                    }
                }
            };
        } else {
            scales = {
                'y-single': {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: selectedMetric === 'issues' ? 'Number of Issues' : 'Story Points'
                    },
                    beginAtZero: true
                }
            };
        }
        
        // Determine chart title
        let chartTitle = 'Issues and Story Points by Platform';
        if (selectedMetric === 'issues') {
            chartTitle = 'Issues by Platform';
        } else if (selectedMetric === 'points') {
            chartTitle = 'Story Points by Platform';
        }
        
        console.log('Chart title will be:', chartTitle);
        
        // Create new chart
        const ctx = canvas.getContext('2d');
        
        this.summaryChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: platforms,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                plugins: {
                    title: {
                        display: true,
                        text: chartTitle,
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: scales
            }
        });
        
        console.log('New chart created successfully');
    }


    /**
     * Update sort arrow indicators
     */
    updateSortArrow(tableId, sortState) {
        const table = document.getElementById(tableId);
        if (!table) return;
        
        table.querySelectorAll('.sortable').forEach(th => {
            const arrow = th.querySelector('.sort-arrow');
            const columnName = th.dataset.sort;
            
            if (columnName === sortState.column) {
                arrow.textContent = sortState.ascending ? ' ▲' : ' ▼';
                th.classList.remove('sorted-asc', 'sorted-desc');
                th.classList.add(sortState.ascending ? 'sorted-asc' : 'sorted-desc');
            } else {
                arrow.textContent = '';
                th.classList.remove('sorted-asc', 'sorted-desc');
            }
        });
    }

    /**
     * Display platform and status category summary table as 2D pivot
     */
    displayPlatformStatusSummary() {
        const summarySection = document.getElementById('platformStatusSummarySection');
        const summaryCheckbox = document.getElementById('showPlatformStatusCategorySummary');
        const resultsToUse = this.getPlatformFilteredResults();

        if (!summaryCheckbox || !summaryCheckbox.checked) {
            summarySection.hidden = true;
            return;
        }

        if (resultsToUse.length === 0) {
            summarySection.hidden = true;
            return;
        }

        const summaryTableHead = document.getElementById('platformStatusSummaryTableHead');
        const summaryTableBody = document.getElementById('platformStatusSummaryTableBody');
        
        // Collect all unique platforms and status categories
        const platformData = new Map(); // platform -> { statusCategory -> {count, points} }
        const statusCategories = new Set();
        
        resultsToUse.forEach(issue => {
            const platformField = JiraClient.getPlatform(issue);
            const platform = platformField === '-' ? 'Unassigned' : platformField;
            const statusCategory = issue.fields.status?.statusCategory?.name || 'Unknown';
            const points = JiraClient.getStoryPoints(issue);
            const numericPoints = points === '-' ? 0 : parseFloat(points) || 0;
            
            statusCategories.add(statusCategory);
            
            if (!platformData.has(platform)) {
                platformData.set(platform, new Map());
            }
            
            const platformMap = platformData.get(platform);
            if (!platformMap.has(statusCategory)) {
                platformMap.set(statusCategory, { count: 0, points: 0 });
            }
            
            const statusData = platformMap.get(statusCategory);
            statusData.count++;
            statusData.points += numericPoints;
        });
        
        // Convert to sorted arrays
        const sortedStatusCategories = Array.from(statusCategories).sort();
        const sortedPlatforms = Array.from(platformData.keys()).sort((a, b) => {
            if (a === 'Unassigned' && b !== 'Unassigned') return 1;
            if (a !== 'Unassigned' && b === 'Unassigned') return -1;
            return a.localeCompare(b);
        });
        
        // Build table header
        let headerHtml = '<tr><th scope="col">Platform</th>';
        sortedStatusCategories.forEach(status => {
            headerHtml += `<th scope="col" colspan="2" class="status-category-header">${this.escapeHtml(status)}</th>`;
        });
        headerHtml += '<th scope="col" colspan="2" class="total-header">Total</th></tr>';
        
        // Add sub-header row for Issues/Points
        headerHtml += '<tr><th></th>';
        sortedStatusCategories.forEach(() => {
            headerHtml += '<th class="sub-header">Issues</th><th class="sub-header">Points</th>';
        });
        headerHtml += '<th class="sub-header">Issues</th><th class="sub-header">Points</th></tr>';
        
        summaryTableHead.innerHTML = headerHtml;
        
        // Build table body
        summaryTableBody.innerHTML = '';
        
        let grandTotalCount = 0;
        let grandTotalPoints = 0;
        const columnTotals = new Map(); // statusCategory -> {count, points}
        
        sortedStatusCategories.forEach(status => {
            columnTotals.set(status, { count: 0, points: 0 });
        });
        
        sortedPlatforms.forEach(platform => {
            const row = document.createElement('tr');
            let rowHtml = `<td><strong>${this.escapeHtml(platform)}</strong></td>`;
            
            let rowTotalCount = 0;
            let rowTotalPoints = 0;
            
            const platformMap = platformData.get(platform);
            
            sortedStatusCategories.forEach(status => {
                const statusData = platformMap.get(status) || { count: 0, points: 0 };
                rowHtml += `<td>${statusData.count}</td><td>${statusData.points.toFixed(1)}</td>`;
                
                rowTotalCount += statusData.count;
                rowTotalPoints += statusData.points;
                
                const colTotal = columnTotals.get(status);
                colTotal.count += statusData.count;
                colTotal.points += statusData.points;
            });
            
            rowHtml += `<td><strong>${rowTotalCount}</strong></td><td><strong>${rowTotalPoints.toFixed(1)}</strong></td>`;
            row.innerHTML = rowHtml;
            summaryTableBody.appendChild(row);
            
            grandTotalCount += rowTotalCount;
            grandTotalPoints += rowTotalPoints;
        });
        
        // Add column totals row
        const totalRow = document.createElement('tr');
        totalRow.className = 'summary-total-row';
        let totalRowHtml = '<td><strong>Total</strong></td>';
        
        sortedStatusCategories.forEach(status => {
            const colTotal = columnTotals.get(status);
            totalRowHtml += `<td><strong>${colTotal.count}</strong></td><td><strong>${colTotal.points.toFixed(1)}</strong></td>`;
        });
        
        totalRowHtml += `<td><strong>${grandTotalCount}</strong></td><td><strong>${grandTotalPoints.toFixed(1)}</strong></td>`;
        totalRow.innerHTML = totalRowHtml;
        summaryTableBody.appendChild(totalRow);
        
        // Store platform status summary for chart updates
        this.currentPlatformStatusSummary = { platformData, sortedStatusCategories, sortedPlatforms };
        
        // Show summary section
        summarySection.hidden = false;
    }

    /**
     * Display project/team summary with status columns
     */
    displayProjectTeamStatusSummary(forceRecalculate = true) {
        const summarySection = document.getElementById('projectTeamStatusSummarySection');
        const summaryTableHead = document.getElementById('projectTeamStatusSummaryTableHead');
        const summaryTableBody = document.getElementById('projectTeamStatusSummaryTableBody');
        const summaryCheckbox = document.getElementById('showProjectTeamStatusSummary');
        const resultsToUse = this.getPlatformFilteredResults();

        if (!summarySection || !summaryTableHead || !summaryTableBody) {
            return;
        }

        if (!summaryCheckbox || !summaryCheckbox.checked) {
            summarySection.hidden = true;
            this.updateStatusFilterVisibility();
            return;
        }

        if (resultsToUse.length === 0) {
            summarySection.hidden = true;
            this.updateStatusFilterVisibility();
            return;
        }

        // Calculate or reuse stored data
        if (forceRecalculate || !this.projectTeamStatusData) {
            const statusNames = new Set();
            const groupMap = new Map();

            this.currentResults.forEach(issue => {
                const project = JiraClient.getProject(issue);
                const team = JiraClient.getTeam(issue);
                const status = JiraClient.getStatus(issue);

                statusNames.add(status);
                const groupKey = `${project}|||${team}`;

                if (!groupMap.has(groupKey)) {
                    groupMap.set(groupKey, {
                        project,
                        team,
                        counts: new Map()
                    });
                }

                const group = groupMap.get(groupKey);
                const currentCount = group.counts.get(status) || 0;
                group.counts.set(status, currentCount + 1);
            });

            // Get preferred status order from storage
            // Determine the correct prefix based on current page
            const currentPage = window.location.pathname;
            let preferredStatusKey = 'preferredStatusesInfo';
            let storagePrefix = currentPage.includes('jira_status_summary.html') ? 'jira_status_summary_' : (currentPage.includes('jql_status_summary.html') ? 'jql_status_summary_' : 'jira_');
            const preferredStatusesInfo = localStorage.getItem(storagePrefix + preferredStatusKey);
            
            console.log('🔍 Checking storage keys:');
            console.log('  Current page:', currentPage);
            console.log('  Using prefix:', storagePrefix);
            console.log('  Looking for:', storagePrefix + preferredStatusKey);
            console.log('  Found:', preferredStatusesInfo ? 'YES' : 'NO');
            
            let sortedStatuses;
            
            if (preferredStatusesInfo) {
                try {
                    const preferredStatuses = JSON.parse(preferredStatusesInfo);
                    const preferredNames = preferredStatuses.map(s => s.name || String(s.id));
                    
                    console.log('📊 Found preferred statuses:', preferredNames);
                    console.log('   Total statuses in results:', Array.from(statusNames).length);
                    console.log('   Total preferred statuses:', preferredStatuses.length);
                    console.log('   Status names from results:', Array.from(statusNames));
                    
                    // Sort: preferred statuses first (in their saved order), then remaining statuses alphabetically
                    sortedStatuses = Array.from(statusNames).sort((a, b) => {
                        const aIndex = preferredNames.indexOf(a);
                        const bIndex = preferredNames.indexOf(b);
                        const aIsPreferred = aIndex !== -1;
                        const bIsPreferred = bIndex !== -1;
                        
                        if (aIsPreferred && bIsPreferred) {
                            // Both preferred: maintain preferred order
                            return aIndex - bIndex;
                        } else if (aIsPreferred) {
                            return -1; // a comes first
                        } else if (bIsPreferred) {
                            return 1; // b comes first
                        } else {
                            // Neither preferred: sort alphabetically
                            return String(a).localeCompare(String(b));
                        }
                    });
                    console.log('📊 Using preferred status order:', sortedStatuses);
                } catch (error) {
                    console.warn('Error parsing preferred statuses, falling back to alphabetical:', error);
                    sortedStatuses = Array.from(statusNames).sort();
                }
            } else {
                // No preferred statuses saved, use alphabetical order
                sortedStatuses = Array.from(statusNames).sort();
                console.log('📊 No preferred statuses found, using alphabetical order:', sortedStatuses);
            }

            // Store data for reuse when filters change
            this.projectTeamStatusData = {
                groupMap,
                sortedStatuses
            };

            // Populate status filter checkboxes (only on initial calculation)
            this.populateStatusFilters(sortedStatuses);
            this.populateStatusCategoryFilters();
            this.populatePlatformFilters();
            this.populateProjectFilters();
            this.populateTeamFilters();
            this.populateFixVersionFilters();
        }

        // Use stored or newly calculated data
        const { sortedStatuses } = this.projectTeamStatusData;
        const groupMap = new Map();

        resultsToUse.forEach(issue => {
            const project = JiraClient.getProject(issue);
            const team = JiraClient.getTeam(issue);
            const status = JiraClient.getStatus(issue);

            const groupKey = `${project}|||${team}`;
            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    project,
                    team,
                    counts: new Map()
                });
            }

            const group = groupMap.get(groupKey);
            const currentCount = group.counts.get(status) || 0;
            group.counts.set(status, currentCount + 1);
        });
        
        // Get filtered statuses based on checkboxes
        const filteredStatuses = this.getFilteredStatuses(sortedStatuses);
        
        const sortState = this.projectTeamStatusSortState;
        const sortedGroups = Array.from(groupMap.values()).map(group => {
            let rowTotal = 0;
            filteredStatuses.forEach(status => {
                rowTotal += group.counts.get(status) || 0;
            });
            return { ...group, rowTotal };
        }).sort((a, b) => {
            const column = sortState.column || 'project';
            if (column === 'total') {
                return sortState.ascending ? a.rowTotal - b.rowTotal : b.rowTotal - a.rowTotal;
            }
            if (column === 'team') {
                const teamCompare = String(a.team).localeCompare(String(b.team));
                if (teamCompare !== 0) {
                    return sortState.ascending ? teamCompare : -teamCompare;
                }
                const projectCompare = String(a.project).localeCompare(String(b.project));
                return sortState.ascending ? projectCompare : -projectCompare;
            }
            if (column.startsWith('status:')) {
                const statusName = decodeURIComponent(column.slice('status:'.length));
                const countA = a.counts.get(statusName) || 0;
                const countB = b.counts.get(statusName) || 0;
                if (countA !== countB) {
                    return sortState.ascending ? countA - countB : countB - countA;
                }
            }
            const projectCompare = String(a.project).localeCompare(String(b.project));
            if (projectCompare !== 0) {
                return sortState.ascending ? projectCompare : -projectCompare;
            }
            const teamCompare = String(a.team).localeCompare(String(b.team));
            return sortState.ascending ? teamCompare : -teamCompare;
        });

        let headerHtml = '<tr>' +
            '<th scope="col" class="sortable" data-sort="project" data-table="projectTeamStatus">Project <span class="sort-arrow"></span></th>' +
            '<th scope="col" class="sortable" data-sort="team" data-table="projectTeamStatus">Team <span class="sort-arrow"></span></th>';
        filteredStatuses.forEach(status => {
            const statusKey = encodeURIComponent(status);
            headerHtml += `<th scope="col" class="sortable" data-sort="status:${statusKey}" data-table="projectTeamStatus">${this.escapeHtml(status)} <span class="sort-arrow"></span></th>`;
        });
        headerHtml += '<th scope="col" class="sortable" data-sort="total" data-table="projectTeamStatus">Total <span class="sort-arrow"></span></th>';
        headerHtml += '</tr>';
        summaryTableHead.innerHTML = headerHtml;

        summaryTableHead.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', (event) => this.handleSortClick(event));
        });

        this.updateSortArrow('projectTeamStatusSummaryTable', this.projectTeamStatusSortState);

        summaryTableBody.innerHTML = '';
        const columnTotals = new Map();
        filteredStatuses.forEach(status => {
            columnTotals.set(status, 0);
        });
        let grandTotal = 0;

        // First pass: calculate totals
        sortedGroups.forEach(group => {
            filteredStatuses.forEach(status => {
                const count = group.counts.get(status) || 0;
                columnTotals.set(status, (columnTotals.get(status) || 0) + count);
                grandTotal += count;
            });
        });

        // Create and insert total row first
        const totalRow = document.createElement('tr');
        totalRow.className = 'summary-total-row';
        let totalRowHtml = '<td><strong>Total</strong></td><td></td>';

        filteredStatuses.forEach(status => {
            const count = columnTotals.get(status) || 0;
            const isReadyForSignoff = status.toUpperCase() === 'READY FOR SIGNOFF';
            const cellClass = (isReadyForSignoff && count > 0) ? ' class="status-column-ready-for-signoff"' : '';
            totalRowHtml += `<td${cellClass}><strong>${count}</strong></td>`;
        });

        totalRowHtml += `<td class="grand-total"><strong>${grandTotal}</strong></td>`;
        totalRow.innerHTML = totalRowHtml;
        summaryTableBody.appendChild(totalRow);

        // Second pass: create regular rows
        sortedGroups.forEach(group => {
            const row = document.createElement('tr');
            let rowHtml = `<td>${this.escapeHtml(group.project)}</td><td>${this.escapeHtml(group.team)}</td>`;
            let rowTotal = 0;

            filteredStatuses.forEach(status => {
                const count = group.counts.get(status) || 0;
                const isReadyForSignoff = status.toUpperCase() === 'READY FOR SIGNOFF';
                let cellClass = '';
                if (isReadyForSignoff && count > 0) {
                    cellClass = ' class="status-column-ready-for-signoff"';
                } else if (count > 0) {
                    cellClass = ' class="status-cell-active"';
                }
                rowHtml += `<td${cellClass}>${count}</td>`;
                rowTotal += count;
            });

            // Skip rows with zero total
            if (rowTotal === 0) {
                return;
            }

            rowHtml += `<td><strong>${rowTotal}</strong></td>`;

            row.innerHTML = rowHtml;
            summaryTableBody.appendChild(row);
        });

        summarySection.hidden = false;
        this.updateStatusFilterVisibility();
    }

    /**
     * Display platform summary with status columns
     */
    displayPlatformStatusSummaryByStatus(forceRecalculate = true) {
        const summarySection = document.getElementById('platformStatusSummaryByStatusSection');
        const summaryTableHead = document.getElementById('platformStatusSummaryByStatusTableHead');
        const summaryTableBody = document.getElementById('platformStatusSummaryByStatusTableBody');
        const summaryCheckbox = document.getElementById('showPlatformStatusSummaryByStatus');
        const resultsToUse = this.getPlatformFilteredResults();

        if (!summarySection || !summaryTableHead || !summaryTableBody) {
            return;
        }

        if (!summaryCheckbox || !summaryCheckbox.checked) {
            summarySection.hidden = true;
            this.updateStatusFilterVisibility();
            return;
        }

        if (resultsToUse.length === 0) {
            summarySection.hidden = true;
            this.updateStatusFilterVisibility();
            return;
        }

        if (forceRecalculate || !this.platformStatusData) {
            const statusNames = new Set();
            const groupMap = new Map();

            this.currentResults.forEach(issue => {
                const platformField = JiraClient.getPlatform(issue);
                const platform = platformField === '-' ? 'Unassigned' : platformField;
                const status = JiraClient.getStatus(issue);

                statusNames.add(status);
                const groupKey = `${platform}`;

                if (!groupMap.has(groupKey)) {
                    groupMap.set(groupKey, {
                        platform,
                        counts: new Map()
                    });
                }

                const group = groupMap.get(groupKey);
                const currentCount = group.counts.get(status) || 0;
                group.counts.set(status, currentCount + 1);
            });

            const currentPage = window.location.pathname;
            const preferredStatusKey = 'preferredStatusesInfo';
            const storagePrefix = currentPage.includes('jira_status_summary.html') ? 'jira_status_summary_' : (currentPage.includes('jql_status_summary.html') ? 'jql_status_summary_' : 'jira_');
            const preferredStatusesInfo = localStorage.getItem(storagePrefix + preferredStatusKey);

            let sortedStatuses;

            if (preferredStatusesInfo) {
                try {
                    const preferredStatuses = JSON.parse(preferredStatusesInfo);
                    const preferredNames = preferredStatuses.map(s => s.name || String(s.id));
                    sortedStatuses = Array.from(statusNames).sort((a, b) => {
                        const aIndex = preferredNames.indexOf(a);
                        const bIndex = preferredNames.indexOf(b);
                        const aIsPreferred = aIndex !== -1;
                        const bIsPreferred = bIndex !== -1;

                        if (aIsPreferred && bIsPreferred) {
                            return aIndex - bIndex;
                        } else if (aIsPreferred) {
                            return -1;
                        } else if (bIsPreferred) {
                            return 1;
                        }
                        return String(a).localeCompare(String(b));
                    });
                } catch (error) {
                    console.warn('Error parsing preferred statuses, falling back to alphabetical:', error);
                    sortedStatuses = Array.from(statusNames).sort();
                }
            } else {
                sortedStatuses = Array.from(statusNames).sort();
            }

            this.platformStatusData = {
                groupMap,
                sortedStatuses
            };

            this.populateStatusFilters(sortedStatuses);
            this.populateStatusCategoryFilters();
            this.populatePlatformFilters();
            this.populateProjectFilters();
            this.populateTeamFilters();
            this.populateFixVersionFilters();
        }

        const { sortedStatuses } = this.platformStatusData;
        const groupMap = new Map();

        resultsToUse.forEach(issue => {
            const platformField = JiraClient.getPlatform(issue);
            const platform = platformField === '-' ? 'Unassigned' : platformField;
            const status = JiraClient.getStatus(issue);

            const groupKey = `${platform}`;
            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    platform,
                    counts: new Map()
                });
            }

            const group = groupMap.get(groupKey);
            const currentCount = group.counts.get(status) || 0;
            group.counts.set(status, currentCount + 1);
        });
        const filteredStatuses = this.getFilteredStatuses(sortedStatuses);

        const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
            return String(a.platform).localeCompare(String(b.platform));
        });

        let headerHtml = '<tr><th scope="col">Platform</th>';
        filteredStatuses.forEach(status => {
            headerHtml += `<th scope="col">${this.escapeHtml(status)}</th>`;
        });
        headerHtml += '<th scope="col">Total</th>';
        headerHtml += '</tr>';
        summaryTableHead.innerHTML = headerHtml;

        summaryTableBody.innerHTML = '';
        const columnTotals = new Map();
        filteredStatuses.forEach(status => {
            columnTotals.set(status, 0);
        });
        let grandTotal = 0;

        sortedGroups.forEach(group => {
            filteredStatuses.forEach(status => {
                const count = group.counts.get(status) || 0;
                columnTotals.set(status, (columnTotals.get(status) || 0) + count);
                grandTotal += count;
            });
        });

        const totalRow = document.createElement('tr');
        totalRow.className = 'summary-total-row';
        let totalRowHtml = '<td><strong>Total</strong></td>';

        filteredStatuses.forEach(status => {
            const count = columnTotals.get(status) || 0;
            const isReadyForSignoff = status.toUpperCase() === 'READY FOR SIGNOFF';
            const cellClass = (isReadyForSignoff && count > 0) ? ' class="status-column-ready-for-signoff"' : '';
            totalRowHtml += `<td${cellClass}><strong>${count}</strong></td>`;
        });

        totalRowHtml += `<td class="grand-total"><strong>${grandTotal}</strong></td>`;
        totalRow.innerHTML = totalRowHtml;
        summaryTableBody.appendChild(totalRow);

        sortedGroups.forEach(group => {
            const row = document.createElement('tr');
            let rowHtml = `<td>${this.escapeHtml(group.platform)}</td>`;
            let rowTotal = 0;

            filteredStatuses.forEach(status => {
                const count = group.counts.get(status) || 0;
                const isReadyForSignoff = status.toUpperCase() === 'READY FOR SIGNOFF';
                let cellClass = '';
                if (isReadyForSignoff && count > 0) {
                    cellClass = ' class="status-column-ready-for-signoff"';
                } else if (count > 0) {
                    cellClass = ' class="status-cell-active"';
                }
                rowHtml += `<td${cellClass}>${count}</td>`;
                rowTotal += count;
            });

            if (rowTotal === 0) {
                return;
            }

            rowHtml += `<td><strong>${rowTotal}</strong></td>`;

            row.innerHTML = rowHtml;
            summaryTableBody.appendChild(row);
        });

        summarySection.hidden = false;
        this.updateStatusFilterVisibility();
    }

    /**
     * Display project summary with status columns
     */
    displayProjectStatusSummary(forceRecalculate = true) {
        const summarySection = document.getElementById('projectStatusSummarySection');
        const summaryTableHead = document.getElementById('projectStatusSummaryTableHead');
        const summaryTableBody = document.getElementById('projectStatusSummaryTableBody');
        const summaryCheckbox = document.getElementById('showProjectStatusSummary');
        const resultsToUse = this.getPlatformFilteredResults();

        if (!summarySection || !summaryTableHead || !summaryTableBody) {
            return;
        }

        if (!summaryCheckbox || !summaryCheckbox.checked) {
            summarySection.hidden = true;
            this.updateStatusFilterVisibility();
            return;
        }

        if (resultsToUse.length === 0) {
            summarySection.hidden = true;
            this.updateStatusFilterVisibility();
            return;
        }

        if (forceRecalculate || !this.projectStatusData) {
            const statusNames = new Set();
            const groupMap = new Map();

            this.currentResults.forEach(issue => {
                const project = JiraClient.getProject(issue);
                const status = JiraClient.getStatus(issue);

                statusNames.add(status);
                const groupKey = `${project}`;

                if (!groupMap.has(groupKey)) {
                    groupMap.set(groupKey, {
                        project,
                        counts: new Map()
                    });
                }

                const group = groupMap.get(groupKey);
                const currentCount = group.counts.get(status) || 0;
                group.counts.set(status, currentCount + 1);
            });

            // Get preferred status order from storage
            const currentPage = window.location.pathname;
            const preferredStatusKey = 'preferredStatusesInfo';
            const storagePrefix = currentPage.includes('jira_status_summary.html') ? 'jira_status_summary_' : (currentPage.includes('jql_status_summary.html') ? 'jql_status_summary_' : 'jira_');
            const preferredStatusesInfo = localStorage.getItem(storagePrefix + preferredStatusKey);

            let sortedStatuses;

            if (preferredStatusesInfo) {
                try {
                    const preferredStatuses = JSON.parse(preferredStatusesInfo);
                    const preferredNames = preferredStatuses.map(s => s.name || String(s.id));
                    sortedStatuses = Array.from(statusNames).sort((a, b) => {
                        const aIndex = preferredNames.indexOf(a);
                        const bIndex = preferredNames.indexOf(b);
                        const aIsPreferred = aIndex !== -1;
                        const bIsPreferred = bIndex !== -1;

                        if (aIsPreferred && bIsPreferred) {
                            return aIndex - bIndex;
                        } else if (aIsPreferred) {
                            return -1;
                        } else if (bIsPreferred) {
                            return 1;
                        }
                        return String(a).localeCompare(String(b));
                    });
                } catch (error) {
                    console.warn('Error parsing preferred statuses, falling back to alphabetical:', error);
                    sortedStatuses = Array.from(statusNames).sort();
                }
            } else {
                sortedStatuses = Array.from(statusNames).sort();
            }

            this.projectStatusData = {
                groupMap,
                sortedStatuses
            };

            this.populateStatusFilters(sortedStatuses);
            this.populateStatusCategoryFilters();
            this.populatePlatformFilters();
            this.populateProjectFilters();
            this.populateTeamFilters();
            this.populateFixVersionFilters();
        }

        const { sortedStatuses } = this.projectStatusData;
        const groupMap = new Map();

        resultsToUse.forEach(issue => {
            const project = JiraClient.getProject(issue);
            const status = JiraClient.getStatus(issue);

            const groupKey = `${project}`;
            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, {
                    project,
                    counts: new Map()
                });
            }

            const group = groupMap.get(groupKey);
            const currentCount = group.counts.get(status) || 0;
            group.counts.set(status, currentCount + 1);
        });
        const filteredStatuses = this.getFilteredStatuses(sortedStatuses);

        const sortState = this.projectStatusSortState;
        const sortedGroups = Array.from(groupMap.values()).map(group => {
            let rowTotal = 0;
            filteredStatuses.forEach(status => {
                rowTotal += group.counts.get(status) || 0;
            });
            return { ...group, rowTotal };
        }).sort((a, b) => {
            const column = sortState.column || 'project';
            if (column === 'total') {
                return sortState.ascending ? a.rowTotal - b.rowTotal : b.rowTotal - a.rowTotal;
            }
            if (column.startsWith('status:')) {
                const statusName = decodeURIComponent(column.slice('status:'.length));
                const countA = a.counts.get(statusName) || 0;
                const countB = b.counts.get(statusName) || 0;
                return sortState.ascending ? countA - countB : countB - countA;
            }
            const compareResult = String(a.project).localeCompare(String(b.project));
            return sortState.ascending ? compareResult : -compareResult;
        });

        let headerHtml = '<tr><th scope="col" class="sortable" data-sort="project" data-table="projectStatus">Project <span class="sort-arrow"></span></th>';
        filteredStatuses.forEach(status => {
            const statusKey = encodeURIComponent(status);
            headerHtml += `<th scope="col" class="sortable" data-sort="status:${statusKey}" data-table="projectStatus">${this.escapeHtml(status)} <span class="sort-arrow"></span></th>`;
        });
        headerHtml += '<th scope="col" class="sortable" data-sort="total" data-table="projectStatus">Total <span class="sort-arrow"></span></th>';
        headerHtml += '</tr>';
        summaryTableHead.innerHTML = headerHtml;

        summaryTableHead.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', (event) => this.handleSortClick(event));
        });

        this.updateSortArrow('projectStatusSummaryTable', this.projectStatusSortState);

        summaryTableBody.innerHTML = '';
        const columnTotals = new Map();
        filteredStatuses.forEach(status => {
            columnTotals.set(status, 0);
        });
        let grandTotal = 0;

        sortedGroups.forEach(group => {
            filteredStatuses.forEach(status => {
                const count = group.counts.get(status) || 0;
                columnTotals.set(status, (columnTotals.get(status) || 0) + count);
                grandTotal += count;
            });
        });

        const totalRow = document.createElement('tr');
        totalRow.className = 'summary-total-row';
        let totalRowHtml = '<td><strong>Total</strong></td>';

        filteredStatuses.forEach(status => {
            const count = columnTotals.get(status) || 0;
            const isReadyForSignoff = status.toUpperCase() === 'READY FOR SIGNOFF';
            const cellClass = (isReadyForSignoff && count > 0) ? ' class="status-column-ready-for-signoff"' : '';
            totalRowHtml += `<td${cellClass}><strong>${count}</strong></td>`;
        });

        totalRowHtml += `<td class="grand-total"><strong>${grandTotal}</strong></td>`;
        totalRow.innerHTML = totalRowHtml;
        summaryTableBody.appendChild(totalRow);

        sortedGroups.forEach(group => {
            const row = document.createElement('tr');
            let rowHtml = `<td>${this.escapeHtml(group.project)}</td>`;
            let rowTotal = 0;

            filteredStatuses.forEach(status => {
                const count = group.counts.get(status) || 0;
                const isReadyForSignoff = status.toUpperCase() === 'READY FOR SIGNOFF';
                let cellClass = '';
                if (isReadyForSignoff && count > 0) {
                    cellClass = ' class="status-column-ready-for-signoff"';
                } else if (count > 0) {
                    cellClass = ' class="status-cell-active"';
                }
                rowHtml += `<td${cellClass}>${count}</td>`;
                rowTotal += count;
            });

            if (rowTotal === 0) {
                return;
            }

            rowHtml += `<td><strong>${rowTotal}</strong></td>`;

            row.innerHTML = rowHtml;
            summaryTableBody.appendChild(row);
        });

        summarySection.hidden = false;
        this.updateStatusFilterVisibility();
    }

    /**
     * Populate status filter checkboxes
     */
    populateStatusFilters(statuses) {
        const container = document.getElementById('statusCheckboxesContainer');
        if (!container) return;

        // Store all statuses for later reference
        this.allStatuses = statuses;

        container.innerHTML = '';
        
        statuses.forEach(status => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.cssText = 'display: flex; align-items: center; margin: 0;';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true; // All selected by default
            checkbox.value = status;
            checkbox.className = 'status-filter-checkbox';
            checkbox.addEventListener('change', () => this.updateStatusTable());
            
            const span = document.createElement('span');
            span.textContent = status;
            
            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        // Setup select/deselect all buttons
        const selectAllBtn = document.getElementById('selectAllStatusesBtn');
        const deselectAllBtn = document.getElementById('deselectAllStatusesBtn');
        
        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.status-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateStatusTable();
            };
        }
        
        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.status-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateStatusTable();
            };
        }
    }

    /**
     * Populate status category filter checkboxes
     */
    populateStatusCategoryFilters() {
        const container = document.getElementById('statusCategoryCheckboxesContainer');
        if (!container) return;

        if (container.childElementCount > 0) {
            return;
        }

        const categories = Array.from(new Set(this.currentResults.map(issue => {
            return issue.fields.status?.statusCategory?.name || 'Unknown';
        })));

        const categoryOrder = ['To Do', 'In Progress', 'Done', 'Unknown'];
        categories.sort((a, b) => {
            const aIndex = categoryOrder.indexOf(a);
            const bIndex = categoryOrder.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) {
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            }
            return String(a).localeCompare(String(b));
        });

        container.innerHTML = '';

        categories.forEach(category => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.cssText = 'display: flex; align-items: center; margin: 0;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = category;
            checkbox.className = 'status-category-filter-checkbox';
            checkbox.addEventListener('change', () => this.updateStatusTable());

            const span = document.createElement('span');
            span.textContent = category;

            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        const selectAllBtn = document.getElementById('selectAllStatusCategoriesBtn');
        const deselectAllBtn = document.getElementById('deselectAllStatusCategoriesBtn');

        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.status-category-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateStatusTable();
            };
        }

        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.status-category-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateStatusTable();
            };
        }
    }

    /**
     * Populate project filter checkboxes
     */
    populateProjectFilters() {
        const container = document.getElementById('projectCheckboxesContainer');
        if (!container) return;

        if (container.childElementCount > 0) {
            return;
        }

        const projects = Array.from(new Set(this.currentResults.map(issue => {
            return JiraClient.getProject(issue);
        }))).sort((a, b) => String(a).localeCompare(String(b)));

        container.innerHTML = '';

        projects.forEach(project => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.cssText = 'display: flex; align-items: center; margin: 0;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = project;
            checkbox.className = 'project-filter-checkbox';
            checkbox.addEventListener('change', () => this.updateStatusTable());

            const span = document.createElement('span');
            span.textContent = project;

            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        const selectAllBtn = document.getElementById('selectAllProjectsBtn');
        const deselectAllBtn = document.getElementById('deselectAllProjectsBtn');

        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.project-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateStatusTable();
            };
        }

        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.project-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateStatusTable();
            };
        }
    }

    /**
     * Populate team filter checkboxes
     */
    populateTeamFilters() {
        const container = document.getElementById('teamCheckboxesContainer');
        if (!container) return;

        if (container.childElementCount > 0) {
            return;
        }

        const teams = Array.from(new Set(this.currentResults.map(issue => {
            return JiraClient.getTeam(issue);
        }))).sort((a, b) => String(a).localeCompare(String(b)));

        container.innerHTML = '';

        teams.forEach(team => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.cssText = 'display: flex; align-items: center; margin: 0;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = team;
            checkbox.className = 'team-filter-checkbox';
            checkbox.addEventListener('change', () => this.updateStatusTable());

            const span = document.createElement('span');
            span.textContent = team;

            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        const selectAllBtn = document.getElementById('selectAllTeamsBtn');
        const deselectAllBtn = document.getElementById('deselectAllTeamsBtn');

        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.team-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateStatusTable();
            };
        }

        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.team-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateStatusTable();
            };
        }
    }

    /**
     * Populate fix version filter checkboxes
     */
    populateFixVersionFilters() {
        const container = document.getElementById('fixVersionCheckboxesContainer');
        if (!container) return;

        if (container.childElementCount > 0) {
            return;
        }

        const fixVersions = Array.from(new Set(this.currentResults.flatMap(issue => {
            const versions = JiraClient.getFixVersions(issue);
            if (versions === '-' || versions === '') return [];
            // Split by comma in case multiple versions are shown
            return versions.split(',').map(v => v.trim());
        }))).sort((a, b) => String(a).localeCompare(String(b)));

        container.innerHTML = '';

        fixVersions.forEach(fixVersion => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.cssText = 'display: flex; align-items: center; margin: 0;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = fixVersion;
            checkbox.className = 'fixversion-filter-checkbox';
            checkbox.addEventListener('change', () => this.updateStatusTable());

            const span = document.createElement('span');
            span.textContent = fixVersion;

            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        const selectAllBtn = document.getElementById('selectAllFixVersionsBtn');
        const deselectAllBtn = document.getElementById('deselectAllFixVersionsBtn');

        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.fixversion-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateStatusTable();
            };
        }

        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.fixversion-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateStatusTable();
            };
        }
    }

    /**
     * Populate platform filter checkboxes
     */
    populatePlatformFilters() {
        const container = document.getElementById('platformCheckboxesContainer');
        if (!container) return;

        if (container.childElementCount > 0) {
            return;
        }

        const platforms = Array.from(new Set(this.currentResults.map(issue => {
            const platformField = JiraClient.getPlatform(issue);
            return platformField === '-' ? 'Unassigned' : platformField;
        }))).sort((a, b) => String(a).localeCompare(String(b)));

        container.innerHTML = '';

        platforms.forEach(platform => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.style.cssText = 'display: flex; align-items: center; margin: 0;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = platform;
            checkbox.className = 'platform-filter-checkbox';
            checkbox.addEventListener('change', () => this.updateStatusTable());

            const span = document.createElement('span');
            span.textContent = platform;

            label.appendChild(checkbox);
            label.appendChild(span);
            container.appendChild(label);
        });

        const selectAllBtn = document.getElementById('selectAllPlatformsBtn');
        const deselectAllBtn = document.getElementById('deselectAllPlatformsBtn');

        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.platform-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateStatusTable();
            };
        }

        if (deselectAllBtn) {
            deselectAllBtn.onclick = () => {
                const checkboxes = document.querySelectorAll('.platform-filter-checkbox');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateStatusTable();
            };
        }
    }

    /**
     * Get filtered statuses based on checked checkboxes
     */
    getFilteredStatuses(allStatuses) {
        const checkboxes = document.querySelectorAll('.status-filter-checkbox');
        if (checkboxes.length === 0) {
            // If checkboxes haven't been rendered yet, return all statuses
            return allStatuses;
        }
        
        const checked = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        
        // Return statuses in the same order as allStatuses, but only checked ones
        return allStatuses.filter(status => checked.includes(status));
    }

    /**
     * Get filtered platforms based on checked checkboxes
     */
    getFilteredPlatforms() {
        const checkboxes = document.querySelectorAll('.platform-filter-checkbox');
        if (checkboxes.length === 0) {
            return null;
        }

        return Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    /**
     * Get filtered projects based on checked checkboxes
     */
    getFilteredProjects() {
        const checkboxes = document.querySelectorAll('.project-filter-checkbox');
        if (checkboxes.length === 0) {
            return null;
        }

        return Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    /**
     * Get filtered teams based on checked checkboxes
     */
    getFilteredTeams() {
        const checkboxes = document.querySelectorAll('.team-filter-checkbox');
        if (checkboxes.length === 0) {
            return null;
        }

        return Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    /**
     * Get filtered status categories
     */
    getFilteredStatusCategories() {
        const checkboxes = document.querySelectorAll('.status-category-filter-checkbox');
        if (checkboxes.length === 0) {
            return null;
        }

        return Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    /**
     * Get filtered fix versions
     */
    getFilteredFixVersions() {
        const checkboxes = document.querySelectorAll('.fixversion-filter-checkbox');
        if (checkboxes.length === 0) {
            return null;
        }

        return Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    /**
     * Get results filtered by platform selections (and status)
     */
    getPlatformFilteredResults() {
        const platforms = this.getFilteredPlatforms();
        const projects = this.getFilteredProjects();
        const teams = this.getFilteredTeams();
        const statusCategories = this.getFilteredStatusCategories();
        const fixVersions = this.getFilteredFixVersions();

        let baseResults = this.currentResults;

        // Apply Status filter (only if status checkboxes exist)
        const statusCheckboxes = document.querySelectorAll('.status-filter-checkbox');
        if (statusCheckboxes.length > 0) {
            const checkedStatuses = Array.from(statusCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);
            
            if (checkedStatuses.length === 0) {
                return [];
            }
            
            baseResults = baseResults.filter(issue => {
                const status = JiraClient.getStatus(issue);
                return checkedStatuses.includes(status);
            });
        }

        if (projects) {
            if (projects.length === 0) {
                return [];
            }
            baseResults = baseResults.filter(issue => {
                const project = JiraClient.getProject(issue);
                return projects.includes(project);
            });
        }

        if (teams) {
            if (teams.length === 0) {
                return [];
            }
            baseResults = baseResults.filter(issue => {
                const team = JiraClient.getTeam(issue);
                return teams.includes(team);
            });
        }

        if (statusCategories) {
            if (statusCategories.length === 0) {
                return [];
            }
            baseResults = baseResults.filter(issue => {
                const category = issue.fields.status?.statusCategory?.name || 'Unknown';
                return statusCategories.includes(category);
            });
        }

        if (fixVersions) {
            if (fixVersions.length === 0) {
                return [];
            }
            baseResults = baseResults.filter(issue => {
                const versions = JiraClient.getFixVersions(issue);
                if (versions === '-' || versions === '') return false;
                // Check if any of the issue's versions match the selected filter
                const issueVersions = versions.split(',').map(v => v.trim());
                return issueVersions.some(v => fixVersions.includes(v));
            });
        }

        if (!platforms) {
            return baseResults;
        }

        if (platforms.length === 0) {
            return [];
        }

        return baseResults.filter(issue => {
            const platformField = JiraClient.getPlatform(issue);
            const platform = platformField === '-' ? 'Unassigned' : platformField;
            return platforms.includes(platform);
        });
    }

    /**
     * Get filtered issues based on all filter checkboxes
     * (This now just returns the platform-filtered results which includes status filtering)
     */
    getFilteredIssues() {
        return this.getPlatformFilteredResults();
    }

    /**
     * Update the status table when filters change
     */
    updateStatusTable() {
        // Re-render the table using stored data, don't recalculate
        this.displayProjectTeamStatusSummary(false);
        this.displayProjectStatusSummary(false);
        this.displayPlatformStatusSummaryByStatus(false);
        this.displaySummary();
        this.displayPlatformStatusSummary();
        // Also refresh the issues list
        this.populateTable();
    }

    /**
     * Display chart for Platform & Status Category summary
     */
    displayPlatformStatusChart(platformData, sortedStatusCategories, sortedPlatforms) {
        const canvas = document.getElementById('platformStatusChart');
        if (!canvas) {
            console.log('Platform Status Chart canvas not found');
            return;
        }
        
        // ALWAYS destroy existing chart first
        if (this.platformStatusChartInstance) {
            console.log('Destroying existing Platform Status chart');
            this.platformStatusChartInstance.destroy();
            this.platformStatusChartInstance = null;
        }
        
        // Get selected metric
        const metricSelect = document.getElementById('platformStatusChartMetricSelect');
        const selectedMetric = metricSelect ? metricSelect.value : 'both';
        
        console.log('Creating Platform Status chart with selected metric:', selectedMetric);
        
        // Filter out Unassigned platforms for chart
        const filteredPlatforms = sortedPlatforms.filter(p => p !== 'Unassigned');
        
        // Prepare datasets for each status category
        const datasets = [];
        const colors = {
            'To Do': { bg: 'rgba(255, 152, 0, 0.6)', border: 'rgba(255, 152, 0, 1)' },
            'In Progress': { bg: 'rgba(33, 150, 243, 0.6)', border: 'rgba(33, 150, 243, 1)' },
            'Done': { bg: 'rgba(76, 175, 80, 0.6)', border: 'rgba(76, 175, 80, 1)' },
            'Unknown': { bg: 'rgba(158, 158, 158, 0.6)', border: 'rgba(158, 158, 158, 1)' }
        };
        
        if (selectedMetric === 'both' || selectedMetric === 'issues') {
            sortedStatusCategories.forEach((statusCategory, index) => {
                const issuesData = filteredPlatforms.map(platform => {
                    const platformMap = platformData.get(platform);
                    const statusData = platformMap?.get(statusCategory) || { count: 0, points: 0 };
                    return statusData.count;
                });
                
                const color = colors[statusCategory] || colors['Unknown'];
                datasets.push({
                    label: `${statusCategory} - Issues`,
                    data: issuesData,
                    backgroundColor: color.bg,
                    borderColor: color.border,
                    borderWidth: 1,
                    yAxisID: selectedMetric === 'both' ? 'y' : 'y-single',
                    stack: selectedMetric === 'issues' ? 'stack0' : `issues-${index}`
                });
            });
        }
        
        if (selectedMetric === 'both' || selectedMetric === 'points') {
            sortedStatusCategories.forEach((statusCategory, index) => {
                const pointsData = filteredPlatforms.map(platform => {
                    const platformMap = platformData.get(platform);
                    const statusData = platformMap?.get(statusCategory) || { count: 0, points: 0 };
                    return statusData.points;
                });
                
                const color = colors[statusCategory] || colors['Unknown'];
                datasets.push({
                    label: `${statusCategory} - Story Points`,
                    data: pointsData,
                    backgroundColor: color.bg,
                    borderColor: color.border,
                    borderWidth: 1,
                    yAxisID: selectedMetric === 'both' ? 'y1' : 'y-single',
                    stack: selectedMetric === 'points' ? 'stack0' : `points-${index}`
                });
            });
        }
        
        console.log('Creating chart with', datasets.length, 'dataset(s)');
        
        // Configure scales based on metric selection
        let scales = {};
        if (selectedMetric === 'both') {
            scales = {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Number of Issues'
                    },
                    beginAtZero: true,
                    stacked: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Story Points'
                    },
                    beginAtZero: true,
                    stacked: true,
                    grid: {
                        drawOnChartArea: false
                    }
                },
                x: {
                    stacked: true
                }
            };
        } else {
            scales = {
                'y-single': {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: selectedMetric === 'issues' ? 'Number of Issues' : 'Story Points'
                    },
                    beginAtZero: true,
                    stacked: true
                },
                x: {
                    stacked: true
                }
            };
        }
        
        // Determine chart title
        let chartTitle = 'Issues and Story Points by Platform & Status Category';
        if (selectedMetric === 'issues') {
            chartTitle = 'Issues by Platform & Status Category';
        } else if (selectedMetric === 'points') {
            chartTitle = 'Story Points by Platform & Status Category';
        }
        
        console.log('Chart title will be:', chartTitle);
        
        // Create new chart
        const ctx = canvas.getContext('2d');
        
        this.platformStatusChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: filteredPlatforms,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2.5,
                plugins: {
                    title: {
                        display: true,
                        text: chartTitle,
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: scales
            }
        });
        
        console.log('New Platform Status chart created successfully');
    }

    /**
     * Get CSS class for status badge based on status category
     */
    getStatusClass(statusCategory) {
        const lower = statusCategory.toLowerCase();
        if (lower.includes('done')) return 'done';
        if (lower.includes('progress')) return 'in-progress';
        return 'todo';
    }

    /**
     * Get CSS class for priority badge
     */
    getPriorityClass(priority) {
        const lower = priority.toLowerCase();
        if (lower.includes('high') || lower.includes('critical')) return 'high';
        if (lower.includes('medium')) return 'medium';
        if (lower.includes('low')) return 'low';
        return '';
    }

    /**
     * Clear results display
     */
    clearResults() {
        // Hide all summary and results sections
        document.getElementById('summarySection').hidden = true;
        document.getElementById('platformStatusSummarySection').hidden = true;
        document.getElementById('projectStatusSummarySection').hidden = true;
        document.getElementById('projectTeamStatusSummarySection').hidden = true;
        document.getElementById('platformStatusSummaryByStatusSection').hidden = true;
        document.getElementById('resultsSection').hidden = true;
        const statusFilterSection = document.getElementById('statusFilterSection');
        if (statusFilterSection) statusFilterSection.hidden = true;
        const statusCategoryFilterSection = document.getElementById('statusCategoryFilterSection');
        if (statusCategoryFilterSection) statusCategoryFilterSection.hidden = true;
        const platformFilterSection = document.getElementById('platformFilterSection');
        if (platformFilterSection) platformFilterSection.hidden = true;
        const projectFilterSection = document.getElementById('projectFilterSection');
        if (projectFilterSection) projectFilterSection.hidden = true;
        const teamFilterSection = document.getElementById('teamFilterSection');
        if (teamFilterSection) teamFilterSection.hidden = true;
        const fixVersionFilterSection = document.getElementById('fixVersionFilterSection');
        if (fixVersionFilterSection) fixVersionFilterSection.hidden = true;
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.hidden = true;
            exportBtn.style.display = 'none';
        }
        
        // Clear table contents
        document.getElementById('summaryTableBody').innerHTML = '';
        document.getElementById('platformStatusSummaryTableBody').innerHTML = '';
        document.getElementById('projectStatusSummaryTableHead').innerHTML = '';
        document.getElementById('projectStatusSummaryTableBody').innerHTML = '';
        document.getElementById('projectTeamStatusSummaryTableHead').innerHTML = '';
        document.getElementById('projectTeamStatusSummaryTableBody').innerHTML = '';
        document.getElementById('platformStatusSummaryByStatusTableHead').innerHTML = '';
        document.getElementById('platformStatusSummaryByStatusTableBody').innerHTML = '';
        const statusCheckboxesContainer = document.getElementById('statusCheckboxesContainer');
        if (statusCheckboxesContainer) statusCheckboxesContainer.innerHTML = '';
        const statusCategoryCheckboxesContainer = document.getElementById('statusCategoryCheckboxesContainer');
        if (statusCategoryCheckboxesContainer) statusCategoryCheckboxesContainer.innerHTML = '';
        const platformCheckboxesContainer = document.getElementById('platformCheckboxesContainer');
        if (platformCheckboxesContainer) platformCheckboxesContainer.innerHTML = '';
        const projectCheckboxesContainer = document.getElementById('projectCheckboxesContainer');
        if (projectCheckboxesContainer) projectCheckboxesContainer.innerHTML = '';
        const teamCheckboxesContainer = document.getElementById('teamCheckboxesContainer');
        if (teamCheckboxesContainer) teamCheckboxesContainer.innerHTML = '';
        const fixVersionCheckboxesContainer = document.getElementById('fixVersionCheckboxesContainer');
        if (fixVersionCheckboxesContainer) fixVersionCheckboxesContainer.innerHTML = '';
        document.getElementById('issuesTableBody').innerHTML = '';
        
        this.currentResults = [];
        this.hasLoadedResults = false;
    }

    /**
     * Open current issues in Jira
     */
    showInJira() {
        // Get the currently filtered issues from the table
        const filteredIssues = this.getFilteredIssues();
        
        if (!filteredIssues || filteredIssues.length === 0) {
            this.showNotification('No issues to show. Please run a query first.', 'error');
            return;
        }

        // Extract the keys from filtered issues
        const keys = filteredIssues.map(issue => issue.key);
        
        // Build JQL query for the filtered keys
        const jqlQuery = `key in (${keys.join(', ')})`;
        
        const jiraUrl = localStorage.getItem('jira_jiraUrl') || 'https://jira.rccl.com';
        const encodedJql = encodeURIComponent(jqlQuery);
        const jiraSearchUrl = `${jiraUrl}/issues/?jql=${encodedJql}`;
        
        window.open(jiraSearchUrl, '_blank');
    }

    /**
     * Export results to Excel
     */
    exportToExcel() {
        if (!window.XLSX) {
            showMessage('XLSX export library not loaded', 'error');
            return;
        }

        const workbook = XLSX.utils.book_new();

        // Create summary info sheet first
        if (this.lastExecutionInfo) {
            const summaryData = [
                ['Jira Export Summary'],
                [],
                ['Report Title', this.lastExecutionInfo.templateName],
                ['JQL Query', this.lastExecutionInfo.jqlQuery],
                ['Execution Time', this.lastExecutionInfo.executionTime],
                [],
                ['Filters Applied'],
                []
            ];

            // Add status filter info
            const statusCheckboxes = document.querySelectorAll('.status-filter-checkbox');
            if (statusCheckboxes.length > 0) {
                const selectedStatuses = Array.from(statusCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                summaryData.push(['Status Filter', selectedStatuses.join(', ') || 'None selected']);
            }

            // Add platform filter info
            const platformCheckboxes = document.querySelectorAll('.platform-filter-checkbox');
            if (platformCheckboxes.length > 0) {
                const selectedPlatforms = Array.from(platformCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                summaryData.push(['Platform Filter', selectedPlatforms.join(', ') || 'None selected']);
            }

            // Add project filter info
            const projectCheckboxes = document.querySelectorAll('.project-filter-checkbox');
            if (projectCheckboxes.length > 0) {
                const selectedProjects = Array.from(projectCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                summaryData.push(['Project Filter', selectedProjects.join(', ') || 'None selected']);
            }

            // Add team filter info
            const teamCheckboxes = document.querySelectorAll('.team-filter-checkbox');
            if (teamCheckboxes.length > 0) {
                const selectedTeams = Array.from(teamCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                summaryData.push(['Team Filter', selectedTeams.join(', ') || 'None selected']);
            }

            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Export Summary');
        }

        const addTableSheet = (tableId, sheetName) => {
            const table = document.getElementById(tableId);
            if (!table) return false;

            const rows = Array.from(table.querySelectorAll('tr'));
            
            // Find the "Created" column index if this is the issues table
            let createdColumnIndex = -1;
            let keyColumnIndex = -1;
            if (tableId === 'issuesTable' && rows.length > 0) {
                const headerCells = rows[0].querySelectorAll('th');
                headerCells.forEach((th, idx) => {
                    const headerText = th.textContent.trim();
                    if (headerText === 'Created') {
                        createdColumnIndex = idx;
                    } else if (headerText === 'Key') {
                        keyColumnIndex = idx;
                    }
                });
            }
            
            const data = rows.map((row, rowIdx) => Array.from(row.querySelectorAll('th, td'))
                .map((cell, colIdx) => {
                    const text = cell.textContent.trim();
                    
                    // Handle Key column - create hyperlink
                    if (colIdx === keyColumnIndex && rowIdx > 0) {
                        const key = cell.getAttribute('data-key') || text;
                        if (key && key !== '-') {
                            const jiraUrl = localStorage.getItem('jira_jiraUrl') || 'https://jira.rccl.com';
                            return {
                                t: 's',
                                v: key,
                                l: { Target: `${jiraUrl}/browse/${key}` }
                            };
                        }
                    }
                    
                    // Handle Created column - use data-date attribute if available
                    if (colIdx === createdColumnIndex && rowIdx > 0) {
                        const dateStr = cell.getAttribute('data-date');
                        if (dateStr && dateStr !== '') {
                            const parsedDate = new Date(dateStr);
                            if (!isNaN(parsedDate.getTime())) {
                                return parsedDate;
                            }
                        }
                    }
                    
                    // Try to parse as number, return number if valid, otherwise return text
                    const num = parseFloat(text);
                    return !isNaN(num) && text !== '' ? num : text;
                }));

            if (data.length === 0 || data.every(row => row.length === 0)) {
                return false;
            }

            const worksheet = XLSX.utils.aoa_to_sheet(data, { cellDates: true });

            // Handle hyperlinks in Key column
            if (keyColumnIndex >= 0 && tableId === 'issuesTable') {
                rows.forEach((row, rowIdx) => {
                    if (rowIdx > 0) { // Skip header row
                        const cellAddress = XLSX.utils.encode_cell({ r: rowIdx, c: keyColumnIndex });
                        const cellData = data[rowIdx][keyColumnIndex];
                        if (cellData && typeof cellData === 'object' && cellData.l) {
                            if (!worksheet[cellAddress]) worksheet[cellAddress] = {};
                            worksheet[cellAddress].l = cellData.l;
                            worksheet[cellAddress].v = cellData.v;
                            worksheet[cellAddress].t = 's';
                        }
                    }
                });
            }

            // Apply cell styling based on HTML background colors
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            
            rows.forEach((row, rowIdx) => {
                const cells = row.querySelectorAll('th, td');
                cells.forEach((cell, colIdx) => {
                    const cellAddress = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
                    if (!worksheet[cellAddress]) return;

                    // Get computed background color
                    const computedStyle = window.getComputedStyle(cell);
                    const bgColor = computedStyle.backgroundColor;
                    
                    // Convert rgb/rgba to hex
                    const rgbMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                    if (rgbMatch) {
                        const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
                        const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
                        const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
                        const hexColor = (r + g + b).toUpperCase();
                        
                        // Only apply fill if color is not white/transparent
                        if (hexColor !== 'FFFFFF' && bgColor !== 'rgba(0, 0, 0, 0)') {
                            if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
                            worksheet[cellAddress].s.fill = {
                                patternType: 'solid',
                                fgColor: { rgb: 'FF' + hexColor }
                            };
                        }
                    }

                    // Check if cell has strong/bold content (like headers or totals)
                    const hasStrong = cell.querySelector('strong') !== null;
                    const isTotalRow = row.classList.contains('summary-total-row');
                    const isHeader = cell.tagName === 'TH';
                    
                    if (hasStrong || isTotalRow || isHeader) {
                        if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
                        if (!worksheet[cellAddress].s.font) worksheet[cellAddress].s.font = {};
                        worksheet[cellAddress].s.font.bold = true;
                    }
                    
                    // Apply date formatting for Created column
                    if (colIdx === createdColumnIndex && rowIdx > 0) {
                        const cellObj = worksheet[cellAddress];
                        if (cellObj && cellObj.t === 'd') {
                            if (!cellObj.s) cellObj.s = {};
                            cellObj.z = 'm/d/yyyy';
                        }
                    }
                });
            });

            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            return true;
        };

        let hasAnySheet = false;

        // Export in the specified order with new sheet names
        hasAnySheet = addTableSheet('projectStatusSummaryTable', 'Project vs Status') || hasAnySheet;
        hasAnySheet = addTableSheet('projectTeamStatusSummaryTable', 'Project_Team vs Status') || hasAnySheet;
        hasAnySheet = addTableSheet('platformStatusSummaryByStatusTable', 'Platform vs Status') || hasAnySheet;
        hasAnySheet = addTableSheet('summaryTable', 'Summary by Platform') || hasAnySheet;
        hasAnySheet = addTableSheet('platformStatusSummaryTable', 'Platform vs Status Cat') || hasAnySheet;
        hasAnySheet = addTableSheet('issuesTable', 'Issues') || hasAnySheet;

        if (!hasAnySheet) {
            showMessage('No results to export', 'error');
            return;
        }

        const fileName = `jira-export-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
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

function showMessage(message, type = 'info') {
    let el = document.getElementById('statusMessageGlobal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'statusMessageGlobal';
        el.className = 'status-message';
        document.body.insertBefore(el, document.body.firstChild);
    }
    el.textContent = message;
    el.className = 'status-message ' + (type === 'error' ? 'error' : 'success');
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.jiraUI = new JiraUI();

    // EXPORT localStorage
    const exportBtn = document.getElementById('exportLocalStorageBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const data = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                data[key] = localStorage.getItem(key);
            }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jira-localstorage-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // IMPORT localStorage
    const importBtn = document.getElementById('importLocalStorageBtn');
    const importFileInput = document.getElementById('importLocalStorageFile');
    if (importBtn && importFileInput) {
        importBtn.addEventListener('click', () => {
            importFileInput.value = '';
            importFileInput.click();
        });
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (!confirm('WARNING: Importing will overwrite all existing localStorage values with those from the file. This action cannot be undone. Do you want to continue?')) {
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (typeof data === 'object' && data !== null) {
                        Object.entries(data).forEach(([key, value]) => {
                            localStorage.setItem(key, value);
                        });
                        showMessage('LocalStorage import successful! Please refresh the page to see changes.', 'success');
                    } else {
                        showMessage('Invalid file format.', 'error');
                    }
                } catch (err) {
                    showMessage('Failed to import: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        });
    }
});
