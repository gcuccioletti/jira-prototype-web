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
        this._currentTicketKey = null;
        this._currentPrompt = null;
        this._initializeEventListeners();
    }

    /**
     * Get item from localStorage
     */
    getStorage(key) {
        return localStorage.getItem(this.storagePrefix + key);
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

        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => {
                this.handleSort(header.dataset.sort);
            });
        });
    }

    /**
     * Initialize the Changelog Analyzer
     */
    async initializeApp() {
        try {
            console.log('🚀 Initializing Changelog Analyzer...');
            
            // Display user info
            await this._displayUserInfo();

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

            console.log('✅ Changelog Analyzer initialized');
            console.log(`   Proxy URL: ${this.proxyUrl}`);
            console.log(`   Auth Type: ${authType}`);

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
     * Handle form submission
     */
    async handleAnalyze() {
        const ticketKeyInput = document.getElementById('ticketKey');
        const ticketKey = ticketKeyInput.value.trim().toUpperCase();
        
        if (!ticketKey) {
            this._showMessage('Please enter a ticket key', 'error');
            return;
        }

        // Validate ticket key format
        if (!/^[A-Z]+-\d+$/.test(ticketKey)) {
            this._showMessage('Invalid ticket key format (e.g., OPR-1234)', 'error');
            return;
        }

        // Validate date range if both dates are provided
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            this._showMessage('Start date/time must be before end date/time', 'error');
            return;
        }

        await this.analyzeTicket(ticketKey);
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
            document.getElementById('changelogSection')
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
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.analyzerApp = new ChangelogAnalyzer();
    window.analyzerApp.initializeApp();
});
