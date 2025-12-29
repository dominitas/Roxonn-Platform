-- Migration: Add blockchain_bounty_id to community_bounties
-- Description: Adds missing blockchain_bounty_id field to track on-chain bounty ID
-- Security: CRITICAL - Required for relayer to complete bounties on-chain

/*
 * WHY THIS FIELD IS CRITICAL:
 * - When a bounty is funded, blockchain.createCommunityBounty() returns an on-chain bounty ID
 * - This ID is required to call blockchain.completeCommunityBounty() when PR is merged
 * - Without this field, the relayer cannot complete payouts
 * - The code was already using this field but it was missing from the schema
 *
 * IMPACT:
 * - Existing bounties in 'pending_payment' status won't be affected (not yet on-chain)
 * - Any bounties in 'funded' status will need manual blockchain ID lookup if they exist
 * - All new bounties will properly store the blockchain ID during payment
 */

ALTER TABLE community_bounties
  ADD COLUMN IF NOT EXISTS blockchain_bounty_id INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN community_bounties.blockchain_bounty_id IS 'On-chain bounty ID from CommunityBountyEscrow.sol, used by relayer to complete payouts';

-- Create index for faster lookups by blockchain ID
CREATE INDEX IF NOT EXISTS idx_community_bounties_blockchain_id
  ON community_bounties(blockchain_bounty_id)
  WHERE blockchain_bounty_id IS NOT NULL;
