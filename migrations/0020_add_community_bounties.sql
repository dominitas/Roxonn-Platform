-- Migration: Add Community Bounties
-- Description: Creates table for community-funded bounties on any public GitHub repository
--              without requiring pool registration, separate from pool-based bounties

/*
 * WHY THIS TABLE IS SEPARATE FROM POOL BOUNTIES:
 *
 * 1. Different Funding Model:
 *    - Pool bounties: Funded by repository pool managers via DualCurrencyRepoRewards.sol
 *    - Community bounties: Funded by individual users via CommunityBountyEscrow.sol
 *
 * 2. Different Authorization:
 *    - Pool bounties: Require registered repository + pool manager role
 *    - Community bounties: ANY user can create on ANY public repo (no registration)
 *
 * 3. Different Smart Contract Architecture:
 *    - Pool bounties: Use repository-based escrow in DualCurrencyRepoRewards
 *    - Community bounties: Use issue-based escrow in CommunityBountyEscrow
 *
 * 4. Different Lifecycle:
 *    - Pool bounties: Allocated from pre-funded pool, instant activation
 *    - Community bounties: Created → Funded → Activated → Claimed → Completed
 *
 * 5. Separate Business Logic:
 *    - Mixing models in one table would require complex conditional logic
 *    - Separate tables = clearer code, easier to maintain, better performance
 */

-- Community bounties table
CREATE TABLE IF NOT EXISTS community_bounties (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- GitHub identifiers (NO foreign key to registered_repositories - repos may not be registered)
  -- WHY: Community bounties work on ANY public repo, registered or not
  github_repo_owner TEXT NOT NULL,           -- e.g., "facebook"
  github_repo_name TEXT NOT NULL,            -- e.g., "react"
  github_issue_number INTEGER NOT NULL,      -- Issue number (unique within repo)
  github_issue_id TEXT NOT NULL,             -- GitHub's global issue ID
  github_issue_url TEXT NOT NULL,            -- Full URL for reference

  -- Creator (user who funded the bounty)
  -- WHY user_id references users: Allows linking to platform users for payment flow
  -- WHY created_by_github_username: Preserves GitHub identity even if user not in our DB yet
  creator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_github_username TEXT NOT NULL,

  -- Bounty details
  title TEXT NOT NULL,                       -- Issue title (cached for display)
  description TEXT,                          -- Optional custom bounty description

  -- Reward configuration
  amount DECIMAL(18, 8) NOT NULL,            -- Bounty amount (e.g., 100.000000)
  currency VARCHAR(10) NOT NULL,             -- USDC, XDC, ROXN
  -- WHY DECIMAL(18, 8): Matches Solidity uint256 precision (8 decimals sufficient for USDC)
  -- WHY currency as TEXT: Same pattern as existing multi_currency_bounties table

  -- Blockchain escrow tracking
  escrow_tx_hash VARCHAR(255),               -- Transaction hash of escrow deposit
  escrow_block_number BIGINT,                -- Block number for verification
  escrow_deposited_at TIMESTAMP WITH TIME ZONE, -- When funds entered escrow
  -- WHY track escrow on-chain: Funds locked in CommunityBountyEscrow.sol, need verifiable proof

  -- Payment tracking (for fiat/crypto payment flow)
  payment_method VARCHAR(20),                -- 'crypto', 'fiat'
  payment_status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  onramp_transaction_id INTEGER REFERENCES onramp_transactions(id), -- Links to fiat payment
  -- WHY payment_method: Support both crypto (direct escrow) and fiat (Onramp → escrow)

  -- Status lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'pending_payment',
  -- WHY these specific statuses:
  -- 'pending_payment': Created, awaiting payment
  -- 'funded': Payment received, funds in escrow, bounty active
  -- 'claimed': Contributor claimed via /claim command
  -- 'completed': Payout executed via relayer
  -- 'refunded': Creator refunded (expired or cancelled)
  -- 'expired': Passed expiry date without completion

  -- Claim tracking
  claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  claimed_by_github_username TEXT,           -- GitHub username of claimer
  claimed_pr_number INTEGER,                 -- PR number that resolved the issue
  claimed_pr_url TEXT,                       -- PR URL for verification
  claimed_at TIMESTAMP WITH TIME ZONE,
  -- WHY track claim separately from completion: Claim is user action, completion is relayer action

  -- Payout tracking
  payout_tx_hash VARCHAR(255),               -- Transaction hash of reward distribution
  payout_executed_at TIMESTAMP WITH TIME ZONE,
  payout_recipient_address VARCHAR(255),     -- Recipient's wallet address
  -- WHY payout tracking: Audit trail for completed bounties

  -- Expiry and refund
  expires_at TIMESTAMP WITH TIME ZONE,       -- Optional expiry date
  refund_tx_hash VARCHAR(255),               -- Transaction hash of refund (if applicable)
  refunded_at TIMESTAMP WITH TIME ZONE,
  -- WHY expiry: Prevents indefinite fund locking, allows creator to reclaim

  -- Metadata
  metadata JSONB DEFAULT '{}',               -- Flexible storage for future features
  -- WHY JSONB: Extensibility without schema migrations (tags, labels, custom fields)

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,

  -- Constraints
  -- WHY CHECK constraints: Data integrity enforcement at DB level (cheaper than app validation)
  CONSTRAINT check_amount_positive CHECK (amount > 0),
  CONSTRAINT check_currency CHECK (currency IN ('USDC', 'XDC', 'ROXN')),
  CONSTRAINT check_status CHECK (status IN (
    'pending_payment',
    'funded',
    'claimed',
    'completed',
    'refunded',
    'expired',
    'failed_verification'
  )),
  CONSTRAINT check_payment_status CHECK (payment_status IN ('pending', 'completed', 'failed')),
  CONSTRAINT check_payment_method CHECK (payment_method IN ('crypto', 'fiat'))
);

/*
 * INDEXES: Chosen based on expected query patterns
 * WHY these indexes exist and how they optimize queries:
 */

-- 1. Repository-based lookups (most common: "show all bounties for repo X")
-- WHY: Users browse bounties by repository, this is the primary navigation pattern
CREATE INDEX IF NOT EXISTS idx_community_bounties_repo
  ON community_bounties(github_repo_owner, github_repo_name);

-- 2. Issue-specific lookup (unique bounty per issue)
-- WHY: Prevents duplicate bounties on same issue, fast lookup when processing webhooks
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_bounties_repo_issue
  ON community_bounties(github_repo_owner, github_repo_name, github_issue_number)
  WHERE status NOT IN ('refunded', 'expired'); -- Allow re-creation after refund/expiry

-- 3. Creator lookups (user's created bounties)
-- WHY: "My Bounties" page, user dashboard queries
CREATE INDEX IF NOT EXISTS idx_community_bounties_creator
  ON community_bounties(creator_user_id)
  WHERE creator_user_id IS NOT NULL;

-- 4. Status-based queries (active bounties explorer)
-- WHY: Main explorer page shows only 'funded' bounties, status filtering is critical
CREATE INDEX IF NOT EXISTS idx_community_bounties_status
  ON community_bounties(status);

-- 5. Active bounties with expiry (cleanup jobs)
-- WHY: Background job to auto-expire bounties needs fast "funded + expired" lookup
CREATE INDEX IF NOT EXISTS idx_community_bounties_expiry
  ON community_bounties(expires_at)
  WHERE status = 'funded' AND expires_at IS NOT NULL;

-- 6. Claimed bounties awaiting payout (relayer processing queue)
-- WHY: Relayer scans for 'claimed' bounties to process payouts, needs fast filtering
CREATE INDEX IF NOT EXISTS idx_community_bounties_claimed
  ON community_bounties(claimed_at)
  WHERE status = 'claimed';

-- 7. Payment tracking (Onramp webhook processing)
-- WHY: When Onramp webhook arrives, we look up bounty by payment_status='pending'
CREATE INDEX IF NOT EXISTS idx_community_bounties_payment
  ON community_bounties(payment_status)
  WHERE payment_status = 'pending';

-- 8. Contributor earnings (leaderboard)
-- WHY: "Top Contributors" leaderboard aggregates by claimed_by_user_id
CREATE INDEX IF NOT EXISTS idx_community_bounties_contributor
  ON community_bounties(claimed_by_user_id)
  WHERE status = 'completed';

-- 9. Created timestamp (chronological sorting)
-- WHY: Default sort order for bounty lists ("newest first")
CREATE INDEX IF NOT EXISTS idx_community_bounties_created_at
  ON community_bounties(created_at DESC);

-- 10. Composite index for explorer page (status + created_at)
-- WHY: Most common query: "SELECT * FROM community_bounties WHERE status='funded' ORDER BY created_at DESC"
CREATE INDEX IF NOT EXISTS idx_community_bounties_status_created
  ON community_bounties(status, created_at DESC);

/*
 * WHAT WOULD BREAK IF DONE DIFFERENTLY:
 *
 * 1. If merged with pool bounties:
 *    - Polymorphic table with type discriminator = complex queries, worse performance
 *    - Nullable foreign keys everywhere (repo_id nullable for community, required for pool)
 *    - Business logic would need constant "if type === community" conditionals
 *
 * 2. If github_repo_owner/name stored as single column:
 *    - Can't query by owner efficiently (e.g., "all bounties in facebook org")
 *    - String parsing required for every query
 *    - Violates First Normal Form (atomic values)
 *
 * 3. If no unique constraint on repo+issue:
 *    - Multiple bounties on same issue = ambiguity on payout
 *    - Race conditions during webhook processing
 *    - User confusion ("which bounty gets paid?")
 *
 * 4. If no expiry mechanism:
 *    - Funds locked forever if issue never resolved
 *    - No way for creator to reclaim funds
 *    - Escrow contract bloated with abandoned bounties
 *
 * 5. If claimed_at not indexed:
 *    - Relayer would need full table scan to find claimable bounties
 *    - O(n) query on every payout check = performance degradation at scale
 *
 * 6. If payment_status not tracked:
 *    - No way to distinguish "waiting for payment" vs "payment failed"
 *    - Onramp webhooks couldn't update bounty status
 *    - Users see "pending" bounties that will never activate
 */
