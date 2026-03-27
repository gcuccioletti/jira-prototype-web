// time-analyzer.js
// Implements the analyze flow: run JQL or single ticket key, fetch changelogs, and render results

const TIME_ANALYZER_TITLE = 'Time Analyzer';

class TimeAnalyzer {
    constructor() {
        this.storagePrefix = 'jira_';
        this.proxyUrl = this.getStorage('proxyUrl') || 'http://localhost:3000/api/jira';
        this.authType = this.getStorage('authType') || 'basic';
        this.username = this.getStorage('username') || '';
        this.apiToken = this.getStorage('apiToken') || '';
        this.bearerToken = this.getStorage('bearerToken') || '';
        this.issues = [];
        this._initializeEventListeners();
        // Attempt to fetch and display connected JIRA user info
        this._displayUserInfo();
    }

    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
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
        console.debug('TimeAnalyzer: initializing event listeners');
        const form = document.getElementById('analyzerForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                console.debug('TimeAnalyzer: form submit detected');
                this.handleAnalyze();
            });
        } else {
            console.debug('TimeAnalyzer: analyzerForm not found');
        }

        // Fallback: also listen to analyze button click in case form submit is blocked
        const analyzeBtn = document.getElementById('analyzeBtn');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.debug('TimeAnalyzer: analyze button clicked');
                this.handleAnalyze();
            });
        } else {
            console.debug('TimeAnalyzer: analyzeBtn not found');
        }

        const issueList = document.getElementById('issueKeyList');
        if (issueList) {
            issueList.addEventListener('click', (e) => {
                const trg = e.target.closest('tr[data-issue-key]');
                if (trg) {
                    const key = trg.dataset.issueKey;
                    const issue = this.issues.find(i => i.key === key);
                    if (issue) this.showIssueDetails(issue);
                }
            });
        }

        const toggleBtn = document.getElementById('toggleChangelogBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const content = document.getElementById('changelogContent');
                if (!content) return;
                const hidden = content.hidden;
                content.hidden = !hidden;
                toggleBtn.textContent = hidden ? '▲ Hide Details' : '▼ Show Details';
            });
        }

        // Export handlers (Excel only)
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExport());
        }
        const aiExportBtn = document.getElementById('aiExportBtn');
        if (aiExportBtn) {
            aiExportBtn.addEventListener('click', () => this.handleExport());
        }
    }

    showMessage(msg, type = 'info') {
        const el = document.getElementById('statusMessage');
        if (!el) return;
        el.hidden = false;
        el.textContent = msg;
        el.className = 'status-message ' + (type === 'error' ? 'status-error' : 'status-success');
        if (type === 'success') setTimeout(() => { el.hidden = true; }, 5000);
    }

    async _displayUserInfo() {
        try {
            const headers = this.getAuthHeaders();
            const requestOptions = {
                method: 'POST',
                headers,
                body: JSON.stringify({ endpoint: '/myself', options: { method: 'GET' } })
            };
            const response = await fetch(this.proxyUrl, requestOptions);
            if (!response.ok) {
                // Not critical if it fails (not logged in or proxy issue)
                console.debug('Could not load JIRA user info, response not ok:', response.status);
                return;
            }
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
                    const initials = (displayName || '').split(' ').map(p => (p && p[0]) || '').join('').toUpperCase().substring(0,2);
                    userInitials.textContent = initials;
                    userAvatar.style.display = 'none';
                    userInitials.style.display = 'flex';
                }
            }

            if (userInfo) userInfo.hidden = false;
        } catch (err) {
            console.debug('Could not load user info:', err);
        }
    }

    async handleAnalyze() {
        const analyzeBtn = document.getElementById('analyzeBtn');
        const analyzeSpinner = document.getElementById('analyzeSpinner');
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = '⏱️ Analyzing...';
        }
        if (analyzeSpinner) analyzeSpinner.style.display = 'inline-block';

        const jqlInput = document.getElementById('jqlQuery');
        const ticketInput = document.getElementById('ticketKey');
        const reportTitleInput = document.getElementById('reportTitle');
        const startDate = document.getElementById('startDate')?.value;
        const endDate = document.getElementById('endDate')?.value;

        const jql = jqlInput?.value.trim();
        const ticketKey = ticketInput?.value.trim();
        const title = reportTitleInput?.value.trim();

        // Reset UI
        this.issues = [];
        this.clearResults();

        if (!ticketKey && !jql) {
            this.showMessage('Please provide a JQL query or a ticket key to analyze.', 'error');
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '⏱️ Analyze Time Metrics';
            }
            return;
        }

        try {
            this.showMessage('Running query...', 'success');
            let issues = [];
            if (ticketKey) {
                const issue = await this.fetchIssue(ticketKey);
                if (issue) issues = [issue];
            } else {
                issues = await this.searchIssues(jql);
            }

            if (!issues.length) {
                this.showMessage('No issues returned for the query', 'error');
                return;
            }

            // Optionally filter changelog entries by date range later — store range
            this.issues = issues;

            // Render basic report
            this.renderReport({ title, jql: ticketKey || jql });

            // Check whether user wants the Issues list produced
            const includeIssues = document.getElementById('includeIssuesCheckbox')?.checked || false;
            const issueSection = document.getElementById('issueListSection');
            const issueTable = document.getElementById('issueKeyTable');
            const ticketSection = document.getElementById('ticketInfoSection');
            const changelogSection = document.getElementById('changelogSection');

            // Always ensure issueSection is visible when showing results
            if (issueSection) issueSection.hidden = false;

            if (includeIssues) {
                // Render and show the issues table
                this.populateIssueList(issues);
                if (issueTable) issueTable.style.display = '';
            } else {
                // Hide only the issues table (leave summary tables visible in the section)
                if (issueTable) issueTable.style.display = 'none';
                // Hide ticket/changelog detail sections and clear any previous lists
                if (ticketSection) ticketSection.hidden = true;
                if (changelogSection) changelogSection.hidden = true;
                const issueKeyList = document.getElementById('issueKeyList'); if (issueKeyList) issueKeyList.innerHTML = '';
                const changelogBody = document.getElementById('changelogTableBody'); if (changelogBody) changelogBody.innerHTML = '';
            }

            // Render aggregated time by status summary
            this.renderTimeByStatusSummary(issues);
            // Render aggregated time by status groups defined in setup
            this.renderTimeByStatusGroupSummary(issues);
            this.showMessage(`Fetched ${issues.length} issue(s)`, 'success');
        } catch (err) {
            console.error('Analyze error', err);
            this.showMessage(`Error during analysis: ${err.message}`, 'error');
        } finally {
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = '⏱️ Analyze Time Metrics';
            }
            const analyzeSpinner = document.getElementById('analyzeSpinner');
            if (analyzeSpinner) analyzeSpinner.style.display = 'none';
        }
    }

    async searchIssues(jql) {
        if (!jql) return [];
        const allIssues = [];
        let startAt = 0;
        const maxResults = 50;
        let totalIssues = Infinity;
        while (startAt < totalIssues) {
            const endpoint = `/search?jql=${encodeURIComponent(jql)}&expand=changelog&startAt=${startAt}&maxResults=${maxResults}`;
            const requestOptions = {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ endpoint, options: { method: 'GET' } })
            };
            const response = await fetch(this.proxyUrl, requestOptions);
            const data = await response.json();
            if (!response.ok) throw new Error(data.errorMessages?.[0] || data.error || `API Error: ${response.status}`);
            const issues = data.issues || [];
            // Ensure each issue has changelog expanded (some proxies may not include it)
            for (const issue of issues) {
                if (!issue.changelog) {
                    // fetch individually
                    const full = await this.fetchIssue(issue.key);
                    if (full) allIssues.push(full);
                } else {
                    allIssues.push(issue);
                }
            }
            totalIssues = data.total || 0;
            startAt += (data.maxResults || maxResults);
        }
        return allIssues;
    }

    async fetchIssue(issueKey) {
        try {
            const endpoint = `/issue/${encodeURIComponent(issueKey)}?expand=changelog`;
            const requestOptions = {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ endpoint, options: { method: 'GET' } })
            };
            const response = await fetch(this.proxyUrl, requestOptions);
            const data = await response.json();
            if (!response.ok) throw new Error(data.errorMessages?.[0] || data.error || `API Error: ${response.status}`);
            return data;
        } catch (err) {
            this.showMessage(`Error fetching issue ${issueKey}: ${err.message}`, 'error');
            return null;
        }
    }

    renderReport({ title, jql }) {
        const issueCountEl = document.getElementById('issueCount');
        const reportTitleDisplay = document.getElementById('reportTitleDisplay');
        const reportTitleHeading = reportTitleDisplay?.querySelector('h3');
        const reportQueryValue = document.getElementById('reportQueryValue');
        // Update total issues as a normal table row
        const issueSummaryBody = document.getElementById('issueSummaryBody');
        if (issueSummaryBody) {
            issueSummaryBody.innerHTML = `<tr><td>Total Issues</td><td>${this.issues.length}</td></tr>`;
        }
        if (reportTitleDisplay && reportTitleHeading) {
            reportTitleDisplay.style.display = 'block';
            reportTitleHeading.textContent = title || 'Time Analysis Report';
        }
        if (reportQueryValue) reportQueryValue.textContent = jql || '';
        // Set generated timestamp in EST timezone
        const reportGeneratedAtEl = document.getElementById('reportGeneratedAt');
        if (reportGeneratedAtEl) {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZoneName: 'short'
            });
            reportGeneratedAtEl.textContent = formatter.format(now);
        }
        // show issueListSection
        const section = document.getElementById('issueListSection');
        if (section) section.hidden = false;
    }

    async handleExport() {
        const exportBtn = document.getElementById('exportBtn');
        const originalText = exportBtn ? exportBtn.textContent : '';
        try {
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.textContent = '⏳ Generating Excel...';
            }

            // Ensure there's data
            const hasGroupData = document.getElementById('statusGroupSummaryBody')?.children.length > 0;
            const hasStatusData = document.getElementById('statusSummaryBody')?.children.length > 0;
            const hasIssues = document.getElementById('issueKeyList')?.children.length > 0;
            if (!hasGroupData && !hasStatusData && !hasIssues) {
                this.showMessage('No data to export. Please run an analysis first.', 'error');
                return;
            }
            if (typeof XLSX === 'undefined' && typeof window.XLSX === 'undefined') {
                this.showMessage('Excel export library not available.', 'error');
                return;
            }
            const XLSXLib = typeof XLSX !== 'undefined' ? XLSX : window.XLSX;
            const wb = XLSXLib.utils.book_new();

            // Append Report Summary (e.g., generated at)
            const reportSummaryBody = document.getElementById('reportSummaryBody');
            const reportSummaryTable = reportSummaryBody?.closest('table');
            if (reportSummaryTable && reportSummaryTable.querySelector('tbody')?.children.length > 0) {
                const ws0 = XLSXLib.utils.table_to_sheet(reportSummaryTable);
                XLSXLib.utils.book_append_sheet(wb, ws0, 'Report Summary');
            }

            // Append Report Query
            const reportQueryTable = document.getElementById('reportQueryTable');
            if (reportQueryTable && reportQueryTable.querySelector('tbody')?.children.length > 0) {
                const wsQ = XLSXLib.utils.table_to_sheet(reportQueryTable);
                XLSXLib.utils.book_append_sheet(wb, wsQ, 'Report Query');
            }

            // Append Total Issues summary
            const issueSummaryBody = document.getElementById('issueSummaryBody');
            const issueSummaryTable = issueSummaryBody?.closest('table');
            if (issueSummaryTable && issueSummaryTable.querySelector('tbody')?.children.length > 0) {
                const ws1 = XLSXLib.utils.table_to_sheet(issueSummaryTable);
                XLSXLib.utils.book_append_sheet(wb, ws1, 'Total Issues');
            }

            // Append Time by Status Group
            const groupTable = document.getElementById('statusGroupSummaryTable');
            if (groupTable && groupTable.querySelector('tbody')?.children.length > 0) {
                const ws = XLSXLib.utils.table_to_sheet(groupTable);
                XLSXLib.utils.book_append_sheet(wb, ws, 'Time by Group');
            }

            // Append Time by Status
            const statusTable = document.getElementById('statusSummaryTable');
            if (statusTable && statusTable.querySelector('tbody')?.children.length > 0) {
                const ws2 = XLSXLib.utils.table_to_sheet(statusTable);
                XLSXLib.utils.book_append_sheet(wb, ws2, 'Time by Status');
            }

            // Append Issues list if present
            const issueTable = document.getElementById('issueKeyTable');
            if (issueTable && issueTable.querySelector('tbody')?.children.length > 0) {
                const ws3 = XLSXLib.utils.table_to_sheet(issueTable);
                XLSXLib.utils.book_append_sheet(wb, ws3, 'Issues');
            }

            // Add a Metadata sheet with report title, query/ticket, generated timestamp (EST), and total issues
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZoneName: 'short'
            });
            const generatedAt = formatter.format(now);
            const reportTitle = (document.getElementById('reportTitle')?.value || document.querySelector('#reportTitleDisplay h3')?.textContent || '').trim();
            const reportQuery = (document.getElementById('reportQueryValue')?.textContent || '').trim();
            const totalIssues = (this.issues && this.issues.length) ? this.issues.length : 0;
            const metaRows = [
                ['Field','Value'],
                ['Report Title', reportTitle],
                ['Query/Ticket', reportQuery],
                ['Generated At (EST)', generatedAt],
                ['Total Issues', String(totalIssues)]
            ];
            const wsMeta = XLSXLib.utils.aoa_to_sheet(metaRows);
            XLSXLib.utils.book_append_sheet(wb, wsMeta, 'Metadata');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `Time_Analyzer_${timestamp}.xlsx`;
            XLSXLib.writeFile(wb, filename);
            this.showMessage('Excel file generated: ' + filename, 'success');
        } catch (err) {
            console.error('Error exporting to Excel:', err);
            this.showMessage('Error exporting to Excel: ' + err.message, 'error');
        } finally {
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
        }
    }

    populateIssueList(issues) {
        const tbody = document.getElementById('issueKeyList');
        if (!tbody) return;
        tbody.innerHTML = '';
        // Build timeline stats (earliest/latest across changelogs)
        issues.forEach(issue => {
            const changelog = issue.changelog?.histories || [];
            const times = changelog.map(h => new Date(h.created)).filter(Boolean);
            const earliest = times.length ? new Date(Math.min(...times)) : new Date(issue.fields.created || Date.now());
            const latest = times.length ? new Date(Math.max(...times)) : new Date(issue.fields.updated || Date.now());

            const durations = this.computeStatusDurations(issue);
            const durationsHtml = durations.length ? ('<ul class="status-durations-list" style="padding-left:1rem;margin:0;">' + durations.map(d => `<li style="margin:0;padding:0;">${this.escapeHtml(d.status)}: <strong>${this.formatDuration(d.durationMs)}</strong></li>`).join('') + '</ul>') : '';

            const tr = document.createElement('tr');
            tr.dataset.issueKey = issue.key;
            tr.innerHTML = `
                <td><a href="#" class="issue-link">${this.escapeHtml(issue.key)}</a></td>
                <td>${this.escapeHtml(issue.fields?.customfield_platform || '')}</td>
                <td class="time-durations-column">${durationsHtml}</td>
                <td class="changelog-events-column">${changelog.length} events</td>
            `;
            tbody.appendChild(tr);
        });


    }

    renderTimeByStatusSummary(issues) {
        const tbody = document.getElementById('statusSummaryBody');
        if (!tbody) return;
        if (!issues || issues.length === 0) {
            // Leave tbody empty when there's no data
            tbody.innerHTML = '';
            return;
        }
        const map = new Map(); // status -> { durationMs, issueSet }
        issues.forEach(issue => {
            const durations = this.computeStatusDurations(issue);
            durations.forEach(d => {
                const prev = map.get(d.status) || { durationMs: 0, issueSet: new Set() };
                prev.durationMs += d.durationMs;
                prev.issueSet.add(issue.key);
                map.set(d.status, prev);
            });
        });
        const rows = Array.from(map.entries()).map(([status, {durationMs, issueSet}]) => ({ status, durationMs, issueCount: issueSet.size }));
        // Sort alphabetically by status name (case-insensitive)
        rows.sort((a, b) => a.status.localeCompare(b.status, undefined, { sensitivity: 'base' }));
        tbody.innerHTML = rows.map(r => {
            const avg = r.issueCount ? this.formatDuration(Math.floor(r.durationMs / r.issueCount)) : '—';
            return `<tr><td>${this.escapeHtml(r.status)}</td><td>${this.escapeHtml(this.formatDuration(r.durationMs))}</td><td>${this.escapeHtml(avg)}</td><td>${r.issueCount}</td></tr>`;
        }).join('');
    }

    // Read configured Status Groups from Setup (key: 'time_status_groups')
    getStatusGroups() {
        const json = localStorage.getItem('time_status_groups');
        try {
            return json ? JSON.parse(json) : [];
        } catch (err) {
            console.debug('Invalid status groups in storage:', err);
            return [];
        }
    }

    renderTimeByStatusGroupSummary(issues) {
        const tbody = document.getElementById('statusGroupSummaryBody');
        if (!tbody) return;
        const groups = this.getStatusGroups();
        if (!groups || groups.length === 0) {
            // Leave tbody empty when no groups are defined
            tbody.innerHTML = '';
            return;
        }
        // Aggregate durations per group and preserve priority
        const rows = groups.map((g, idx) => {
            const priority = Number.isFinite(g.priority) ? g.priority : idx;
            const statusesSet = new Set((g.statuses || []).map(s => String(s).trim()));
            let totalMs = 0;
            const issueSet = new Set();
            issues.forEach(issue => {
                const durations = this.computeStatusDurations(issue);
                durations.forEach(d => {
                    if (statusesSet.has(d.status)) {
                        totalMs += d.durationMs;
                        issueSet.add(issue.key);
                    }
                });
            });
            return { name: g.name || 'Unnamed Group', durationMs: totalMs, issueCount: issueSet.size, priority };
        });
        // Sort by priority (lower number = higher priority), then by name
        rows.sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.name.localeCompare(b.name);
        });
        tbody.innerHTML = rows.map(r => {
            const avg = r.issueCount ? this.formatDuration(Math.floor(r.durationMs / r.issueCount)) : '—';
            return `<tr><td>${this.escapeHtml(r.name)}</td><td>${this.escapeHtml(this.formatDuration(r.durationMs))}</td><td>${this.escapeHtml(avg)}</td><td>${r.issueCount}</td></tr>`;
        }).join('');
    }

    computeWorkflowPath(issue) {
        // Simple summary: list unique status names in order of change
        const histories = issue.changelog?.histories || [];
        const statuses = [];
        histories.forEach(h => {
            h.items.forEach(it => {
                if (it.field === 'status') statuses.push(it.toString || it.to);
            });
        });
        return Array.from(new Set(statuses)).join(' → ');
    }

    computeStatusDurations(issue) {
        // Returns array of { status, durationMs } aggregated across changelog
        const histories = (issue.changelog?.histories || []).slice().sort((a, b) => new Date(a.created) - new Date(b.created));
        const createdAt = new Date(issue.fields?.created || Date.now());
        let currentTime = createdAt;
        const firstStatusItem = histories.find(h => h.items.some(it => it.field === 'status'))?.items.find(it => it.field === 'status');
        let currentStatus = firstStatusItem?.fromString || firstStatusItem?.toString || (issue.fields?.status?.name) || 'Unknown';
        const periods = [];
        for (const h of histories) {
            const changeTime = new Date(h.created);
            for (const it of h.items) {
                if (it.field === 'status') {
                    periods.push({ status: currentStatus, from: currentTime, to: changeTime });
                    currentStatus = it.toString || it.to || currentStatus;
                    currentTime = changeTime;
                }
            }
        }
        const lastTime = new Date(issue.fields?.updated || Date.now());
        periods.push({ status: currentStatus, from: currentTime, to: lastTime });
        // Aggregate durations
        const totals = {};
        periods.forEach(p => {
            const ms = Math.max(0, new Date(p.to) - new Date(p.from));
            totals[p.status] = (totals[p.status] || 0) + ms;
        });
        return Object.entries(totals).map(([status, durationMs]) => ({ status, durationMs })).sort((a, b) => b.durationMs - a.durationMs);
    }

    formatDuration(ms) {
        if (!ms || ms <= 0) return '0s';
        const totalSec = Math.floor(ms / 1000);
        const days = Math.floor(totalSec / 86400);
        let rem = totalSec % 86400;
        const hours = Math.floor(rem / 3600);
        rem = rem % 3600;
        const minutes = Math.floor(rem / 60);
        const seconds = rem % 60;
        const parts = [];
        if (days) parts.push(`${days}d`);
        if (hours) parts.push(`${hours}h`);
        if (minutes) parts.push(`${minutes}m`);
        if (seconds && parts.length === 0) parts.push(`${seconds}s`);
        return parts.join(' ') || '0s';
    }

    computePatterns(issue) {
        // Placeholder: detect if 'Code Review' appears in workflow path
        const path = this.computeWorkflowPath(issue);
        const patterns = [];
        if (path.includes('Code Review')) patterns.push('Code Review');
        return patterns;
    }

    getLastPattern(issue) {
        const patterns = this.computePatterns(issue);
        return patterns.length ? patterns[patterns.length - 1] : '';
    }

    showIssueDetails(issue) {
        // Populate ticket section
        const ticketSection = document.getElementById('ticketInfoSection');
        if (ticketSection) ticketSection.hidden = false;
        document.getElementById('ticketKeyDisplay').textContent = issue.key;
        document.getElementById('ticketSummary').textContent = issue.fields.summary || '';
        document.getElementById('ticketStatus').textContent = issue.fields.status?.name || '';
        document.getElementById('ticketAssignee').textContent = issue.fields.assignee?.displayName || '';
        document.getElementById('changeCount').textContent = issue.changelog?.histories?.length || 0;

        // Populate changelog table
        const changelogBody = document.getElementById('changelogTableBody');
        if (changelogBody) {
            changelogBody.innerHTML = '';
            const histories = issue.changelog?.histories || [];
            histories.forEach(h => {
                h.items.forEach(it => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${this.escapeHtml(h.created)}</td>
                        <td>${this.escapeHtml(h.author?.displayName || '')}</td>
                        <td>${this.escapeHtml(it.field)}</td>
                        <td>${this.escapeHtml(it.fromString || it.from || '')}</td>
                        <td>${this.escapeHtml(it.toString || it.to || '')}</td>
                    `;
                    changelogBody.appendChild(tr);
                });
            });
        }
        // show changelog section
        const changelogSection = document.getElementById('changelogSection');
        if (changelogSection) changelogSection.hidden = false;
    }

    clearResults() {
        const issueSection = document.getElementById('issueListSection');
        if (issueSection) issueSection.hidden = true;
        const ticketSection = document.getElementById('ticketInfoSection');
        if (ticketSection) ticketSection.hidden = true;
        const aiSection = document.getElementById('aiAnalysisSection');
        if (aiSection) aiSection.hidden = true;
        const changelogSection = document.getElementById('changelogSection');
        if (changelogSection) changelogSection.hidden = true;
        const issueSummaryBody = document.getElementById('issueSummaryBody'); if (issueSummaryBody) issueSummaryBody.innerHTML = '';
        const issueKeyList = document.getElementById('issueKeyList'); if (issueKeyList) issueKeyList.innerHTML = '';
        const changelogBody = document.getElementById('changelogTableBody'); if (changelogBody) changelogBody.innerHTML = '';
        const statusSummaryBody = document.getElementById('statusSummaryBody'); if (statusSummaryBody) statusSummaryBody.innerHTML = '';
        const statusGroupSummaryBody = document.getElementById('statusGroupSummaryBody'); if (statusGroupSummaryBody) statusGroupSummaryBody.innerHTML = '';
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    try {
        const analyzer = new TimeAnalyzer();
        window.timeAnalyzer = analyzer; // expose for debugging
        console.debug('TimeAnalyzer initialized and exposed to window.timeAnalyzer');
        // Hook export and other UI here as needed
    } catch (err) {
        console.error('Failed to initialize TimeAnalyzer:', err);
    }
});
