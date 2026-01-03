/**
 * Roxonn Browser Extension - Background Service Worker
 *
 * Handles API calls to GitHub and Roxonn services.
 * Manages authentication state and user preferences.
 */

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createBounty') {
    handleCreateBounty(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (request.action === 'checkAuth') {
    checkAuthStatus()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'logout') {
    handleLogout()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * Create a bounty by posting a comment to the GitHub issue
 */
async function handleCreateBounty({ owner, repo, issueNumber, commentBody }) {
  // Get stored GitHub token
  const { githubToken, roxonnUser } = await chrome.storage.sync.get(['githubToken', 'roxonnUser']);

  if (!githubToken) {
    return {
      success: false,
      error: 'Not logged in. Please click the Roxonn extension icon and log in first.'
    };
  }

  try {
    // Post comment to GitHub issue
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Roxonn-Browser-Extension/1.0'
        },
        body: JSON.stringify({ body: commentBody })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub API error: ${response.status}`);
    }

    const commentData = await response.json();

    // Track bounty creation in Roxonn analytics (optional, non-blocking)
    trackBountyCreation(owner, repo, issueNumber, commentBody, roxonnUser).catch(console.error);

    return {
      success: true,
      commentId: commentData.id,
      commentUrl: commentData.html_url
    };

  } catch (error) {
    console.error('[Roxonn Background] Error creating bounty:', error);
    return {
      success: false,
      error: error.message || 'Failed to post comment to GitHub'
    };
  }
}

/**
 * Track bounty creation in Roxonn analytics
 */
async function trackBountyCreation(owner, repo, issueNumber, commentBody, user) {
  try {
    // Extract amount and currency from comment
    const match = commentBody.match(/\/bounty\s+(\d+(?:\.\d+)?)\s+(XDC|ROXN|USDC)/i);
    if (!match) return;

    const amount = match[1];
    const currency = match[2].toUpperCase();

    // Send to Roxonn API (fire and forget)
    await fetch('https://app.roxonn.com/api/analytics/extension-bounty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        repo,
        issueNumber: parseInt(issueNumber),
        amount,
        currency,
        userId: user?.id,
        source: 'browser-extension'
      })
    });
  } catch (error) {
    // Silent fail - analytics are optional
    console.log('[Roxonn Background] Analytics tracking failed:', error.message);
  }
}

/**
 * Check if user is authenticated
 */
async function checkAuthStatus() {
  const { githubToken, roxonnUser } = await chrome.storage.sync.get(['githubToken', 'roxonnUser']);

  if (!githubToken) {
    return { authenticated: false };
  }

  // Verify token is still valid
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Roxonn-Browser-Extension/1.0'
      }
    });

    if (response.ok) {
      const userData = await response.json();
      return {
        authenticated: true,
        user: {
          login: userData.login,
          avatar_url: userData.avatar_url,
          name: userData.name,
          email: userData.email,
          ...roxonnUser
        }
      };
    } else {
      // Token is invalid, clear it
      await chrome.storage.sync.remove(['githubToken', 'roxonnUser']);
      return { authenticated: false };
    }
  } catch (error) {
    console.error('[Roxonn Background] Auth check failed:', error);
    return { authenticated: false, error: error.message };
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  await chrome.storage.sync.remove(['githubToken', 'roxonnUser', 'defaultCurrency']);
}

/**
 * Handle OAuth callback from Roxonn
 * Called when user logs in via the popup
 */
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.action === 'roxonnOAuthCallback' && request.token) {
    chrome.storage.sync.set({
      githubToken: request.token,
      roxonnUser: request.user || {}
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// Log extension startup
console.log('[Roxonn Background] Extension loaded');
