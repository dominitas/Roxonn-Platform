/**
 * Roxonn Browser Extension - Content Script
 *
 * This script runs on GitHub issue pages and injects a "Create Roxonn Bounty" button
 * that opens a modal for easy bounty creation.
 */

// Wait for GitHub page to fully load
function injectRoxonnButton() {
  // Only inject on issue pages (not PR pages)
  if (!window.location.pathname.match(/\/issues\/\d+$/)) {
    return;
  }

  // Check if button already exists
  if (document.getElementById('roxonn-create-bounty-btn')) {
    return;
  }

  // Find GitHub's issue header actions area
  // Try multiple selectors for different GitHub layouts
  const issueHeader = document.querySelector('.gh-header-actions') ||
    document.querySelector('[data-testid="header-actions"]') ||
    document.querySelector('.js-issue-header-container .d-flex');

  if (!issueHeader) {
    console.log('[Roxonn] Issue header not found, will retry...');
    return;
  }

  // Create Roxonn button
  const button = document.createElement('button');
  button.id = 'roxonn-create-bounty-btn';
  button.className = 'btn btn-sm';
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" style="margin-right: 4px; vertical-align: text-bottom;">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
      <path fill="currentColor" d="M12 6v12M15 9l-3-3-3 3M9 15l3 3 3-3"/>
    </svg>
    Create Roxonn Bounty
  `;
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
    margin-left: 8px;
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    transition: all 0.2s ease;
  `;

  // Add hover effect
  button.onmouseenter = () => {
    button.style.transform = 'translateY(-1px)';
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  };
  button.onmouseleave = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = 'none';
  };

  // Add click handler
  button.addEventListener('click', openBountyModal);

  // Insert button at the beginning of the actions area
  issueHeader.prepend(button);

  console.log('[Roxonn] Button injected successfully');
}

function openBountyModal() {
  // Get issue details from the page
  const issueTitle = document.querySelector('.js-issue-title, [data-testid="issue-title"]')?.textContent?.trim() || '';
  const issueNumber = window.location.pathname.match(/\/issues\/(\d+)/)?.[1] || '';
  const pathMatch = window.location.pathname.match(/\/([^/]+)\/([^/]+)\/issues/);
  const owner = pathMatch?.[1] || '';
  const repo = pathMatch?.[2] || '';

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'roxonn-modal-overlay';
  overlay.innerHTML = `
    <div class="roxonn-modal">
      <div class="roxonn-modal-header">
        <h2>Create Roxonn Bounty</h2>
        <button id="roxonn-modal-close" type="button">&times;</button>
      </div>

      <form id="roxonn-bounty-form">
        <div class="roxonn-form-group">
          <label>Issue</label>
          <input type="text" value="#${issueNumber} - ${issueTitle.substring(0, 50)}${issueTitle.length > 50 ? '...' : ''}" disabled class="roxonn-input-disabled" />
        </div>

        <div class="roxonn-form-row">
          <div class="roxonn-form-group roxonn-form-group-amount">
            <label>Amount *</label>
            <input type="number" id="roxonn-bounty-amount" placeholder="100" min="0.01" step="0.01" required />
          </div>
          <div class="roxonn-form-group roxonn-form-group-currency">
            <label>Currency *</label>
            <select id="roxonn-bounty-currency" required>
              <option value="USDC">USDC</option>
              <option value="XDC">XDC</option>
              <option value="ROXN">ROXN</option>
            </select>
          </div>
        </div>

        <div class="roxonn-form-group">
          <label>Description (optional)</label>
          <textarea id="roxonn-bounty-description" rows="3" placeholder="Additional details about what needs to be done..."></textarea>
        </div>

        <div class="roxonn-form-group">
          <label>Skills Needed (optional)</label>
          <input type="text" id="roxonn-bounty-skills" placeholder="React, TypeScript, CSS" />
          <small>Comma-separated (e.g., React, TypeScript, CSS)</small>
        </div>

        <div class="roxonn-form-actions">
          <button type="button" id="roxonn-cancel-btn" class="roxonn-btn-secondary">Cancel</button>
          <button type="submit" id="roxonn-submit-btn" class="roxonn-btn-primary">
            <span id="roxonn-submit-text">Create Bounty</span>
            <span id="roxonn-submit-loading" style="display: none;">Creating...</span>
          </button>
        </div>
      </form>

      <div class="roxonn-info">
        <small>
          This will post a <code>/bounty [amount] [currency]</code> command to the issue.
          You'll receive a payment link to fund the escrow.
        </small>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Focus on amount input
  setTimeout(() => {
    document.getElementById('roxonn-bounty-amount')?.focus();
  }, 100);

  // Add event listeners
  document.getElementById('roxonn-modal-close').addEventListener('click', closeModal);
  document.getElementById('roxonn-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('roxonn-bounty-form').addEventListener('submit', (e) => handleSubmit(e, owner, repo, issueNumber));
  overlay.addEventListener('click', (e) => {
    if (e.target.id === 'roxonn-modal-overlay') closeModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', handleEscapeKey);
}

function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    closeModal();
  }
}

function closeModal() {
  document.getElementById('roxonn-modal-overlay')?.remove();
  document.removeEventListener('keydown', handleEscapeKey);
}

async function handleSubmit(e, owner, repo, issueNumber) {
  e.preventDefault();

  const amount = document.getElementById('roxonn-bounty-amount').value;
  const currency = document.getElementById('roxonn-bounty-currency').value;
  const description = document.getElementById('roxonn-bounty-description').value;
  const skills = document.getElementById('roxonn-bounty-skills').value;

  // Validate
  if (!amount || parseFloat(amount) <= 0) {
    alert('Please enter a valid amount');
    return;
  }

  // Build comment body
  let commentBody = `/bounty ${amount} ${currency}`;

  if (description) {
    commentBody += `\n\n**Description:**\n${description}`;
  }

  if (skills) {
    commentBody += `\n\n**Skills needed:** ${skills}`;
  }

  // Show loading state
  const submitBtn = document.getElementById('roxonn-submit-btn');
  const submitText = document.getElementById('roxonn-submit-text');
  const submitLoading = document.getElementById('roxonn-submit-loading');
  submitBtn.disabled = true;
  submitText.style.display = 'none';
  submitLoading.style.display = 'inline';

  try {
    // Send to background script
    const response = await chrome.runtime.sendMessage({
      action: 'createBounty',
      data: { owner, repo, issueNumber, commentBody }
    });

    if (response.success) {
      closeModal();
      // Show success notification
      showNotification('Bounty command posted! Check the issue for payment link.', 'success');
      // Reload page to show new comment
      setTimeout(() => window.location.reload(), 1500);
    } else {
      showNotification('Error: ' + (response.error || 'Failed to post comment'), 'error');
      // Reset button state
      submitBtn.disabled = false;
      submitText.style.display = 'inline';
      submitLoading.style.display = 'none';
    }
  } catch (error) {
    console.error('[Roxonn] Error:', error);
    showNotification('Error: ' + error.message, 'error');
    // Reset button state
    submitBtn.disabled = false;
    submitText.style.display = 'inline';
    submitLoading.style.display = 'none';
  }
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `roxonn-notification roxonn-notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 24px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 100000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: roxonn-slide-in 0.3s ease;
    background: ${type === 'success' ? '#22c55e' : '#ef4444'};
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'roxonn-slide-out 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Inject CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes roxonn-slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes roxonn-slide-out {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectRoxonnButton);
} else {
  injectRoxonnButton();
}

// Re-inject on GitHub's SPA navigation (turbo)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    // Wait for new page content to load
    setTimeout(injectRoxonnButton, 500);
    setTimeout(injectRoxonnButton, 1000);
    setTimeout(injectRoxonnButton, 2000);
  }
}).observe(document, { subtree: true, childList: true });

// Also try injecting periodically for slow-loading pages
setTimeout(injectRoxonnButton, 1000);
setTimeout(injectRoxonnButton, 2000);
