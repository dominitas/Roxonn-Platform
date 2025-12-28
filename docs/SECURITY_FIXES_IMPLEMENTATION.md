# Security Fixes Implementation Plan
**Date:** 2025-12-28
**Status:** ✅ Ready for Implementation
**Fixes:** CRITICAL-1, CRITICAL-2, CRITICAL-3, HIGH-1 + Fee Model Update

---

## Summary of Changes

This document provides the complete implementation plan for 4 critical security fixes plus the fee model update from 1% total to 5% split (2.5% client + 2.5% contributor).

### Files Modified:
- ✅ **3 New Migrations** (webhook deliveries, payouts, fee model)
- ✅ **shared/schema.ts** (new tables + amount validation)
- ⏳ **server/storage.ts** (idempotency + atomic methods)
- ⏳ **server/routes/webhookRoutes.ts** (delivery check)
- ⏳ **server/github.ts** (payout check)
- ⏳ **server/routes/communityBounties.ts** (atomic claim + fees)
- ⏳ **server/blockchain.ts** (fee calculations)
- ⏳ **contracts/CommunityBountyEscrow.sol** (fee model)
- ⏳ **client/** (UI updates for fees)

---

## ✅ COMPLETED: Database Migrations

### Migration 0021: Webhook Deliveries
**File:** `migrations/0021_add_webhook_deliveries.sql`
**Purpose:** Track processed webhook delivery IDs to prevent duplicate processing

**Key Features:**
- `delivery_id` column with UNIQUE constraint
- Atomic INSERT ... ON CONFLICT DO NOTHING pattern
- Indexes on delivery_id (hot path), event_type, status
- 30-day retention policy

### Migration 0022: Payouts
**File:** `migrations/0022_add_payouts.sql`
**Purpose:** Track completed payouts to prevent double-payment

**Key Features:**
- UNIQUE constraint on `(repository_github_id, issue_number)`
- Fee breakdown columns (base, client fee, contributor fee, total)
- CHECK constraints enforcing fee invariants (5% = 2.5% + 2.5%)
- Supports both pool and community bounties

### Migration 0023: Fee Model Update
**File:** `migrations/0023_update_community_bounties_fee_model.sql`
**Purpose:** Add fee tracking columns to community_bounties table

**Columns Added:**
- `base_bounty_amount` - Advertised bounty (what contributor sees)
- `client_fee_amount` - 2.5% paid by client at creation
- `contributor_fee_amount` - 2.5% deducted from payout
- `total_platform_fee` - Sum of both fees (always 5%)
- `total_paid_by_client` - base + client fee (what client pays)

**CHECK Constraints:**
```sql
CHECK (client_fee_amount = ROUND(base_bounty_amount * 0.025, 8))
CHECK (contributor_fee_amount = ROUND(base_bounty_amount * 0.025, 8))
CHECK (total_platform_fee = client_fee_amount + contributor_fee_amount)
CHECK (total_paid_by_client = base_bounty_amount + client_fee_amount)
```

### Schema Updates
**File:** `shared/schema.ts`
**Changes:**
1. ✅ Added `webhookDeliveries` table definition
2. ✅ Added `payouts` table definition
3. ✅ Added fee columns to `communityBounties`
4. ✅ Updated `createCommunityBountySchema` with .refine() checks:
   - Amount > 0
   - Amount >= 1 (minimum bounty)

---

## ⏳ PENDING: Storage Layer Updates

### File: `server/storage.ts`

Add these methods to the `DatabaseStorage` class (before closing brace):

```typescript
  // ========================================
  // CRITICAL-1: Webhook Delivery Idempotency
  // ========================================

  /**
   * Record webhook delivery (atomic check-and-insert)
   * Returns true if this is first time seeing this delivery
   * Returns false if delivery already processed (duplicate)
   *
   * SECURITY: Prevents duplicate webhook processing
   * USAGE: Call at start of webhook handler, before any processing
   */
  async recordWebhookDelivery(
    deliveryId: string,
    eventType: string,
    eventAction: string | null,
    repositoryId: string | null,
    installationId: string | null
  ): Promise<boolean> {
    try {
      const result = await db.insert(webhookDeliveries)
        .values({
          deliveryId,
          eventType,
          eventAction,
          repositoryId,
          repositoryName: null, // Can be added from payload if needed
          installationId,
          status: 'processing',
        })
        .onConflictDoNothing({ target: webhookDeliveries.deliveryId })
        .returning({ id: webhookDeliveries.id });

      // If INSERT returned a row, this is first time seeing delivery
      const isFirstTime = result.length > 0;

      if (!isFirstTime) {
        log(`Duplicate webhook delivery detected: ${deliveryId}`, 'webhook-idempotency');
      }

      return isFirstTime;
    } catch (error) {
      log(`Error recording webhook delivery: ${error instanceof Error ? error.message : String(error)}`, 'storage-ERROR');
      // On error, allow processing (fail open) but log
      return true;
    }
  }

  /**
   * Mark webhook delivery as completed
   */
  async markWebhookDeliveryCompleted(deliveryId: string): Promise<void> {
    try {
      await db.update(webhookDeliveries)
        .set({
          status: 'completed',
          processedAt: new Date(),
        })
        .where(eq(webhookDeliveries.deliveryId, deliveryId));
    } catch (error) {
      log(`Error marking webhook delivery completed: ${error instanceof Error ? error.message : String(error)}`, 'storage-ERROR');
    }
  }

  /**
   * Mark webhook delivery as failed with error
   */
  async markWebhookDeliveryFailed(deliveryId: string, errorMessage: string): Promise<void> {
    try {
      await db.update(webhookDeliveries)
        .set({
          status: 'failed',
          processedAt: new Date(),
          errorMessage,
        })
        .where(eq(webhookDeliveries.deliveryId, deliveryId));
    } catch (error) {
      log(`Error marking webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`, 'storage-ERROR');
    }
  }

  // ========================================
  // CRITICAL-2: Payout Idempotency
  // ========================================

  /**
   * Check if payout already exists for this repo+issue
   * Returns existing payout if found, null otherwise
   *
   * SECURITY: Prevents double payouts
   * USAGE: Call before blockchain.distributeReward()
   */
  async getPayoutByRepoAndIssue(
    repositoryGithubId: string,
    issueNumber: number
  ): Promise<Payout | null> {
    try {
      const [payout] = await db.select()
        .from(payouts)
        .where(and(
          eq(payouts.repositoryGithubId, repositoryGithubId),
          eq(payouts.issueNumber, issueNumber)
        ))
        .limit(1);

      return payout || null;
    } catch (error) {
      log(`Error fetching payout: ${error instanceof Error ? error.message : String(error)}`, 'storage-ERROR');
      return null;
    }
  }

  /**
   * Record completed payout
   *
   * SECURITY: Atomic insert with unique constraint
   * If payout already exists, INSERT will fail (idempotency guarantee)
   */
  async recordPayout(payout: NewPayout): Promise<Payout> {
    try {
      const [result] = await db.insert(payouts)
        .values(payout)
        .returning();

      log(`Payout recorded: repo=${payout.repositoryGithubId}, issue=${payout.issueNumber}, tx=${payout.txHash}`, 'payout');
      return result;
    } catch (error) {
      // Unique constraint violation = payout already exists (acceptable)
      if (error instanceof Error && error.message.includes('unique constraint')) {
        log(`Payout already exists (idempotency): repo=${payout.repositoryGithubId}, issue=${payout.issueNumber}`, 'payout');
        throw new Error('Payout already recorded for this issue');
      }
      log(`Error recording payout: ${error instanceof Error ? error.message : String(error)}`, 'storage-ERROR');
      throw error;
    }
  }

  // ========================================
  // CRITICAL-3: Atomic Bounty Claim
  // ========================================

  /**
   * Claim bounty atomically with SELECT FOR UPDATE
   * Prevents race condition where multiple users claim same bounty
   *
   * SECURITY: Transaction with row-level lock
   * Returns updated bounty if claim succeeded
   * Throws error if bounty not claimable
   */
  async claimCommunityBountyAtomic(
    bountyId: number,
    userId: number,
    githubUsername: string,
    prNumber: number,
    prUrl: string
  ): Promise<CommunityBounty> {
    return await db.transaction(async (tx) => {
      // Step 1: Lock the bounty row (SELECT FOR UPDATE)
      const [bounty] = await tx.select()
        .from(communityBounties)
        .where(eq(communityBounties.id, bountyId))
        .for('update') // Row-level lock
        .limit(1);

      if (!bounty) {
        throw new Error('Bounty not found');
      }

      // Step 2: Check if bounty is claimable
      if (bounty.status !== 'funded') {
        throw new Error(`Bounty is not claimable (status: ${bounty.status})`);
      }

      // Step 3: Update bounty status to claimed (within same transaction)
      const [updatedBounty] = await tx.update(communityBounties)
        .set({
          status: 'claimed',
          claimedByUserId: userId,
          claimedByGithubUsername: githubUsername,
          claimedPrNumber: prNumber,
          claimedPrUrl: prUrl,
          claimedAt: new Date(),
        })
        .where(eq(communityBounties.id, bountyId))
        .returning();

      log(`Bounty ${bountyId} claimed atomically by ${githubUsername} via PR #${prNumber}`, 'claim-atomic');
      return updatedBounty;
    });
  }

  // ========================================
  // Fee Calculation Utilities
  // ========================================

  /**
   * Calculate fee breakdown for bounty amount
   * Returns base amount + all fee components
   *
   * Fee Model: 5% total (2.5% client + 2.5% contributor)
   */
  calculateBountyFees(baseBountyAmount: number): {
    baseBountyAmount: number;
    clientFeeAmount: number;
    contributorFeeAmount: number;
    totalPlatformFee: number;
    totalPaidByClient: number;
    contributorPayout: number;
  } {
    // Round to 8 decimals (matches database precision)
    const roundTo8 = (num: number) => Math.round(num * 100000000) / 100000000;

    const clientFee = roundTo8(baseBountyAmount * 0.025); // 2.5%
    const contributorFee = roundTo8(baseBountyAmount * 0.025); // 2.5%
    const totalFee = roundTo8(clientFee + contributorFee);
    const totalPaid = roundTo8(baseBountyAmount + clientFee);
    const payout = roundTo8(baseBountyAmount - contributorFee);

    return {
      baseBountyAmount: roundTo8(baseBountyAmount),
      clientFeeAmount: clientFee,
      contributorFeeAmount: contributorFee,
      totalPlatformFee: totalFee,
      totalPaidByClient: totalPaid,
      contributorPayout: payout,
    };
  }
```

**Import Additions Needed:**
```typescript
import { webhookDeliveries, payouts, type NewPayout, type Payout, type WebhookDelivery } from '../shared/schema';
```

---

## ⏳ PENDING: Webhook Route Updates

### File: `server/routes/webhookRoutes.ts`

**Update `handleGitHubAppWebhook` function:**

```typescript
async function handleGitHubAppWebhook(req: Request, res: Response) {
  log('GitHub App Webhook request received', 'webhook-app');
  const event = req.headers['x-github-event'] as string;
  const signature = req.headers['x-hub-signature-256'] as string;
  const delivery = req.headers['x-github-delivery'] as string; // ← Already extracted

  log(`Event: ${event}, Delivery: ${delivery}`, 'webhook-app');

  // NEW: Check for missing delivery ID
  if (!delivery) {
    log('Missing x-github-delivery header', 'webhook-app');
    return res.status(400).json({ error: 'Missing delivery ID' });
  }

  if (!signature) {
    log('Missing app webhook signature', 'webhook-app');
    return res.status(401).json({ error: 'Missing signature' });
  }

  // Verify signature (existing code - no changes)
  const appWebhooks = new Webhooks({
    secret: config.githubAppWebhookSecret!
  });

  const isValid = await appWebhooks.verify(req.body.toString('utf8'), signature);
  if (!isValid) {
    log('Invalid app webhook signature', 'webhook-app');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  log('App webhook signature verified successfully', 'webhook-app');

  // Parse payload AFTER verification
  const payload = JSON.parse(req.body.toString('utf8'));
  const installationId = String(payload.installation?.id);

  if (!installationId) {
    log('App webhook ignored: Missing installation ID', 'webhook-app');
    return res.status(400).json({ error: 'Missing installation ID' });
  }

  // NEW: CRITICAL-1 FIX - Check delivery idempotency
  const isFirstDelivery = await storage.recordWebhookDelivery(
    delivery,
    event,
    payload.action || null,
    payload.repository?.id?.toString() || null,
    installationId
  );

  if (!isFirstDelivery) {
    log(`Duplicate delivery ${delivery} - skipping processing`, 'webhook-app');
    return res.status(200).json({ message: 'Duplicate delivery ignored' });
  }

  log(`Processing event '${event}'...`, 'webhook-app');

  try {
    // ... existing event handling code (issue_comment, issues, etc.) ...

    // At end of successful processing:
    await storage.markWebhookDeliveryCompleted(delivery);

  } catch (error: any) {
    log(`App Webhook processing error: ${error?.message || error}`, 'webhook-app');

    // Mark delivery as failed
    await storage.markWebhookDeliveryFailed(delivery, error?.message || String(error));

    if (!res.headersSent) {
      return res.status(500).json({ error: 'App webhook processing failed' });
    }
  }
}
```

---

## ⏳ PENDING: GitHub Handler Updates

### File: `server/github.ts`

**Update `handleIssueClosed` function (CRITICAL-2 fix):**

Find the section where `blockchain.distributeReward()` is called (around line 1343) and add payout check:

```typescript
// BEFORE (existing code):
const distributionResult = await blockchain.distributeReward(
  poolManagerAddress,
  repositoryOwner,
  repositoryName,
  repositoryGithubId,
  issueNumber
);

// AFTER (with idempotency check):

// CRITICAL-2 FIX: Check if payout already exists
const existingPayout = await storage.getPayoutByRepoAndIssue(
  repositoryGithubId,
  issueNumber
);

if (existingPayout) {
  log(`Payout already exists for repo ${repositoryGithubId} issue #${issueNumber}. TX: ${existingPayout.txHash}`, 'payout-idempotency');
  log(`Skipping duplicate payout. Original payout on ${existingPayout.paidAt}`, 'payout-idempotency');
  return; // Exit early - no duplicate payout
}

// Proceed with payout (first time)
log(`No existing payout found - proceeding with distribution`, 'payout');
const distributionResult = await blockchain.distributeReward(
  poolManagerAddress,
  repositoryOwner,
  repositoryName,
  repositoryGithubId,
  issueNumber
);

log(`Distributed reward for issue ${issueNumber}. TX: ${distributionResult.hash}`, 'payout');

// Record payout in database
try {
  // For pool bounties, fees are 0% (fully paid from pool)
  await storage.recordPayout({
    repositoryGithubId,
    issueNumber,
    recipientUserId: contributorUser.id,
    recipientGithubUsername: contributorUsername,
    recipientWalletAddress: contributorUser.xdcWalletAddress!,
    amount: bountyAmount.toString(), // Full amount (no fees for pool)
    currency: 'XDC', // Or determine from bounty
    baseBountyAmount: bountyAmount.toString(),
    clientFeeAmount: '0', // Pool bounties have no client fee
    contributorFeeAmount: '0', // Pool bounties have no contributor fee
    totalPlatformFee: '0',
    txHash: distributionResult.hash,
    blockNumber: distributionResult.blockNumber || null,
    gasUsed: null,
    payoutType: 'pool',
    poolManagerAddress,
    communityBountyId: null,
    metadata: {
      issueUrl: issue.html_url,
      prNumber: prNumber,
      distributedVia: 'handleIssueClosed',
    },
  });
} catch (error) {
  // If recording fails but blockchain succeeded, log error
  // Payout is still successful (blockchain is source of truth)
  log(`Payout succeeded but DB record failed: ${error instanceof Error ? error.message : String(error)}`, 'payout-ERROR');
}
```

---

## ⏳ PENDING: Community Bounties Route Updates

### File: `server/routes/communityBounties.ts`

#### 1. Update CREATE Endpoint (add fee calculations):

```typescript
router.post(
  '/api/community-bounties',
  requireAuth,
  csrfProtection,
  createBountyRateLimiter,
  async (req: Request, res: Response) => {
    try {
      // ... existing validation code ...

      const validatedData = createCommunityBountySchema.parse(req.body);

      // NEW: Calculate fees
      const fees = storage.calculateBountyFees(parseFloat(validatedData.amount));

      // Create bounty with fee breakdown
      const bounty = await storage.createCommunityBounty({
        ...validatedData,
        creatorUserId: req.user.id,
        createdByGithubUsername: req.user.githubUsername,
        status: 'pending_payment',
        paymentStatus: 'pending',
        // NEW: Fee fields
        baseBountyAmount: fees.baseBountyAmount.toString(),
        clientFeeAmount: fees.clientFeeAmount.toString(),
        contributorFeeAmount: fees.contributorFeeAmount.toString(),
        totalPlatformFee: fees.totalPlatformFee.toString(),
        totalPaidByClient: fees.totalPaidByClient.toString(),
      });

      // Update response message to show fees
      res.status(201).json({
        bounty,
        message: `Bounty created. Pay ${fees.totalPaidByClient} ${validatedData.currency} (${fees.baseBountyAmount} bounty + ${fees.clientFeeAmount} platform fee)`,
        fees: {
          baseBounty: fees.baseBountyAmount,
          clientFee: fees.clientFeeAmount,
          contributorFee: fees.contributorFeeAmount,
          totalFee: fees.totalPlatformFee,
          youPay: fees.totalPaidByClient,
          contributorReceives: fees.contributorPayout,
        },
      });
    } catch (error: any) {
      // ... existing error handling ...
    }
  }
);
```

#### 2. Update CLAIM Endpoint (use atomic method):

```typescript
router.post(
  '/api/community-bounties/:id/claim',
  requireAuth,
  csrfProtection,
  claimBountyRateLimiter,
  async (req: Request, res: Response) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const bountyId = parseInt(req.params.id);
      if (isNaN(bountyId)) {
        return res.status(400).json({ error: 'Invalid bounty ID' });
      }

      const { prNumber, prUrl } = req.body;

      if (!prNumber || typeof prNumber !== 'number') {
        return res.status(400).json({ error: 'PR number is required' });
      }

      log(`Processing claim for community bounty ${bountyId} by user ${req.user.id}, PR #${prNumber}`, 'community-bounties');

      // Get user for wallet check
      const user = await storage.getUserById(req.user.id);
      if (!user || !user.githubUsername) {
        return res.status(400).json({ error: 'GitHub account not linked' });
      }

      if (!user.xdcWalletAddress) {
        return res.status(400).json({ error: 'Wallet not set up. Please create a wallet first.' });
      }

      // CRITICAL-3 FIX: Use atomic claim method
      let updatedBounty;
      try {
        updatedBounty = await storage.claimCommunityBountyAtomic(
          bountyId,
          req.user.id,
          user.githubUsername,
          prNumber,
          prUrl
        );
      } catch (error: any) {
        // Atomic claim failed - bounty not claimable
        if (error.message.includes('not claimable')) {
          return res.status(400).json({ error: error.message });
        }
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: 'Bounty not found' });
        }
        throw error; // Other errors
      }

      log(`Community bounty ${bountyId} claimed by ${user.githubUsername} with PR #${prNumber}`, 'community-bounties');

      // Calculate fees for response
      const fees = storage.calculateBountyFees(parseFloat(updatedBounty.baseBountyAmount));

      res.status(200).json({
        status: 'claimed',
        bounty: updatedBounty,
        message: 'Bounty claimed successfully. Payout will be processed automatically after your PR is merged.',
        estimatedPayout: {
          baseBounty: fees.baseBountyAmount,
          contributorFee: fees.contributorFeeAmount,
          netPayout: fees.contributorPayout,
          currency: updatedBounty.currency,
        },
      });

    } catch (error: any) {
      log(`Error claiming community bounty: ${error.message}`, 'community-bounties-ERROR');

      if (error instanceof BusinessError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      res.status(500).json({
        error: 'Failed to claim bounty',
        details: error.message
      });
    }
  }
);
```

---

## ⏳ PENDING: Smart Contract Updates

### File: `contracts/CommunityBountyEscrow.sol`

**Update fee rates and payout logic:**

```solidity
// OLD (lines 48-49):
uint256 public constant platformFeeRate = 50;      // 0.5% (basis points)
uint256 public constant contributorFeeRate = 50;   // 0.5% (basis points)

// NEW:
uint256 public constant platformFeeRate = 250;     // 2.5% (basis points)
uint256 public constant contributorFeeRate = 250;  // 2.5% (basis points)
```

**Important:** The smart contract currently expects `amount` to be the BASE bounty amount, but with the new fee model, the contract should receive `total_paid_by_client` (base + client fee). This requires updating the `createBounty` function signature or adding a new parameter.

**Recommended Approach:**
```solidity
// Option A: Keep existing function, update backend to pass total_paid amount
function createBounty(..., uint256 amount, ...) external payable {
  // amount = base_bounty + client_fee (client pays this)
  // On payout:
  // - Contributor gets: amount * 0.975 (minus 2.5% contributor fee)
  // - Platform gets: amount * 0.025 (contributor fee) + previously collected client fee
}

// Option B: Add explicit fee parameter
function createBounty(..., uint256 baseBounty, uint256 clientFee, ...) external payable {
  uint256 totalAmount = baseBounty + clientFee;
  require(msg.value == totalAmount, "Incorrect payment amount");
  // Store both amounts separately
}
```

**Action Required:** Choose approach and update smart contract + blockchain service accordingly.

---

## ⏳ PENDING: Blockchain Service Updates

### File: `server/blockchain.ts`

**Update `createCommunityBountyWithXDC` to include fees:**

```typescript
async createCommunityBountyWithXDC(
  userId: number,
  baseBountyAmount: string, // NEW: explicitly base amount
  expiryTimestamp: number
): Promise<{ tx: any; bountyId: number }> {
  // Calculate fees
  const fees = storage.calculateBountyFees(parseFloat(baseBountyAmount));

  // User must pay: base + client fee
  const totalPayment = fees.totalPaidByClient;

  log(`Creating XDC community bounty: base=${baseBountyAmount}, client_fee=${fees.clientFeeAmount}, total=${totalPayment}`, 'blockchain');

  // Get user wallet
  const user = await storage.getUserById(userId);
  if (!user || !user.xdcPrivateKey) {
    throw new Error('User wallet not found');
  }

  const wallet = new ethers.Wallet(user.xdcPrivateKey, this.xdcProvider);
  const contract = new ethers.Contract(
    config.communityBountyEscrowAddress,
    CommunityBountyEscrowABI,
    wallet
  );

  // Call createBounty with TOTAL payment amount (base + client fee)
  // Smart contract stores this total and later deducts contributor fee on payout
  const tx = await contract.createBounty(
    totalPayment, // ← Changed: was baseBountyAmount, now includes client fee
    'XDC',
    expiryTimestamp,
    {
      value: ethers.parseEther(totalPayment.toString()),
      gasLimit: 300000,
    }
  );

  await tx.wait();

  // Get bounty ID from event
  const receipt = await tx.wait();
  const event = receipt.logs.find((log: any) => log.fragment?.name === 'BountyCreated');
  const bountyId = event?.args?.bountyId;

  log(`XDC community bounty created: ID=${bountyId}, TX=${tx.hash}`, 'blockchain');

  return { tx, bountyId };
}
```

**Similar updates needed for:**
- `createCommunityBountyWithROXN()`
- `createCommunityBountyWithUSDC()`

---

## ⏳ PENDING: Relayer Service Updates

### File: `server/communityBountyRelayer.ts`

**Update `processClaimedBounty` to record payout:**

```typescript
// After successful blockchain.completeCommunityBounty() call:

const result = await blockchain.completeCommunityBounty(
  bounty.blockchainBountyId!,
  contributor.xdcWalletAddress
);

log(`Bounty ${bountyId} completed on-chain. TX: ${result.txHash}, Block: ${result.blockNumber}`, 'relayer');

// Calculate fees for payout record
const fees = storage.calculateBountyFees(parseFloat(bounty.baseBountyAmount));

// NEW: Record payout in database
try {
  await storage.recordPayout({
    repositoryGithubId: bounty.githubRepoOwner + '/' + bounty.githubRepoName, // Or use actual repo ID
    issueNumber: bounty.githubIssueNumber,
    recipientUserId: contributor.id,
    recipientGithubUsername: bounty.claimedByGithubUsername!,
    recipientWalletAddress: contributor.xdcWalletAddress!,
    amount: fees.contributorPayout.toString(),
    currency: bounty.currency,
    baseBountyAmount: fees.baseBountyAmount.toString(),
    clientFeeAmount: fees.clientFeeAmount.toString(),
    contributorFeeAmount: fees.contributorFeeAmount.toString(),
    totalPlatformFee: fees.totalPlatformFee.toString(),
    txHash: result.txHash,
    blockNumber: result.blockNumber,
    gasUsed: null,
    payoutType: 'community',
    poolManagerAddress: null,
    communityBountyId: bountyId,
    metadata: {
      issueUrl: bounty.githubIssueUrl,
      prNumber: bounty.claimedPrNumber,
      prUrl: bounty.claimedPrUrl,
      verificationResult: verification,
    },
  });
} catch (error) {
  log(`Payout succeeded but DB record failed: ${error instanceof Error ? error.message : String(error)}`, 'relayer-ERROR');
}

// Existing code to update bounty status to 'completed'...
```

---

## ⏳ PENDING: Frontend Updates

### Files to Update:

1. **client/src/lib/community-bounties-api.ts**
   - Update `CommunityBounty` interface to include fee fields
   - Add fee breakdown to API responses

2. **client/src/pages/community-bounties-page.tsx**
   - Display "You Pay: X + fee" instead of just base amount
   - Show fee breakdown in bounty detail modal
   - Update estimated payout calculation

3. **Bot Comment Templates** (server/github.ts)
   - Update `/bounty` command response to show fees:
     ```
     Base Bounty: 100 USDC
     Platform Fee (2.5%): 2.50 USDC
     Total You Pay: 102.50 USDC

     Contributor Receives: 97.50 USDC (after 2.5% fee)
     ```

---

## Testing & Verification Plan

### Unit Tests Needed:

1. **Fee Calculation Tests:**
```typescript
describe('calculateBountyFees', () => {
  it('should calculate 5% total fees correctly', () => {
    const fees = storage.calculateBountyFees(100);
    expect(fees.clientFeeAmount).toBe(2.5);
    expect(fees.contributorFeeAmount).toBe(2.5);
    expect(fees.totalPlatformFee).toBe(5);
    expect(fees.totalPaidByClient).toBe(102.5);
    expect(fees.contributorPayout).toBe(97.5);
  });

  it('should handle small amounts correctly', () => {
    const fees = storage.calculateBountyFees(0.5);
    expect(fees.clientFeeAmount).toBe(0.0125);
    expect(fees.contributorFeeAmount).toBe(0.0125);
    expect(fees.totalPlatformFee).toBe(0.025);
  });
});
```

2. **Webhook Idempotency Tests:**
```typescript
describe('recordWebhookDelivery', () => {
  it('should return true for first delivery', async () => {
    const isFirst = await storage.recordWebhookDelivery('abc-123', 'issues', 'closed', '123', '456');
    expect(isFirst).toBe(true);
  });

  it('should return false for duplicate delivery', async () => {
    await storage.recordWebhookDelivery('abc-123', 'issues', 'closed', '123', '456');
    const isDuplicate = await storage.recordWebhookDelivery('abc-123', 'issues', 'closed', '123', '456');
    expect(isDuplicate).toBe(false);
  });
});
```

3. **Payout Idempotency Tests:**
```typescript
describe('recordPayout', () => {
  it('should prevent duplicate payouts', async () => {
    const payout = { /* ... */ };
    await storage.recordPayout(payout);

    await expect(storage.recordPayout(payout))
      .rejects.toThrow('Payout already recorded');
  });
});
```

4. **Atomic Claim Tests:**
```typescript
describe('claimCommunityBountyAtomic', () => {
  it('should prevent concurrent claims', async () => {
    // Create funded bounty
    const bounty = await createTestBounty({ status: 'funded' });

    // Attempt concurrent claims
    const claim1 = storage.claimCommunityBountyAtomic(bounty.id, 1, 'user1', 42, 'url1');
    const claim2 = storage.claimCommunityBountyAtomic(bounty.id, 2, 'user2', 43, 'url2');

    // Only one should succeed
    const results = await Promise.allSettled([claim1, claim2]);
    const succeeded = results.filter(r => r.status === 'fulfilled');
    expect(succeeded.length).toBe(1);
  });
});
```

### Manual Verification Steps:

1. **Webhook Idempotency:**
   ```bash
   # Send same delivery ID twice
   curl -X POST /webhook/github/app \
     -H "x-github-delivery: test-123" \
     -H "x-github-event: issues" \
     -d '{"action":"closed",...}'

   # Check logs - should see "Duplicate delivery ignored"
   # Check DB - only 1 row in webhook_deliveries
   ```

2. **Payout Idempotency:**
   ```bash
   # Trigger issue closed twice for same issue
   # Check logs - second attempt should skip with "Payout already exists"
   # Check DB - only 1 row in payouts table
   ```

3. **Fee Calculations:**
   ```bash
   # Create 100 USDC bounty
   # Verify client pays: 102.50 USDC
   # Verify contributor receives: 97.50 USDC
   # Verify platform collects: 5.00 USDC total
   ```

---

## Deployment Checklist

- [ ] Run migrations 0021, 0022, 0023
- [ ] Update shared/schema.ts
- [ ] Update server/storage.ts (all new methods)
- [ ] Update server/routes/webhookRoutes.ts (idempotency check)
- [ ] Update server/github.ts (payout idempotency)
- [ ] Update server/routes/communityBounties.ts (fees + atomic claim)
- [ ] Update server/blockchain.ts (fee calculations)
- [ ] Update contracts/CommunityBountyEscrow.sol (fee rates)
- [ ] Deploy updated smart contract
- [ ] Update frontend (API + UI)
- [ ] Update bot comment templates
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Manual verification (webhook, payout, claim)
- [ ] Update BOT_COMMANDS.md with new fee structure
- [ ] Monitor logs for first 24 hours

---

## Summary of Fixes

| Fix | Issue | Solution | Files |
|-----|-------|----------|-------|
| CRITICAL-1 | Webhook delivery idempotency | webhook_deliveries table + check | webhookRoutes.ts, storage.ts, migration |
| CRITICAL-2 | Payout idempotency | payouts table + existence check | github.ts, storage.ts, migration |
| CRITICAL-3 | Claim race condition | SELECT FOR UPDATE transaction | communityBounties.ts, storage.ts |
| HIGH-1 | Amount validation (>0) | Zod .refine() checks | schema.ts |
| FEE MODEL | 1% → 5% split fees | Fee columns + calculations | 3 migrations, 5 files |

**Total Impact:**
- ✅ Prevents double payouts (financial security)
- ✅ Prevents duplicate webhook processing (reliability)
- ✅ Prevents race condition claims (fairness)
- ✅ Enforces minimum amounts (spam prevention)
- ✅ Transparent fee structure (user trust)

**Estimated Implementation Time:** 4-6 hours
**Estimated Testing Time:** 2-3 hours
**Total:** 6-9 hours to full production readiness
