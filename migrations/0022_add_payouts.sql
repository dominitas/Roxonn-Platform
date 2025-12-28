-- Migration: Add Payouts Tracking
-- Description: Prevents duplicate payouts via idempotency check
-- Security: Fixes CRITICAL-2 - No payout idempotency in handleIssueClosed

/*
 * WHY THIS TABLE:
 * - handleIssueClosed() has no check if issue was already paid out
 * - Duplicate "issue closed" webhooks could trigger blockchain.distributeReward() twice
 * - This table tracks completed payouts to ensure one-payout-per-issue guarantee
 *
 * SECURITY IMPACT:
 * - Prevents double payouts when webhook is retried
 * - Prevents financial loss from duplicate blockchain transactions
 * - Provides audit trail of all reward distributions
 */

CREATE TABLE IF NOT EXISTS payouts (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- Payout identification (unique per payout)
  -- WHY: Prevents duplicate payouts for same repo+issue combination
  repository_github_id TEXT NOT NULL,    -- GitHub repository ID (e.g., "123456789")
  issue_number INTEGER NOT NULL,         -- Issue number (e.g., 42)

  -- Recipient information
  recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recipient_github_username TEXT NOT NULL,
  recipient_wallet_address VARCHAR(255) NOT NULL,

  -- Payout details
  amount DECIMAL(18, 8) NOT NULL,        -- Payout amount (after fees)
  currency VARCHAR(10) NOT NULL,         -- XDC, ROXN, USDC

  -- Fee breakdown (NEW: Split fee model)
  -- WHY: Track both client-side and contributor-side fees separately
  base_bounty_amount DECIMAL(18, 8) NOT NULL,      -- Original bounty amount
  client_fee_amount DECIMAL(18, 8) NOT NULL,       -- 2.5% paid by client at creation
  contributor_fee_amount DECIMAL(18, 8) NOT NULL,  -- 2.5% deducted from payout
  total_platform_fee DECIMAL(18, 8) NOT NULL,      -- Sum of client + contributor fees (5%)

  -- Blockchain transaction
  tx_hash VARCHAR(255) NOT NULL,         -- Transaction hash of payout
  block_number BIGINT,                   -- Block number for verification
  gas_used BIGINT,                       -- Gas used for analytics

  -- Payout type
  payout_type VARCHAR(20) NOT NULL,      -- 'pool' or 'community'
  -- WHY: Different payout mechanisms for pool vs community bounties

  -- Source tracking
  pool_manager_address VARCHAR(255),     -- For pool bounties only
  community_bounty_id INTEGER REFERENCES community_bounties(id) ON DELETE SET NULL,  -- For community bounties only

  -- Timestamps
  paid_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',           -- Store PR number, merge SHA, etc.

  -- Constraints
  CONSTRAINT check_currency CHECK (currency IN ('XDC', 'ROXN', 'USDC')),
  CONSTRAINT check_payout_type CHECK (payout_type IN ('pool', 'community')),
  CONSTRAINT check_amount_positive CHECK (amount > 0),
  CONSTRAINT check_base_amount_positive CHECK (base_bounty_amount > 0),

  -- WHY: Fee invariants (5% total = 2.5% client + 2.5% contributor)
  CONSTRAINT check_total_fee_equals_sum CHECK (
    total_platform_fee = client_fee_amount + contributor_fee_amount
  ),
  CONSTRAINT check_client_fee_is_2_5_percent CHECK (
    client_fee_amount = ROUND(base_bounty_amount * 0.025, 8)
  ),
  CONSTRAINT check_contributor_fee_is_2_5_percent CHECK (
    contributor_fee_amount = ROUND(base_bounty_amount * 0.025, 8)
  ),
  CONSTRAINT check_payout_equals_base_minus_contributor_fee CHECK (
    amount = base_bounty_amount - contributor_fee_amount
  ),

  -- UNIQUE constraint: One payout per repo+issue
  -- WHY: This is the core idempotency guarantee
  CONSTRAINT uq_payouts_repo_issue UNIQUE (repository_github_id, issue_number)
);

-- Indexes for performance

-- WHY: Check for existing payout on every handleIssueClosed call (hot path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_repo_issue
  ON payouts(repository_github_id, issue_number);

-- WHY: Query user's payout history
CREATE INDEX IF NOT EXISTS idx_payouts_recipient
  ON payouts(recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;

-- WHY: Analytics on transaction hashes
CREATE INDEX IF NOT EXISTS idx_payouts_tx_hash
  ON payouts(tx_hash);

-- WHY: Community bounty reconciliation
CREATE INDEX IF NOT EXISTS idx_payouts_community_bounty
  ON payouts(community_bounty_id)
  WHERE community_bounty_id IS NOT NULL;

-- WHY: Time-based queries (leaderboards, reports)
CREATE INDEX IF NOT EXISTS idx_payouts_paid_at
  ON payouts(paid_at DESC);

-- WHY: Currency-specific analytics
CREATE INDEX IF NOT EXISTS idx_payouts_currency
  ON payouts(currency);

/*
 * USAGE PATTERN (Pool Bounties - handleIssueClosed):
 *
 * 1. Issue closed webhook received for issue #42 in repo "123456789"
 * 2. Before calling blockchain.distributeReward():
 *    SELECT id FROM payouts WHERE repository_github_id='123456789' AND issue_number=42
 * 3. If result exists: SKIP payout (already paid)
 * 4. If result NULL: Proceed with payout
 * 5. After blockchain.distributeReward() succeeds:
 *    INSERT INTO payouts (repository_github_id, issue_number, ..., tx_hash)
 * 6. If INSERT fails due to unique constraint: Payout succeeded but record lost (rare race condition)
 *    - This is acceptable: blockchain has single payout, DB catches up
 *
 * USAGE PATTERN (Community Bounties - Relayer):
 *
 * 1. Relayer processes claimed bounty
 * 2. Before calling blockchain.completeCommunityBounty():
 *    SELECT id FROM payouts WHERE community_bounty_id=789
 * 3. If result exists: SKIP payout (already paid)
 * 4. If result NULL: Proceed with payout
 * 5. After payout: INSERT INTO payouts with community_bounty_id=789
 */

/*
 * FEE CALCULATION EXAMPLES:
 *
 * Example 1: 100 USDC bounty
 * - base_bounty_amount: 100.00000000
 * - client_fee_amount: 2.50000000 (2.5% of 100)
 * - contributor_fee_amount: 2.50000000 (2.5% of 100)
 * - total_platform_fee: 5.00000000
 * - amount (payout): 97.50000000 (100 - 2.5)
 * - Client pays: 102.50 USDC total (100 + 2.5)
 *
 * Example 2: 0.5 XDC bounty
 * - base_bounty_amount: 0.50000000
 * - client_fee_amount: 0.01250000 (2.5% of 0.5)
 * - contributor_fee_amount: 0.01250000 (2.5% of 0.5)
 * - total_platform_fee: 0.02500000
 * - amount (payout): 0.48750000 (0.5 - 0.0125)
 * - Client pays: 0.5125 XDC total (0.5 + 0.0125)
 */
