-- Migration: Update Community Bounties for Split Fee Model
-- Description: Adds fee tracking columns for 2.5% client + 2.5% contributor model
-- Replaces: Old 1% total fee model (0.5% platform + 0.5% contributor)
-- New Model: 5% total fee (2.5% client + 2.5% contributor)

/*
 * WHY THIS MIGRATION:
 * - Old model: 1% total fees (0.5% + 0.5%)
 * - New model: 5% total fees (2.5% client-side + 2.5% contributor-side)
 * - Need to track fees separately for accounting and transparency
 * - Existing bounties must be migrated to new fee structure
 */

-- Add new fee columns to community_bounties table
ALTER TABLE community_bounties
  ADD COLUMN IF NOT EXISTS base_bounty_amount DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS client_fee_amount DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS contributor_fee_amount DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS total_platform_fee DECIMAL(18, 8),
  ADD COLUMN IF NOT EXISTS total_paid_by_client DECIMAL(18, 8);

/*
 * COLUMN EXPLANATIONS:
 *
 * base_bounty_amount:
 * - The advertised bounty amount (what contributor sees)
 * - Example: 100 USDC
 *
 * client_fee_amount:
 * - 2.5% fee paid by bounty creator at payment time
 * - Example: 2.5 USDC (2.5% of 100)
 *
 * contributor_fee_amount:
 * - 2.5% fee deducted from contributor payout
 * - Example: 2.5 USDC (2.5% of 100)
 *
 * total_platform_fee:
 * - Sum of client + contributor fees (always 5% of base)
 * - Example: 5.00 USDC (2.5 + 2.5)
 *
 * total_paid_by_client:
 * - Total amount client must pay (base + client fee)
 * - Example: 102.5 USDC (100 + 2.5)
 * - This is what gets locked in escrow smart contract
 */

-- Migrate existing bounties to new fee model
-- WHY: Existing bounties were created under 1% fee model, need to backfill
UPDATE community_bounties
SET
  base_bounty_amount = amount,
  client_fee_amount = ROUND(amount * 0.025, 8),
  contributor_fee_amount = ROUND(amount * 0.025, 8),
  total_platform_fee = ROUND(amount * 0.05, 8),
  total_paid_by_client = amount + ROUND(amount * 0.025, 8)
WHERE
  base_bounty_amount IS NULL;

-- Make columns NOT NULL after backfill
ALTER TABLE community_bounties
  ALTER COLUMN base_bounty_amount SET NOT NULL,
  ALTER COLUMN client_fee_amount SET NOT NULL,
  ALTER COLUMN contributor_fee_amount SET NOT NULL,
  ALTER COLUMN total_platform_fee SET NOT NULL,
  ALTER COLUMN total_paid_by_client SET NOT NULL;

-- Add CHECK constraints to ensure fee invariants
ALTER TABLE community_bounties
  ADD CONSTRAINT check_base_amount_positive CHECK (base_bounty_amount > 0),
  ADD CONSTRAINT check_client_fee_is_2_5_percent CHECK (
    client_fee_amount = ROUND(base_bounty_amount * 0.025, 8)
  ),
  ADD CONSTRAINT check_contributor_fee_is_2_5_percent CHECK (
    contributor_fee_amount = ROUND(base_bounty_amount * 0.025, 8)
  ),
  ADD CONSTRAINT check_total_fee_equals_sum CHECK (
    total_platform_fee = client_fee_amount + contributor_fee_amount
  ),
  ADD CONSTRAINT check_total_paid_equals_base_plus_client_fee CHECK (
    total_paid_by_client = base_bounty_amount + client_fee_amount
  );

/*
 * IMPORTANT NOTES:
 *
 * 1. The `amount` column remains unchanged for backward compatibility
 *    - It continues to represent the base bounty amount
 *    - UI and API will transition to using base_bounty_amount explicitly
 *
 * 2. Smart contract changes required:
 *    - CommunityBountyEscrow.sol must accept total_paid_by_client (not base amount)
 *    - Escrow must store: base amount + client fee
 *    - Payout must transfer: base amount - contributor fee
 *    - Fees must transfer to fee collector: client fee + contributor fee
 *
 * 3. Existing pending bounties:
 *    - Status 'pending_payment': Migrated to new fees, client must pay new total
 *    - Status 'funded' (old 1% fees): HONORED as-is (don't modify existing escrows)
 *    - New bounties: Always use 5% model
 *
 * 4. Rounding precision:
 *    - All fees rounded to 8 decimals (matches DECIMAL(18,8))
 *    - ROUND() prevents floating-point precision issues
 *    - Example: 0.025 * 100.12345678 = 2.50308642 (8 decimals precise)
 */

/*
 * FEE EXAMPLES:
 *
 * Example 1: 100 USDC Bounty
 * -------------------------
 * base_bounty_amount:      100.00000000 USDC
 * client_fee_amount:         2.50000000 USDC (2.5%)
 * contributor_fee_amount:    2.50000000 USDC (2.5%)
 * total_platform_fee:        5.00000000 USDC
 * total_paid_by_client:    102.50000000 USDC
 * contributor_receives:     97.50000000 USDC (100 - 2.5)
 *
 * Example 2: 0.5 XDC Bounty
 * -------------------------
 * base_bounty_amount:        0.50000000 XDC
 * client_fee_amount:         0.01250000 XDC (2.5%)
 * contributor_fee_amount:    0.01250000 XDC (2.5%)
 * total_platform_fee:        0.02500000 XDC
 * total_paid_by_client:      0.51250000 XDC
 * contributor_receives:      0.48750000 XDC (0.5 - 0.0125)
 *
 * Example 3: 1000.25 ROXN Bounty
 * -------------------------
 * base_bounty_amount:     1000.25000000 ROXN
 * client_fee_amount:        25.00625000 ROXN (2.5%)
 * contributor_fee_amount:   25.00625000 ROXN (2.5%)
 * total_platform_fee:       50.01250000 ROXN
 * total_paid_by_client:   1025.25625000 ROXN
 * contributor_receives:    975.24375000 ROXN (1000.25 - 25.00625)
 */

-- Create index on new fee columns for analytics queries
CREATE INDEX IF NOT EXISTS idx_community_bounties_total_platform_fee
  ON community_bounties(total_platform_fee)
  WHERE status IN ('completed', 'funded');

-- WHY: Useful for revenue reports and fee analytics
