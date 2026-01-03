# Roxonn Browser Extension

Create crypto bounties on GitHub issues with one click.

## Features

- **One-Click Bounty Creation**: Add a "Create Roxonn Bounty" button to every GitHub issue page
- **Easy Form Interface**: Simple form to set bounty amount and currency instead of typing commands
- **Multi-Currency Support**: Pay bounties in XDC, ROXN, or USDC
- **GitHub Integration**: Automatically posts `/bounty` command to the issue

## Installation

### From Chrome Web Store (Recommended)
1. Visit the [Roxonn Extension](https://chrome.google.com/webstore/detail/roxonn/[ID]) page
2. Click "Add to Chrome"
3. Click the extension icon and log in with your Roxonn account

### Manual Installation (Development)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `extension` folder
6. Click the Roxonn icon and log in

## Usage

1. **Navigate to any GitHub issue** in a repository where you want to create a bounty
2. **Click the purple "Create Roxonn Bounty" button** in the issue header
3. **Fill in the form**:
   - Amount (required)
   - Currency (USDC, XDC, or ROXN)
   - Description (optional)
   - Skills needed (optional)
4. **Click "Create Bounty"** - This posts a `/bounty` command to the issue
5. **Fund the bounty** using the payment link provided by Roxonn bot

## Files

- `manifest.json` - Extension configuration
- `content.js` - Injects the bounty button into GitHub pages
- `modal.css` - Styles for the bounty creation modal
- `background.js` - Handles API calls and authentication
- `popup.html/js/css` - Extension popup UI for settings and login

## Development

### Prerequisites
- Chrome or Chromium-based browser
- Basic knowledge of browser extensions

### Local Development
1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the Roxonn extension
4. Test your changes on a GitHub issue page

### Building for Production
```bash
# Create a ZIP file for Chrome Web Store submission
cd extension
zip -r roxonn-extension.zip . -x "*.git*" -x "*.md"
```

## Icon Requirements

Create the following icon files in the `icons/` folder:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Icons should feature the Roxonn logo on a transparent or white background.

## Permissions

The extension requires the following permissions:
- `storage` - Save user preferences and authentication
- `activeTab` - Inject the bounty button on GitHub pages
- `host_permissions` for:
  - `https://github.com/*` - To inject UI on GitHub
  - `https://api.github.com/*` - To post comments
  - `https://roxonn.com/*` - For authentication

## Support

- **Documentation**: https://roxonn.com/docs
- **Discord**: https://discord.gg/roxonn
- **Issues**: https://github.com/roxonn/extension/issues
