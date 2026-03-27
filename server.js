/**
 * JIRA Proxy Server
 * Handles authentication and CORS for secure JIRA API requests
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const normalizeBaseUrl = (jiraUrl) => (
    jiraUrl
        .replace(/\/rest\/api\/latest\/?$/, '')
        .replace(/\/rest\/agile\/latest\/?$/, '')
);

const buildJiraUrl = (baseUrl, endpoint, defaultBasePath) => {
    if (endpoint.startsWith('http')) return endpoint;
    if (endpoint.startsWith('/rest/')) return `${baseUrl}${endpoint}`;
    return `${baseUrl}${defaultBasePath}${endpoint}`;
};

const proxyJiraRequest = async (req, res, defaultBasePath) => {
    try {
        const { endpoint, options = {} } = req.body;

        if (!endpoint) {
            return res.status(400).json({ error: 'Missing endpoint parameter' });
        }

        // Get base URL from environment variables
        const jiraUrl = process.env.JIRA_URL;
        const username = process.env.JIRA_USERNAME;
        const apiToken = process.env.JIRA_API_TOKEN;
        const incomingAuthHeader = req.headers.authorization;

        if (!jiraUrl) {
            return res.status(500).json({
                error: 'JIRA base URL not configured in environment variables'
            });
        }

        const baseUrl = normalizeBaseUrl(jiraUrl);

        // Build JIRA API URL
        const url = buildJiraUrl(baseUrl, endpoint, defaultBasePath);

        // Create Basic Auth header (JIRA API uses Basic auth with email:token)
        const credentials = (username && apiToken)
            ? Buffer.from(`${username}:${apiToken}`).toString('base64')
            : null;

        const optionsAuthHeader = options.headers?.Authorization || options.headers?.authorization;
        const authHeader = optionsAuthHeader || incomingAuthHeader || (credentials ? `Basic ${credentials}` : null);

        if (!authHeader) {
            return res.status(500).json({
                error: 'JIRA credentials not configured in environment variables and no Authorization header provided'
            });
        }

        // Set up request options
        const fetchOptions = {
            ...options,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'User-Agent': 'JIRA-Proxy-Server/1.0',
                ...options.headers
            }
        };

        // If a corporate CA bundle is provided, create an https.Agent
        // Node will trust the provided CA when making TLS connections to JIRA
        const caPath = process.env.NODE_EXTRA_CA_CERTS || process.env.JIRA_CA_PATH;
        if (caPath && fs.existsSync(caPath)) {
            try {
                const ca = fs.readFileSync(caPath);
                const agent = new https.Agent({ ca });
                fetchOptions.agent = agent;
                console.log(`🔐 Using custom CA bundle at: ${caPath}`);
            } catch (readErr) {
                console.warn('⚠️ Failed to read CA file:', readErr.message);
            }
        }

        console.log(`🔎 Jira endpoint: ${endpoint}`);
        console.log(`🔄 Proxying request to: ${url}`);

        // Make request to JIRA
        const response = await fetch(url, fetchOptions);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(`❌ JIRA API error: ${response.status}`, data);
            return res.status(response.status).json(data);
        }

        console.log('✅ Request successful');
        res.json(data);
    } catch (error) {
        console.error('❌ Proxy error:', error.message);
        res.status(500).json({
            error: error.message,
            details: 'Failed to connect to JIRA API'
        });
    }
};

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running' });
});

/**
 * Proxy endpoint for JIRA API requests
 * Usage: POST /api/jira with body: { endpoint, options }
 */
app.post('/api/jira', async (req, res) => {
    await proxyJiraRequest(req, res, '/rest/api/latest');
});

/**
 * Proxy endpoint for JIRA Agile API requests
 * Usage: POST /api/jira-agile with body: { endpoint, options }
 */
app.post('/api/jira-agile', async (req, res) => {
    await proxyJiraRequest(req, res, '/rest/agile/latest');
});

/**
 * Excel export endpoint
 * Usage: POST /api/export-excel with report data
 */
app.post('/api/export-excel', async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { reportData } = req.body;

        if (!reportData || !reportData.summary) {
            return res.status(400).json({ error: 'Missing report data' });
        }

        const { version, selectedProjectGroups, groupNames, summary, showFixVersions, showJql, filterDoneStatus } = reportData;

        // Create workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Release Analysis');

        // Add header info rows
        worksheet.addRow(['Release Delivery Analysis']);
        worksheet.addRow(['Analysis Label:', version || 'N/A']);
        worksheet.addRow(['Project Groups:', selectedProjectGroups ? selectedProjectGroups.join(', ') : 'N/A']);
        worksheet.addRow(['Release Groups:', groupNames.join(', ')]);
        worksheet.addRow(['Filter Done Status:', filterDoneStatus ? 'Yes' : 'No']);
        worksheet.addRow(['Generated:', new Date().toLocaleString()]);
        worksheet.addRow([]); // Empty row

        // Add table headers
        const headers = ['Project Group', 'Release Group'];
        if (showFixVersions) {
            headers.push('Fix Versions');
        }
        if (showJql) {
            headers.push('JQL Query');
        }
        headers.push('Story Count', 'Story Points', 'Spike Count', 'Spike Points', 'Bug Count', 'Bug Points', 'Total Count', 'Total Points', 'Team Members', 'Throughput - Issues', 'Throughput - SP');
        worksheet.addRow(headers);

        // Calculate column indices for throughput columns
        let throughputIssuesColIdx = 3; // After Project Group (col 1) and Release Group (col 2)
        if (showFixVersions) throughputIssuesColIdx++;
        if (showJql) throughputIssuesColIdx++;
        throughputIssuesColIdx += 8; // Story Count, Story Points, Spike Count, Spike Points, Bug Count, Bug Points, Total Count, Total Points
        throughputIssuesColIdx += 1; // Team Members
        const throughputSpColIdx = throughputIssuesColIdx + 1;

        // Helper function to convert hex color to ARGB
        const hexToArgb = (hexColor) => {
            if (!hexColor) return 'FFFFFFFF';
            const hex = hexColor.replace('#', '').toUpperCase();
            if (hex.length !== 6) return 'FFFFFFFF';
            return 'FF' + hex;
        };

        // Add data rows
        let dataRowNum = 9; // Header row is row 8 (after 7 header info rows + 1 empty)
        summary.forEach((stats) => {
            const row = [stats.projectGroupName, stats.groupName];
            if (showFixVersions) {
                row.push(stats.fixVersions.join(', '));
            }
            if (showJql) {
                row.push(stats.jql);
            }
            row.push(
                stats.Story.count,
                parseFloat(stats.Story.storyPoints.toFixed(1)),
                stats.Spike.count,
                parseFloat(stats.Spike.storyPoints.toFixed(1)),
                stats.Bug.count,
                parseFloat(stats.Bug.storyPoints.toFixed(1)),
                stats.total.count,
                parseFloat(stats.total.storyPoints.toFixed(1)),
                stats.projectGroupTeamMembers ?? 'N/A',
                stats.projectGroupTeamMembers ? parseFloat((stats.total.count / stats.projectGroupTeamMembers).toFixed(2)) : 'N/A',
                stats.projectGroupTeamMembers ? parseFloat((stats.total.storyPoints / stats.projectGroupTeamMembers).toFixed(2)) : 'N/A'
            );

            worksheet.addRow(row);

            // Get color ranges from the request (they would need to be passed in)
            // For now, use placeholder logic - this would be enhanced if color ranges are sent
            const countRanges = reportData.countRanges || [];
            const spRanges = reportData.spRanges || [];

            // Apply background colors to throughput columns
            const throughputIssuesValue = stats.projectGroupTeamMembers ? stats.total.count / stats.projectGroupTeamMembers : null;
            const throughputSpValue = stats.projectGroupTeamMembers ? stats.total.storyPoints / stats.projectGroupTeamMembers : null;

            // Find matching color for throughput issues
            if (throughputIssuesValue !== null && countRanges.length > 0) {
                const matchingRange = countRanges.find(r => throughputIssuesValue >= r.min && throughputIssuesValue <= r.max);
                if (matchingRange) {
                    const cell = worksheet.getCell(dataRowNum, throughputIssuesColIdx);
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: hexToArgb(matchingRange.color) }
                    };
                }
            }

            // Find matching color for throughput SP
            if (throughputSpValue !== null && spRanges.length > 0) {
                const matchingRange = spRanges.find(r => throughputSpValue >= r.min && throughputSpValue <= r.max);
                if (matchingRange) {
                    const cell = worksheet.getCell(dataRowNum, throughputSpColIdx);
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: hexToArgb(matchingRange.color) }
                    };
                }
            }

            dataRowNum++;
        });

        // Set column widths
        worksheet.columns = [
            { width: 15 }, // Project Group
            { width: 30 }, // Release Group
        ];
        if (showFixVersions) {
            worksheet.columns.push({ width: 40 }); // Fix Versions
        }
        if (showJql) {
            worksheet.columns.push({ width: 60 }); // JQL Query
        }
        worksheet.columns.push(
            { width: 12 }, // Story Count
            { width: 13 }, // Story Points
            { width: 12 }, // Spike Count
            { width: 13 }, // Spike Points
            { width: 11 }, // Bug Count
            { width: 12 }, // Bug Points
            { width: 12 }, // Total Count
            { width: 13 }, // Total Points
            { width: 14 }, // Team Members
            { width: 18 }, // Throughput - Issues
            { width: 18 }  // Throughput - SP
        );

        // Generate filename
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `Release_Delivery_${(selectedProjectGroups || []).join('_')}_${timestamp}.xlsx`;

        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write workbook to buffer and send to response
        const buffer = await workbook.xlsx.writeBuffer();
        res.send(buffer);
    } catch (error) {
        console.error('Error generating Excel export:', error);
        res.status(500).json({ 
            error: 'Failed to generate Excel file',
            details: error.message
        });
    }
});

/**
 * Configuration recovery endpoint
 * Returns configuration from .env file for localStorage restoration
 */
app.get('/api/config/recover', (req, res) => {
    res.json({
        jiraUrl: process.env.JIRA_URL || '',
        proxyUrl: 'http://localhost:3000/api/jira',
        authType: process.env.JIRA_AUTH_TYPE || 'basic',
        username: process.env.JIRA_AUTH_TYPE === 'bearer' 
            ? process.env.JIRA_USERTOKEN 
            : process.env.JIRA_USERNAME,
        apiToken: process.env.JIRA_PASSWORD || '',
        bearerToken: process.env.JIRA_API_TOKEN || '',
        defaultProjectKey: process.env.JIRA_PROJECT_KEY || '',
        defaultTeam: '',
        maxResults: '1000'
    });
});

// Serve index.html on root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 JIRA Proxy Server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/jira`);
    console.log(`📋 Config recovery: http://localhost:${PORT}/api/config/recover`);
    console.log(`✅ Make sure your .env file contains: JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN`);
});
