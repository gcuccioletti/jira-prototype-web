// jira_sprint_results.js
// Fetch sprint issues and render a results summary

class SprintResults {
    constructor() {
        this.storagePrefix = 'jira_';
        this.proxyUrl = this.getStorage('proxyUrl') || 'http://localhost:3000/api/jira';
        this.agileProxyUrl = this._getAgileProxyUrl();
        this.authType = this.getStorage('authType') || 'basic';
        this.username = this.getStorage('username') || '';
        this.apiToken = this.getStorage('apiToken') || '';
        this.bearerToken = this.getStorage('bearerToken') || '';
        this.sprint = null;
        this.allIssues = [];
        this.filteredIssues = [];
        this.sprintData = []; // Array to store per-sprint data
        this.currentSprintIndex = null; // Track currently selected sprint
        this.sprintPairs = []; // Array to store board/sprint ID pairs
        this.currentBoardId = null; // Track current board ID for selected Sprint Set
        this.currentSprintSetName = null; // Track current Sprint Set name for pairs
        this.currentSprintInfoMap = new Map(); // Track sprintId -> sprintName for pairs
        this.draggedPairIndex = null; // Track dragged pair index for reordering
        this.summarySortKey = null;
        this.summarySortDirection = 'asc';
        this.issueTableDisplayMode = {
            completedIssuesBody: 'all',
            notCompletedIssuesBody: 'all',
            removedIssuesBody: 'all',
            completedInAnotherBody: 'all'
        };
        this.preferredSprintSets = this._loadPreferredSprintSets();
        this._initializeEventListeners();
        this._initializeSummarySorting();
        this._displayUserInfo();
        this._populateSprintSets();
    }

    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
    }

    _getAgileProxyUrl() {
        const storedAgileUrl = this.getStorage('agileProxyUrl');
        if (storedAgileUrl) return storedAgileUrl;

        const coreProxyUrl = this.getStorage('proxyUrl') || this.proxyUrl;
        if (coreProxyUrl && coreProxyUrl.includes('/api/jira')) {
            return coreProxyUrl.replace('/api/jira', '/api/jira-agile');
        }

        return 'http://localhost:3000/api/jira-agile';
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
        const form = document.getElementById('sprintForm');
        if (form) {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                this.handleLoad();
            });
        }

        const loadBtn = document.getElementById('loadSprintBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', (event) => {
                event.preventDefault();
                this.handleLoad();
            });
        }

        const sprintSetSelect = document.getElementById('sprintSetSelect');
        if (sprintSetSelect) {
            sprintSetSelect.addEventListener('change', (event) => {
                this.handleSprintSetSelection(event.target.value);
            });
        }

        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExport());
        }

        const loadSelectedSprintsBtn = document.getElementById('loadSelectedSprintsBtn');
        if (loadSelectedSprintsBtn) {
            loadSelectedSprintsBtn.addEventListener('click', () => {
                if (this.currentBoardId) {
                    this._updateSprintPairsList(this.currentBoardId);
                } else {
                    this.showMessage('Please select a Sprint Set first.', 'error');
                }
            });
        }

        const issueToggleButtons = document.querySelectorAll('.toggle-issues');
        issueToggleButtons.forEach((button) => {
            button.addEventListener('click', () => this._toggleIssueSection(button));
        });

        const totalOnlyButtons = document.querySelectorAll('.toggle-total-only');
        totalOnlyButtons.forEach((button) => {
            button.addEventListener('click', () => this._toggleTotalOnlyRows(button));
        });

        const showTotalRowCheckbox = document.getElementById('showTotalRow');
        if (showTotalRowCheckbox) {
            // Load saved preference, default to true
            const savedShowTotalRow = this.getStorage('showTotalRow');
            if (savedShowTotalRow !== null) {
                showTotalRowCheckbox.checked = savedShowTotalRow === 'true';
            } else {
                showTotalRowCheckbox.checked = true; // Default to checked
            }
            // Save preference on change
            showTotalRowCheckbox.addEventListener('change', (event) => {
                localStorage.setItem(this.storagePrefix + 'showTotalRow', event.target.checked);

                if (this.sprintData.length) {
                    this._renderSummary(this.allIssues);

                    if (this.currentSprintIndex !== null && this.currentSprintIndex >= 0) {
                        this.handleSprintRowClick(this.currentSprintIndex);
                    }
                }
            });
        }

        const includePlatformCheckbox = document.getElementById('includePlatform');
        if (includePlatformCheckbox) {
            // Load saved preference, default to true
            const savedIncludePlatform = this.getStorage('includePlatform');
            if (savedIncludePlatform !== null) {
                includePlatformCheckbox.checked = savedIncludePlatform === 'true';
            } else {
                includePlatformCheckbox.checked = true; // Default to checked
            }
            // Save preference on change
            includePlatformCheckbox.addEventListener('change', (event) => {
                localStorage.setItem(this.storagePrefix + 'includePlatform', event.target.checked);
                // Show/hide platform filter
                const platformFilterContainer = document.getElementById('platformFilterContainer');
                if (platformFilterContainer) {
                    platformFilterContainer.style.display = event.target.checked ? 'block' : 'none';
                }
            });
        }

        const includeAbandonedRejectedCheckbox = document.getElementById('includeAbandonedRejected');
        if (includeAbandonedRejectedCheckbox) {
            // Load saved preference, default to true
            const savedIncludeAbandonedRejected = this.getStorage('includeAbandonedRejected');
            if (savedIncludeAbandonedRejected !== null) {
                includeAbandonedRejectedCheckbox.checked = savedIncludeAbandonedRejected === 'true';
            } else {
                includeAbandonedRejectedCheckbox.checked = true; // Default to checked
            }
            // Save preference on change
            includeAbandonedRejectedCheckbox.addEventListener('change', (event) => {
                localStorage.setItem(this.storagePrefix + 'includeAbandonedRejected', event.target.checked);
            });
        }

        const filterPlatform = document.getElementById('filterPlatform');
        if (filterPlatform) {
            filterPlatform.addEventListener('change', () => this.applyFilters());
        }
    }

    _updatePlatformColumnVisibility(show) {
        if (show) {
            document.body.classList.remove('hide-platform');
        } else {
            document.body.classList.add('hide-platform');
        }
    }

    _initializeSummarySorting() {
        const summaryBody = document.getElementById('sprintSummaryBody');
        const summaryTable = summaryBody?.closest('table');
        const headerCells = summaryTable?.querySelectorAll('thead th');
        if (!headerCells || headerCells.length === 0) return;

        const sortKeys = [
            'sprintSetName',
            'sprintName',
            'sprintStatus',
            'original',
            'added',
            'removed',
            'remained',
            'done',
            'notDone',
            'percentageComplete',
            'totalPoints',
            'donePoints',
            'percentageCompleteSp'
        ];

        headerCells.forEach((headerCell, index) => {
            const sortKey = sortKeys[index];
            if (!sortKey) return;

            headerCell.dataset.sortKey = sortKey;
            headerCell.dataset.sortLabel = headerCell.textContent.trim();
            headerCell.classList.add('sortable-header');
            headerCell.style.cursor = 'pointer';

            headerCell.addEventListener('click', () => {
                this._handleSummarySort(sortKey);
            });
        });

        this._updateSummarySortIndicators();
    }

    _handleSummarySort(sortKey) {
        if (!sortKey) return;

        if (this.summarySortKey === sortKey) {
            this.summarySortDirection = this.summarySortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.summarySortKey = sortKey;
            this.summarySortDirection = 'asc';
        }

        this._updateSummarySortIndicators();

        if (this.sprintData.length) {
            this._renderSummary(this.allIssues);
        }
    }

    _updateSummarySortIndicators() {
        const summaryBody = document.getElementById('sprintSummaryBody');
        const summaryTable = summaryBody?.closest('table');
        if (!summaryTable) return;

        const headerCells = summaryTable.querySelectorAll('thead th[data-sort-key]');
        headerCells.forEach((headerCell) => {
            const label = headerCell.dataset.sortLabel || headerCell.textContent.trim();
            const sortKey = headerCell.dataset.sortKey;

            if (this.summarySortKey && sortKey === this.summarySortKey) {
                const arrow = this.summarySortDirection === 'asc' ? ' ↑' : ' ↓';
                headerCell.textContent = `${label}${arrow}`;
                headerCell.classList.add('active-sort');
            } else {
                headerCell.textContent = label;
                headerCell.classList.remove('active-sort');
            }
        });
    }

    showMessage(message, type = 'info') {
        const el = document.getElementById('statusMessage');
        if (!el) return;
        el.hidden = false;
        el.textContent = message;
        el.className = 'status-message ' + (type === 'error' ? 'status-error' : 'status-success');
        if (type === 'success') {
            setTimeout(() => {
                el.hidden = true;
            }, 5000);
        }
    }

    async _displayUserInfo() {
        try {
            const proxyUrl = this.getStorage('proxyUrl') || this.proxyUrl;
            const headers = this.getAuthHeaders();
            if (!headers.Authorization) return;

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    endpoint: '/myself',
                    options: { method: 'GET' }
                })
            });

            if (!response.ok) return;
            const user = await response.json();
            if (!user) return;

            const userInfo = document.getElementById('userInfo');
            const userAvatar = document.getElementById('userAvatar');
            const userInitials = document.getElementById('userInitials');
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');

            const displayName = user.displayName || user.name || '';
            if (userName) userName.textContent = displayName;
            if (userEmail) userEmail.textContent = user.emailAddress || '';

            if (userAvatar && userInitials) {
                if (user.avatarUrls && user.avatarUrls['48x48']) {
                    userAvatar.src = user.avatarUrls['48x48'];
                    userAvatar.style.display = 'block';
                    userInitials.style.display = 'none';
                } else {
                    const initials = (displayName || '').split(' ').map(part => (part && part[0]) || '').join('').toUpperCase().substring(0, 2);
                    userInitials.textContent = initials;
                    userAvatar.style.display = 'none';
                    userInitials.style.display = 'flex';
                }
            }

            if (userInfo) userInfo.hidden = false;
        } catch (error) {
            console.debug('Could not load user info:', error);
        }
    }

    _loadPreferredSprintSets() {
        try {
            const storedSets = this.getStorage('preferredSprintSets');
            return storedSets ? JSON.parse(storedSets) : [];
        } catch (error) {
            console.error('Failed to load preferred sprint sets:', error);
            return [];
        }
    }

    _populateSprintSets() {
        const select = document.getElementById('sprintSetSelect');
        if (!select) return;

        // Clear existing options except the first one
        while (select.options.length > 1) {
            select.remove(1);
        }

        // Add sprint sets as options
        this.preferredSprintSets.forEach((set, index) => {
            const option = document.createElement('option');
            option.value = index;
            const boardLabel = set.boardName ? ` (${set.boardName})` : '';
            const sprintCount = set.sprintIds?.length || 0;
            option.textContent = `${set.name}${boardLabel} - ${sprintCount} sprint${sprintCount !== 1 ? 's' : ''}`;
            select.appendChild(option);
        });
    }

    async handleSprintSetSelection(value) {
        const sprintSelectionContainer = document.getElementById('sprintSelectionContainer');
        const sprintCheckboxList = document.getElementById('sprintCheckboxList');
        const sprintIdGroup = document.getElementById('sprintId')?.parentElement;
        
        if (!value) {
            // Clear selection and show sprint ID input again
            if (sprintSelectionContainer) sprintSelectionContainer.style.display = 'none';
            if (sprintCheckboxList) sprintCheckboxList.innerHTML = '';
            if (sprintIdGroup) sprintIdGroup.style.display = 'block';
            this.currentBoardId = null; // Clear stored board ID
            this.currentSprintSetName = null;
            this.currentSprintInfoMap = new Map();
            return;
        }

        const index = parseInt(value, 10);
        if (isNaN(index) || index < 0 || index >= this.preferredSprintSets.length) {
            return;
        }

        const sprintSet = this.preferredSprintSets[index];
        const sprintIds = sprintSet.sprintIds || [];
        const sprintNames = sprintSet.sprintNames || [];
        
        // Store the selected Sprint Set name and board ID for display in results
        this.selectedSprintSetName = sprintSet.name;
        this.currentBoardId = sprintSet.boardId;
        this.currentSprintSetName = sprintSet.name;

        // Populate the board ID field
        const boardIdInput = document.getElementById('boardId');
        if (boardIdInput && sprintSet.boardId) {
            boardIdInput.value = sprintSet.boardId;
        }

        // Build sprint checkbox list without JIRA calls
        if (sprintSelectionContainer && sprintCheckboxList) {
            sprintSelectionContainer.style.display = 'block';
            
            // Hide sprint ID input field when using Sprint Set selection
            const sprintIdGroup = document.getElementById('sprintId')?.parentElement;
            if (sprintIdGroup) sprintIdGroup.style.display = 'none';

            this.currentSprintInfoMap = new Map(
                sprintIds.map((id, idx) => [String(id), sprintNames[idx] || `Sprint ${id}`])
            );

            sprintCheckboxList.innerHTML = sprintIds.map((sprintId, idx) => `
                <div style="margin-bottom: 0.5rem;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" 
                               class="sprint-checkbox" 
                               value="${sprintId}" 
                               checked 
                               style="cursor: pointer;">
                        <span><strong>${sprintId}</strong> - ${this.escapeHtml(sprintNames[idx] || `Sprint ${sprintId}`)}</span>
                    </label>
                </div>
            `).join('');
            
            this.showMessage(`Sprint Set "${sprintSet.name}" loaded with ${sprintIds.length} sprint(s). Click "Load Selected Sprints" to add them to the pairs list.`, 'info');
        } else {
            this.showMessage(`Sprint Set "${sprintSet.name}" selected with ${sprintIds.length} sprint(s).`, 'info');
        }
    }

    async _loadFromPairsList(includeAbandonedRejected) {
        const loadBtn = document.getElementById('loadSprintBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.textContent = 'Loading...';
        }

        this._resetResults();
        
        try {
            this.showMessage('Loading sprints from pairs list...', 'info');
            
            const includePlatform = document.getElementById('includePlatform')?.checked;
            const sprintsData = [];
            const allIssues = [];
            
            for (const pair of this.sprintPairs) {
                try {
                    const sprintReport = await this._fetchSprintReport(pair.boardId, pair.sprintId);
                    const entityData = this._extractEntityData(sprintReport);
                    const issues = this._extractIssuesFromReport(sprintReport, pair.sprintId, entityData, includeAbandonedRejected);
                    
                    // Enrich issues with platform data from JIRA if enabled
                    if (includePlatform && issues.length > 0) {
                        await this._enrichIssuesWithPlatformData(issues);
                    }
                    
                    const sprint = this._extractSprintInfo(sprintReport, pair.sprintId);
                    sprint._sprintSetName = pair.sprintSetName || 'Manual';
                    sprint._puntedCount = this._countPuntedTickets(sprintReport, includeAbandonedRejected);
                    sprint._addedCount = this._countAddedTickets(sprintReport);
                    sprint._originalCount = this._countOriginalTickets(sprintReport, includeAbandonedRejected);
                    sprint._doneCount = this._countDoneTickets(sprintReport, includeAbandonedRejected);
                    sprint._notDoneCount = this._countNotDoneTickets(sprintReport, includeAbandonedRejected);
                    sprint._sprintReport = sprintReport;
                    sprint._entityData = entityData;
                    sprintsData.push({ sprint, issues });
                    allIssues.push(...issues);
                } catch (error) {
                    console.error(`Failed to load sprint ${pair.sprintId} from board ${pair.boardId}:`, error);
                    this.showMessage(`Warning: Failed to load sprint ${pair.sprintId}`, 'error');
                }
            }
            
            if (sprintsData.length === 0) {
                this.showMessage('No sprints were loaded successfully.', 'error');
                return;
            }
            
            // Create a combined sprint object
            const combinedSprint = {
                id: this.sprintPairs.map(p => p.sprintId).join(','),
                name: `Multiple Sprints (${sprintsData.length})`,
                state: 'mixed',
                startDate: sprintsData[0]?.sprint?.startDate,
                endDate: sprintsData[sprintsData.length - 1]?.sprint?.endDate
            };
            
            this.sprint = combinedSprint;
            this.allIssues = allIssues;
            this.sprintData = sprintsData;
            this.selectedSprintSetName = null; // Custom pairs selection
            this._renderResults(combinedSprint, allIssues);
            this.showMessage(`${sprintsData.length} sprint(s) loaded from pairs list with ${allIssues.length} total issues.`, 'success');
        } catch (error) {
            console.error('Sprint results error:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        } finally {
            if (loadBtn) {
                loadBtn.disabled = false;
                loadBtn.textContent = 'Load Sprint Results';
            }
        }
    }

    async handleLoad() {
        const boardIdInput = document.getElementById('boardId')?.value.trim();
        const includeAbandonedRejected = document.getElementById('includeAbandonedRejected')?.checked;
        
        // Check if sprintPairs list has entries - use it as source of truth
        if (this.sprintPairs && this.sprintPairs.length > 0) {
            // Use pairs list for loading
            await this._loadFromPairsList(includeAbandonedRejected);
            return;
        }
        
        // Check if this is a custom selection (not from Sprint Set dropdown)
        const sprintSetSelect = document.getElementById('sprintSetSelect');
        const sprintSelectionContainer = document.getElementById('sprintSelectionContainer');
        
        let sprintIds = [];
        
        // If Sprint Set is selected and sprint checkboxes are visible, use only checked sprints
        if (sprintSetSelect && sprintSetSelect.value !== '' && sprintSelectionContainer && sprintSelectionContainer.style.display !== 'none') {
            const checkedBoxes = document.querySelectorAll('.sprint-checkbox:checked');
            sprintIds = Array.from(checkedBoxes).map(cb => cb.value.trim()).filter(id => id);
            
            if (sprintIds.length === 0) {
                this.showMessage('Please select at least one sprint to load.', 'error');
                return;
            }
        } else {
            // Use manual input
            const sprintIdInput = document.getElementById('sprintId')?.value.trim();
            if (!sprintIdInput) {
                this.showMessage('Please enter a sprint ID.', 'error');
                return;
            }
            sprintIds = sprintIdInput.split(',').map(id => id.trim()).filter(id => id);
            this.selectedSprintSetName = null; // Custom sprint selection
        }

        if (!boardIdInput) {
            this.showMessage('Please enter a Board ID (Rapid View ID).', 'error');
            return;
        }
        
        if (sprintIds.length === 0) {
            this.showMessage('Please enter valid sprint ID(s).', 'error');
            return;
        }

        const loadBtn = document.getElementById('loadSprintBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.textContent = 'Loading...';
        }

        this._resetResults();
        
        try {
            if (sprintIds.length === 1) {
                // Single sprint
                this.showMessage('Loading sprint results...', 'info');
                
                // Get checkbox states
                const includePlatform = document.getElementById('includePlatform')?.checked;
                
                const sprintReport = await this._fetchSprintReport(boardIdInput, sprintIds[0]);
                const entityData = this._extractEntityData(sprintReport);
                const issues = this._extractIssuesFromReport(sprintReport, sprintIds[0], entityData, includeAbandonedRejected);
                
                // Enrich issues with platform data from JIRA if enabled
                if (includePlatform) {
                    this.showMessage('Fetching platform data...', 'info');
                    await this._enrichIssuesWithPlatformData(issues);
                }
                
                const sprint = this._extractSprintInfo(sprintReport, sprintIds[0]);
                sprint._sprintSetName = this.selectedSprintSetName || 'Custom';
                sprint._puntedCount = this._countPuntedTickets(sprintReport, includeAbandonedRejected);
                sprint._addedCount = this._countAddedTickets(sprintReport);
                sprint._originalCount = this._countOriginalTickets(sprintReport, includeAbandonedRejected);
                sprint._doneCount = this._countDoneTickets(sprintReport, includeAbandonedRejected);
                sprint._notDoneCount = this._countNotDoneTickets(sprintReport, includeAbandonedRejected);
                sprint._sprintReport = sprintReport;
                sprint._entityData = entityData;
                this.sprint = sprint;
                this.allIssues = issues;
                this.sprintData = [{ sprint, issues }];
                this._renderResults(sprint, issues);
                this.showMessage('Sprint results loaded successfully.', 'success');
            } else {
                // Multiple sprints - fetch all and combine
                this.showMessage(`Loading ${sprintIds.length} sprints...`, 'info');
                const sprintsData = [];
                const allIssues = [];
                
                const includePlatform = document.getElementById('includePlatform')?.checked;
                
                for (let i = 0; i < sprintIds.length; i++) {
                    const sprintId = sprintIds[i];
                    this.showMessage(`Loading sprint ${i + 1} of ${sprintIds.length}...`, 'info');
                    try {
                        const sprintReport = await this._fetchSprintReport(boardIdInput, sprintId);
                        const entityData = this._extractEntityData(sprintReport);
                        const issues = this._extractIssuesFromReport(sprintReport, sprintId, entityData, includeAbandonedRejected);
                        
                        // Enrich issues with platform data from JIRA if enabled
                        if (includePlatform) {
                            await this._enrichIssuesWithPlatformData(issues);
                        }
                        
                        const sprint = this._extractSprintInfo(sprintReport, sprintId);
                        sprint._sprintSetName = this.selectedSprintSetName || 'Custom';
                        sprint._puntedCount = this._countPuntedTickets(sprintReport, includeAbandonedRejected);
                        sprint._addedCount = this._countAddedTickets(sprintReport);
                        sprint._originalCount = this._countOriginalTickets(sprintReport, includeAbandonedRejected);
                        sprint._doneCount = this._countDoneTickets(sprintReport, includeAbandonedRejected);
                        sprint._notDoneCount = this._countNotDoneTickets(sprintReport, includeAbandonedRejected);
                        sprint._sprintReport = sprintReport;
                        sprint._entityData = entityData;
                        sprintsData.push({ sprint, issues });
                        allIssues.push(...issues);
                    } catch (error) {
                        console.error(`Failed to load sprint ${sprintId}:`, error);
                        this.showMessage(`Warning: Failed to load sprint ${sprintId}`, 'error');
                    }
                }
                
                // Create a combined sprint object
                const combinedSprint = {
                    id: sprintIds.join(','),
                    name: `Multiple Sprints (${sprintsData.length})`,
                    state: 'mixed',
                    startDate: sprintsData[0]?.sprint?.startDate,
                    endDate: sprintsData[sprintsData.length - 1]?.sprint?.endDate
                };
                
                this.sprint = combinedSprint;
                this.allIssues = allIssues;
                this.sprintData = sprintsData;
                this._renderResults(combinedSprint, allIssues);
                this.showMessage(`${sprintsData.length} sprint(s) loaded with ${allIssues.length} total issues.`, 'success');
            }
        } catch (error) {
            console.error('Sprint results error:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        } finally {
            if (loadBtn) {
                loadBtn.disabled = false;
                loadBtn.textContent = 'Load Sprint Results';
            }
        }
    }

    async _fetchSprintNames(boardId, sprintIds) {
        const sprintInfoList = [];
        
        for (const sprintId of sprintIds) {
            try {
                const sprintReport = await this._fetchSprintReport(boardId, sprintId);
                const sprintInfo = this._extractSprintInfo(sprintReport, sprintId);
                sprintInfoList.push(sprintInfo);
            } catch (error) {
                // If fetch fails, use Sprint ID as name
                sprintInfoList.push({
                    id: sprintId,
                    name: `Sprint ${sprintId} (failed to load)`,
                    state: 'unknown'
                });
            }
        }
        
        return sprintInfoList;
    }

    async _fetchSprintReport(boardId, sprintId) {
        const endpoint = `/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${encodeURIComponent(boardId)}&sprintId=${encodeURIComponent(sprintId)}`;
        const proxyUrl = this.getStorage('proxyUrl') || this.proxyUrl;
        const headers = this.getAuthHeaders();

        if (!headers.Authorization) {
            throw new Error('JIRA authentication not configured. Please complete setup first.');
        }

        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                endpoint,
                options: { method: 'GET' }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch sprint report: ${response.status} ${errorText}`);
        }

        const json = await response.json();
        return json;
    }

    async _enrichIssuesWithPlatformData(issues) {
        // Fetch platform field (customfield_11500) for all issues in batches
        if (!issues || issues.length === 0) return;
        
        const issueKeys = issues.map(issue => issue.key).filter(key => key);
        if (issueKeys.length === 0) return;
        
        // Batch issues in groups of 100 (JIRA API limit)
        const batchSize = 100;
        for (let i = 0; i < issueKeys.length; i += batchSize) {
            const batch = issueKeys.slice(i, i + batchSize);
            const jql = `key in (${batch.join(',')})`;
            
            try {
                const endpoint = `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=customfield_11500&maxResults=${batchSize}`;
                const proxyUrl = this.getStorage('proxyUrl') || this.proxyUrl;
                const headers = this.getAuthHeaders();
                
                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        endpoint,
                        options: { method: 'GET' }
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const issueMap = new Map();
                    
                    // Build a map of issue key to platform value
                    if (data.issues) {
                        data.issues.forEach(jiraIssue => {
                            const platform = jiraIssue.fields?.customfield_11500;
                            if (platform) {
                                issueMap.set(jiraIssue.key, platform);
                            }
                        });
                    }
                    
                    // Update the issues with platform data
                    issues.forEach(issue => {
                        if (issueMap.has(issue.key)) {
                            const platformValue = issueMap.get(issue.key);
                            if (!issue.fields) issue.fields = {};
                            issue.fields.customfield_11500 = platformValue;
                        }
                    });
                }
            } catch (error) {
                console.error('Error fetching platform data for batch:', batch, error);
            }
        }
    }

    _extractEntityData(sprintReport) {
        // Extract entity data tables: statuses, priorities, types, epics
        // The entityData is inside the contents section
        const entitySection = sprintReport?.contents?.entityData || sprintReport?.entityData || sprintReport?.entity || {};
        
        const entityData = {
            statuses: entitySection?.statuses || {},
            priorities: entitySection?.priorities || {},
            types: entitySection?.types || {},
            epics: entitySection?.epics || {}
        };
        
        return entityData;
    }

    _extractSprintInfo(sprintReport, sprintId) {
        const sprint = sprintReport?.sprint;
        return {
            id: sprintId,
            name: sprint?.name || `Sprint ${sprintId}`,
            state: sprint?.state || 'unknown',
            startDate: sprint?.startDate,
            endDate: sprint?.endDate,
            completeDate: sprint?.completeDate
        };
    }

    _extractIssuesFromReport(sprintReport, sprintId, entityData, includeAbandonedRejected) {
        const categorizedIssues = {
            completed: [],
            notCompleted: [],
            removed: [],
            completedInAnother: []
        };
        
        const sprint = sprintReport?.sprint;
        const sprintName = sprint?.name || `Sprint ${sprintId}`;
        
        // Get issue arrays from different sections
        const completedIssues = sprintReport?.contents?.completedIssues || [];
        const issuesNotCompleted = sprintReport?.contents?.issuesNotCompletedInCurrentSprint || [];
        const puntedIssues = sprintReport?.contents?.puntedIssues || [];
        const completedInAnotherSprint = sprintReport?.contents?.issuesCompletedInAnotherSprint || [];
        
        // Get the list of issue keys added during sprint
        const issueKeysAddedDuringSprint = sprintReport?.contents?.issueKeysAddedDuringSprint || [];
        
        // Handle different data formats for issueKeysAddedDuringSprint
        let addedKeysArray = [];
        if (Array.isArray(issueKeysAddedDuringSprint)) {
            addedKeysArray = issueKeysAddedDuringSprint;
        } else if (typeof issueKeysAddedDuringSprint === 'object' && issueKeysAddedDuringSprint !== null) {
            addedKeysArray = Object.keys(issueKeysAddedDuringSprint);
        } else if (typeof issueKeysAddedDuringSprint === 'string') {
            addedKeysArray = issueKeysAddedDuringSprint.split(',').filter(s => s.trim());
        }
        const addedKeysSet = new Set(addedKeysArray.map(key => String(key)));
        
        // Helper function to create issue object
        const createIssueObject = (issue, category) => {
            // Extract typeId and statusId from the issue object
            // Check multiple possible field locations in GreenHopper API response
            const typeId = issue.typeId || 
                          (typeof issue.type === 'object' ? issue.type?.id : issue.type) || 
                          '';
            const statusId = issue.statusId || 
                            (typeof issue.status === 'object' ? issue.status?.id : issue.status) || 
                            '';
            
            // Look up typeName from entityData types table
            let typeName = '';
            if (typeId && entityData?.types) {
                // Try both numeric and string keys
                const typeEntry = entityData.types[typeId] || entityData.types[String(typeId)];
                typeName = typeEntry?.typeName || typeEntry?.name || typeId;
            } else {
                typeName = issue.typeName || typeId;
            }
            
            // Look up statusName from entityData statuses table
            let statusName = '';
            if (statusId && entityData?.statuses) {
                // Try both numeric and string keys
                const statusEntry = entityData.statuses[statusId] || entityData.statuses[String(statusId)];
                statusName = statusEntry?.statusName || statusEntry?.name || statusId;
            } else {
                statusName = issue.statusName || statusId;
            }
            
            return {
                id: issue.id,
                key: issue.key,
                addedFlag: addedKeysSet.has(String(issue.key)) ? '*' : '',
                sprintId: sprintId,
                sprintName: sprintName,
                category: category, // Mark which category this issue belongs to
                fields: {
                    summary: issue.summary || '',
                    issuetype: {
                        id: typeId,
                        name: typeName
                    },
                    status: {
                        id: statusId,
                        name: statusName
                    },
                    assignee: issue.assigneeName ? {
                        displayName: issue.assigneeName
                    } : null,
                    customfield_10200: issue.currentEstimateStatistic?.statFieldValue?.value || null,
                    customfield_11500: issue.platformName || null,
                    customfield_10114: issue.teamName || null
                },
                issuecategory: issue.issuecategory || issue.categoryName || ''
            };
        };
        
        // Process completed issues
        completedIssues.forEach(issue => {
            const issueObj = createIssueObject(issue, 'completed');
            // Filter out Abandon/Rejected if flag is false
            if (includeAbandonedRejected === false && this._isStatusIgnored(issueObj.fields?.status?.name)) {
                return;
            }
            categorizedIssues.completed.push(issueObj);
        });
        
        // Process not completed issues
        issuesNotCompleted.forEach(issue => {
            const issueObj = createIssueObject(issue, 'notCompleted');
            // Filter out Abandon/Rejected if flag is false
            if (includeAbandonedRejected === false && this._isStatusIgnored(issueObj.fields?.status?.name)) {
                return;
            }
            categorizedIssues.notCompleted.push(issueObj);
        });
        
        // Process removed/punted issues
        puntedIssues.forEach(issue => {
            const issueObj = createIssueObject(issue, 'removed');
            // Filter out Abandon/Rejected if flag is false
            if (includeAbandonedRejected === false && this._isStatusIgnored(issueObj.fields?.status?.name)) {
                return;
            }
            categorizedIssues.removed.push(issueObj);
        });
        
        // Process issues completed in another sprint
        completedInAnotherSprint.forEach(issue => {
            const issueObj = createIssueObject(issue, 'completedInAnother');
            // Filter out Abandon/Rejected if flag is false
            if (includeAbandonedRejected === false && this._isStatusIgnored(issueObj.fields?.status?.name)) {
                return;
            }
            categorizedIssues.completedInAnother.push(issueObj);
        });

        // Return flat array for backward compatibility
        return [
            ...categorizedIssues.completed,
            ...categorizedIssues.notCompleted,
            ...categorizedIssues.removed,
            ...categorizedIssues.completedInAnother
        ];
    }

    _renderResults(sprint, issues) {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) resultsSection.hidden = false;
        
        // Update Sprint Set title
        const sprintSetTitle = document.getElementById('sprintSetTitle');
        if (sprintSetTitle) {
            if (this.selectedSprintSetName) {
                sprintSetTitle.textContent = `Sprint Set: ${this.selectedSprintSetName}`;
                sprintSetTitle.style.display = 'block';
            } else {
                sprintSetTitle.textContent = 'Custom Sprint Selection';
                sprintSetTitle.style.display = 'block';
            }
        }

        // Update platform column visibility based on current checkbox state
        const includePlatformCheckbox = document.getElementById('includePlatform');
        if (includePlatformCheckbox) {
            this._updatePlatformColumnVisibility(includePlatformCheckbox.checked);
            // Show/hide platform filter
            const platformFilterContainer = document.getElementById('platformFilterContainer');
            if (platformFilterContainer) {
                platformFilterContainer.style.display = includePlatformCheckbox.checked ? 'block' : 'none';
            }
        }

        this._populateFilterOptions(issues);
        this._renderSummary(issues);
        
        // Hide Sprint Issues section initially
        const sprintIssuesSection = document.getElementById('sprintIssuesSection');
        if (sprintIssuesSection) sprintIssuesSection.style.display = 'none';
    }

    handleSprintRowClick(index) {
        if (index < 0 || index >= this.sprintData.length) return;
        
        // Store selected sprint index
        this.currentSprintIndex = index;
        
        const { sprint, issues } = this.sprintData[index];
        
        // Apply platform filter to issues
        const platformFilter = document.getElementById('filterPlatform')?.value || '';
        const filteredIssues = platformFilter 
            ? issues.filter(issue => this._getPlatform(issue) === platformFilter)
            : issues;
        
        // Show Sprint Issues section
        const sprintIssuesSection = document.getElementById('sprintIssuesSection');
        if (sprintIssuesSection) sprintIssuesSection.style.display = 'block';

        // Update Sprint Issues header with Sprint Set and Sprint Name
        const sprintIssuesHeader = document.getElementById('sprintIssuesHeader');
        if (sprintIssuesHeader) {
            const sprintSetName = sprint._sprintSetName || 'Custom';
            sprintIssuesHeader.textContent = `Sprint Set: ${sprintSetName} | Sprint: ${sprint.name}`;
        }

        this._resetIssueSectionToggles();
        
        // Highlight selected row
        document.querySelectorAll('.sprint-row').forEach(row => {
            row.style.backgroundColor = '';
        });
        const selectedRow = document.querySelector(`[data-sprint-index="${index}"]`);
        if (selectedRow) {
            selectedRow.style.backgroundColor = '#e8f4fd';
        }
        
        // Render categorized issues for the selected sprint
        this._renderCategorizedIssues(filteredIssues);
    }

    _renderCategorizedIssues(issues) {
        // Categorize issues by their category field
        const categorized = {
            completed: issues.filter(issue => issue.category === 'completed'),
            notCompleted: issues.filter(issue => issue.category === 'notCompleted'),
            removed: issues.filter(issue => issue.category === 'removed'),
            completedInAnother: issues.filter(issue => issue.category === 'completedInAnother')
        };
        
        // Render each category
        this._renderIssueCategory('completedIssuesBody', categorized.completed);
        this._renderIssueCategory('notCompletedIssuesBody', categorized.notCompleted);
        this._renderIssueCategory('removedIssuesBody', categorized.removed);
        this._renderIssueCategory('completedInAnotherBody', categorized.completedInAnother);
    }

    _toggleIssueSection(button) {
        const targetId = button.dataset.target;
        if (!targetId) return;
        const container = document.getElementById(targetId);
        if (!container) return;

        const isHidden = container.style.display === 'none';
        container.style.display = isHidden ? 'block' : 'none';
        button.textContent = isHidden ? 'Collapse' : 'Expand';
        button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    }

    _resetIssueSectionToggles() {
        const containers = [
            'completedIssuesContainer',
            'notCompletedIssuesContainer',
            'removedIssuesContainer',
            'completedInAnotherContainer'
        ];

        containers.forEach((id) => {
            const container = document.getElementById(id);
            if (container) container.style.display = 'block';
        });

        const buttons = document.querySelectorAll('.toggle-issues');
        buttons.forEach((button) => {
            button.textContent = 'Collapse';
            button.setAttribute('aria-expanded', 'true');
        });

        this.issueTableDisplayMode = {
            completedIssuesBody: 'all',
            notCompletedIssuesBody: 'all',
            removedIssuesBody: 'all',
            completedInAnotherBody: 'all'
        };

        const totalOnlyButtons = document.querySelectorAll('.toggle-total-only');
        totalOnlyButtons.forEach((button) => {
            button.textContent = 'Only show Total';
        });
    }

    _toggleTotalOnlyRows(button) {
        const bodyId = button.dataset.body;
        if (!bodyId) return;

        const currentMode = this.issueTableDisplayMode[bodyId] || 'all';
        const nextMode = currentMode === 'all' ? 'total-only' : 'all';
        this.issueTableDisplayMode[bodyId] = nextMode;

        button.textContent = nextMode === 'total-only' ? 'Show All Rows' : 'Only show Total';
        this._applyIssueTableDisplayMode(bodyId);
    }

    _applyIssueTableDisplayMode(bodyId) {
        const body = document.getElementById(bodyId);
        if (!body) return;

        const mode = this.issueTableDisplayMode[bodyId] || 'all';
        const dataRows = body.querySelectorAll('tr.issue-data-row');

        dataRows.forEach((row) => {
            row.style.display = mode === 'total-only' ? 'none' : '';
        });
    }

    _renderIssueCategory(bodyId, issues) {
        const body = document.getElementById(bodyId);
        if (!body) return;

        if (!issues.length) {
            body.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No issues in this category</td></tr>';
            return;
        }

        // Check if platform should be shown
        const includePlatformCheckbox = document.getElementById('includePlatform');
        const includePlatform = includePlatformCheckbox ? includePlatformCheckbox.checked : false;

        // Check if total row should be shown
        const showTotalRowCheckbox = document.getElementById('showTotalRow');
        const showTotalRow = showTotalRowCheckbox ? showTotalRowCheckbox.checked : true;

        // Calculate totals
        let addedFlagCount = 0;
        let totalStoryPoints = 0;
        
        const issueRows = issues.map(issue => {
            const key = issue.key || '';
            const addedFlag = issue.addedFlag || '';
            const summary = issue.fields?.summary || '';
            const typeName = issue.fields?.issuetype?.name || '';
            const statusName = issue.fields?.status?.name || '';
            const platform = this._getPlatform(issue);
            const points = this._getStoryPoints(issue);

            // Count added flags
            if (addedFlag === '*') {
                addedFlagCount++;
            }
            
            // Sum story points
            if (points !== null) {
                totalStoryPoints += points;
            }

            return (
                `<tr class="issue-data-row">` +
                `<td>${this.escapeHtml(key)}</td>` +
                `<td style="text-align: center; font-weight: bold;">${this.escapeHtml(addedFlag)}</td>` +
                `<td style="text-align: left;">${this.escapeHtml(summary)}</td>` +
                `<td>${this.escapeHtml(typeName)}</td>` +
                `<td>${this.escapeHtml(statusName)}</td>` +
                (includePlatform ? `<td class="platform-column">${this.escapeHtml(platform)}</td>` : '') +
                `<td>${this.escapeHtml(points !== null ? points.toFixed(1) : '-')}</td>` +
                `</tr>`
            );
        }).join('');
        
        // Add total row if enabled
        let totalRow = '';
        if (showTotalRow) {
            const colspanCount = includePlatform ? 4 : 3;
            totalRow = (
                `<tr class="issue-total-row" style="background-color: #f0f0f0; font-weight: bold;">` +
                `<td>${issues.length}</td>` +
                `<td style="text-align: center;">${addedFlagCount}</td>` +
                `<td colspan="${colspanCount}"></td>` +
                `<td>${totalStoryPoints.toFixed(1)}</td>` +
                `</tr>`
            );
        }
        
        body.innerHTML = totalRow + issueRows;
        this._applyIssueTableDisplayMode(bodyId);
    }

    _renderSprintMeta(sprint) {
        const metaBody = document.getElementById('sprintMetaBody');
        if (!metaBody) return;

        const rows = this._buildSprintMetaRows(sprint);

        metaBody.innerHTML = rows.map(([label, value]) => (
            `<tr><th style="width: 160px;">${this.escapeHtml(label)}</th><td>${this.escapeHtml(value)}</td></tr>`
        )).join('');
    }

    _getTypeNameFromEntity(typeObj, entityData) {
        if (!typeObj) return '';
        
        // typeObj can be either an id (string) or an object with id and name properties
        const typeId = typeof typeObj === 'string' ? typeObj : typeObj?.id;
        if (!typeId) return typeObj?.name || '';
        
        // Look up type name from entityData/types section
        const types = entityData?.types;
        if (!types) return typeObj?.name || '';
        
        // Handle types as object (keyed by id)
        if (types[typeId]) {
            return types[typeId]?.typeName || types[typeId]?.name || '';
        }
        
        // Handle types as array - search for matching id
        if (Array.isArray(types)) {
            const typeEntry = types.find(t => String(t?.id) === String(typeId));
            if (typeEntry) {
                return typeEntry?.typeName || typeEntry?.name || '';
            }
        }
        
        // Fallback to name if provided in typeObj
        if (typeObj?.name) {
            return typeObj.name;
        }
        
        return '';
    }

    _renderSummary(issues) {
        const summaryBody = document.getElementById('sprintSummaryBody');
        if (!summaryBody) return;
        
        const platformFilter = document.getElementById('filterPlatform')?.value || '';
        const showTotalRow = document.getElementById('showTotalRow')?.checked ?? true;

        const totals = {
            original: 0,
            added: 0,
            removed: 0,
            remained: 0,
            done: 0,
            notDone: 0,
            totalPoints: 0,
            donePoints: 0
        };
        
        const rows = this.sprintData.map(({ sprint, issues }, index) => {
            // Apply platform filter to issues
            const filteredIssues = platformFilter 
                ? issues.filter(issue => this._getPlatform(issue) === platformFilter)
                : issues;
            
            // Recalculate counts based on filtered issues
            const counts = this._calculateSprintCounts(filteredIssues);
            const puntedCount = counts.removed;
            const addedCount = counts.added;
            const originalCount = counts.original;
            const doneCount = counts.done;
            const notDoneCount = counts.notDone;
            const remainedCount = originalCount + addedCount - puntedCount;
            const percentageComplete = this._calculatePercentageComplete(doneCount, remainedCount);
            const metrics = this._calculateSprintMetrics(filteredIssues);
            
            // Calculate story points percentage
            const totalPointsNum = parseFloat(metrics.totalPoints) || 0;
            const donePointsNum = parseFloat(metrics.donePoints) || 0;
            const storyPointsPercentage = totalPointsNum > 0 
                ? Math.round((donePointsNum / totalPointsNum) * 100) + '%' 
                : '0%';
            const storyPointsPercentageNum = totalPointsNum > 0
                ? Math.round((donePointsNum / totalPointsNum) * 100)
                : 0;
            const percentageCompleteNum = remainedCount > 0
                ? Math.round((doneCount / remainedCount) * 100)
                : 0;

            totals.original += originalCount;
            totals.added += addedCount;
            totals.removed += puntedCount;
            totals.remained += remainedCount;
            totals.done += doneCount;
            totals.notDone += notDoneCount;
            totals.totalPoints += totalPointsNum;
            totals.donePoints += donePointsNum;

            return {
                originalIndex: index,
                sprintSetName: sprint._sprintSetName || 'Custom',
                sprintName: sprint.name || '',
                sprintStatus: sprint.state || 'unknown',
                originalCount,
                addedCount,
                puntedCount,
                remainedCount,
                doneCount,
                notDoneCount,
                percentageComplete,
                percentageCompleteNum,
                totalPointsNum,
                donePointsNum,
                storyPointsPercentage,
                storyPointsPercentageNum,
                totalPointsDisplay: metrics.totalPoints,
                donePointsDisplay: metrics.donePoints
            };
        });

        let sortedRows = [...rows];
        if (this.summarySortKey) {
            const direction = this.summarySortDirection === 'asc' ? 1 : -1;
            sortedRows.sort((a, b) => {
                let valueA;
                let valueB;

                switch (this.summarySortKey) {
                    case 'sprintSetName':
                        valueA = a.sprintSetName.toLowerCase();
                        valueB = b.sprintSetName.toLowerCase();
                        break;
                    case 'sprintName':
                        valueA = a.sprintName.toLowerCase();
                        valueB = b.sprintName.toLowerCase();
                        break;
                    case 'sprintStatus':
                        valueA = a.sprintStatus.toLowerCase();
                        valueB = b.sprintStatus.toLowerCase();
                        break;
                    case 'original':
                        valueA = a.originalCount;
                        valueB = b.originalCount;
                        break;
                    case 'added':
                        valueA = a.addedCount;
                        valueB = b.addedCount;
                        break;
                    case 'removed':
                        valueA = a.puntedCount;
                        valueB = b.puntedCount;
                        break;
                    case 'remained':
                        valueA = a.remainedCount;
                        valueB = b.remainedCount;
                        break;
                    case 'done':
                        valueA = a.doneCount;
                        valueB = b.doneCount;
                        break;
                    case 'notDone':
                        valueA = a.notDoneCount;
                        valueB = b.notDoneCount;
                        break;
                    case 'percentageComplete':
                        valueA = a.percentageCompleteNum;
                        valueB = b.percentageCompleteNum;
                        break;
                    case 'totalPoints':
                        valueA = a.totalPointsNum;
                        valueB = b.totalPointsNum;
                        break;
                    case 'donePoints':
                        valueA = a.donePointsNum;
                        valueB = b.donePointsNum;
                        break;
                    case 'percentageCompleteSp':
                        valueA = a.storyPointsPercentageNum;
                        valueB = b.storyPointsPercentageNum;
                        break;
                    default:
                        valueA = a.originalIndex;
                        valueB = b.originalIndex;
                        break;
                }

                if (valueA < valueB) return -1 * direction;
                if (valueA > valueB) return 1 * direction;
                return a.originalIndex - b.originalIndex;
            });
        }

        // Render one row per sprint
        const sprintRows = sortedRows.map((row) => {
            
            return (
                `<tr data-sprint-index="${row.originalIndex}" style="cursor: pointer;" onclick="sprintResults.handleSprintRowClick(${row.originalIndex})" class="sprint-row">` +
                `<td>${this.escapeHtml(row.sprintSetName)}</td>` +
                `<td>${this.escapeHtml(row.sprintName)}</td>` +
                `<td>${this.escapeHtml(row.sprintStatus)}</td>` +
                `<td>${row.originalCount}</td>` +
                `<td>${row.addedCount}</td>` +
                `<td>${row.puntedCount > 0 ? '-' + row.puntedCount : row.puntedCount}</td>` +
                `<td>${row.remainedCount}</td>` +
                `<td>${row.doneCount}</td>` +
                `<td>${row.notDoneCount}</td>` +
                `<td>${row.percentageComplete}</td>` +
                `<td>${row.totalPointsDisplay}</td>` +
                `<td>${row.donePointsDisplay}</td>` +
                `<td>${row.storyPointsPercentage}</td>` +
                `</tr>`
            );
        }).join('');

        let totalRow = '';
        if (showTotalRow && this.sprintData.length) {
            const totalPercentageComplete = this._calculatePercentageComplete(totals.done, totals.remained);
            const totalStoryPointsPercentage = totals.totalPoints > 0
                ? Math.round((totals.donePoints / totals.totalPoints) * 100) + '%'
                : '0%';

            totalRow = (
                `<tr class="summary-total-row">` +
                `<td>Total</td>` +
                `<td>All sprints</td>` +
                `<td>-</td>` +
                `<td>${totals.original}</td>` +
                `<td>${totals.added}</td>` +
                `<td>${totals.removed > 0 ? '-' + totals.removed : totals.removed}</td>` +
                `<td>${totals.remained}</td>` +
                `<td>${totals.done}</td>` +
                `<td>${totals.notDone}</td>` +
                `<td>${totalPercentageComplete}</td>` +
                `<td>${totals.totalPoints.toFixed(1)}</td>` +
                `<td>${totals.donePoints.toFixed(1)}</td>` +
                `<td>${totalStoryPointsPercentage}</td>` +
                `</tr>`
            );
        }

        summaryBody.innerHTML = sprintRows + totalRow;

        if (this.currentSprintIndex !== null && this.currentSprintIndex >= 0) {
            const selectedRow = document.querySelector(`[data-sprint-index="${this.currentSprintIndex}"]`);
            if (selectedRow) {
                selectedRow.style.backgroundColor = '#e8f4fd';
            }
        }
    }

    _calculateSprintMetrics(issues) {
        let totalPoints = 0;
        let donePoints = 0;
        let doneCount = 0;

        // Categories to include in total story points calculation
        const totalCategories = ['completed', 'notCompleted', 'completedInAnother'];
        
        // Categories to include in done story points calculation
        const doneCategories = ['completed', 'completedInAnother'];

        issues.forEach(issue => {
            // For TOTAL STORY POINTS: sum currentEstimateStatistic from specific categories
            if (totalCategories.includes(issue.category)) {
                const currentEstimate = this._getCurrentEstimate(issue);
                if (currentEstimate !== null) {
                    totalPoints += currentEstimate;
                }
            }
            
            // For DONE STORY POINTS: sum currentEstimateStatistic from done categories only
            if (doneCategories.includes(issue.category)) {
                const currentEstimate = this._getCurrentEstimate(issue);
                if (currentEstimate !== null) {
                    donePoints += currentEstimate;
                }
            }
            
            // Count done issues
            if (this._isDone(issue)) {
                doneCount += 1;
            }
        });

        const totalCount = issues.length;
        const notDoneCount = totalCount - doneCount;

        return {
            totalCount,
            doneCount,
            notDoneCount,
            totalPoints: totalPoints ? totalPoints.toFixed(1) : '0',
            donePoints: donePoints ? donePoints.toFixed(1) : '0'
        };
    }

    _resetResults() {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) resultsSection.hidden = true;
        const sprintIssuesSection = document.getElementById('sprintIssuesSection');
        if (sprintIssuesSection) sprintIssuesSection.style.display = 'none';
        const summaryBody = document.getElementById('sprintSummaryBody');
        if (summaryBody) summaryBody.innerHTML = '';
        
        // Clear all category tables
        const completedBody = document.getElementById('completedIssuesBody');
        if (completedBody) completedBody.innerHTML = '';
        const notCompletedBody = document.getElementById('notCompletedIssuesBody');
        if (notCompletedBody) notCompletedBody.innerHTML = '';
        const removedBody = document.getElementById('removedIssuesBody');
        if (removedBody) removedBody.innerHTML = '';
        const completedInAnotherBody = document.getElementById('completedInAnotherBody');
        if (completedInAnotherBody) completedInAnotherBody.innerHTML = '';
        
        this.filteredIssues = [];
        this.sprintData = [];
    }

    _populateFilterOptions(issues) {
        const platformSelect = document.getElementById('filterPlatform');

        if (!platformSelect) return;

        const platforms = new Set();

        issues.forEach((issue) => {
            const platform = this._getPlatform(issue);
            if (platform) platforms.add(platform);
        });

        this._replaceSelectOptions(platformSelect, 'All Platforms', [...platforms].sort());
    }

    _replaceSelectOptions(select, defaultLabel, items) {
        select.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = defaultLabel;
        select.appendChild(defaultOption);

        items.forEach((value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
    }

    applyFilters() {
        const platformFilter = document.getElementById('filterPlatform')?.value || '';

        const filtered = this.allIssues.filter((issue) => {
            const platform = this._getPlatform(issue);

            if (platformFilter && platformFilter !== platform) return false;
            return true;
        });

        this.filteredIssues = filtered;
        
        // Re-render Summary Metrics with filtered data
        this._renderSummary(this.allIssues);
        
        // If a sprint is currently selected, re-render its Sprint Issues with filter applied
        if (this.currentSprintIndex !== null && this.currentSprintIndex >= 0) {
            this.handleSprintRowClick(this.currentSprintIndex);
        }
    }

    handleExport() {
        const issues = this.filteredIssues.length ? this.filteredIssues : this.allIssues;
        if (!issues.length) {
            this.showMessage('No issues available to export.', 'error');
            return;
        }

        if (typeof XLSX === 'undefined') {
            this.showMessage('Excel export requires XLSX support.', 'error');
            return;
        }

        this._exportExcel(issues);
    }

    _exportExcel(issues) {
        const summaryRows = this._buildTransposedSummaryRows();
        const issueRows = this._buildIssueRows(issues);

        const workbook = XLSX.utils.book_new();
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
        const issuesSheet = XLSX.utils.aoa_to_sheet(issueRows);

        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
        XLSX.utils.book_append_sheet(workbook, issuesSheet, 'Issues');

        XLSX.writeFile(workbook, this._buildFilename('xlsx'));
    }

    _buildTransposedSummaryRows() {
        const header = ['Sprint Set Name', 'Sprint Name', 'Sprint Status', 'Original Tickets', 'Added Tickets', 'Removed Tickets', 'Remained Tickets', 'Done Tickets', 'Not Done Tickets', 'Percentage Complete', 'Total Story Points', 'Done Story Points', 'Percentage Complete SP'];
        const rows = [header];
        const platformFilter = document.getElementById('filterPlatform')?.value || '';
        
        this.sprintData.forEach(({ sprint, issues }) => {
            const filteredIssues = platformFilter
                ? issues.filter(issue => this._getPlatform(issue) === platformFilter)
                : issues;
            const counts = this._calculateSprintCounts(filteredIssues);
            const puntedCount = counts.removed;
            const addedCount = counts.added;
            const originalCount = counts.original;
            const doneCount = counts.done;
            const notDoneCount = counts.notDone;
            const remainedCount = originalCount + addedCount - puntedCount;
            const percentageValue = remainedCount > 0 ? Math.round((doneCount / remainedCount) * 100) : '';
            const metrics = this._calculateSprintMetrics(filteredIssues);
            const totalPointsNum = parseFloat(metrics.totalPoints) || 0;
            const donePointsNum = parseFloat(metrics.donePoints) || 0;
            const storyPointsPercentage = totalPointsNum > 0 ? Math.round((donePointsNum / totalPointsNum) * 100) : 0;
            rows.push([
                sprint._sprintSetName || 'Custom',
                sprint.name,
                sprint.state || 'unknown',
                originalCount,
                addedCount,
                puntedCount > 0 ? -Math.abs(puntedCount) : puntedCount,
                remainedCount,
                doneCount,
                notDoneCount,
                percentageValue,
                totalPointsNum,
                donePointsNum,
                storyPointsPercentage
            ]);
        });
        
        return rows;
    }

    _buildIssueRows(issues) {
        // Check if platform should be included
        const includePlatformCheckbox = document.getElementById('includePlatform');
        const includePlatform = includePlatformCheckbox ? includePlatformCheckbox.checked : false;
        
        // Build header row
        const headerRow = [
            'Sprint ID',
            'Sprint Name',
            'Category',
            'Key',
            'Added Flag',
            'Summary',
            'Type',
            'Status'
        ];
        
        if (includePlatform) {
            headerRow.push('Platform');
        }
        
        headerRow.push('Story Points');
        
        const rows = [headerRow];

        // Map category codes to readable names
        const categoryNames = {
            'completed': 'Completed Issues',
            'notCompleted': 'Issues Not Completed',
            'removed': 'Issues Removed From Sprint',
            'completedInAnother': 'Issues Completed in Another Sprint'
        };

        issues.forEach((issue) => {
            const points = this._getStoryPoints(issue);
            const categoryLabel = categoryNames[issue.category] || issue.issuecategory || issue.category || '';
            
            const row = [
                issue.sprintId || '',
                issue.sprintName || '',
                categoryLabel,
                issue.key || '',
                issue.addedFlag || '',
                issue.fields?.summary || '',
                issue.fields?.issuetype?.name || '',
                issue.fields?.status?.name || ''
            ];
            
            if (includePlatform) {
                row.push(this._getPlatform(issue));
            }
            
            row.push(
                points !== null ? points.toFixed(1) : ''
            );
            
            rows.push(row);
        });

        return rows;
    }

    _buildSprintMetaRows(sprint) {
        return [
            ['Sprint Name', sprint?.name || ''],
            ['State', sprint?.state || ''],
            ['Start Date', this._formatDate(sprint?.startDate)],
            ['End Date', this._formatDate(sprint?.endDate)],
            ['Complete Date', this._formatDate(sprint?.completeDate)]
        ];
    }

    _buildFilename(extension) {
        const date = new Date().toISOString().slice(0, 10);
        const sprintName = this.sprint?.name ? this.sprint.name.replace(/[^a-zA-Z0-9-_]+/g, '_') : 'Sprint';
        return `jira-sprint-results-${sprintName}-${date}.${extension}`;
    }

    _downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    _isDone(issue) {
        const statusCategory = issue.fields?.status?.statusCategory?.key;
        if (statusCategory) return statusCategory === 'done';
        const statusName = issue.fields?.status?.name || '';
        return statusName.toLowerCase() === 'done';
    }

    _getPlatform(issue) {
        const platform = issue.fields?.customfield_11500;
        if (!platform) return '';
        if (typeof platform === 'string') return platform;
        if (platform.value) return platform.value;
        if (platform.name) return platform.name;
        return platform.toString();
    }

    _getTeam(issue) {
        const team = issue.fields?.customfield_10114;
        if (!team) return '';
        if (typeof team === 'string') return team;
        if (team.value) return team.value;
        if (team.name) return team.name;
        return team.toString();
    }

    _getStoryPoints(issue) {
        const rawPoints = issue.fields?.customfield_10200;
        if (rawPoints === null || rawPoints === undefined || rawPoints === '') return null;
        const value = Number(rawPoints);
        return Number.isFinite(value) ? value : null;
    }

    _getCurrentEstimate(issue) {
        // Get currentEstimateStatistic value for story points calculation
        // This is stored in customfield_10200 which contains: issue.currentEstimateStatistic?.statFieldValue?.value
        const rawPoints = issue.fields?.customfield_10200;
        if (rawPoints === null || rawPoints === undefined || rawPoints === '') return null;
        const value = Number(rawPoints);
        return Number.isFinite(value) ? value : null;
    }

    _formatDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _isStatusIgnored(status) {
        if (!status) return false;
        const statusLower = status.toLowerCase();
        return statusLower === 'abandon' || statusLower === 'rejected';
    }

    _countPuntedTickets(sprintReport, includeAbandonedRejected) {
        const puntedIssues = sprintReport?.contents?.puntedIssues || [];
        if (includeAbandonedRejected === true) {
            return puntedIssues.length;
        }
        return puntedIssues.filter(issue => !this._isStatusIgnored(issue.statusName)).length;
    }

    _countAddedTickets(sprintReport) {
        const added = sprintReport?.contents?.issueKeysAddedDuringSprint;
        if (!added) return 0;
        
        // Handle different data formats
        if (Array.isArray(added)) {
            return added.length;
        }
        if (typeof added === 'object') {
            return Object.keys(added).length;
        }
        if (typeof added === 'string') {
            // If it's a comma-separated string, count the items
            return added.split(',').filter(s => s.trim()).length;
        }
        return 0;
    }

    _countOriginalTickets(sprintReport, includeAbandonedRejected) {
        const contents = sprintReport?.contents;
        if (!contents) return 0;
        
        // Calculate: completedIssues + issuesNotCompletedInCurrentSprint + puntedIssues + issuesCompletedInAnotherSprint - issueKeysAddedDuringSprint
        let completed = (contents.completedIssues || []).length;
        let notCompleted = (contents.issuesNotCompletedInCurrentSprint || []).length;
        let punted = (contents.puntedIssues || []).length;
        let completedOther = (contents.issuesCompletedInAnotherSprint || []).length;
        const added = this._countAddedTickets(sprintReport);
        
        // Filter out abandoned/rejected if flag is false
        if (includeAbandonedRejected === false) {
            completed = (contents.completedIssues || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
            notCompleted = (contents.issuesNotCompletedInCurrentSprint || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
            punted = (contents.puntedIssues || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
            completedOther = (contents.issuesCompletedInAnotherSprint || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
        }
        
        const originalCount = completed + notCompleted + punted + completedOther - added;
        return Math.max(0, originalCount); // Ensure non-negative
    }

    _countDoneTickets(sprintReport, includeAbandonedRejected) {
        const contents = sprintReport?.contents;
        if (!contents) return 0;
        
        // Count completed issues in current sprint + completed issues in another sprint
        let completed = (contents.completedIssues || []).length;
        let completedOther = (contents.issuesCompletedInAnotherSprint || []).length;
        
        // Filter out abandoned/rejected if flag is false
        if (includeAbandonedRejected === false) {
            completed = (contents.completedIssues || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
            completedOther = (contents.issuesCompletedInAnotherSprint || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
        }
        
        return completed + completedOther;
    }

    _countNotDoneTickets(sprintReport, includeAbandonedRejected) {
        const contents = sprintReport?.contents;
        if (!contents) return 0;
        
        // Count issues not completed in current sprint
        let notCompleted = (contents.issuesNotCompletedInCurrentSprint || []).length;
        
        // Filter out abandoned/rejected if flag is false
        if (includeAbandonedRejected === false) {
            notCompleted = (contents.issuesNotCompletedInCurrentSprint || []).filter(issue => !this._isStatusIgnored(issue.statusName)).length;
        }
        
        return notCompleted;
    }

    _calculatePercentageComplete(doneCount, remainedCount) {
        if (!remainedCount || remainedCount === 0) return 'N/A';
        
        try {
            const percentage = (doneCount / remainedCount) * 100;
            if (isNaN(percentage)) return 'N/A';
            return Math.round(percentage) + '%';
        } catch (error) {
            return 'N/A';
        }
    }

    _updateSprintPairsList(boardId) {
        const sprintPairsList = document.getElementById('sprintPairsList');
        const sprintPairsContent = document.getElementById('sprintPairsContent');
        
        if (!sprintPairsList || !sprintPairsContent) return;
        
        const checkedBoxes = document.querySelectorAll('.sprint-checkbox:checked');
        const selectedSprintIds = Array.from(checkedBoxes).map(cb => cb.value.trim()).filter(id => id);
        const sprintSetName = this.currentSprintSetName || 'Manual';
        
        // Add new pairs to existing array, avoiding duplicates
        let addedCount = 0;
        let duplicateCount = 0;
        
        selectedSprintIds.forEach(sprintId => {
            // Check if this pair already exists
            const isDuplicate = this.sprintPairs.some(pair => 
                pair.boardId === boardId && pair.sprintId === sprintId
            );
            
            if (!isDuplicate) {
                const sprintName = this.currentSprintInfoMap.get(String(sprintId)) || `Sprint ${sprintId}`;
                this.sprintPairs.push({ boardId, sprintId, sprintSetName, sprintName });
                addedCount++;
            } else {
                duplicateCount++;
            }
        });
        
        this._renderSprintPairs();
        
        // Show feedback message
        if (addedCount > 0 && duplicateCount > 0) {
            this.showMessage(`Added ${addedCount} new pair(s). Skipped ${duplicateCount} duplicate(s).`, 'info');
        } else if (addedCount > 0) {
            this.showMessage(`Added ${addedCount} pair(s) to the list.`, 'success');
        } else if (duplicateCount > 0) {
            this.showMessage(`All ${duplicateCount} selected pair(s) already exist in the list.`, 'info');
        }
    }

    _renderSprintPairs() {
        const sprintPairsContent = document.getElementById('sprintPairsContent');
        
        if (!sprintPairsContent) return;
        
        if (this.sprintPairs.length === 0) {
            sprintPairsContent.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999; padding: 1rem;">No pairs added yet.</td></tr>';
            return;
        }
        
        // Build pairs list as table rows
        const pairsList = this.sprintPairs.map((pair, index) => `
            <tr draggable="true" data-index="${index}" style="cursor: grab;">
                <td style="text-align: center; padding: 0.25rem 0.5rem;">${this.escapeHtml(pair.sprintSetName || 'Manual')}</td>
                <td style="text-align: center; padding: 0.25rem 0.5rem;">${this.escapeHtml(pair.sprintName || `Sprint ${pair.sprintId}`)}</td>
                <td style="text-align: center; font-family: monospace; padding: 0.25rem 0.5rem;">${this.escapeHtml(pair.boardId)}</td>
                <td style="text-align: center; font-family: monospace; padding: 0.25rem 0.5rem;">${this.escapeHtml(pair.sprintId)}</td>
                <td style="text-align: center; padding: 0.25rem 0.5rem;">
                    <button type="button" class="btn btn-secondary" style="padding: 0.2rem 0.45rem; font-size: 0.8rem; background: #dc3545; border-color: #dc3545; color: #fff;" onclick="sprintResults._handleDeletePair(${index})">Delete</button>
                </td>
            </tr>
        `).join('');
        
        sprintPairsContent.innerHTML = pairsList;
        this._attachSprintPairsDragHandlers();
    }

    _handleAddPair() {
        const boardId = prompt('Enter Board ID:', '');
        if (!boardId || !boardId.trim()) return;
        
        const sprintId = prompt('Enter Sprint ID:', '');
        if (!sprintId || !sprintId.trim()) return;
        
        const sprintIdValue = sprintId.trim();
        this.sprintPairs.push({
            boardId: boardId.trim(),
            sprintId: sprintIdValue,
            sprintSetName: 'Manual',
            sprintName: `Sprint ${sprintIdValue}`
        });
        this._renderSprintPairs();
    }

    _handleEditPair(index) {
        if (index < 0 || index >= this.sprintPairs.length) return;
        
        const pair = this.sprintPairs[index];
        const boardId = prompt('Enter Board ID:', pair.boardId);
        if (boardId === null) return; // User cancelled
        
        const sprintId = prompt('Enter Sprint ID:', pair.sprintId);
        if (sprintId === null) return; // User cancelled
        
        if (boardId.trim() && sprintId.trim()) {
            this.sprintPairs[index] = { boardId: boardId.trim(), sprintId: sprintId.trim() };
            this._renderSprintPairs();
        }
    }

    _handleDeletePair(index) {
        if (index < 0 || index >= this.sprintPairs.length) return;
        
        const pair = this.sprintPairs[index];
        this.sprintPairs.splice(index, 1);
        this._renderSprintPairs();
        this.showMessage(`Pair (${pair.boardId}, ${pair.sprintId}) deleted successfully.`, 'success');
    }

    _attachSprintPairsDragHandlers() {
        const sprintPairsContent = document.getElementById('sprintPairsContent');
        if (!sprintPairsContent) return;

        sprintPairsContent.ondragstart = (event) => {
            const row = event.target.closest('tr[data-index]');
            if (!row) return;
            const index = parseInt(row.dataset.index, 10);
            if (Number.isNaN(index)) return;
            this.draggedPairIndex = index;
            event.dataTransfer.effectAllowed = 'move';
            row.style.opacity = '0.6';
        };

        sprintPairsContent.ondragover = (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        };

        sprintPairsContent.ondrop = (event) => {
            event.preventDefault();
            const row = event.target.closest('tr[data-index]');
            if (!row || this.draggedPairIndex === null) return;
            const targetIndex = parseInt(row.dataset.index, 10);
            if (Number.isNaN(targetIndex) || targetIndex === this.draggedPairIndex) return;

            this._reorderSprintPairs(this.draggedPairIndex, targetIndex);
            this.draggedPairIndex = null;
        };

        sprintPairsContent.ondragend = (event) => {
            const row = event.target.closest('tr[data-index]');
            if (row) row.style.opacity = '';
            this.draggedPairIndex = null;
        };
    }

    _reorderSprintPairs(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.sprintPairs.length) return;
        if (toIndex < 0 || toIndex >= this.sprintPairs.length) return;

        const [moved] = this.sprintPairs.splice(fromIndex, 1);
        this.sprintPairs.splice(toIndex, 0, moved);
        this._renderSprintPairs();
    }

    _calculateSprintCounts(issues) {
        const counts = {
            original: 0,
            added: 0,
            removed: 0,
            done: 0,
            notDone: 0
        };

        const categoryKeys = new Set(['completed', 'notCompleted', 'removed', 'completedInAnother']);
        let categoryTicketCount = 0;
        
        issues.forEach(issue => {
            const category = issue.category;
            const isAdded = issue.addedFlag === '*' || issue.addedFlag === true;

            if (!categoryKeys.has(category)) {
                return;
            }

            categoryTicketCount++;
            if (isAdded) {
                counts.added++;
            }
            
            // Count by category
            if (category === 'removed') {
                counts.removed++;
            } else if (category === 'completed' || category === 'notCompleted' || category === 'completedInAnother') {
                // Count done vs not done
                if (category === 'completed' || category === 'completedInAnother') {
                    counts.done++;
                } else if (category === 'notCompleted') {
                    counts.notDone++;
                }
            }
        });

        counts.original = Math.max(0, categoryTicketCount - counts.added);
        
        return counts;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    try {
        const sprintResults = new SprintResults();
        window.sprintResults = sprintResults;
    } catch (error) {
        console.error('Failed to initialize SprintResults:', error);
    }
});
