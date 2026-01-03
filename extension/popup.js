/**
 * Roxonn Browser Extension - Popup Script
 * Handles user authentication and settings
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM elements
  const loadingState = document.getElementById('loading-state');
  const loggedOutState = document.getElementById('logged-out-state');
  const loggedInState = document.getElementById('logged-in-state');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userLogin = document.getElementById('user-login');
  const defaultCurrency = document.getElementById('default-currency');

  // Check authentication status
  try {
    const authStatus = await chrome.runtime.sendMessage({ action: 'checkAuth' });

    loadingState.style.display = 'none';

    if (authStatus.authenticated && authStatus.user) {
      // Show logged in state
      loggedInState.style.display = 'block';
      userAvatar.src = authStatus.user.avatar_url || 'icons/icon48.png';
      userName.textContent = authStatus.user.name || authStatus.user.login;
      userLogin.textContent = '@' + authStatus.user.login;

      // Load saved currency preference
      const { defaultCurrency: savedCurrency } = await chrome.storage.sync.get('defaultCurrency');
      if (savedCurrency) {
        defaultCurrency.value = savedCurrency;
      }
    } else {
      // Show logged out state
      loggedOutState.style.display = 'block';
    }
  } catch (error) {
    console.error('[Roxonn Popup] Error checking auth:', error);
    loadingState.style.display = 'none';
    loggedOutState.style.display = 'block';
  }

  // Login button click
  loginBtn.addEventListener('click', () => {
    // Open Roxonn login page
    // After OAuth, the page will send a message to this extension with the token
    chrome.tabs.create({
      url: 'https://roxonn.com/auth/extension-login'
    });

    // Close popup (user will complete login in new tab)
    window.close();
  });

  // Logout button click
  logoutBtn.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'logout' });
      loggedInState.style.display = 'none';
      loggedOutState.style.display = 'block';
    } catch (error) {
      console.error('[Roxonn Popup] Error logging out:', error);
    }
  });

  // Save currency preference
  defaultCurrency.addEventListener('change', async () => {
    await chrome.storage.sync.set({ defaultCurrency: defaultCurrency.value });
  });
});
