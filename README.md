# Jira Integration Tool

A modern, responsive web application for connecting to Jira servers and managing backlog items. Built with vanilla HTML, CSS, and JavaScript for a lightweight, accessible experience.

## Features

✨ **Core Functionality**
- 🔐 Secure authentication with Jira API tokens
- ⚙️ **New: Setup page for configuration management**
- 📊 Execute custom JQL queries to retrieve issues
- 📋 Load and view project backlogs
- 🎨 Modern, responsive UI that works on all devices
- ♿ Full accessibility support (WCAG 2.1 compliant)
- 🌙 Dark mode support

📈 **Issue Management**
- View detailed issue information (key, summary, type, status, priority, assignee, story points)
- Display results in a clean table format
- Export results to CSV for further analysis
- Real-time issue count and status updates

🎯 **User Experience**
- Intuitive connection form with credential validation
- Clear success/error messaging
- Loading states and progress indicators
- Responsive design for mobile, tablet, and desktop
- Semantic HTML for better accessibility

## Getting Started

### Prerequisites

- A Jira Cloud instance (requires API token authentication)
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Node.js (for the proxy server)
- Jira API credentials:
  - Server URL (e.g., `https://your-domain.atlassian.net`)
  - Email or username
  - API token (generate from https://id.atlassian.com/manage-profile/security/api-tokens)

### Installation

1. Clone or download this repository
2. Install dependencies: `npm install`
3. Start the proxy server: `npm start` or `node server.js`
4. Open `http://localhost:3000` in your web browser

### Quick Setup with Setup Page

1. Open the application and click the **⚙️ Setup** button in the header
2. Configure all settings in one place:
   - **Server Configuration**: Set your Jira URL and proxy endpoint
   - **Authentication**: Save your credentials securely in browser storage
   - **Query Defaults**: Set default project keys and team IDs
   - **JQL Templates**: Save frequently used queries for quick access
3. Test your connection directly from the setup page
4. Return to main page - the app will automatically connect using your saved settings!

### Usage

#### Automatic Connection

The application automatically attempts to connect to Jira when you load the page using your saved configuration from the Setup page.

**If connection is successful:**
- ✅ You'll see a success message with your username
- The query form will appear automatically
- You can start querying issues right away

**If connection fails:**
- ❌ You'll see a detailed error message
- Click "Open Setup Page" to review and fix your configuration
- Common issues and solutions are provided
- Click "Retry Connection" to try again after fixing settings

#### Query Issues

Once connected, you have multiple options:

**Option A: Load Backlog**
- Enter your project key (e.g., `PROJ`)
- Enter team identifier
- Click "Load Backlog"
- View all backlog items sorted by rank

**Option B: Load Open Issues**
- Click "Load Open Issues"
- View all open/in-progress issues

**Option C: Custom JQL Query**
- Enter a custom JQL query in the query field
- Click "Load Issues"
- Examples:
  - `project = PROJ AND status = "To Do"`
  - `project = PROJ AND type in (Story, Bug) AND priority = High`
  - `assignee = currentUser() AND status != Done`

#### View & Export Results

- View results in the table below the query form
- Click "Export" to download results as CSV
- Click "Disconnect" to log out and connect to a different Jira instance

## API Reference

### JiraClient Class

#### Methods

**Constructor**
```javascript
new JiraClient(url, username, apiToken)
```

**testConnection()**
- Validates the connection to Jira
- Returns: Promise<User>

**searchIssues(jql, maxResults = 100)**
- Execute JQL query and retrieve issues
- Returns: Promise<SearchResults>

**getBacklog(projectKey)**
- Get all backlog items for a project
- Returns: Promise<SearchResults>

**getBoards()**
- Get list of all boards
- Returns: Promise<BoardList>

**getBoardByName(name)**
- Find board by name (partial match)
- Returns: Promise<Board>

## JQL Query Examples

```jql
# Get all open stories
project = PROJ AND type = Story AND status != Done ORDER BY rank ASC

# Get bugs assigned to you
assignee = currentUser() AND type = Bug

# Get high priority items
project = PROJ AND priority = High ORDER BY created DESC

# Get recently updated items
project = PROJ AND updated >= -7d ORDER BY updated DESC

# Get items in specific status
project = PROJ AND status in ("To Do", "In Progress")
```

## File Structure

```
jira-integration-tool/
├── index.html          # Main HTML file with semantic markup
├── styles.css          # Complete styling with responsive design
├── script.js           # JavaScript application logic
└── README.md           # This file
```

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Security Notes

⚠️ **Important Security Considerations:**

1. **API Token Storage**: This application stores your credentials in memory only. They are NOT saved to local storage or sent to any external server.

2. **CORS Restrictions**: If running on localhost, you may need to handle CORS headers. Jira Cloud allows API requests from any origin.

3. **API Token Generation**: 
   - Create dedicated API tokens for this application
   - Use workspace/application-specific tokens when possible
   - Regenerate tokens regularly for security

4. **Sensitive Information**: 
   - Never share your API token
   - Be careful when sharing exported CSV files containing sensitive project information

## Customization

### Changing Colors

Edit the CSS variables in `styles.css`:

```css
/* Primary gradient colors */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Change to your brand colors */
background: linear-gradient(135deg, #YOUR_COLOR1 0%, #YOUR_COLOR2 100%);
```

### Adding Custom Fields

To display additional custom fields, modify the `script.js` search function:

```javascript
// Add your custom field IDs to the fields parameter
fields: 'key,summary,issuetype,status,priority,assignee,customfield_10016,customfield_YOUR_FIELD_ID'
```

Then update the table population to display the new fields.

### Extending JQL Presets

Add preset queries to `script.js`:

```javascript
const presets = {
    'My Open Issues': 'assignee = currentUser() AND status != Done',
    'Recent Updates': 'updated >= -7d ORDER BY updated DESC',
    'High Priority': 'priority = High ORDER BY created DESC'
};
```

## Troubleshooting

### "Connection failed" Error

- Verify your Jira URL is correct and includes `https://`
- Confirm your username and API token are accurate
- Check that your Jira instance is accessible

### "401 Unauthorized" Error

- Generate a new API token at https://id.atlassian.com/manage-profile/security/api-tokens
- Ensure you're using your email address (not display name) as username

### "CORS Error" (if running from file://)

- Host the application on a local web server:
  ```bash
  # Python 3
  python -m http.server 8000
  
  # Node.js http-server
  npx http-server
  
  # PHP
  php -S localhost:8000
  ```

### No Results Found

- Verify your JQL query syntax
- Check that the project key is correct and in uppercase
- Try a simpler query like `project = PROJ` first

## Performance Tips

- Limit results by using `maxResults` parameter or JQL filters
- Use `status` filters to exclude completed items
- Sort by `rank` for backlog items to maintain order
- Use `updated` filters to get recent changes only

## License

This project is open source and available under the MIT License.

## Support

For issues with the application, please check:
1. Browser console for JavaScript errors (F12 > Console)
2. Network tab for API response errors
3. Jira API documentation: https://developer.atlassian.com/cloud/jira/rest/v3/

## Contributing

Contributions welcome! Feel free to:
- Report bugs and issues
- Suggest new features
- Submit pull requests with improvements
- Improve documentation

---

Built with ❤️ for better project management
