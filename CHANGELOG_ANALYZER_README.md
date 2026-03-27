# JIRA Changelog Analyzer

An AI-powered tool to analyze JIRA ticket changelogs using Microsoft 365 Copilot.

## Features

- **Changelog Retrieval**: Fetch complete change history for any JIRA ticket
- **Microsoft 365 Copilot Integration**: Manual workflow for corporate AI analysis
- **Timeline View**: See key changes in chronological order
- **Pattern Detection**: Identify unusual patterns like frequent reassignments or long delays
- **Export**: Download analysis as text file
- **Sortable Data**: Sort changelog by date, author, or field
- **Filter**: Search through changelog entries

## Setup

### 1. Prerequisites

- Node.js installed
- JIRA credentials configured in the main tool
- Access to Microsoft 365 Copilot (corporate account)

### 2. No API Configuration Required!

This tool uses a **manual workflow** with Microsoft 365 Copilot, so you don't need any API keys or special configurations. It works immediately with your existing corporate M365 Copilot access.

### 3. Start the Server

The server should already be running from the main JIRA tool:

```bash
npm start
```

The changelog analyzer uses the same proxy server at `http://localhost:3000`

## Usage

### 1. Open the Changelog Analyzer

- From the main JIRA tool, click "📊 Changelog Analyzer" in the header
- Or navigate directly to `changelog-analyzer.html`

### 2. Enter a Ticket Key

- Type a JIRA ticket key (e.g., `OPR-1234`)
- Click "🔍 Analyze Changelog"

### 3. Use Microsoft 365 Copilot

The analyzer will display a guided workflow:

1. **Click "Copy Prompt"** - Copies the formatted analysis request
2. **Open Microsoft Copilot** - Use any of these:
   - Visit [copilot.microsoft.com](https://copilot.microsoft.com)
   - Use Copilot in Microsoft Teams
   - Use Copilot in Microsoft Edge sidebar
3. **Paste & Get Analysis** - Paste the prompt and let Copilot analyze
4. **Copy Response** - Copy Copilot's analysis
5. **Paste Back** - Paste the response into the text area
6. **Display** - Click "Display Analysis" to see formatted results

### 4. View Results

The analyzer displays:

1. **Ticket Information**: Summary, status, assignee, and change count
2. **Manual Copilot Workflow**: Easy-to-follow steps
3. **AI Analysis** (after pasting): Formatted insights with sections
4. **Raw Changelog**: Detailed table of all changes with sorting and filtering

### 5. Export Analysis

Click the "📥 Export" button to download the complete analysis as a text file.

## AI Analysis Features

When you ask Microsoft 365 Copilot to analyze the changelog, you get:

- **Executive Summary**: Brief overview of the ticket's journey
- **Key Changes**: Top 5-7 most significant updates
- **Status Analysis**: Flow through workflow states and time in each
- **Collaboration Patterns**: Who worked on it and reassignment patterns
- **Time Metrics**: Duration analysis and bottleneck identification
- **Anomaly Detection**: Unusual patterns or delays
- **Recommendations**: Process improvement suggestions

## Why Manual Workflow?

**Benefits:**
- ✅ **No API Keys Required** - Works immediately
- ✅ **Uses Corporate AI** - Leverages your M365 Copilot license
- ✅ **Security Compliant** - Data stays within Microsoft ecosystem
- ✅ **No Additional Costs** - No API usage fees
- ✅ **Full Control** - You see exactly what's analyzed
- ✅ **Privacy** - Respects corporate data policies

## Technical Details

### Files Structure

```
changelog-analyzer.html    - User interface
changelog-analyzer.js      - Application logic with manual workflow
changelog-analyzer.css     - Styling with Copilot workflow UI
server.js                  - Backend proxy (JIRA only, no AI API)
```

### Authentication

Uses existing JIRA authentication from localStorage:
- `jira_authType` (basic or bearer)
- `jira_username`
- `jira_apiToken`
- `jira_bearerToken`
- `jira_url`

## Troubleshooting

### "Cannot connect to proxy server"

Make sure the Node.js server is running:
```bash
npm start
```

### "JIRA URL not configured"

Complete the setup in the main JIRA tool first (Setup page).

### Invalid Ticket Key

Ensure the ticket key format is correct: `PROJECT-123`

### Copy Button Not Working

If the copy button doesn't work:
1. Click "Show" to display the prompt
2. Select all text manually (Cmd+A or Ctrl+A)
3. Copy (Cmd+C or Ctrl+C)

## Tips for Best Results

1. **Copy the Full Prompt** - Don't truncate it
2. **Use Latest Copilot** - Ensure you're on copilot.microsoft.com
3. **Wait for Complete Response** - Let Copilot finish analyzing
4. **Copy Markdown Format** - Copilot's response includes formatting
5. **Large Changelogs** - For tickets with 100+ changes, Copilot may need time

## Future Enhancements

When Microsoft releases an official Copilot API, this tool can be upgraded to:
- [ ] Automatic analysis without manual copying
- [ ] Batch ticket analysis
- [ ] Real-time analysis updates
- [ ] Comparison of multiple tickets

## Support

For issues or questions, refer to the main JIRA integration tool documentation.
