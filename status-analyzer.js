/* ===========================
   JIRA Changelog Analyzer
   =========================== */

/**
 * Changelog Analyzer Application
 */
class ChangelogAnalyzer {
    constructor() {
        this.proxyUrl = 'http://localhost:3000/api/jira';
        this.storagePrefix = 'jira_';
        this._sortState = { column: 'date', ascending: false };
        this._isCloseTicketAnalyzer = window.location.pathname.endsWith('/close-ticket-analyzer.html')
            || window.location.pathname.endsWith('close-ticket-analyzer.html');
        this._currentTicketKey = null;
        this._currentPrompt = null;
        this._lastExecutedJql = '';
        this._closeTicketSummarySort = { key: 'project', ascending: true };
        this._closeTicketIssuesSort = { key: 'project', ascending: true };
        this._issueCurrentStatusMap = new Map();
        this._issueStatusChangeTimeMap = new Map();
        this._issueStatusChangeTimeSortMap = new Map();
        this._issueChangelogStatusTimestampMap = new Map();
        this._issueChangelogStatusTimestampSortMap = new Map();
        this._issueDoneChangelogStatusTimestampMap = new Map();
        this._issueDoneChangelogStatusTimestampSortMap = new Map();
        this._issueProjectMap = new Map();
        this._issueTeamMap = new Map();
        this._rfsoSummaryRecords = [];
        this._initializeEventListeners();
    }

    /**
     * Get item from localStorage
     */
    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
    }

    /**
     * Get patterns from localStorage
     */
    _getPatterns() {
        const patternsJson = this.getStorage('status_patterns');
        return patternsJson ? JSON.parse(patternsJson) : [];
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
        const form = document.getElementById('analyzerForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAnalyze();
            });
        }

        const toggleBtn = document.getElementById('toggleChangelogBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleChangelogDetails());
        }

        const searchInput = document.getElementById('changelogSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterChangelog(e.target.value));
        }

        const toggleChangelogColumn = document.getElementById('toggleChangelogColumn');
        if (toggleChangelogColumn) {
            toggleChangelogColumn.addEventListener('change', (e) => {
                this._setChangelogColumnVisibility(e.target.checked);
            });
            this._setChangelogColumnVisibility(toggleChangelogColumn.checked);
        } else {
            this._setChangelogColumnVisibility(true);
        }

        const filterNoStatusChanges = document.getElementById('filterNoStatusChanges');
        if (filterNoStatusChanges) {
            filterNoStatusChanges.addEventListener('change', () => {
                if (this._lastIssueKeys) {
                    this._displayIssueKeyList(this._lastIssueKeys);
                }
            });
        }

        const showNoPatternFound = document.getElementById('showNoPatternFound');
        if (showNoPatternFound) {
            showNoPatternFound.addEventListener('change', () => {
                if (this._lastIssueKeys) {
                    this._displayIssueKeyList(this._lastIssueKeys);
                }
            });
        }

        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => {
                this.handleSort(header.dataset.sort);
            });
        });

        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExport());
        }

        const jqlQueryInput = document.getElementById('jqlQuery');
        if (jqlQueryInput) {
            jqlQueryInput.addEventListener('input', () => this._updateCombinedJqlPreview());
        }

        const startDateInput = document.getElementById('startDate');
        if (startDateInput) {
            startDateInput.addEventListener('input', () => this._updateCombinedJqlPreview());
            startDateInput.addEventListener('change', () => this._updateCombinedJqlPreview());
        }

        const endDateInput = document.getElementById('endDate');
        if (endDateInput) {
            endDateInput.addEventListener('input', () => this._updateCombinedJqlPreview());
            endDateInput.addEventListener('change', () => this._updateCombinedJqlPreview());
        }
    }

    _updateCombinedJqlPreview() {
        const preview = document.getElementById('combinedJqlPreview');
        if (!preview) return;

        const jqlQuery = document.getElementById('jqlQuery')?.value?.trim() || '';
        const startDateValue = document.getElementById('startDate')?.value?.trim() || '';
        const endDateValue = document.getElementById('endDate')?.value?.trim() || '';

        let combinedJql = jqlQuery;
        if (startDateValue) {
            const jqlDate = startDateValue.replace('T', ' ');
            const statusChangedClause = `'Status Changed' >= "${jqlDate}"`;
            combinedJql = combinedJql ? `${combinedJql} AND ${statusChangedClause}` : statusChangedClause;
        }

        if (endDateValue) {
            const jqlDate = endDateValue.replace('T', ' ');
            const statusChangedClause = `'Status Changed' <= "${jqlDate}"`;
            combinedJql = combinedJql ? `${combinedJql} AND ${statusChangedClause}` : statusChangedClause;
        }

        preview.value = combinedJql;
    }

    _getEffectiveJql() {
        const combinedJql = document.getElementById('combinedJqlPreview')?.value?.trim() || '';
        if (combinedJql) {
            return combinedJql;
        }

        const jqlQuery = document.getElementById('jqlQuery')?.value?.trim() || '';
        if (jqlQuery) {
            return jqlQuery;
        }

        const ticketKey = document.getElementById('ticketKey')?.value?.trim()?.toUpperCase() || '';
        if (ticketKey) {
            return `key = "${ticketKey}" ORDER BY updated DESC`;
        }

        return '';
    }

    /**
     * Show or hide the Changelog Events column
     */
    _setChangelogColumnVisibility(show) {
        document.querySelectorAll('.changelog-events-column').forEach(cell => {
            cell.style.display = show ? '' : 'none';
        });
    }

    /**
     * Initialize the Changelog Analyzer
     */
    async initializeApp() {
        try {
            console.log('🚀 Initializing Status Analyzer...');
            
            // Display user info
            await this._displayUserInfo();

            // Check for loaded template from config page
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const templateFromUrl = urlParams.get('template');
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                const templateFromHash = hashParams.get('template');
                const templateFromHrefMatch = window.location.href.match(/[?#&]template=([^&#]*)/);
                const templateFromHref = templateFromHrefMatch
                    ? decodeURIComponent(templateFromHrefMatch[1].replace(/\+/g, ' '))
                    : null;
                const templateQuery = templateFromUrl
                    || templateFromHash
                    || templateFromHref
                    || sessionStorage.getItem('jira_selected_jql_template')
                    || localStorage.getItem('jira_selected_jql_template');
                
                console.log('Template from URL:', templateFromUrl);
                console.log('Template from hash:', templateFromHash);
                console.log('Template from href:', templateFromHref);
                console.log('Final template query:', templateQuery);
                
                if (templateQuery) {
                    const jqlInput = document.getElementById('jqlQuery');
                    if (jqlInput) {
                        jqlInput.value = templateQuery;
                        console.log('JQL input populated with:', templateQuery);
                    }
                    
                    // Also populate report title with template name if available
                    const templateName = sessionStorage.getItem('jira_selected_template_name')
                        || localStorage.getItem('jira_selected_template_name');
                    if (templateName) {
                        const reportTitleInput = document.getElementById('reportTitle');
                        if (reportTitleInput) {
                            reportTitleInput.value = templateName;
                            console.log('Report title populated with:', templateName);
                        }
                        sessionStorage.removeItem('jira_selected_template_name');
                        localStorage.removeItem('jira_selected_template_name');
                    }
                    
                    sessionStorage.removeItem('jira_selected_jql_template');
                    localStorage.removeItem('jira_selected_jql_template');
                    if (templateFromUrl || templateFromHash) {
                        urlParams.delete('template');
                        hashParams.delete('template');
                        const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}`;
                        window.history.replaceState({}, document.title, newUrl);
                    }
                }
            } catch (templateError) {
                console.error('Error processing template:', templateError);
            }

            // Verify authentication is configured
            const authType = this.getStorage('authType');
            const username = this.getStorage('username');
            const bearerToken = this.getStorage('bearerToken');
            
            console.log('📋 Available localStorage configuration:');
            console.log(`   Auth Type: ${authType || '(not set)'}`);
            console.log(`   Username: ${username || '(not set)'}`);
            console.log(`   Bearer Token set: ${!!bearerToken}`);
            
            // Check if configuration exists
            if (!authType) {
                throw new Error('JIRA authentication not configured. Please complete the setup page first');
            }

            console.log('✅ Status Analyzer initialized');
            console.log(`   Proxy URL: ${this.proxyUrl}`);
            console.log(`   Auth Type: ${authType}`);

            this._updateCombinedJqlPreview();

        } catch (error) {
            console.error('❌ Initialization error:', error);
            this._showMessage(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Display user information from the API
     */
    async _displayUserInfo() {
        try {
            const proxyUrl = this.getStorage('proxyUrl') || this.proxyUrl;
            const authType = this.getStorage('authType');

            if (!proxyUrl || !authType) {
                return; // Not configured yet
            }

            const headers = this.getAuthHeaders();
            if (!headers.Authorization) {
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

        const displayName = user.displayName || user.name || 'User';
        if (userNameSpan) {
            userNameSpan.textContent = displayName;
        }
        if (userEmailSpan) {
            userEmailSpan.textContent = user.emailAddress || '';
        }

        if (userAvatar && userInitials) {
            if (user.avatarUrls && user.avatarUrls['48x48']) {
                userAvatar.src = user.avatarUrls['48x48'];
                userAvatar.style.display = 'block';
                userInitials.style.display = 'none';
            } else {
                const initials = this._generateInitials(displayName);
                userInitials.textContent = initials;
                userAvatar.style.display = 'none';
                userInitials.style.display = 'flex';
            }
        }

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
     * Show status message
     */
    _showMessage(message, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = `status-message status-${type}`;
            statusDiv.hidden = false;
        }
    }

    /**
     * Hide status message
     */
    _hideStatus() {
        const statusDiv = document.getElementById('statusMessage');
        if (statusDiv) {
            statusDiv.hidden = true;
        }
    }

    /**
     * Toggle loading state for Analyze button
     */
    _setAnalyzeLoading(isLoading) {
        const analyzeBtn = document.getElementById('analyzeBtn');
        const loadingMessage = document.getElementById('analyzeLoadingMessage');
        if (analyzeBtn) {
            analyzeBtn.disabled = isLoading;
        }
        if (loadingMessage) {
            loadingMessage.hidden = !isLoading;
        }
    }

    /**
     * Handle form submission
     */
    async handleAnalyze() {
        this._updateCombinedJqlPreview();

        if (this._isCloseTicketAnalyzer) {
            const startDate = document.getElementById('startDate')?.value?.trim() || '';
            if (!startDate) {
                this._showMessage('Please select a From date/time before analyzing tickets.', 'error');
                return;
            }
        }

        const jqlQueryInput = document.getElementById('jqlQuery');
        const jqlQuery = jqlQueryInput ? jqlQueryInput.value.trim() : '';
        const ticketKeyInput = document.getElementById('ticketKey');
        const ticketKey = ticketKeyInput ? ticketKeyInput.value.trim().toUpperCase() : '';
        const combinedJqlPreview = document.getElementById('combinedJqlPreview');
        const combinedJql = combinedJqlPreview ? combinedJqlPreview.value.trim() : '';

        if (!combinedJql && !jqlQuery && !ticketKey) {
            this._showMessage('Please enter a JQL query or a ticket key', 'error');
            return;
        }

        if (ticketKey && !/^[A-Z]+-\d+$/.test(ticketKey)) {
            this._showMessage('Invalid ticket key format (e.g., OPR-1234)', 'error');
            return;
        }

        const jql = this._getEffectiveJql();
        this._lastExecutedJql = jql;

        this._setAnalyzeLoading(true);
        this._showMessage('⏳ Fetching issue keys...', 'loading');
        this._hideAllSections();

        try {
            const issueKeys = await this._fetchIssueKeys(jql);

            if (issueKeys.length > 0) {
                if (this._isCloseTicketAnalyzer) {
                    this._closeTicketSummarySort = { key: 'project', ascending: true };
                    this._issueChangelogMap = new Map();
                    this._issueStatusChangeMap = new Map();
                    this._issuePlatformMap = new Map();
                    this._issueCurrentStatusMap = new Map();
                    this._issueStatusChangeTimeMap = new Map();
                    this._issueStatusChangeTimeSortMap = new Map();
                    this._issueChangelogStatusTimestampMap = new Map();
                    this._issueChangelogStatusTimestampSortMap = new Map();
                    this._issueDoneChangelogStatusTimestampMap = new Map();
                    this._issueDoneChangelogStatusTimestampSortMap = new Map();
                    this._issueProjectMap = new Map();
                    this._issueTeamMap = new Map();
                    await this._fetchIssueFieldsForKeys(issueKeys);
                    await this._fetchChangelogStatusTimestampsForKeys(issueKeys);

                    const includeMovedToRFSO = document.getElementById('includeMovedToRFSO')?.checked ?? false;
                    this._rfsoSummaryRecords = [];
                    if (includeMovedToRFSO) {
                        const rfsoJql = this._buildRFSOSummaryJql(this._lastExecutedJql);
                        if (rfsoJql) {
                            const rfsoIssueKeys = await this._fetchIssueKeys(rfsoJql);
                            this._rfsoSummaryRecords = await this._fetchIssueSummaryRecordsForKeys(rfsoIssueKeys);
                        }
                    }

                    this._displayIssueKeyList(issueKeys);
                    this._showMessage(`✅ Loaded ${issueKeys.length} tickets from JQL`, 'success');
                } else {
                    this._showMessage('⏳ Fetching changelogs for issues...', 'loading');
                    const changelogResults = await this._fetchChangelogsForIssueKeys(issueKeys);
                    const successCount = changelogResults.filter(result => !result.error).length;
                    const failureCount = changelogResults.length - successCount;

                    this._displayIssueKeyList(issueKeys);

                    const failureText = failureCount > 0 ? ` (${failureCount} failed)` : '';
                    this._showMessage(`✅ Changelogs loaded for ${successCount} issues${failureText}`, 'success');
                }
                setTimeout(() => this._hideStatus(), 3000);
            } else {
                this._showMessage('✅ No issues found for the query', 'success');
                setTimeout(() => this._hideStatus(), 3000);
            }
        } catch (error) {
            console.error('❌ Error fetching issue keys:', error);
            this._showMessage(`Error: ${error.message}`, 'error');
        } finally {
            this._setAnalyzeLoading(false);
        }
    }

    /**
     * Fetch changelog data for each issue key
     */
    async _fetchChangelogsForIssueKeys(issueKeys) {
        const results = [];
        this._issueChangelogMap = new Map();
        this._issueStatusChangeMap = new Map();
        this._issuePlatformMap = new Map();

        for (const issueKey of issueKeys) {
            try {
                const ticketData = await this._fetchTicketData(issueKey);
                const statusChanges = this._extractStatusChanges(ticketData);
                const platform = this._extractPlatform(ticketData);
                this._issueChangelogMap.set(issueKey, ticketData.changelog || null);
                this._issueStatusChangeMap.set(issueKey, statusChanges);
                this._issuePlatformMap.set(issueKey, platform);
                results.push({ issueKey, data: ticketData, statusChanges });
            } catch (error) {
                this._issueChangelogMap.set(issueKey, null);
                this._issueStatusChangeMap.set(issueKey, []);
                this._issuePlatformMap.set(issueKey, '-');
                results.push({ issueKey, error: error.message });
            }
        }

        return results;
    }

    /**
     * Extract only status changes from a ticket changelog
     */
    _extractStatusChanges(ticketData) {
        const histories = ticketData.changelog?.histories || [];
        const statusChanges = [];
        const ignoredFields = new Set(['customfield_17903', 'Status Changed']);

        histories.forEach(history => {
            history.items.forEach(item => {
                if (ignoredFields.has(item.field)) {
                    return;
                }

                const isStatusField =
                    item.fieldId === 'status' ||
                    item.field?.toLowerCase() === 'status';

                if (!isStatusField) {
                    return;
                }

                statusChanges.push({
                    date: new Date(history.created),
                    dateString: new Date(history.created).toLocaleString(),
                    author: history.author.displayName,
                    fromStatus: item.fromString || item.from || '-',
                    toStatus: item.toString || item.to || '-'
                });
            });
        });

        return statusChanges.sort((a, b) => a.date - b.date);
    }

    /**
     * Extract platform field from ticket data
     */
    _extractPlatform(ticketData) {
        if (!ticketData || !ticketData.fields) return '-';
        const platform = ticketData.fields.customfield_11500;
        if (!platform) return '-';
        if (typeof platform === 'string') return platform;
        if (platform.value) return platform.value;
        return '-';
    }

    _extractTeam(ticketData) {
        if (!ticketData || !ticketData.fields) return '-';
        const team = ticketData.fields.customfield_10114;
        if (!team) return '-';
        if (typeof team === 'string') return team;
        if (team.value) return team.value;
        if (team.name) return team.name;
        return '-';
    }

    /**
     * Build workflow path from status changes (showing all transitions including repeats)
     */
    _buildWorkflowPath(statusChanges) {
        if (!statusChanges || statusChanges.length === 0) {
            return 'No status changes';
        }

        const statuses = [];
        
        // Add the initial status (from first change)
        if (statusChanges.length > 0) {
            statuses.push(statusChanges[0].fromStatus);
        }
        
        // Add all the "to" statuses in order (including repeats to show back-and-forth)
        statusChanges.forEach(change => {
            statuses.push(change.toStatus);
        });
        
        return statuses.map(status => this._escapeHtml(status)).join(' → ');
    }

    /**
     * Find patterns that match in the status changes
     */
    _findMatchingPatterns(statusChanges) {
        if (!statusChanges || statusChanges.length === 0) {
            return [];
        }

        const patterns = this._getPatterns();
        // Sort patterns by priority (ascending) before matching
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));
        const matchedPatterns = [];

        console.log('🔍 Pattern Detection Debug:');
        console.log('Available patterns:', patterns);
        console.log('Status changes to check:', statusChanges.map(c => ({
            from: c.fromStatus,
            to: c.toStatus,
            fromType: typeof c.fromStatus,
            toType: typeof c.toStatus
        })));

        // Check each pattern against all status transitions
        patterns.forEach(pattern => {
            console.log(`\nChecking pattern "${pattern.name}" (${pattern.from} → ${pattern.to})`);
            
            const found = statusChanges.some(change => {
                // Trim whitespace and compare
                const changeFrom = (change.fromStatus || '').trim();
                const changeTo = (change.toStatus || '').trim();
                const patternFrom = (pattern.from || '').trim();
                const patternTo = (pattern.to || '').trim();
                
                const matches = changeFrom === patternFrom && changeTo === patternTo;
                
                if (matches) {
                    console.log(`  ✅ Match found: ${changeFrom} → ${changeTo}`);
                }
                
                return matches;
            });
            
            if (found) {
                matchedPatterns.push(pattern.name);
            } else {
                console.log(`  ❌ No match for pattern "${pattern.name}"`);
            }
        });

        console.log('\n📊 Final matched patterns:', matchedPatterns);
        return matchedPatterns;
    }

    /**
     * Find the last matching pattern in the workflow path
     */
    _findLastMatchingPattern(statusChanges) {
        if (!statusChanges || statusChanges.length === 0) {
            return null;
        }

        const patterns = this._getPatterns();
        patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));

        let lastPatternName = null;

        statusChanges.forEach(change => {
            const changeFrom = (change.fromStatus || '').trim();
            const changeTo = (change.toStatus || '').trim();

            const matchingPattern = patterns.find(pattern => {
                const patternFrom = (pattern.from || '').trim();
                const patternTo = (pattern.to || '').trim();
                return changeFrom === patternFrom && changeTo === patternTo;
            });

            if (matchingPattern) {
                lastPatternName = matchingPattern.name;
            }
        });

        return lastPatternName;
    }

    /**
     * Fetch issue keys from JIRA using JQL
     */
    async _fetchIssueKeys(jql) {
        const configuredMaxResults = Number(this.getStorage('maxResults'));
        const maxTotal = Number.isFinite(configuredMaxResults) && configuredMaxResults > 0
            ? configuredMaxResults
            : 1000;
        const jiraMaxPageSize = 100;
        let startAt = 0;
        let totalAvailable = Number.POSITIVE_INFINITY;
        const issueKeys = [];

        while (issueKeys.length < maxTotal && startAt < totalAvailable) {
            const remainingCapacity = maxTotal - issueKeys.length;
            const requestSize = Math.min(jiraMaxPageSize, remainingCapacity);
            const searchParams = new URLSearchParams({
                jql: jql,
                startAt: String(startAt),
                maxResults: String(requestSize),
                fields: 'key'
            });

            const requestOptions = {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    endpoint: `/search?${searchParams.toString()}`,
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

            const issues = data.issues || [];
            totalAvailable = Number.isFinite(data.total) ? data.total : totalAvailable;
            issueKeys.push(...issues.map(issue => issue.key));

            if (issues.length === 0) {
                break;
            }

            startAt += issues.length;
        }

        return issueKeys;
    }

    async _fetchIssueFieldsForKeys(issueKeys) {
        if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
            return;
        }

        const batchSize = 50;
        for (let index = 0; index < issueKeys.length; index += batchSize) {
            const batch = issueKeys.slice(index, index + batchSize);
            const jql = `key in (${batch.map(key => `"${key}"`).join(',')})`;
            const searchParams = new URLSearchParams({
                jql,
                maxResults: String(batch.length),
                fields: 'key,project,status,customfield_11500,customfield_17903,customfield_10114'
            });

            const response = await fetch(this.proxyUrl, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({
                    endpoint: `/search?${searchParams.toString()}`,
                    options: { method: 'GET' }
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const errorMessage = data.errorMessages?.[0] || data.error || `API Error: ${response.status}`;
                throw new Error(errorMessage);
            }

            const issues = data.issues || [];
            issues.forEach((issue) => {
                const key = issue?.key;
                if (!key) return;

                const project = issue?.fields?.project?.name || issue?.fields?.project?.key || '-';
                const team = this._extractTeam(issue);
                const platform = this._extractPlatform(issue);
                const status = issue?.fields?.status?.name || '-';
                const statusChangeTimeRaw = issue?.fields?.customfield_17903;
                let statusChangeTime = '-';
                let statusChangeTimeSortValue = Number.POSITIVE_INFINITY;

                if (statusChangeTimeRaw) {
                    if (typeof statusChangeTimeRaw === 'string') {
                        const parsedDate = new Date(statusChangeTimeRaw);
                        if (!Number.isNaN(parsedDate.getTime())) {
                            statusChangeTimeSortValue = parsedDate.getTime();
                        }
                        statusChangeTime = Number.isNaN(parsedDate.getTime())
                            ? statusChangeTimeRaw
                            : parsedDate.toLocaleString();
                    } else if (typeof statusChangeTimeRaw === 'number') {
                        const parsedDate = new Date(statusChangeTimeRaw);
                        if (!Number.isNaN(parsedDate.getTime())) {
                            statusChangeTimeSortValue = parsedDate.getTime();
                        }
                        statusChangeTime = Number.isNaN(parsedDate.getTime())
                            ? String(statusChangeTimeRaw)
                            : parsedDate.toLocaleString();
                    } else if (typeof statusChangeTimeRaw === 'object') {
                        const objectValue = statusChangeTimeRaw.value || statusChangeTimeRaw.date || statusChangeTimeRaw.name || null;
                        if (objectValue) {
                            const parsedDate = new Date(objectValue);
                            if (!Number.isNaN(parsedDate.getTime())) {
                                statusChangeTimeSortValue = parsedDate.getTime();
                            }
                            statusChangeTime = Number.isNaN(parsedDate.getTime())
                                ? String(objectValue)
                                : parsedDate.toLocaleString();
                        }
                    }
                }

                this._issueProjectMap.set(key, project);
                this._issueTeamMap.set(key, team || '-');
                this._issuePlatformMap.set(key, platform || '-');
                this._issueCurrentStatusMap.set(key, status);
                this._issueStatusChangeTimeMap.set(key, statusChangeTime);
                this._issueStatusChangeTimeSortMap.set(key, statusChangeTimeSortValue);
            });
        }
    }

    _buildRFSOSummaryJql(baseJql) {
        const cleanedBase = (baseJql || '').replace(/\s+ORDER\s+BY[\s\S]*$/i, '').trim();
        if (!cleanedBase) return '';
        return `(${cleanedBase}) AND status CHANGED TO "Ready For SignOff"`;
    }

    async _fetchIssueSummaryRecordsForKeys(issueKeys) {
        if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
            return [];
        }

        const records = [];
        const startDateInput = document.getElementById('startDate')?.value?.trim() || '';
        const endDateInput = document.getElementById('endDate')?.value?.trim() || '';
        const startDate = startDateInput ? new Date(startDateInput) : null;
        const endDate = endDateInput ? new Date(endDateInput) : null;

        const toDateKey = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const normalizeStatus = (value) => (value || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const targetStatus = normalizeStatus('Ready For SignOff');

        for (const issueKey of issueKeys) {
            try {
                const ticketData = await this._fetchTicketData(issueKey);
                const project = ticketData?.fields?.project?.name || ticketData?.fields?.project?.key || '-';
                const team = this._extractTeam(ticketData);
                const statusChanges = this._extractStatusChanges(ticketData);

                statusChanges.forEach((change) => {
                    if (normalizeStatus(change.toStatus) !== targetStatus) {
                        return;
                    }

                    if (startDate && change.date < startDate) {
                        return;
                    }
                    if (endDate && change.date > endDate) {
                        return;
                    }

                    records.push({
                        key: issueKey,
                        project,
                        team,
                        statusChangeDateKey: toDateKey(change.date)
                    });
                });
            } catch (error) {
                console.warn(`Failed to fetch changelog for RFSO summary on ${issueKey}:`, error);
            }
        }

        return records;
    }

    async _fetchChangelogStatusTimestampsForKeys(issueKeys) {
        if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
            return;
        }

        const startDateInput = document.getElementById('startDate')?.value?.trim() || '';
        const endDateInput = document.getElementById('endDate')?.value?.trim() || '';
        const startDate = startDateInput ? new Date(startDateInput) : null;
        const endDate = endDateInput ? new Date(endDateInput) : null;
        const normalizeStatus = (value) => (value || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
        const rfsoTargetStatus = normalizeStatus('Ready For SignOff');
        const doneTargetStatus = normalizeStatus('Ready For Production');

        const pickLatestChange = (changes) => {
            let filteredChanges = changes;
            if (startDate || endDate) {
                filteredChanges = changes.filter((change) => {
                    if (startDate && change.date < startDate) return false;
                    if (endDate && change.date > endDate) return false;
                    return true;
                });
            }

            if (filteredChanges.length) return filteredChanges[filteredChanges.length - 1];
            if (changes.length) return changes[changes.length - 1];
            return null;
        };

        for (const issueKey of issueKeys) {
            try {
                const ticketData = await this._fetchTicketData(issueKey);
                const statusChanges = this._extractStatusChanges(ticketData);

                const rfsoChanges = statusChanges.filter((change) => normalizeStatus(change.toStatus) === rfsoTargetStatus);
                const doneChanges = statusChanges.filter((change) => normalizeStatus(change.toStatus) === doneTargetStatus);
                const selectedRfsoChange = pickLatestChange(rfsoChanges);
                const selectedDoneChange = pickLatestChange(doneChanges);

                if (selectedRfsoChange) {
                    this._issueChangelogStatusTimestampMap.set(issueKey, selectedRfsoChange.dateString || '-');
                    this._issueChangelogStatusTimestampSortMap.set(issueKey, selectedRfsoChange.date?.getTime?.() ?? Number.POSITIVE_INFINITY);
                } else {
                    this._issueChangelogStatusTimestampMap.set(issueKey, '-');
                    this._issueChangelogStatusTimestampSortMap.set(issueKey, Number.POSITIVE_INFINITY);
                }

                if (selectedDoneChange) {
                    this._issueDoneChangelogStatusTimestampMap.set(issueKey, selectedDoneChange.dateString || '-');
                    this._issueDoneChangelogStatusTimestampSortMap.set(issueKey, selectedDoneChange.date?.getTime?.() ?? Number.POSITIVE_INFINITY);
                } else {
                    this._issueDoneChangelogStatusTimestampMap.set(issueKey, '-');
                    this._issueDoneChangelogStatusTimestampSortMap.set(issueKey, Number.POSITIVE_INFINITY);
                }
            } catch (error) {
                this._issueChangelogStatusTimestampMap.set(issueKey, '-');
                this._issueChangelogStatusTimestampSortMap.set(issueKey, Number.POSITIVE_INFINITY);
                this._issueDoneChangelogStatusTimestampMap.set(issueKey, '-');
                this._issueDoneChangelogStatusTimestampSortMap.set(issueKey, Number.POSITIVE_INFINITY);
            }
        }
    }

    /**
     * Display list of issue keys
     */
    _displayIssueKeyList(issueKeys) {
        this._lastIssueKeys = issueKeys;
        const listSection = document.getElementById('issueListSection');
        const listElement = document.getElementById('issueKeyList');
        const issueCount = document.getElementById('issueCount');
        const patternSummaryBody = document.getElementById('patternSummaryBody');
        const codeReviewSummaryBody = document.getElementById('codeReviewSummaryBody');

        // Get timeframe filters
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;

        const filterNoStatusChangesCheckbox = document.getElementById('filterNoStatusChanges');
        const showNoPatternFoundCheckbox = document.getElementById('showNoPatternFound');
        const showNoStatusChanges = filterNoStatusChangesCheckbox ? filterNoStatusChangesCheckbox.checked : true;
        const showNoPatternFound = showNoPatternFoundCheckbox ? showNoPatternFoundCheckbox.checked : true;

        if (this._isCloseTicketAnalyzer) {
            const summaryHead = document.getElementById('projectTeamDateSummaryHead');
            const summaryBody = document.getElementById('projectTeamDateSummaryBody');

            const formatDateKey = (timestamp) => {
                const date = new Date(timestamp);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const dateSet = new Set();
            const summaryMap = new Map();

            issueKeys.forEach((key) => {
                const project = this._issueProjectMap?.get(key) || '-';
                const team = this._issueTeamMap?.get(key) || '-';
                const groupKey = `${project}|||${team}`;
                const timestamp = this._issueStatusChangeTimeSortMap?.get(key);
                const dateKey = Number.isFinite(timestamp) ? formatDateKey(timestamp) : 'No Date';

                dateSet.add(dateKey);

                if (!summaryMap.has(groupKey)) {
                    summaryMap.set(groupKey, {
                        project,
                        team,
                        counts: new Map(),
                        total: 0
                    });
                }

                const entry = summaryMap.get(groupKey);
                entry.counts.set(dateKey, (entry.counts.get(dateKey) || 0) + 1);
                entry.total += 1;
            });

            const sortedDateColumns = Array.from(dateSet).sort((left, right) => {
                if (left === 'No Date') return 1;
                if (right === 'No Date') return -1;
                return left.localeCompare(right);
            });

            const summaryRows = Array.from(summaryMap.values());

            const getSummarySortValue = (entry, sortKey) => {
                if (sortKey === 'project') return (entry.project || '').toLowerCase();
                if (sortKey === 'team') return (entry.team || '').toLowerCase();
                if (sortKey === 'total') return entry.total || 0;
                if (sortKey && sortKey.startsWith('date:')) {
                    const dateKey = sortKey.slice(5);
                    return entry.counts.get(dateKey) || 0;
                }
                return '';
            };

            const sortedSummaryRows = [...summaryRows].sort((left, right) => {
                const sortKey = this._closeTicketSummarySort?.key || 'project';
                const ascending = this._closeTicketSummarySort?.ascending ?? true;
                const direction = ascending ? 1 : -1;

                const leftValue = getSummarySortValue(left, sortKey);
                const rightValue = getSummarySortValue(right, sortKey);

                if (leftValue < rightValue) return -1 * direction;
                if (leftValue > rightValue) return 1 * direction;

                const projectCompare = (left.project || '').localeCompare(right.project || '');
                if (projectCompare !== 0) return projectCompare;
                return (left.team || '').localeCompare(right.team || '');
            });

            if (summaryHead && summaryBody) {
                const summarySortKey = this._closeTicketSummarySort?.key || 'project';
                const summaryAscending = this._closeTicketSummarySort?.ascending ?? true;
                const getSummaryHeaderClass = (key) => {
                    if (summarySortKey !== key) return 'sortable';
                    return summaryAscending ? 'sortable sorted-asc' : 'sortable sorted-desc';
                };

                const headerCells = [
                    `<th class="${getSummaryHeaderClass('project')}" data-sort-key="project">Project <span class="sort-arrow"></span></th>`,
                    `<th class="${getSummaryHeaderClass('team')}" data-sort-key="team">Team <span class="sort-arrow"></span></th>`,
                    ...sortedDateColumns.map((date) => {
                        const key = `date:${date}`;
                        return `<th class="${getSummaryHeaderClass(key)}" data-sort-key="${this._escapeHtml(key)}">${this._escapeHtml(date)} <span class="sort-arrow"></span></th>`;
                    }),
                    `<th class="${getSummaryHeaderClass('total')}" data-sort-key="total">Total <span class="sort-arrow"></span></th>`
                ];
                summaryHead.innerHTML = `<tr>${headerCells.join('')}</tr>`;

                if (sortedSummaryRows.length === 0) {
                    const colspan = 3 + sortedDateColumns.length;
                    summaryBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999;">No data available</td></tr>`;
                } else {
                    const totalsByDate = new Map();
                    let grandTotal = 0;

                    const bodyRowsHtml = sortedSummaryRows.map((entry) => {
                        const encodedGroupKey = encodeURIComponent(`${entry.project}|||${entry.team}`);
                        const dateCells = sortedDateColumns.map((date) => {
                            const count = entry.counts.get(date) || 0;
                            totalsByDate.set(date, (totalsByDate.get(date) || 0) + count);
                            return `<td class="summary-selectable-cell" data-select-type="group-date" data-date-key="${this._escapeHtml(date)}" style="text-align:center;">${count}</td>`;
                        }).join('');

                        grandTotal += entry.total;

                        return (
                            `<tr class="summary-selectable-row" data-row-type="group" data-group-key="${encodedGroupKey}">` +
                            `<td class="summary-selectable-cell" data-select-type="group-row">${this._escapeHtml(entry.project)}</td>` +
                            `<td class="summary-selectable-cell" data-select-type="group-row">${this._escapeHtml(entry.team)}</td>` +
                            `${dateCells}` +
                            `<td class="summary-selectable-cell" data-select-type="group-row" style="font-weight:700; text-align:center;">${entry.total}</td>` +
                            `</tr>`
                        );
                    }).join('');

                    const totalDateCells = sortedDateColumns.map((date) => {
                        const totalCount = totalsByDate.get(date) || 0;
                        return `<td class="summary-selectable-cell" data-select-type="total-date" data-date-key="${this._escapeHtml(date)}" style="font-weight:700; text-align:center;">${totalCount}</td>`;
                    }).join('');

                    const totalRowHtml = (
                        `<tr class="summary-total-row summary-selectable-row" data-row-type="total">` +
                        `<td class="summary-selectable-cell" data-select-type="total-all" style="font-weight:700;">Total</td>` +
                        `<td class="summary-selectable-cell" data-select-type="total-all" style="font-weight:700;">All Teams</td>` +
                        `${totalDateCells}` +
                        `<td class="summary-selectable-cell" data-select-type="total-all" style="font-weight:700; text-align:center;">${grandTotal}</td>` +
                        `</tr>`
                    );

                    summaryBody.innerHTML = bodyRowsHtml + totalRowHtml;
                }
            }

            const movedToRFSOSection = document.getElementById('movedToRFSOSummarySection');
            const movedToRFSOHead = document.getElementById('movedToRFSOSummaryHead');
            const movedToRFSOBody = document.getElementById('movedToRFSOSummaryBody');
            const includeMovedToRFSO = document.getElementById('includeMovedToRFSO')?.checked ?? false;

            if (movedToRFSOSection) {
                movedToRFSOSection.hidden = !includeMovedToRFSO;
            }

            if (includeMovedToRFSO && movedToRFSOHead && movedToRFSOBody) {
                const rfsoDateSet = new Set();
                const rfsoGroupMap = new Map();

                this._rfsoSummaryRecords.forEach((record) => {
                    const project = record.project || '-';
                    const team = record.team || '-';
                    const dateKey = record.statusChangeDateKey || 'No Date';
                    const groupKey = `${project}|||${team}`;

                    rfsoDateSet.add(dateKey);

                    if (!rfsoGroupMap.has(groupKey)) {
                        rfsoGroupMap.set(groupKey, {
                            project,
                            team,
                            counts: new Map(),
                            total: 0
                        });
                    }

                    const entry = rfsoGroupMap.get(groupKey);
                    entry.counts.set(dateKey, (entry.counts.get(dateKey) || 0) + 1);
                    entry.total += 1;
                });

                const rfsoSortedDates = Array.from(rfsoDateSet).sort((left, right) => {
                    if (left === 'No Date') return 1;
                    if (right === 'No Date') return -1;
                    return left.localeCompare(right);
                });

                movedToRFSOHead.innerHTML = `<tr>${[
                    '<th>Project</th>',
                    '<th>Team</th>',
                    ...rfsoSortedDates.map((date) => `<th>${this._escapeHtml(date)}</th>`),
                    '<th>Total</th>'
                ].join('')}</tr>`;

                const rfsoRows = Array.from(rfsoGroupMap.values()).sort((left, right) => {
                    const projectCompare = (left.project || '').localeCompare(right.project || '');
                    if (projectCompare !== 0) return projectCompare;
                    return (left.team || '').localeCompare(right.team || '');
                });

                if (!rfsoRows.length) {
                    const colspan = 3 + rfsoSortedDates.length;
                    movedToRFSOBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:#999;">No tickets moved to Ready For SignOff in the selected timeframe</td></tr>`;
                } else {
                    const totalsByDate = new Map();
                    let grandTotal = 0;

                    const bodyRowsHtml = rfsoRows.map((entry) => {
                        const encodedGroupKey = encodeURIComponent(`${entry.project}|||${entry.team}`);
                        const dateCells = rfsoSortedDates.map((date) => {
                            const count = entry.counts.get(date) || 0;
                            totalsByDate.set(date, (totalsByDate.get(date) || 0) + count);
                            return `<td class="summary-selectable-cell" data-select-type="group-date" data-date-key="${this._escapeHtml(date)}" style="text-align:center;">${count}</td>`;
                        }).join('');

                        grandTotal += entry.total;

                        return (
                            `<tr class="summary-selectable-row" data-row-type="group" data-group-key="${encodedGroupKey}">` +
                            `<td class="summary-selectable-cell" data-select-type="group-row">${this._escapeHtml(entry.project)}</td>` +
                            `<td class="summary-selectable-cell" data-select-type="group-row">${this._escapeHtml(entry.team)}</td>` +
                            `${dateCells}` +
                            `<td class="summary-selectable-cell" data-select-type="group-row" style="font-weight:700; text-align:center;">${entry.total}</td>` +
                            `</tr>`
                        );
                    }).join('');

                    const totalDateCells = rfsoSortedDates.map((date) => {
                        const totalCount = totalsByDate.get(date) || 0;
                        return `<td class="summary-selectable-cell" data-select-type="total-date" data-date-key="${this._escapeHtml(date)}" style="font-weight:700; text-align:center;">${totalCount}</td>`;
                    }).join('');

                    const totalRowHtml = (
                        `<tr class="summary-total-row summary-selectable-row" data-row-type="total">` +
                        `<td class="summary-selectable-cell" data-select-type="total-all" style="font-weight:700;">Total</td>` +
                        `<td class="summary-selectable-cell" data-select-type="total-all" style="font-weight:700;">All Teams</td>` +
                        `${totalDateCells}` +
                        `<td class="summary-selectable-cell" data-select-type="total-all" style="font-weight:700; text-align:center;">${grandTotal}</td>` +
                        `</tr>`
                    );

                    movedToRFSOBody.innerHTML = bodyRowsHtml + totalRowHtml;
                }
            }

            const closeTicketIssuesContainer = document.getElementById('closeTicketIssuesContainer');
            const closeTicketIssuesHint = document.getElementById('closeTicketIssuesHint');
            const summaryTable = document.getElementById('projectTeamDateSummaryTable');
            const movedToRFSOTable = document.getElementById('movedToRFSOSummaryTable');
            const issueTable = document.getElementById('issueKeyTable');

            const issueRecords = issueKeys.map((key) => {
                const project = this._issueProjectMap?.get(key) || '-';
                const team = this._issueTeamMap?.get(key) || '-';
                const platform = this._issuePlatformMap?.get(key) || '-';
                const status = this._issueCurrentStatusMap?.get(key) || '-';
                const statusChangeTime = this._issueStatusChangeTimeMap?.get(key) || '-';
                const statusChangeTimestamp = this._issueStatusChangeTimeSortMap?.get(key) ?? Number.POSITIVE_INFINITY;
                const changelogStatusTimestamp = this._issueChangelogStatusTimestampMap?.get(key) || '-';
                const changelogStatusTimestampSortValue = this._issueChangelogStatusTimestampSortMap?.get(key) ?? Number.POSITIVE_INFINITY;
                const doneChangelogStatusTimestamp = this._issueDoneChangelogStatusTimestampMap?.get(key) || '-';
                const doneChangelogStatusTimestampSortValue = this._issueDoneChangelogStatusTimestampSortMap?.get(key) ?? Number.POSITIVE_INFINITY;
                const statusChangeDateKey = Number.isFinite(statusChangeTimestamp)
                    ? (() => {
                        const date = new Date(statusChangeTimestamp);
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    })()
                    : 'No Date';

                return {
                    key,
                    project,
                    team,
                    platform,
                    status,
                    statusChangeTime,
                    statusChangeTimestamp,
                    changelogStatusTimestamp,
                    changelogStatusTimestampSortValue,
                    doneChangelogStatusTimestamp,
                    doneChangelogStatusTimestampSortValue,
                    statusChangeDateKey
                };
            });

            let activeFilteredRecords = [];

            const sortIssueRecords = (records) => {
                const sortKey = this._closeTicketIssuesSort?.key || 'project';
                const ascending = this._closeTicketIssuesSort?.ascending ?? true;
                const direction = ascending ? 1 : -1;

                return [...records].sort((left, right) => {
                    const lower = (value) => (value || '').toString().toLowerCase();
                    let leftValue;
                    let rightValue;

                    switch (sortKey) {
                        case 'key':
                            leftValue = lower(left.key);
                            rightValue = lower(right.key);
                            break;
                        case 'project':
                            leftValue = lower(left.project);
                            rightValue = lower(right.project);
                            break;
                        case 'team':
                            leftValue = lower(left.team);
                            rightValue = lower(right.team);
                            break;
                        case 'platform':
                            leftValue = lower(left.platform);
                            rightValue = lower(right.platform);
                            break;
                        case 'status':
                            leftValue = lower(left.status);
                            rightValue = lower(right.status);
                            break;
                        case 'statusChangeTime':
                            leftValue = left.statusChangeTimestamp ?? Number.POSITIVE_INFINITY;
                            rightValue = right.statusChangeTimestamp ?? Number.POSITIVE_INFINITY;
                            break;
                        case 'changelogStatusTimestamp':
                            leftValue = left.changelogStatusTimestampSortValue ?? Number.POSITIVE_INFINITY;
                            rightValue = right.changelogStatusTimestampSortValue ?? Number.POSITIVE_INFINITY;
                            break;
                        case 'doneChangelogStatusTimestamp':
                            leftValue = left.doneChangelogStatusTimestampSortValue ?? Number.POSITIVE_INFINITY;
                            rightValue = right.doneChangelogStatusTimestampSortValue ?? Number.POSITIVE_INFINITY;
                            break;
                        default:
                            leftValue = lower(left.project);
                            rightValue = lower(right.project);
                            break;
                    }

                    if (leftValue < rightValue) return -1 * direction;
                    if (leftValue > rightValue) return 1 * direction;
                    return left.key.localeCompare(right.key);
                });
            };

            const updateIssuesSortIndicators = () => {
                if (!issueTable) return;
                const headers = issueTable.querySelectorAll('thead th.sortable[data-sort-key]');
                headers.forEach((header) => {
                    const key = header.dataset.sortKey;
                    header.classList.remove('sorted-asc', 'sorted-desc');
                    if (key === this._closeTicketIssuesSort?.key) {
                        header.classList.add(this._closeTicketIssuesSort.ascending ? 'sorted-asc' : 'sorted-desc');
                    }
                });
            };

            const renderCloseTicketIssues = (records) => {
                if (!listElement) return;

                const sortedRecords = sortIssueRecords(records);
                updateIssuesSortIndicators();

                if (!sortedRecords.length) {
                    listElement.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#999;">No tickets match this selection</td></tr>';
                    return;
                }

                listElement.innerHTML = sortedRecords.map((record) => `
                    <tr class="issue-row">
                        <td class="issue-key-cell">${this._escapeHtml(record.key)}</td>
                        <td class="project-cell">${this._escapeHtml(record.project)}</td>
                        <td class="team-cell">${this._escapeHtml(record.team)}</td>
                        <td class="platform-cell">${this._escapeHtml(record.platform)}</td>
                        <td class="status-cell">${this._escapeHtml(record.status)}</td>
                        <td class="time-cell">${this._escapeHtml(record.statusChangeTime)}</td>
                        <td class="time-cell">${this._escapeHtml(record.changelogStatusTimestamp)}</td>
                        <td class="time-cell">${this._escapeHtml(record.doneChangelogStatusTimestamp)}</td>
                    </tr>
                `).join('');
            };

            if (issueCount) issueCount.textContent = issueRecords.length;
            if (closeTicketIssuesContainer) closeTicketIssuesContainer.hidden = true;
            if (closeTicketIssuesHint) closeTicketIssuesHint.hidden = false;
            if (listElement) listElement.innerHTML = '';
            updateIssuesSortIndicators();

            if (summaryTable) {
                summaryTable.onclick = (event) => {
                    const selectedHeader = event.target.closest('th.sortable[data-sort-key]');
                    if (selectedHeader) {
                        const sortKey = selectedHeader.dataset.sortKey;
                        if (this._closeTicketSummarySort.key === sortKey) {
                            this._closeTicketSummarySort.ascending = !this._closeTicketSummarySort.ascending;
                        } else {
                            this._closeTicketSummarySort = { key: sortKey, ascending: true };
                        }
                        this._displayIssueKeyList(issueKeys);
                        return;
                    }

                    const selectedCell = event.target.closest('td.summary-selectable-cell');
                    if (!selectedCell) return;

                    const selectedRow = selectedCell.closest('tr.summary-selectable-row');
                    if (!selectedRow) return;

                    summaryTable.querySelectorAll('.summary-selected-row').forEach((row) => row.classList.remove('summary-selected-row'));
                    summaryTable.querySelectorAll('.summary-selected-cell').forEach((cell) => cell.classList.remove('summary-selected-cell'));
                    if (movedToRFSOTable) {
                        movedToRFSOTable.querySelectorAll('.summary-selected-row').forEach((row) => row.classList.remove('summary-selected-row'));
                        movedToRFSOTable.querySelectorAll('.summary-selected-cell').forEach((cell) => cell.classList.remove('summary-selected-cell'));
                    }

                    selectedRow.classList.add('summary-selected-row');
                    selectedCell.classList.add('summary-selected-cell');

                    const rowType = selectedRow.dataset.rowType;
                    const selectType = selectedCell.dataset.selectType;
                    const selectedDateKey = selectedCell.dataset.dateKey || null;

                    let filteredRecords = issueRecords;

                    if (rowType === 'group') {
                        const encodedGroupKey = selectedRow.dataset.groupKey || '';
                        const decodedGroupKey = decodeURIComponent(encodedGroupKey);
                        const [selectedProject = '', selectedTeam = ''] = decodedGroupKey.split('|||');

                        filteredRecords = issueRecords.filter((record) => (
                            record.project === selectedProject && record.team === selectedTeam
                        ));

                        if (selectType === 'group-date' && selectedDateKey) {
                            filteredRecords = filteredRecords.filter((record) => record.statusChangeDateKey === selectedDateKey);
                        }
                    } else if (rowType === 'total') {
                        if (selectType === 'total-date' && selectedDateKey) {
                            filteredRecords = issueRecords.filter((record) => record.statusChangeDateKey === selectedDateKey);
                        }
                    }

                    activeFilteredRecords = filteredRecords;
                    renderCloseTicketIssues(activeFilteredRecords);
                    if (closeTicketIssuesContainer) closeTicketIssuesContainer.hidden = false;
                    if (closeTicketIssuesHint) closeTicketIssuesHint.hidden = true;
                };
            }

            if (movedToRFSOTable) {
                movedToRFSOTable.onclick = (event) => {
                    const selectedCell = event.target.closest('td.summary-selectable-cell');
                    if (!selectedCell) return;

                    const selectedRow = selectedCell.closest('tr.summary-selectable-row');
                    if (!selectedRow) return;

                    movedToRFSOTable.querySelectorAll('.summary-selected-row').forEach((row) => row.classList.remove('summary-selected-row'));
                    movedToRFSOTable.querySelectorAll('.summary-selected-cell').forEach((cell) => cell.classList.remove('summary-selected-cell'));
                    if (summaryTable) {
                        summaryTable.querySelectorAll('.summary-selected-row').forEach((row) => row.classList.remove('summary-selected-row'));
                        summaryTable.querySelectorAll('.summary-selected-cell').forEach((cell) => cell.classList.remove('summary-selected-cell'));
                    }

                    selectedRow.classList.add('summary-selected-row');
                    selectedCell.classList.add('summary-selected-cell');

                    let matchedRfsoRecords = [...(this._rfsoSummaryRecords || [])];

                    const rowType = selectedRow.dataset.rowType;
                    const selectType = selectedCell.dataset.selectType;
                    const selectedDateKey = selectedCell.dataset.dateKey || null;

                    if (rowType === 'group') {
                        const encodedGroupKey = selectedRow.dataset.groupKey || '';
                        const decodedGroupKey = decodeURIComponent(encodedGroupKey);
                        const [selectedProject = '', selectedTeam = ''] = decodedGroupKey.split('|||');

                        matchedRfsoRecords = matchedRfsoRecords.filter((record) => (
                            record.project === selectedProject && record.team === selectedTeam
                        ));

                        if (selectType === 'group-date' && selectedDateKey) {
                            matchedRfsoRecords = matchedRfsoRecords.filter((record) => record.statusChangeDateKey === selectedDateKey);
                        }
                    } else if (rowType === 'total') {
                        if (selectType === 'total-date' && selectedDateKey) {
                            matchedRfsoRecords = matchedRfsoRecords.filter((record) => record.statusChangeDateKey === selectedDateKey);
                        }
                    }

                    const matchedKeySet = new Set(matchedRfsoRecords.map((record) => record.key));
                    const filteredRecords = issueRecords.filter((record) => matchedKeySet.has(record.key));

                    activeFilteredRecords = filteredRecords;
                    renderCloseTicketIssues(activeFilteredRecords);
                    if (closeTicketIssuesContainer) closeTicketIssuesContainer.hidden = false;
                    if (closeTicketIssuesHint) closeTicketIssuesHint.hidden = true;
                };
            }

            if (issueTable) {
                issueTable.onclick = (event) => {
                    const selectedHeader = event.target.closest('th.sortable[data-sort-key]');
                    if (!selectedHeader) return;

                    const sortKey = selectedHeader.dataset.sortKey;
                    if (this._closeTicketIssuesSort.key === sortKey) {
                        this._closeTicketIssuesSort.ascending = !this._closeTicketIssuesSort.ascending;
                    } else {
                        this._closeTicketIssuesSort = { key: sortKey, ascending: true };
                    }

                    if (closeTicketIssuesContainer && !closeTicketIssuesContainer.hidden) {
                        renderCloseTicketIssues(activeFilteredRecords);
                    } else {
                        updateIssuesSortIndicators();
                    }
                };
            }

            const timelineBody = document.getElementById('timelineBody');
            if (timelineBody) {
                const now = new Date();
                const formatDateTime = (date, timezone) => {
                    const formatter = new Intl.DateTimeFormat('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: timezone,
                        hour12: true
                    });
                    return formatter.format(date);
                };

                timelineBody.innerHTML = `
                    <tr>
                        <td>EST (Eastern Standard Time)</td>
                        <td>${this._escapeHtml(formatDateTime(now, 'America/New_York'))}</td>
                        <td>${this._escapeHtml(formatDateTime(now, 'America/New_York'))}</td>
                    </tr>
                    <tr>
                        <td>IST (Indian Standard Time)</td>
                        <td>${this._escapeHtml(formatDateTime(now, 'Asia/Kolkata'))}</td>
                        <td>${this._escapeHtml(formatDateTime(now, 'Asia/Kolkata'))}</td>
                    </tr>
                `;
            }

            if (listSection) listSection.hidden = false;
            return;
        }
            const estStart = formatDateTime(displayStart, 'America/New_York');
            const estEnd = formatDateTime(displayEnd, 'America/New_York');
            const istStart = formatDateTime(displayStart, 'Asia/Kolkata');
            const istEnd = formatDateTime(displayEnd, 'Asia/Kolkata');

            timelineBody.innerHTML = `
                <tr>
                    <td>EST (Eastern Standard Time)</td>
                    <td>${this._escapeHtml(estStart)}</td>
                    <td>${this._escapeHtml(estEnd)}</td>
                </tr>
                <tr>
                    <td>IST (Indian Standard Time)</td>
                    <td>${this._escapeHtml(istStart)}</td>
                    <td>${this._escapeHtml(istEnd)}</td>
                </tr>
            `;
        }

        if (patternSummaryBody) {
            const patterns = this._getPatterns();
            patterns.sort((a, b) => (a.priority || 999) - (b.priority || 999));

            if (patterns.length === 0) {
                patternSummaryBody.innerHTML = '<tr><td colspan="2">No patterns defined</td></tr>';
            } else {
                patternSummaryBody.innerHTML = patterns
                    .map(pattern => {
                        const count = patternCountMap.get(pattern.name) || 0;
                        return `
                            <tr>
                                <td>${this._escapeHtml(pattern.name)}</td>
                                <td>${this._escapeHtml(String(count))}</td>
                            </tr>
                        `;
                    })
                    .join('');
            }
        }

        if (codeReviewSummaryBody) {
            if (codeReviewPlatformMap.size === 0) {
                codeReviewSummaryBody.innerHTML = '<tr><td colspan="2">No tickets in Code Review</td></tr>';
            } else {
                const sortedPlatforms = Array.from(codeReviewPlatformMap.entries())
                    .sort((a, b) => b[1] - a[1]); // Sort by count descending
                
                codeReviewSummaryBody.innerHTML = sortedPlatforms
                    .map(([platform, count]) => {
                        return `
                            <tr>
                                <td>${this._escapeHtml(platform)}</td>
                                <td>${this._escapeHtml(String(count))}</td>
                            </tr>
                        `;
                    })
                    .join('');
            }
        }

        const toggleChangelogColumn = document.getElementById('toggleChangelogColumn');
        if (toggleChangelogColumn) {
            this._setChangelogColumnVisibility(toggleChangelogColumn.checked);
        } else {
            this._setChangelogColumnVisibility(true);
        }

        // Display report title and JQL query if provided
        const reportTitleInput = document.getElementById('reportTitle');
        const reportTitleDisplay = document.getElementById('reportTitleDisplay');
        if (reportTitleInput && reportTitleDisplay) {
            const title = reportTitleInput.value.trim();
            const executedJql = this._lastExecutedJql || this._getEffectiveJql();
            const titleHeading = reportTitleDisplay.querySelector('h3');
            const reportQueryValue = document.getElementById('reportQueryValue');
            
            if (titleHeading) {
                titleHeading.textContent = title || 'Status Workflow Analysis';
            }
            if (reportQueryValue) {
                reportQueryValue.textContent = executedJql || 'Not provided';
            }

            if (title || executedJql) {
                reportTitleDisplay.style.display = 'block';
            } else {
                reportTitleDisplay.style.display = 'none';
            }
        }

        if (listSection) listSection.hidden = false;
    }

    /**
     * Analyze a JIRA ticket and fetch its changelog
     */
    async analyzeTicket(ticketKey) {
        this._showMessage(`⏳ Fetching changelog for ${ticketKey}...`, 'loading');
        this._hideAllSections();

        try {
            // Fetch ticket details with changelog
            const ticketData = await this._fetchTicketData(ticketKey);
            
            if (!ticketData) {
                throw new Error(`Ticket ${ticketKey} not found`);
            }

            this._currentTicketKey = ticketKey;

            // Display ticket information
            this._displayTicketInfo(ticketData);

            // Parse changelog
            const changelog = this._parseChangelog(ticketData);

            // Display changelog
            this._displayChangelog(changelog);

            // Trigger AI analysis workflow
            this._displayManualCopilotWorkflow(ticketData, changelog);

            this._showMessage(`✅ Changelog loaded successfully (${changelog.length} changes)`, 'success');
            setTimeout(() => this._hideStatus(), 3000);

        } catch (error) {
            console.error('❌ Error analyzing ticket:', error);
            this._showMessage(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Fetch ticket data from JIRA using proxy server
     */
    async _fetchTicketData(ticketKey) {
        try {
            const endpoint = `/issue/${ticketKey}?expand=changelog`;
            
            console.log('🔍 Fetching ticket details through proxy:');
            console.log(`   Endpoint: ${endpoint}`);
            console.log(`   Ticket Key: ${ticketKey}`);
            console.log(`   Auth Type: ${this.getStorage('authType')}`);

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

            console.log(`   Response Status: ${response.status}`);

            if (!response.ok) {
                const errorMessage = data.errorMessages?.[0] || data.error || `API Error: ${response.status}`;
                console.error(`❌ API Error: ${errorMessage}`);
                throw new Error(errorMessage);
            }

            console.log(`✅ Successfully fetched ticket: ${data.key}`);
            return data;

        } catch (error) {
            console.error('❌ Fetch error:', error);
            throw error;
        }
    }

    /**
     * Display ticket information
     */
    _displayTicketInfo(ticketData) {
        const ticketKeyDisplay = document.getElementById('ticketKeyDisplay');
        const ticketSummary = document.getElementById('ticketSummary');
        const ticketStatus = document.getElementById('ticketStatus');
        const ticketAssignee = document.getElementById('ticketAssignee');
        const changeCount = document.getElementById('changeCount');

        if (ticketKeyDisplay) ticketKeyDisplay.textContent = ticketData.key;
        if (ticketSummary) ticketSummary.textContent = ticketData.fields.summary;
        if (ticketStatus) ticketStatus.innerHTML = 
            `<span class="badge badge-status">${this._escapeHtml(ticketData.fields.status.name)}</span>`;
        if (ticketAssignee) ticketAssignee.textContent = 
            ticketData.fields.assignee?.displayName || 'Unassigned';
        
        const changes = ticketData.changelog?.histories || [];
        if (changeCount) changeCount.textContent = changes.length;

        const section = document.getElementById('ticketInfoSection');
        if (section) section.hidden = false;
    }

    /**
     * Parse changelog from ticket data
     */
    _parseChangelog(ticketData) {
        const histories = ticketData.changelog?.histories || [];
        const changelog = [];
        const fieldsToIgnore = ['customfield_17903','Status Changed']; // Status Changed custom field

        histories.forEach(history => {
            history.items.forEach(item => {
                // Skip ignored fields
                if (fieldsToIgnore.includes(item.field)) {
                    return;
                }
                
                changelog.push({
                    date: new Date(history.created),
                    dateString: new Date(history.created).toLocaleString(),
                    author: history.author.displayName,
                    field: item.field,
                    fromValue: item.fromString || item.from || '-',
                    toValue: item.toString || item.to || '-'
                });
            });
        });

        // Apply timeframe filter if specified
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        let filteredChangelog = changelog;
        
        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            
            filteredChangelog = changelog.filter(entry => {
                if (start && entry.date < start) return false;
                if (end) {
                    // Include entries on the end date (set to end of day)
                    const endOfDay = new Date(end);
                    endOfDay.setHours(23, 59, 59, 999);
                    if (entry.date > endOfDay) return false;
                }
                return true;
            });
        }

        return filteredChangelog.sort((a, b) => b.date - a.date);
    }

    /**
     * Display changelog table
     */
    _displayChangelog(changelog) {
        const tbody = document.getElementById('changelogTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';

        changelog.forEach(change => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this._escapeHtml(change.dateString)}</td>
                <td>${this._escapeHtml(change.author)}</td>
                <td><strong>${this._escapeHtml(change.field)}</strong></td>
                <td>${this._escapeHtml(change.fromValue)}</td>
                <td>${this._escapeHtml(change.toValue)}</td>
            `;
            tbody.appendChild(row);
        });

        const section = document.getElementById('changelogSection');
        if (section) section.hidden = false;
    }

    /**
     * Toggle changelog details
     */
    toggleChangelogDetails() {
        const content = document.getElementById('changelogContent');
        const btn = document.getElementById('toggleChangelogBtn');
        
        if (content && btn) {
            if (content.hidden) {
                content.hidden = false;
                btn.textContent = '▲ Hide Details';
            } else {
                content.hidden = true;
                btn.textContent = '▼ Show Details';
            }
        }
    }

    /**
     * Filter changelog
     */
    filterChangelog(searchTerm) {
        const rows = document.querySelectorAll('#changelogTableBody tr');
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }

    /**
     * Handle column sort
     */
    handleSort(column) {
        if (this._sortState.column === column) {
            this._sortState.ascending = !this._sortState.ascending;
        } else {
            this._sortState.column = column;
            this._sortState.ascending = true;
        }

        this._updateSortArrow();
    }

    /**
     * Update sort arrow
     */
    _updateSortArrow() {
        document.querySelectorAll('.sortable').forEach(header => {
            const arrow = header.querySelector('.sort-arrow');
            const column = header.dataset.sort;

            if (column === this._sortState.column) {
                arrow.textContent = this._sortState.ascending ? ' ▲' : ' ▼';
            } else {
                arrow.textContent = '';
            }
        });
    }

    /**
     * Display manual Microsoft Copilot workflow
     */
    _displayManualCopilotWorkflow(ticketData, changelog) {
        const analysisContent = document.getElementById('aiAnalysisContent');
        if (!analysisContent) return;

        // Format changelog for Copilot prompt
        const formattedChangelog = this._formatChangelogForPrompt(changelog);
        
        const copilotPrompt = `Analyze this JIRA ticket changelog and provide comprehensive insights:

**Ticket Information:**
- Key: ${ticketData.key}
- Summary: ${ticketData.fields.summary}
- Status: ${ticketData.fields.status.name}
- Assignee: ${ticketData.fields.assignee?.displayName || 'Unassigned'}
- Created: ${new Date(ticketData.fields.created).toLocaleDateString()}
- Total Changes: ${changelog.length}

**Changelog History:**
${formattedChangelog}

**Required Analysis:**

1. **Executive Summary** (2-3 sentences)
   - Brief overview of the ticket's journey
   - Key outcome or current state

2. **Key Changes Timeline** (Top 5-7 most significant changes)
   - Date and description of critical changes
   - Impact on ticket progress

3. **Status Progression Analysis**
   - Workflow path (status changes)
   - Time spent in each status
   - Any status reversals or unusual patterns

4. **Assignee History and Collaboration**
   - Who worked on this ticket
   - Number of reassignments
   - Team collaboration patterns

5. **Priority and Severity Changes**
   - Any escalations or de-escalations

6. **Time Metrics**
   - Age of ticket
   - Time in each major status category

7. **Identified Patterns or Anomalies**
   - Frequent reassignments
   - Long periods of inactivity
   - Rapid status changes

8. **Resolution Path** (if ticket is resolved)
   - Key steps that led to resolution
   - Critical decisions or changes

9. **Process Improvement Recommendations**
   - Suggested improvements
   - Workflow optimization opportunities

Please format your response with clear markdown sections and bullet points.`;

        analysisContent.innerHTML = `
            <div class="copilot-manual-workflow">
                <div class="copilot-instructions">
                    <h3>📋 Microsoft 365 Copilot Analysis</h3>
                    <p>Follow these steps to analyze with your corporate Copilot:</p>
                    <ol>
                        <li><strong>Click "Copy Prompt"</strong> button below</li>
                        <li><strong>Open Microsoft Copilot</strong> (copilot.microsoft.com or Teams)</li>
                        <li><strong>Paste the prompt</strong> and press Enter</li>
                        <li><strong>Copy Copilot's response</strong> when analysis completes</li>
                        <li><strong>Paste it back</strong> in the text area below</li>
                        <li><strong>Click "Display Analysis"</strong> to view formatted results</li>
                    </ol>
                    <div class="copilot-buttons">
                        <button class="btn btn-primary" onclick="window.analyzerApp && window.analyzerApp._copyPromptToClipboard()">
                            📋 Copy Prompt for Copilot
                        </button>
                        <a href="https://copilot.microsoft.com" target="_blank" class="btn btn-secondary">
                            🚀 Open Microsoft Copilot
                        </a>
                    </div>
                </div>
                
                <div class="prompt-preview">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="margin: 0;">Prompt Preview:</h4>
                        <button class="btn btn-secondary btn-small" onclick="window.analyzerApp && window.analyzerApp._togglePromptPreview()">▼ Show</button>
                    </div>
                    <pre id="promptText" style="display: none;">${this._escapeHtml(copilotPrompt)}</pre>
                </div>
                
                <div class="copilot-response-input">
                    <h4>📝 Paste Copilot's Response Here:</h4>
                    <textarea id="copilotResponse" rows="15" placeholder="After getting the analysis from Microsoft Copilot, paste it here..."></textarea>
                    <button class="btn btn-primary" onclick="window.analyzerApp && window.analyzerApp._displayCopilotResponse()">
                        💾 Display Analysis
                    </button>
                </div>
            </div>
        `;

        // Store prompt for copying
        this._currentPrompt = copilotPrompt;

        const section = document.getElementById('aiAnalysisSection');
        if (section) section.hidden = false;
    }

    /**
     * Copy prompt to clipboard
     */
    _copyPromptToClipboard() {
        if (!this._currentPrompt) {
            this._showMessage('No prompt available to copy', 'error');
            return;
        }

        navigator.clipboard.writeText(this._currentPrompt).then(() => {
            const btn = event?.target;
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ Copied!';
                btn.style.background = '#10b981';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.style.background = '';
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy:', err);
            this._showMessage('Failed to copy. Please select and copy the text manually.', 'error');
        });
    }

    /**
     * Toggle prompt preview
     */
    _togglePromptPreview() {
        const promptText = document.getElementById('promptText');
        const btn = event?.target;
        
        if (promptText && btn) {
            if (promptText.style.display === 'none') {
                promptText.style.display = 'block';
                btn.textContent = '▲ Hide';
            } else {
                promptText.style.display = 'none';
                btn.textContent = '▼ Show';
            }
        }
    }

    /**
     * Display Copilot response
     */
    _displayCopilotResponse() {
        const responseArea = document.getElementById('copilotResponse');
        const response = responseArea?.value.trim();
        
        if (!response) {
            this._showMessage('Please paste Copilot\'s response first', 'error');
            return;
        }

        this._displayFormattedAnalysis(response);
    }

    /**
     * Format changelog for Copilot prompt
     */
    _formatChangelogForPrompt(changelog) {
        if (changelog.length === 0) {
            return 'No changes recorded.';
        }

        return changelog
            .slice(0, 50)
            .map(change => 
                `- **${change.dateString}** | ${change.author} | ${change.field}: "${change.fromValue}" → "${change.toValue}"`
            )
            .join('\n');
    }

    /**
     * Display formatted analysis
     */
    _displayFormattedAnalysis(analysisText) {
        const analysisContent = document.getElementById('aiAnalysisContent');
        if (!analysisContent) return;

        // Convert markdown-like formatting to HTML
        let formattedHtml = analysisText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<em>$1</em>')
            .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
            .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
            .replace(/^- (.*?)$/gm, '<li>$1</li>')
            .replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');

        analysisContent.innerHTML = `
            <div class="analysis-display">
                <p>${formattedHtml}</p>
            </div>
        `;

        this._showMessage('✅ Analysis displayed successfully', 'success');
    }

    /**
     * Hide all sections
     */
    _hideAllSections() {
        const sections = [
            document.getElementById('ticketInfoSection'),
            document.getElementById('aiAnalysisSection'),
            document.getElementById('changelogSection'),
            document.getElementById('issueListSection')
        ];

        sections.forEach(section => {
            if (section) section.hidden = true;
        });
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
     * Handle export based on selected format
     */
    async handleExport() {
        const formatSelect = document.getElementById('exportFormatSelect');
        const format = formatSelect ? formatSelect.value : 'pdf';
        
        if (format === 'excel') {
            await this.exportToExcel();
        } else {
            await this.exportToPdf();
        }
    }

    /**
     * Export the current analysis to PDF
     */
    async exportToPdf() {
        const issueListSection = document.getElementById('issueListSection');
        if (!issueListSection || issueListSection.hidden) {
            this._showMessage('No data to export. Please run an analysis first.', 'error');
            return;
        }

        const exportBtn = document.getElementById('exportBtn');
        const originalText = exportBtn.textContent;
        exportBtn.disabled = true;
        exportBtn.textContent = '⏳ Generating PDF...';

        try {
            // Clone the section to modify it for PDF
            const clone = issueListSection.cloneNode(true);
            
            // Create wrapper with explicit styling to override all CSS variables
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                --primary-color: #000000;
                --secondary-color: #000000;
                --text-primary: #000000;
                --text-secondary: #000000;
                --border-color: #333333;
                --card-background: #ffffff;
                --success-color: #000000;
                display: block;
                padding: 15px;
                background: #ffffff;
                font-family: Arial, sans-serif;
                font-size: 10px;
                color: #000000;
                opacity: 1;
                filter: none;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                width: auto;
                max-width: none;
                overflow: visible;
                page-break: avoid;
                page-break-inside: avoid;
            `;
            
            clone.style.cssText += `
                display: block;
                background: #ffffff;
                color: #000000;
                opacity: 1;
                padding: 0;
                margin: 0;
                width: auto;
                max-width: none;
                overflow: visible;
                page-break: avoid;
                page-break-inside: avoid;
            `;
            
            // Create and inject CSS overrides to prevent stylesheet interference
            const styleOverride = document.createElement('style');
            styleOverride.textContent = `
                * { 
                    background-color: white !important; 
                    background-image: none !important; 
                    color: #000000 !important;
                    opacity: 1 !important;
                    filter: none !important;
                    page-break: avoid !important;
                    page-break-inside: avoid !important;
                    page-break-before: avoid !important;
                    page-break-after: avoid !important;
                }
                h2, h3 { color: #000000 !important; }
                th { background-color: #000000 !important; color: #ffffff !important; }
                td { background-color: #ffffff !important; color: #000000 !important; }
                table { border-collapse: collapse; page-break-inside: avoid !important; }
                tr { background-color: transparent !important; page-break-inside: avoid !important; }
            `;
            wrapper.appendChild(styleOverride);
            wrapper.appendChild(clone);
            
            // Add report title and JQL query at the top if provided
            const reportTitleInput = document.getElementById('reportTitle');
            const jqlQueryInput = document.getElementById('jqlQuery');
            let insertAfterNode = null;
            if (reportTitleInput && reportTitleInput.value.trim()) {
                const titleElement = document.createElement('h1');
                titleElement.textContent = reportTitleInput.value.trim();
                titleElement.style.cssText = `
                    color: #000000 !important;
                    font-size: 20px;
                    font-weight: bold;
                    margin: 0 0 10px 0;
                    padding: 10px 0;
                    text-align: center;
                    border-bottom: 3px solid #000000;
                `;
                clone.insertBefore(titleElement, clone.firstChild);
                insertAfterNode = titleElement;
            }

            if (jqlQueryInput && jqlQueryInput.value.trim()) {
                const queryBlock = document.createElement('div');
                queryBlock.style.cssText = `
                    margin: 0 0 12px 0;
                    padding: 0;
                `;
                queryBlock.innerHTML = `
                    <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                        <tbody>
                            <tr>
                                <th style="width: 140px; padding: 6px; border: 2px solid #000000; background: #000000; color: #ffffff; text-align: left;">JQL Query</th>
                                <td style="padding: 6px; border: 2px solid #000000; background: #ffffff; color: #000000;">${this._escapeHtml(jqlQueryInput.value.trim())}</td>
                            </tr>
                        </tbody>
                    </table>
                `;

                if (insertAfterNode && insertAfterNode.nextSibling) {
                    clone.insertBefore(queryBlock, insertAfterNode.nextSibling);
                } else if (insertAfterNode) {
                    clone.appendChild(queryBlock);
                } else {
                    clone.insertBefore(queryBlock, clone.firstChild);
                }
            }
            
            // Remove the export controls and main header from the clone
            const sectionHeader = clone.querySelector('.section-header');
            if (sectionHeader) {
                sectionHeader.remove();
            }
            
            // Remove the report title display div (we add the title separately as H1)
            const reportTitleDisplay = clone.querySelector('#reportTitleDisplay');
            if (reportTitleDisplay) {
                reportTitleDisplay.remove();
            }
            
            // Remove Changelog Events column if the checkbox is not checked
            try {
                const toggleChangelogColumn = document.getElementById('toggleChangelogColumn');
                if (!toggleChangelogColumn || !toggleChangelogColumn.checked) {
                    const changelogHeaders = clone.querySelectorAll('.changelog-events-column');
                    changelogHeaders.forEach(header => {
                        // Find the column index before removing anything
                        const row = header.parentElement;
                        if (!row) return;
                        
                        const columnIndex = Array.from(row.children).indexOf(header);
                        
                        // Find the table
                        const table = row.closest('table');
                        if (table && columnIndex >= 0) {
                            // Remove all cells in this column from tbody rows
                            const bodyRows = table.querySelectorAll('tbody tr');
                            bodyRows.forEach(bodyRow => {
                                if (bodyRow.children && bodyRow.children[columnIndex]) {
                                    bodyRow.children[columnIndex].remove();
                                }
                            });
                            
                            // Remove the header last
                            header.remove();
                        }
                    });
                }
            } catch (columnError) {
                console.warn('Error removing changelog column:', columnError);
            }
            
            // Remove all empty divs and spacers
            const spacerDivs = clone.querySelectorAll('div[style*="height"]');
            spacerDivs.forEach(div => {
                if (div.style.height && !div.textContent.trim()) {
                    div.style.height = '10px';
                }
            });

            // Force all elements to have solid colors and no transparency
            const allElements = clone.querySelectorAll('*');
            allElements.forEach(el => {
                // Remove all classes and reset attributes
                el.removeAttribute('class');
                
                // Replace any inline styles that use CSS variables
                const styleAttr = el.getAttribute('style');
                if (styleAttr && styleAttr.includes('var(')) {
                    const newStyle = styleAttr
                        .replace(/var\(--success-color\)/g, '#000000')
                        .replace(/var\(--primary-color\)/g, '#000000')
                        .replace(/var\(--secondary-color\)/g, '#000000')
                        .replace(/var\(--text-primary\)/g, '#000000')
                        .replace(/var\(--text-secondary\)/g, '#000000')
                        .replace(/var\(--error-color\)/g, '#000000')
                        .replace(/var\(--warning-color\)/g, '#000000');
                    el.setAttribute('style', newStyle);
                }
                
                const styles = window.getComputedStyle(el);
                
                // Override opacity and filters aggressively
                el.style.setProperty('opacity', '1', 'important');
                el.style.setProperty('filter', 'none', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
                el.style.setProperty('-webkit-filter', 'none', 'important');
                
                // Force white background on all containers
                if (el.tagName === 'DIV' || el.tagName === 'SECTION') {
                    el.style.setProperty('background', '#ffffff', 'important');
                    el.style.setProperty('background-color', '#ffffff', 'important');
                    el.style.setProperty('background-image', 'none', 'important');
                }
                
                // Force black text on all text elements
                if (el.textContent && el.textContent.trim()) {
                    el.style.setProperty('color', '#000000', 'important');
                }
            });

            // Style headings with solid black and minimal spacing
            const headings = clone.querySelectorAll('h2, h3');
            headings.forEach((h, idx) => {
                h.style.cssText = `
                    color: #000000 !important;
                    font-size: ${h.tagName === 'H2' ? '16px' : '13px'};
                    font-weight: bold;
                    margin-top: ${idx === 0 ? '0' : '12px'};
                    margin-bottom: 6px;
                    padding: 0;
                    opacity: 1;
                    background: transparent;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    page-break-after: avoid !important;
                    page-break-inside: avoid !important;
                    page-break-before: avoid !important;
                `;
            });

            // Style summary table containers to ensure they're visible
            const summaryContainers = clone.querySelectorAll('.summary-table-container');
            summaryContainers.forEach(container => {
                container.style.cssText = `
                    margin: 0 0 12px 0;
                    padding: 0;
                    overflow: hidden;
                    width: 100%;
                    max-width: 100%;
                    display: block;
                    page-break-inside: avoid !important;
                    page-break-before: avoid !important;
                    page-break-after: avoid !important;
                `;
            });

            // Style tables with high contrast and ensure visibility
            const tables = clone.querySelectorAll('table');
            tables.forEach(table => {
                table.style.cssText = `
                    page-break-inside: avoid !important;
                    page-break-before: avoid !important;
                    page-break-after: avoid !important;
                    font-size: 9px;
                    border-collapse: collapse;
                    width: 100%;
                    max-width: 100%;
                    table-layout: fixed;
                    background: #ffffff;
                    opacity: 1;
                    margin: 0 0 12px 0;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                    display: table;
                    visibility: visible;
                `;
                
                const tbody = table.querySelector('tbody');
                if (tbody) {
                    tbody.style.display = 'table-row-group';
                    tbody.style.pageBreakInside = 'avoid';
                }
                
                const thead = table.querySelector('thead');
                if (thead) {
                    thead.style.display = 'table-header-group';
                    thead.style.pageBreakInside = 'avoid';
                    thead.style.pageBreakAfter = 'avoid';
                }
                
                const rows = table.querySelectorAll('tr');
                rows.forEach(row => {
                    row.style.pageBreakInside = 'avoid';
                    row.style.pageBreakBefore = 'avoid';
                    row.style.pageBreakAfter = 'avoid';
                    row.style.opacity = '1';
                    row.style.display = 'table-row';
                });
                
                const headers = table.querySelectorAll('th');
                headers.forEach(th => {
                    th.removeAttribute('class');
                    th.style.setProperty('padding', '6px', 'important');
                    th.style.setProperty('border', '2px solid #000000', 'important');
                    th.style.setProperty('background', '#000000', 'important');
                    th.style.setProperty('background-color', '#000000', 'important');
                    th.style.setProperty('background-image', 'none', 'important');
                    th.style.setProperty('color', '#ffffff', 'important');
                    th.style.setProperty('font-weight', 'bold', 'important');
                    th.style.setProperty('opacity', '1', 'important');
                    th.style.setProperty('display', 'table-cell', 'important');
                    th.style.setProperty('word-wrap', 'break-word', 'important');
                    th.style.setProperty('word-break', 'break-word', 'important');
                    th.style.setProperty('white-space', 'normal', 'important');
                    th.style.setProperty('overflow-wrap', 'break-word', 'important');
                    th.style.setProperty('-webkit-print-color-adjust', 'exact', 'important');
                    th.style.setProperty('print-color-adjust', 'exact', 'important');
                });
                
                const bodyCells = table.querySelectorAll('tbody td');
                bodyCells.forEach((cell, idx) => {
                    cell.removeAttribute('class');
                    cell.style.setProperty('padding', '6px', 'important');
                    cell.style.setProperty('border', '2px solid #000000', 'important');
                    cell.style.setProperty('background', '#ffffff', 'important');
                    cell.style.setProperty('background-color', '#ffffff', 'important');
                    cell.style.setProperty('background-image', 'none', 'important');
                    cell.style.setProperty('color', '#000000', 'important');
                    cell.style.setProperty('opacity', '1', 'important');
                    cell.style.setProperty('display', 'table-cell', 'important');
                    cell.style.setProperty('word-wrap', 'break-word', 'important');
                    cell.style.setProperty('word-break', 'break-word', 'important');
                    cell.style.setProperty('white-space', 'normal', 'important');
                    cell.style.setProperty('overflow-wrap', 'break-word', 'important');
                    cell.style.setProperty('-webkit-print-color-adjust', 'exact', 'important');
                    cell.style.setProperty('print-color-adjust', 'exact', 'important');
                    cell.style.setProperty('font-weight', 'normal', 'important');
                });
            });

            // Configure PDF options with maximum quality
            const opt = {
                margin: [5, 8, 5, 8],
                filename: `jira-status-analysis-${new Date().toISOString().split('T')[0]}.pdf`,
                html2canvas: { 
                    scale: 2,
                    useCORS: true, 
                    letterRendering: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    removeContainer: true,
                    allowTaint: false,
                    imageTimeout: 0,
                    onclone: function(clonedDoc) {
                        const clonedBody = clonedDoc.body;
                        clonedBody.style.setProperty('background', '#ffffff', 'important');
                        clonedBody.style.setProperty('color', '#000000', 'important');
                        clonedBody.style.setProperty('width', 'auto', 'important');
                        clonedBody.style.setProperty('max-width', 'none', 'important');
                    }
                }
            };

            // Generate PDF without page breaks - all content as full image on single page
            const element = wrapper;
            
            // Temporarily append to body for rendering
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            wrapper.style.top = '0';
            document.body.appendChild(wrapper);
            
            try {
                const canvas = await html2canvas(element, opt.html2canvas);
                const imgData = canvas.toDataURL('image/png');
                
                console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
                
                const { jsPDF } = window.jspdf;
                
                // Create custom page size to fit all content without page format constraints
                const margin = 5;
                const contentWidth = 210;  // Width in mm for content
                const contentHeight = (canvas.height * contentWidth) / canvas.width;
                
                // Total page dimensions - no orientation, just custom format
                const pageWidth = contentWidth + (margin * 2);
                const pageHeight = contentHeight + (margin * 2);
                
                // Create PDF with no orientation constraint - just custom dimensions
                const pdf = new jsPDF({
                    unit: 'mm',
                    format: [pageWidth, pageHeight],
                    compress: true
                });
                
                // Add the entire canvas as one image - no page breaks
                pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, contentHeight, undefined, 'FAST');
                
                console.log('PDF generated: full image', pageWidth, 'x', pageHeight, 'mm');
                pdf.save(opt.filename);
            } catch (pdfError) {
                console.error('PDF generation error:', pdfError);
                throw pdfError;
            } finally {
                // Always remove from body
                if (document.body.contains(wrapper)) {
                    document.body.removeChild(wrapper);
                }
            }
        } catch (error) {
            console.error('PDF export failed:', error);
            this._showMessage(`Failed to export PDF: ${error.message}\n\nCheck browser console for details.`, 'error');
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }
    }

    /**
     * Export the current analysis to Excel
     */
    async exportToExcel() {
        const issueListSection = document.getElementById('issueListSection');
        if (!issueListSection || issueListSection.hidden) {
            this._showMessage('No data to export. Please run an analysis first.', 'error');
            return;
        }

        const exportBtn = document.getElementById('exportBtn');
        const originalText = exportBtn.textContent;
        exportBtn.disabled = true;
        exportBtn.textContent = '⏳ Generating Excel...';

        try {
            const workbook = XLSX.utils.book_new();
            
            // Get report title and JQL query if provided
            const reportTitleInput = document.getElementById('reportTitle');
            const reportTitle = reportTitleInput && reportTitleInput.value.trim() ? reportTitleInput.value.trim() : '';
            const jqlQuery = this._lastExecutedJql || this._getEffectiveJql();
            
            // Add title sheet if provided
            if (reportTitle) {
                const titleWs = XLSX.utils.aoa_to_sheet([[reportTitle]]);
                XLSX.utils.book_append_sheet(workbook, titleWs, 'Report Title');
            }

            // Add JQL query sheet if provided
            if (jqlQuery) {
                const queryWs = XLSX.utils.aoa_to_sheet([['JQL Query', jqlQuery]]);
                XLSX.utils.book_append_sheet(workbook, queryWs, 'Report Query');
            }
            
            // Export Timeline Table
            const timelineTable = document.getElementById('timelineTable');
            if (timelineTable) {
                const ws1 = XLSX.utils.table_to_sheet(timelineTable);
                XLSX.utils.book_append_sheet(workbook, ws1, 'Timeline');
            }
            
            // Export Total Issues
            const issueCount = document.getElementById('issueCount');
            if (issueCount && issueCount.textContent) {
                const ws2 = XLSX.utils.aoa_to_sheet([['Total Issues'], [issueCount.textContent]]);
                XLSX.utils.book_append_sheet(workbook, ws2, 'Total Issues');
            }
            
            // Export Pattern Summary Table
            const patternTable = document.getElementById('patternSummaryTable');
            if (patternTable) {
                const ws3 = XLSX.utils.table_to_sheet(patternTable);
                XLSX.utils.book_append_sheet(workbook, ws3, 'Pattern Changes');
            }
            
            // Export Code Review Summary Table
            const codeReviewTable = document.getElementById('codeReviewSummaryTable');
            if (codeReviewTable) {
                const ws4 = XLSX.utils.table_to_sheet(codeReviewTable);
                XLSX.utils.book_append_sheet(workbook, ws4, 'Code Review');
            }
            
            // Export Issue Key Table
            const issueKeyTable = document.getElementById('issueKeyTable');
            if (issueKeyTable) {
                const ws5 = XLSX.utils.table_to_sheet(issueKeyTable);
                XLSX.utils.book_append_sheet(workbook, ws5, 'Issues');
            }
            
            // Save the file
            const filename = `jira-status-analysis-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(workbook, filename);
        } catch (error) {
            console.error('Excel export failed:', error);
            this._showMessage('Failed to export Excel. Please try again.', 'error');
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.analyzerApp = new ChangelogAnalyzer();
    window.analyzerApp.initializeApp();
});
