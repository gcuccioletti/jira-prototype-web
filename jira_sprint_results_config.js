// jira_sprint_results_config.js
// Load sprint boards for Sprint Results configuration

class SprintResultsConfig {
    constructor() {
        this.storagePrefix = 'jira_';
        this.proxyUrl = this.getStorage('proxyUrl') || 'http://localhost:3000/api/jira';
        this.agileProxyUrl = this._getAgileProxyUrl();
        this.authType = this.getStorage('authType') || 'basic';
        this.username = this.getStorage('username') || '';
        this.apiToken = this.getStorage('apiToken') || '';
        this.bearerToken = this.getStorage('bearerToken') || '';
        this.boards = [];
        this.preferredBoards = this._loadPreferredBoards();
        this.preferredSprintSets = this._loadPreferredSprintSets();
        this.sprints = [];
        this._initializeEventListeners();
        this._loadUiState();
        this._loadSavedBoard();
        this._renderPreferredBoards();
        this._renderPreferredBoardOptions();
        this._renderPreferredSprintSets();
    }

    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
    }

    setStorage(key, value) {
        localStorage.setItem(this.storagePrefix + key, value);
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
        const loadBtn = document.getElementById('loadBoardsBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.loadBoards());
        }

        const select = document.getElementById('sprintBoardSelect');
        if (select) {
            select.addEventListener('change', () => {
                const selected = select.options[select.selectedIndex];
                if (!selected || !selected.value) return;
                this.setStorage('sprintBoardId', selected.value);
                this.setStorage('sprintBoardName', selected.textContent || '');
            });
        }

        const searchInput = document.getElementById('sprintBoardSearch');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this._saveBoardSearchQuery();
                this.applyBoardFilter();
            });
        }

        const clearBtn = document.getElementById('clearBoardSearchBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                }
                this._saveBoardSearchQuery();
                this.applyBoardFilter();
            });
        }

        const savePreferredBtn = document.getElementById('savePreferredBoardsBtn');
        if (savePreferredBtn) {
            savePreferredBtn.addEventListener('click', () => this.savePreferredBoard());
        }

        const preferredBody = document.getElementById('preferredBoardsBody');
        if (preferredBody) {
            preferredBody.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-board-id]');
                if (!button) return;
                const boardId = button.dataset.boardId;
                if (boardId) {
                    this.deletePreferredBoard(boardId);
                }
            });
        }

        const loadSprintsBtn = document.getElementById('loadSprintsBtn');
        if (loadSprintsBtn) {
            loadSprintsBtn.addEventListener('click', () => this.loadSprints());
        }

        const saveSprintSetBtn = document.getElementById('saveSprintSetBtn');
        if (saveSprintSetBtn) {
            saveSprintSetBtn.addEventListener('click', () => this.saveSprintSet());
        }

        const cancelEditBtn = document.getElementById('cancelEditSprintSetBtn');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => this.cancelEditSprintSet());
        }

        const savedSetsBody = document.getElementById('savedSprintSetsBody');
        if (savedSetsBody) {
            savedSetsBody.addEventListener('click', (event) => {
                const editBtn = event.target.closest('button[data-action="edit"]');
                const deleteBtn = event.target.closest('button[data-action="delete"]');
                if (editBtn) {
                    const index = parseInt(editBtn.dataset.index, 10);
                    if (!isNaN(index)) this.editSprintSet(index);
                } else if (deleteBtn) {
                    const index = parseInt(deleteBtn.dataset.index, 10);
                    if (!isNaN(index)) this.deleteSprintSet(index);
                }
            });
        }

        const sprintListBody = document.getElementById('sprintListBody');
        if (sprintListBody) {
            sprintListBody.addEventListener('click', (event) => {
                const upBtn = event.target.closest('button[data-action="move-up"]');
                const downBtn = event.target.closest('button[data-action="move-down"]');
                if (upBtn) {
                    const row = upBtn.closest('tr');
                    if (row) this.moveSprintUp(row);
                } else if (downBtn) {
                    const row = downBtn.closest('tr');
                    if (row) this.moveSprintDown(row);
                }
            });
        }

        const sprintStartDate = document.getElementById('sprintStartDate');
        const sprintEndDate = document.getElementById('sprintEndDate');
        if (sprintStartDate) {
            sprintStartDate.addEventListener('change', () => {
                this._saveSprintFilterState();
                this._applySprintFilters();
            });
        }
        if (sprintEndDate) {
            sprintEndDate.addEventListener('change', () => {
                this._saveSprintFilterState();
                this._applySprintFilters();
            });
        }

        const clearFiltersBtn = document.getElementById('clearSprintFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                if (sprintStartDate) sprintStartDate.value = '';
                if (sprintEndDate) sprintEndDate.value = '';
                this._saveSprintFilterState();
                this._applySprintFilters();
            });
        }

        const sprintSetNameInput = document.getElementById('sprintSetName');
        if (sprintSetNameInput) {
            sprintSetNameInput.addEventListener('input', () => this._saveSprintSetDraft());
        }
    }

    _loadUiState() {
        this._loadBoardSearchQuery();
        this._loadSprintFilterState();
        this._loadSprintSetDraft();
    }

    _saveBoardSearchQuery() {
        const searchInput = document.getElementById('sprintBoardSearch');
        const query = (searchInput?.value || '').trim();
        this.setStorage('sprintBoardSearchQuery', query);
    }

    _loadBoardSearchQuery() {
        const searchInput = document.getElementById('sprintBoardSearch');
        if (!searchInput) return;
        const query = this.getStorage('sprintBoardSearchQuery') || '';
        searchInput.value = query;
    }

    _saveSprintFilterState() {
        const startDateInput = document.getElementById('sprintStartDate');
        const endDateInput = document.getElementById('sprintEndDate');
        this.setStorage('sprintStartDateFilter', startDateInput?.value || '');
        this.setStorage('sprintEndDateFilter', endDateInput?.value || '');
    }

    _loadSprintFilterState() {
        const startDateInput = document.getElementById('sprintStartDate');
        const endDateInput = document.getElementById('sprintEndDate');
        if (startDateInput) {
            startDateInput.value = this.getStorage('sprintStartDateFilter') || '';
        }
        if (endDateInput) {
            endDateInput.value = this.getStorage('sprintEndDateFilter') || '';
        }
    }

    _saveSprintSetDraft() {
        const setNameInput = document.getElementById('sprintSetName');
        this.setStorage('sprintSetDraftName', (setNameInput?.value || '').trim());
    }

    _loadSprintSetDraft() {
        const setNameInput = document.getElementById('sprintSetName');
        if (!setNameInput) return;
        const draft = this.getStorage('sprintSetDraftName') || '';
        if (!setNameInput.value) {
            setNameInput.value = draft;
        }
    }

    _loadSavedBoard() {
        const select = document.getElementById('sprintBoardSelect');
        if (!select) return;
        const savedId = this.getStorage('sprintBoardId');
        const savedName = this.getStorage('sprintBoardName');
        if (!savedId || !savedName) return;

        const option = document.createElement('option');
        option.value = savedId;
        option.textContent = savedName;
        option.selected = true;
        select.appendChild(option);
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
            }, 4000);
        }
    }

    async loadBoards() {
        const loadBtn = document.getElementById('loadBoardsBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.textContent = 'Loading...';
        }

        try {
            this.showMessage('Loading boards...', 'info');
            const boards = await this._fetchAllBoards();
            this.boards = boards;
            this.applyBoardFilter();
            this._setSearchVisibility(this.boards.length > 0);
            this.showMessage('Boards loaded successfully.', 'success');
        } catch (error) {
            console.error('Failed to load boards:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        } finally {
            if (loadBtn) {
                loadBtn.disabled = false;
                loadBtn.textContent = 'Load Boards';
            }
        }
    }

    async _fetchAllBoards() {
        const maxResults = 50;
        let startAt = 0;
        let total = 0;
        const boards = [];

        do {
            const endpoint = `/board?startAt=${startAt}&maxResults=${maxResults}`;
            const data = await this._proxyGetAgile(endpoint);
            const pageBoards = data?.values || [];
            boards.push(...pageBoards);
            total = typeof data?.total === 'number' ? data.total : boards.length;
            startAt += pageBoards.length;
            if (pageBoards.length === 0) break;
        } while (startAt < total);

        return boards;
    }

    async _proxyGetAgile(endpoint) {
        const proxyUrl = this.agileProxyUrl || 'http://localhost:3000/api/jira-agile';
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
            throw new Error(errorText || `Request failed (${response.status})`);
        }

        return response.json();
    }

    _populateBoardSelect(boards) {
        const select = document.getElementById('sprintBoardSelect');
        if (!select) return;

        const savedId = this.getStorage('sprintBoardId');
        select.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Select a board --';
        select.appendChild(defaultOption);

        const query = (document.getElementById('sprintBoardSearch')?.value || '').trim();
        const normalizedQuery = query.toLowerCase();

        boards
            .slice()
            .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
            .forEach((board) => {
                const option = document.createElement('option');
                option.value = String(board.id);
                const boardName = board.name || `Board ${board.id}`;
                option.dataset.boardName = boardName;
                option.textContent = this._highlightMatch(boardName, normalizedQuery);
                if (savedId && String(board.id) === String(savedId)) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
    }

    applyBoardFilter() {
        const searchInput = document.getElementById('sprintBoardSearch');
        const query = (searchInput?.value || '').trim().toLowerCase();
        const boards = query
            ? this.boards.filter((board) => (board?.name || '').toLowerCase().includes(query))
            : this.boards;

        this._populateBoardSelect(boards);
    }

    _setSearchVisibility(isVisible) {
        const searchRow = document.getElementById('sprintBoardSearchRow');
        if (searchRow) {
            searchRow.style.display = isVisible ? 'flex' : 'none';
        }
    }

    _highlightMatch(text, query) {
        if (!query) return text;
        const index = text.toLowerCase().indexOf(query);
        if (index === -1) return text;
        const start = text.slice(0, index);
        const match = text.slice(index, index + query.length);
        const end = text.slice(index + query.length);
        return `${start}[${match}]${end}`;
    }

    _loadPreferredBoards() {
        const raw = this.getStorage('preferredBoards');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Failed to parse preferred boards:', error);
            return [];
        }
    }

    _savePreferredBoards(boards) {
        this.setStorage('preferredBoards', JSON.stringify(boards));
    }

    savePreferredBoard() {
        const select = document.getElementById('sprintBoardSelect');
        if (!select || !select.value) {
            this.showMessage('Select a board before saving.', 'error');
            return;
        }

        const selectedId = String(select.value);
        const selectedOption = select.options[select.selectedIndex];
        const selectedName = this._getBoardNameById(selectedId)
            || selectedOption?.dataset.boardName
            || selectedOption?.textContent
            || '';
        const exists = this.preferredBoards.some((board) => String(board.id) === selectedId);
        if (!exists) {
            this.preferredBoards.push({ id: selectedId, name: selectedName });
            this._savePreferredBoards(this.preferredBoards);
            this._renderPreferredBoards();
            this._renderPreferredBoardOptions();
            this.showMessage('Preferred board saved.', 'success');
            return;
        }

        this.showMessage('Board is already in preferred list.', 'info');
    }

    deletePreferredBoard(boardId) {
        this.preferredBoards = this.preferredBoards.filter((board) => String(board.id) !== String(boardId));
        this._savePreferredBoards(this.preferredBoards);
        this._renderPreferredBoards();
        this._renderPreferredBoardOptions();
        this.showMessage('Preferred board removed.', 'success');
    }

    _renderPreferredBoards() {
        const body = document.getElementById('preferredBoardsBody');
        if (!body) return;

        if (!this.preferredBoards.length) {
            body.innerHTML = '<tr><td colspan="2">No preferred boards saved.</td></tr>';
            return;
        }

        body.innerHTML = this.preferredBoards
            .slice()
            .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
            .map((board) => {
                const label = board.name ? `${board.name} (${board.id})` : String(board.id);
                return (
                    `<tr>`
                    + `<td>${this.escapeHtml(label)}</td>`
                    + `<td><button type="button" class="btn btn-secondary btn-small" data-board-id="${this.escapeHtml(String(board.id))}">Delete</button></td>`
                    + `</tr>`
                );
            })
            .join('');
    }

    _renderPreferredBoardOptions() {
        const select = document.getElementById('preferredBoardSelect');
        if (!select) return;

        select.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '-- Select a preferred board --';
        select.appendChild(defaultOption);

        this.preferredBoards
            .slice()
            .sort((a, b) => (a?.name || '').localeCompare(b?.name || ''))
            .forEach((board) => {
                const option = document.createElement('option');
                option.value = String(board.id);
                option.textContent = board.name ? `${board.name} (${board.id})` : String(board.id);
                select.appendChild(option);
            });
    }

    async loadSprints() {
        const boardSelect = document.getElementById('preferredBoardSelect');
        const boardId = boardSelect?.value;
        if (!boardId) {
            this.showMessage('Select a preferred board to load sprints.', 'error');
            return;
        }

        const loadBtn = document.getElementById('loadSprintsBtn');
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.textContent = 'Loading...';
        }

        try {
            this.showMessage('Loading sprint IDs...', 'info');
            this.sprints = await this._fetchAllSprints(boardId);
            this._applySprintFilters();
            this._setSprintListVisibility(this.sprints.length > 0);
            this.showMessage('Sprint IDs loaded successfully.', 'success');
        } catch (error) {
            console.error('Failed to load sprints:', error);
            this.showMessage(`Error: ${error.message}`, 'error');
        } finally {
            if (loadBtn) {
                loadBtn.disabled = false;
                loadBtn.textContent = 'Load Sprint IDs';
            }
        }
    }

    async _fetchAllSprints(boardId) {
        const maxResults = 50;
        let startAt = 0;
        let total = 0;
        const sprints = [];

        do {
            const endpoint = `/board/${encodeURIComponent(boardId)}/sprint?startAt=${startAt}&maxResults=${maxResults}`;
            const data = await this._proxyGetAgile(endpoint);
            const pageSprints = data?.values || [];
            sprints.push(...pageSprints);
            total = typeof data?.total === 'number' ? data.total : sprints.length;
            startAt += pageSprints.length;
            if (pageSprints.length === 0) break;
        } while (startAt < total);

        return sprints;
    }

    _renderSprintList(sprints) {
        const body = document.getElementById('sprintListBody');
        if (!body) return;

        if (!sprints.length) {
            body.innerHTML = '<tr><td colspan="7">No sprints found for this board.</td></tr>';
            return;
        }

        // Sort by start date (ascending)
        const sortedSprints = sprints
            .slice()
            .sort((a, b) => {
                const dateA = a?.startDate ? new Date(a.startDate).getTime() : 0;
                const dateB = b?.startDate ? new Date(b.startDate).getTime() : 0;
                return dateA - dateB;
            });

        body.innerHTML = sortedSprints
            .map((sprint) => {
                const sprintName = sprint.name || `Sprint ${sprint.id}`;
                const startDate = sprint.startDate ? new Date(sprint.startDate).toLocaleDateString() : '';
                const endDate = sprint.endDate ? new Date(sprint.endDate).toLocaleDateString() : '';
                return (
                    `<tr data-sprint-id="${this.escapeHtml(String(sprint.id))}" data-sprint-name="${this.escapeHtml(sprintName)}" data-start-date="${this.escapeHtml(sprint.startDate || '')}" data-end-date="${this.escapeHtml(sprint.endDate || '')}" data-state="${this.escapeHtml(sprint.state || '')}">`
                    + `<td><input type="checkbox" data-sprint-id="${this.escapeHtml(String(sprint.id))}" data-sprint-name="${this.escapeHtml(sprintName)}"></td>`
                    + `<td>${this.escapeHtml(sprintName)}</td>`
                    + `<td>${this.escapeHtml(sprint.state || '')}</td>`
                    + `<td>${this.escapeHtml(String(sprint.id))}</td>`
                    + `<td>${this.escapeHtml(startDate)}</td>`
                    + `<td>${this.escapeHtml(endDate)}</td>`
                    + `<td><button type="button" class="btn btn-secondary btn-small" data-action="move-up" style="padding: 2px 6px; margin-right: 4px;">▲</button><button type="button" class="btn btn-secondary btn-small" data-action="move-down" style="padding: 2px 6px;">▼</button></td>`
                    + `</tr>`
                );
            })
            .join('');
    }

    _setSprintListVisibility(isVisible) {
        const listContainer = document.getElementById('sprintListContainer');
        if (listContainer) {
            listContainer.style.display = isVisible ? 'block' : 'none';
        }
        const actions = document.getElementById('sprintSetActions');
        if (actions) {
            actions.style.display = isVisible ? 'block' : 'none';
        }
    }

    _setSprintFiltersVisibility(isVisible) {
        const filtersContainer = document.getElementById('sprintDateFilters');
        if (filtersContainer) {
            filtersContainer.style.display = isVisible ? 'block' : 'none';
        }
    }

    _loadPreferredSprintSets() {
        const raw = this.getStorage('preferredSprintSets');
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Failed to parse preferred sprint sets:', error);
            return [];
        }
    }

    _savePreferredSprintSets(sets) {
        this.setStorage('preferredSprintSets', JSON.stringify(sets));
    }

    saveSprintSet() {
        const setNameInput = document.getElementById('sprintSetName');
        const setName = (setNameInput?.value || '').trim();
        if (!setName) {
            this.showMessage('Enter a sprint set name.', 'error');
            return;
        }

        const boardSelect = document.getElementById('preferredBoardSelect');
        const boardId = boardSelect?.value;
        const boardName = boardSelect?.options[boardSelect.selectedIndex]?.textContent || '';
        if (!boardId) {
            this.showMessage('Select a preferred board before saving a set.', 'error');
            return;
        }

        const checked = Array.from(document.querySelectorAll('#sprintListBody input[type="checkbox"]:checked'));
        if (!checked.length) {
            this.showMessage('Select at least one sprint ID.', 'error');
            return;
        }

        // Get sprints in the order they appear in the table (user's manual reordering)
        const sprintIds = [];
        const sprintNames = [];
        const rows = Array.from(document.querySelectorAll('#sprintListBody tr'));
        rows.forEach(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                const sprintId = checkbox.dataset.sprintId;
                const sprintName = checkbox.dataset.sprintName;
                if (sprintId) sprintIds.push(sprintId);
                if (sprintName) sprintNames.push(sprintName);
            }
        });

        const editingIndexInput = document.getElementById('editingSprintSetIndex');
        const editingIndex = editingIndexInput?.value;

        if (editingIndex !== '' && editingIndex !== null && editingIndex !== undefined) {
            // Update existing sprint set
            const index = parseInt(editingIndex, 10);
            if (!isNaN(index) && index >= 0 && index < this.preferredSprintSets.length) {
                this.preferredSprintSets[index] = {
                    name: setName,
                    boardId: String(boardId),
                    boardName,
                    sprintIds,
                    sprintNames,
                    createdAt: this.preferredSprintSets[index].createdAt,
                    updatedAt: new Date().toISOString()
                };
                this.showMessage('Sprint set updated.', 'success');
            }
        } else {
            // Create new sprint set
            this.preferredSprintSets.push({
                name: setName,
                boardId: String(boardId),
                boardName,
                sprintIds,
                sprintNames,
                createdAt: new Date().toISOString()
            });
            this.showMessage('Sprint set saved.', 'success');
        }

        this._savePreferredSprintSets(this.preferredSprintSets);
        this.setStorage('sprintSetDraftName', '');
        this._renderPreferredSprintSets();
        this.cancelEditSprintSet();
    }

    async editSprintSet(index) {
        if (index < 0 || index >= this.preferredSprintSets.length) return;

        const sprintSet = this.preferredSprintSets[index];
        
        // Set the board
        const boardSelect = document.getElementById('preferredBoardSelect');
        if (boardSelect) {
            boardSelect.value = sprintSet.boardId;
        }

        // Load sprints for that board
        await this.loadSprints();

        // Check the sprints in the set (in the saved order)
        setTimeout(() => {
            const body = document.getElementById('sprintListBody');
            if (!body) return;

            // First, uncheck all
            body.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

            // Create a map of sprint IDs from the set
            const sprintIdSet = new Set(sprintSet.sprintIds || []);
            
            // Get all rows and separate them into selected and unselected
            const allRows = Array.from(body.querySelectorAll('tr'));
            const selectedRows = [];
            const unselectedRows = [];

            allRows.forEach(row => {
                const checkbox = row.querySelector('input[type="checkbox"]');
                const sprintId = checkbox?.dataset.sprintId;
                if (sprintId && sprintIdSet.has(sprintId)) {
                    selectedRows.push(row);
                    checkbox.checked = true;
                } else {
                    unselectedRows.push(row);
                }
            });

            // Sort selected rows by the order in the sprint set
            selectedRows.sort((a, b) => {
                const idA = a.querySelector('input[type="checkbox"]').dataset.sprintId;
                const idB = b.querySelector('input[type="checkbox"]').dataset.sprintId;
                return sprintSet.sprintIds.indexOf(idA) - sprintSet.sprintIds.indexOf(idB);
            });

            // Clear and rebuild the table with selected rows first
            body.innerHTML = '';
            selectedRows.forEach(row => body.appendChild(row));
            unselectedRows.forEach(row => body.appendChild(row));

            // Set edit mode
            const setNameInput = document.getElementById('sprintSetName');
            const editingIndexInput = document.getElementById('editingSprintSetIndex');
            const cancelBtn = document.getElementById('cancelEditSprintSetBtn');
            const saveBtn = document.getElementById('saveSprintSetBtn');

            if (setNameInput) setNameInput.value = sprintSet.name;
            this._saveSprintSetDraft();
            if (editingIndexInput) editingIndexInput.value = index;
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
            if (saveBtn) saveBtn.textContent = 'Update Sprint Set';

            this.showMessage('Editing sprint set. Modify selection/order and click Update.', 'info');
        }, 100);
    }

    deleteSprintSet(index) {
        if (index < 0 || index >= this.preferredSprintSets.length) return;

        const sprintSet = this.preferredSprintSets[index];
        if (confirm(`Delete sprint set "${sprintSet.name}"?`)) {
            this.preferredSprintSets.splice(index, 1);
            this._savePreferredSprintSets(this.preferredSprintSets);
            this._renderPreferredSprintSets();
            this.showMessage('Sprint set deleted.', 'success');
        }
    }

    cancelEditSprintSet() {
        const setNameInput = document.getElementById('sprintSetName');
        const editingIndexInput = document.getElementById('editingSprintSetIndex');
        const cancelBtn = document.getElementById('cancelEditSprintSetBtn');
        const saveBtn = document.getElementById('saveSprintSetBtn');

        if (setNameInput) setNameInput.value = '';
        if (editingIndexInput) editingIndexInput.value = '';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (saveBtn) saveBtn.textContent = 'Save Sprint Set';
        this.setStorage('sprintSetDraftName', '');
    }

    moveSprintUp(row) {
        const prevRow = row.previousElementSibling;
        if (prevRow && prevRow.tagName === 'TR') {
            row.parentNode.insertBefore(row, prevRow);
        }
    }

    moveSprintDown(row) {
        const nextRow = row.nextElementSibling;
        if (nextRow && nextRow.tagName === 'TR') {
            row.parentNode.insertBefore(nextRow, row);
        }
    }

    _renderPreferredSprintSets() {
        const body = document.getElementById('savedSprintSetsBody');
        if (!body) return;

        if (!this.preferredSprintSets.length) {
            body.innerHTML = '<tr><td colspan="2">No sprint sets saved.</td></tr>';
            return;
        }

        body.innerHTML = this.preferredSprintSets
            .map((set, index) => {
                const boardLabel = set.boardName ? ` - ${set.boardName}` : '';
                const sprintList = (set.sprintIds || []).join(', ');
                return (
                    `<tr>`
                    + `<td>${this.escapeHtml(`${set.name}${boardLabel}: ${sprintList}`)}</td>`
                    + `<td>`
                    + `<button type="button" class="btn btn-secondary btn-small" data-action="edit" data-index="${index}" style="margin-right: 4px;">Edit</button>`
                    + `<button type="button" class="btn btn-secondary btn-small" data-action="delete" data-index="${index}">Delete</button>`
                    + `</td>`
                    + `</tr>`
                );
            })
            .join('');
    }

    _getBoardNameById(boardId) {
        const match = this.boards.find((board) => String(board.id) === String(boardId));
        return match?.name || '';
    }

    _setSprintFiltersVisibility(isVisible) {
        const filtersContainer = document.getElementById('sprintDateFilters');
        if (filtersContainer) {
            filtersContainer.style.display = isVisible ? 'block' : 'none';
        }
    }

    _applySprintFilters() {
        if (!this.sprints || !this.sprints.length) {
            return;
        }

        const startDateInput = document.getElementById('sprintStartDate');
        const endDateInput = document.getElementById('sprintEndDate');
        
        const startDateValue = startDateInput?.value;
        const endDateValue = endDateInput?.value;

        // Always exclude sprints without a startDate and only include active or closed sprints
        let filteredSprints = this.sprints.filter(sprint => {
            if (!sprint.startDate) {
                console.log('Sprint has no startDate - excluding:', sprint.name || sprint.id);
                return false;
            }
            // Only include active or closed sprints
            const state = (sprint.state || '').toLowerCase();
            if (state !== 'active' && state !== 'closed') {
                console.log('Sprint state not active/closed - excluding:', sprint.name || sprint.id, 'state:', sprint.state);
                return false;
            }
            return true;
        });

        // Filter by start date if date filters are provided
        if (startDateValue || endDateValue) {
            const filterStartDate = startDateValue ? new Date(startDateValue) : null;
            const filterEndDate = endDateValue ? new Date(endDateValue) : null;
            
            // Set end date to end of day
            if (filterEndDate) {
                filterEndDate.setHours(23, 59, 59, 999);
            }

            filteredSprints = filteredSprints.filter(sprint => {
                const sprintStartDate = new Date(sprint.startDate);
                
                // Check if sprint start date is within the filter range
                if (filterStartDate && sprintStartDate < filterStartDate) {
                    return false;
                }
                if (filterEndDate && sprintStartDate > filterEndDate) {
                    return false;
                }
                return true;
            });
            
            console.log(`Filtered ${this.sprints.length} sprints to ${filteredSprints.length} sprints`);
        }

        this._renderSprintList(filteredSprints);
        this._setSprintListVisibility(filteredSprints.length > 0);
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        window.sprintResultsConfig = new SprintResultsConfig();
    } catch (error) {
        console.error('Failed to initialize SprintResultsConfig:', error);
    }
});
