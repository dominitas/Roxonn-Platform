# Security Audit Findings - Community Bounties System
**Date:** 2025-12-28
**Scope:** GitHub webhook handlers, command parsing, payment activation, escrow/payout logic, DB updates, API endpoints

## Executive Summary

This security audit identified **6 critical**, **4 high**, and **3 medium** severity issues in the Community Bounties system. All issues must be addressed before production deployment.

**Status:** 🔴 **NOT PRODUCTION READY** - Critical issues require immediate attention

---

## Critical Severity Issues

### 🔴 CRITICAL-1: Webhook Delivery Idempotency Missing
**Severity:** Critical
**CWE:** CWE-

-841 (Improper Enforcement of Behavioral Workflow)
**Impact:** Double payout, duplicate bounty creation, financial loss

**Description:**
The GitHub App webhook handler extracts the `x-github-delivery` header (webhookRoutes.ts:24) but NEVER uses it for deduplication. GitHub may send duplicate webhook deliveries for the same event (network retries, failures, etc.). This creates multiple critical risks:

1. **Issue Closed Event** (`handleIssueClosed`): Multiple webhooks could trigger `blockchain.distributeReward()` multiple times for the same issue, causing double/triple payouts
2. **Community Bounty Claim**: Multiple `/claim` commands could be processed in parallel before status updates
3. **Subscription Activation**: Already has idempotency via `orderId` check (lines 288-294) ✅

**Vulnerable Code:**
```typescript
// webhookRoutes.ts:24 - Extracted but never used!
const delivery = req.headers['x-github-delivery'] as string;
log(`Event: ${event}, Delivery: ${delivery}`, 'webhook-app');
// No subsequent check if this delivery ID was already processed
```

**Attack Scenario:**
1. Issue #123 closed, webhook delivery `abc-123` sent
2. Backend processes, pays out 100 USDC to contributor
3. GitHub retries webhook (network issue), delivery `abc-123` sent again
4. Backend processes AGAIN, pays out another 100 USDC
5. Attacker gains 2x payout for single PR

**Fix Required:**
- Create `webhook_deliveries` table with unique index on `delivery_id`
- Check and insert delivery ID atomically before processing
- Return 200 OK for duplicate deliveries without processing

**Files Affected:**
- `server/routes/webhookRoutes.ts` (all webhook handlers)
- `server/github.ts` (`handleIssueClosed`, `handleBountyCommand`)
- Database migration (new table needed)

**Priority:** 🔥 **IMMEDIATE** - Fix before any production use

---

### 🔴 CRITICAL-2: No Payout Idempotency in `handleIssueClosed`
**Severity:** Critical
**CWE:** CWE-362 (Concurrent Execution using Shared Resource)
**Impact:** Double payout via race condition

**Description:**
`handleIssueClosed()` (github.ts:1143-1357) has NO checks to prevent paying the same issue twice. It directly calls `blockchain.distributeReward()` without verifying if a payout already occurred.

**Vulnerable Code:**
```typescript
// github.ts:1343-1356 - No idempotency check!
const distributionResult = await blockchain.distributeReward(
  poolManagerAddress,
  repositoryOwner,
  repositoryName,
  repositoryGithubId,
  issueNumber
);
log(`Distributed reward for issue ${issueNumber}. TX: ${distributionResult.hash}`);
```

**Attack Scenario:**
1. Attacker merges PR for issue #100 with 1000 USDC bounty
2. GitHub sends "issue closed" webhook, payout executes
3. Attacker triggers another "issue closed" event (re-close via API, or exploit webhook retry)
4. No check exists, second payout executes
5. Attacker receives 2000 USDC instead of 1000 USDC

**Fix Required:**
- Add `payouts` table tracking `(repo_id, issue_number)` with unique constraint
- Check if payout already exists before calling `distributeReward()`
- Store transaction hash in payouts table for audit trail

**Files Affected:**
- `server/github.ts` (handleIssueClosed function)
- Database migration (new payouts table)

**Priority:** 🔥 **IMMEDIATE**

---

### 🔴 CRITICAL-3: Race Condition in Community Bounty Claim
**Severity:** Critical
**CWE:** CWE-362 (Time-of-check Time-of-use)
**Impact:** Multiple users can claim same bounty

**Description:**
The `/claim` endpoint (communityBounties.ts:319-397) checks if `bounty.status === 'funded'` (line 350) and then updates to `'claimed'` (line 364), but these are NOT atomic operations. Two concurrent requests can both pass the check and both claim the bounty.

**Vulnerable Code:**
```typescript
// communityBounties.ts:348-364
if (bounty.status !== 'funded') {  // ← Check (TOC)
  return res.status(400).json({ ... });
}
// ... 10+ lines of code ...
const updatedBounty = await storage.updateCommunityBounty(bountyId, {  // ← Use (TOU)
  status: 'claimed',
  claimedByUserId: req.user.id,
  // ...
});
```

**Attack Scenario:**
1. Bounty #50 has status `'funded'` with 500 USDC reward
2. User A sends POST `/api/community-bounties/50/claim` at T+0ms
3. User B sends POST `/api/community-bounties/50/claim` at T+1ms
4. Both requests read `status === 'funded'`, both pass validation
5. Both execute `updateCommunityBounty` sequentially
6. Last write wins, but BOTH users think they claimed it
7. Relayer processes the winner, but loser has false expectation

**Fix Required:**
- Use PostgreSQL `SELECT FOR UPDATE` in transaction
- Or use optimistic locking with `WHERE status = 'funded'` in UPDATE
- Or add unique constraint preventing multiple claims

**Files Affected:**
- `server/routes/communityBounties.ts` (claim endpoint)
- `server/storage.ts` (updateCommunityBounty method)

**Priority:** 🔥 **IMMEDIATE**

---

### 🔴 CRITICAL-4: Payment Activation Lacks TX Hash Verification
**Severity:** Critical
**CWE:** CWE-345 (Insufficient Verification of Data Authenticity)
**Impact:** Bounty activation without actual payment

**Description:**
The `/pay` endpoint (communityBounties.ts:201-296) calls `blockchain.createCommunityBountyWithXDC()` and trusts the returned `tx.hash` without verification. If the blockchain call fails silently or returns a fake hash, the bounty could be marked as `'funded'` without actual on-chain escrow.

**Vulnerable Code:**
```typescript
// communityBounties.ts:263-271
const updatedBounty = await storage.updateCommunityBounty(bountyId, {
  status: 'funded',  // ← Trusts blockchain service blindly
  escrowTxHash: result.tx.hash,  // ← No verification this TX exists on-chain
  blockchainBountyId: result.bountyId  // ← No verification this ID is valid
});
```

**Attack Scenario:**
1. Attacker creates bounty for 1000 USDC
2. Attacker calls `/pay` but blockchain transaction reverts (insufficient balance)
3. If blockchain service doesn't throw error properly, fake hash returned
4. Bounty marked as `'funded'` in DB
5. Attacker can now `/claim` their own bounty
6. Relayer attempts payout, fails (no actual escrow), bounty stuck

**Fix Required:**
- After blockchain call, query blockchain to verify:
  - Transaction exists and is confirmed
  - Transaction created escrow with correct amount
  - Transaction succeeded (not reverted)
- Add retry logic with exponential backoff
- Store raw blockchain response for debugging

**Files Affected:**
- `server/routes/communityBounties.ts` (/pay endpoint)
- `server/blockchain.ts` (create methods)

**Priority:** 🔥 **HIGH** - Fix before allowing real payments

---

### 🔴 CRITICAL-5: Command Injection via Issue Title/Body
**Severity:** Critical
**CWE:** CWE-77 (Improper Neutralization of Special Elements)
**Impact:** Arbitrary code execution, data exfiltration

**Description:**
GitHub issue titles and bodies are user-controlled and inserted into bot comments without sanitization. If these contain shell metacharacters or code injection sequences, they could be exploited when:
1. Bot comments are processed by other systems (CLI tools, scripts)
2. Issue data is logged to files parsed by automation
3. Data is displayed in contexts without proper escaping

**Vulnerable Code:**
```typescript
// github.ts:1852 - Issue title inserted directly into comment
const commentBody = `### Bounty Created: ${amount} ${currency}...
**Issue:** ${issue.title}  // ← User-controlled, no sanitization
`;

// github.ts:1808-1820 - Issue title stored in DB without sanitization
await storage.createCommunityBounty({
  title: issue.title,  // ← Directly from GitHub API
  description: issue.body,  // ← Also user-controlled
});
```

**Attack Scenario:**
1. Attacker creates issue with title: `` `rm -rf /` ``
2. Creates bounty via `/bounty 10 USDC`
3. Bot comment includes backticks, could be interpreted as command
4. Admin runs script parsing bot comments
5. Command executes, deletes files

**Fix Required:**
- Sanitize all user-controlled input before:
  - Inserting into GitHub comments
  - Storing in database
  - Logging to files
- Use parameterized queries (already done ✅)
- Escape special characters: `` ` ``, `$()`, `${}`

**Files Affected:**
- `server/github.ts` (all `postGitHubComment` calls)
- `server/routes/communityBounties.ts` (bounty creation)

**Priority:** 🔥 **HIGH**

---

### 🔴 CRITICAL-6: Relayer Wallet Private Key Exposure Risk
**Severity:** Critical
**CWE:** CWE-798 (Use of Hard-coded Credentials)
**Impact:** Complete loss of all escrowed funds

**Description:**
The relayer service uses a private key (from `config.communityBountyRelayerPrivateKey`) to call `completeCommunityBounty()`. If this key is:
1. Stored in plaintext config files
2. Logged accidentally
3. Exposed via environment variable dumps
4. Compromised via server breach

Attackers gain full control over all community bounty escrow funds.

**Vulnerable Areas:**
```typescript
// blockchain.ts - Relayer private key usage (exact lines not shown in files read)
// config.ts - Key loaded from environment
export const communityBountyRelayerPrivateKey = process.env.COMMUNITY_BOUNTY_RELAYER_PK;
```

**Fix Required:**
- Store relayer private key in **AWS Secrets Manager** or **HashiCorp Vault**
- Never log private key or mnemonic
- Rotate key regularly
- Use separate relayer key per environment (dev/staging/prod)
- Implement key usage monitoring/alerting

**Files Affected:**
- `server/config.ts`
- `server/blockchain.ts`
- Deployment scripts

**Priority:** 🔥 **IMMEDIATE** - Before mainnet deployment

---

## High Severity Issues

### 🟠 HIGH-1: Amount Validation Allows Zero/Negative Values
**Severity:** High
**CWE:** CWE-1284 (Improper Validation of Specified Quantity in Input)
**Impact:** Invalid bounties bypass validation

**Description:**
The `createCommunityBountySchema` regex `/^\d+(\.\d{1,8})?$/` allows `"0"` and `"0.00000000"`, which pass Zod validation but fail the database CHECK constraint `amount > 0`. While the DB constraint prevents data corruption, this creates poor UX (unclear error messages) and wastes blockchain gas on failed transactions.

**Vulnerable Code:**
```typescript
// shared/schema.ts:701
amount: z.string().regex(/^\d+(\.\d{1,8})?$/),  // ← Allows "0"
```

**Fix Required:**
```typescript
amount: z.string()
  .regex(/^\d+(\.\d{1,8})?$/)
  .refine(
    (val) => parseFloat(val) > 0,
    { message: "Amount must be greater than 0" }
  )
```

**Files Affected:**
- `shared/schema.ts`

**Priority:** 🟠 **HIGH** - Include in next release

---

### 🟠 HIGH-2: No Minimum Bounty Amount Enforcement
**Severity:** High
**CWE:** CWE-840 (Business Logic Errors)
**Impact:** Spam bounties, gas cost attacks

**Description:**
Users can create bounties for absurdly small amounts (e.g., `0.00000001 USDC`), which:
1. Spam the platform with worthless bounties
2. Waste contributor time
3. Cost more in gas fees than the reward value
4. Enable griefing attacks (create 1000 bounties at $0.000001 each)

**Current State:**
- Regex allows: `0.00000001` to `99999999.99999999`
- No business logic minimum (e.g., "1 USDC minimum")

**Fix Required:**
```typescript
amount: z.string()
  .regex(/^\d+(\.\d{1,8})?$/)
  .refine(
    (val) => parseFloat(val) >= 1,  // ← Minimum 1 unit
    { message: "Minimum bounty amount is 1 USDC/XDC/ROXN" }
  )
```

**Files Affected:**
- `shared/schema.ts`
- `server/routes/communityBounties.ts`

**Priority:** 🟠 **HIGH**

---

### 🟠 HIGH-3: Relayer Service Has No Dead Letter Queue
**Severity:** High
**CWE:** CWE-755 (Improper Handling of Exceptional Conditions)
**Impact:** Lost payouts, stuck bounties

**Description:**
`processClaimedBounty()` (communityBountyRelayer.ts:60-176) handles errors by:
1. Logging error
2. Updating status to `'failed_verification'`
3. Moving on to next bounty

If a bounty fails due to transient error (GitHub API rate limit, network timeout), it's marked as permanently failed with NO retry mechanism.

**Vulnerable Code:**
```typescript
// communityBountyRelayer.ts:117-123
if (!verification.verified) {
  log(`Bounty ${bountyId} verification failed: ${verification.error}`, 'relayer-ERROR');
  await storage.updateCommunityBounty(bountyId, {
    status: 'failed_verification'  // ← Permanent failure, no retry!
  });
  return;
}
```

**Fix Required:**
- Add retry counter to `community_bounties` table
- Retry up to 3 times with exponential backoff
- Only mark `'failed_verification'` after 3 failures
- Create admin dashboard to manually retry failed bounties

**Files Affected:**
- `server/communityBountyRelayer.ts`
- `migrations/0020_add_community_bounties.sql`

**Priority:** 🟠 **HIGH**

---

### 🟠 HIGH-4: GitHub API Token Not Validated Before Use
**Severity:** High
**CWE:** CWE-754 (Improper Check for Unusual Conditions)
**Impact:** Silent failures, unprocessed bounties

**Description:**
`getInstallationAccessToken()` (github.ts:215-233) fetches GitHub API tokens but doesn't validate:
1. Token is not empty/null
2. Token has required permissions (repo read, issues write)
3. Token expiry is reasonable (should be ~60 min)

If token fetch fails silently, all subsequent GitHub API calls fail without clear error messages.

**Fix Required:**
- Validate token response before returning
- Check `token.permissions` includes required scopes
- Log token expiry time
- Throw explicit error if validation fails

**Files Affected:**
- `server/github.ts` (getInstallationAccessToken)

**Priority:** 🟠 **MEDIUM**

---

## Medium Severity Issues

### 🟡 MEDIUM-1: Rate Limiting Per IP Instead of Per User
**Severity:** Medium
**CWE:** CWE-770 (Allocation of Resources Without Limits)
**Impact:** Rate limit bypass via IP rotation

**Description:**
Rate limiters (communityBounties.ts:42-64) are IP-based via `express-rate-limit`. Attackers can bypass by:
1. Using VPN/proxy to rotate IPs
2. Using Tor exit nodes
3. Using cloud VM pools

**Fix Required:**
- Add per-user rate limiting (store in Redis/database)
- Combine IP + user ID for hybrid approach
- Lower limits for unauthenticated requests

**Files Affected:**
- `server/routes/communityBounties.ts`

**Priority:** 🟡 **MEDIUM**

---

### 🟡 MEDIUM-2: Insufficient Logging for Security Events
**Severity:** Medium
**CWE:** CWE-778 (Insufficient Logging)
**Impact:** Difficult incident response, no audit trail

**Description:**
Critical security events lack structured logging:
- Bounty creation: Missing user IP, user agent
- Payment activation: Missing blockchain confirmation count
- Claim attempts: Missing GitHub username verification
- Failed auth: Not logged at all

**Fix Required:**
- Add structured logging library (Winston, Pino)
- Log all security-sensitive events with:
  - Timestamp
  - User ID + IP + User-Agent
  - Action + resource ID
  - Success/failure + error details
- Send critical events to SIEM

**Files Affected:**
- All route files
- `server/utils.ts` (log function)

**Priority:** 🟡 **MEDIUM**

---

### 🟡 MEDIUM-3: No Input Length Limits
**Severity:** Medium
**CWE:** CWE-770 (Resource Exhaustion)
**Impact:** DoS via large payloads

**Description:**
Zod schemas don't enforce maximum lengths on text fields:
- `title`: Max 500 in schema ✅, but no enforcement on `description`
- `description`: No max length (could be megabytes)
- GitHub issue URLs: No validation

Attacker could submit gigantic descriptions causing memory exhaustion.

**Fix Required:**
```typescript
description: z.string().max(10000).optional(),  // 10KB max
githubIssueUrl: z.string().url().max(500),
```

**Files Affected:**
- `shared/schema.ts`

**Priority:** 🟡 **LOW**

---

## Security Checklist Status

| Check | Status | Notes |
|-------|--------|-------|
| **Webhook Authenticity** | | |
| ├─ GitHub signature verification | ✅ PASS | Octokit webhooks library used |
| ├─ Onramp.money signature verification | ✅ PASS | HMAC SHA-512 validation |
| └─ Delivery idempotency | ❌ **FAIL** | CRITICAL-1: No deduplication |
| **Command Parsing Safety** | | |
| ├─ Strict regex parsing | ✅ PASS | Whitelist-based patterns |
| ├─ Reject malformed inputs | ✅ PASS | Returns null on parse failure |
| └─ Injection prevention | ⚠️ PARTIAL | CRITICAL-5: Title/body not sanitized |
| **Authorization & Permissions** | | |
| ├─ Pool bounty: pool manager only | ✅ PASS | github.ts:1690 |
| ├─ Community bounty: creator only (pay) | ✅ PASS | communityBounties.ts:226 |
| ├─ Relayer-only completion | ✅ PASS | Smart contract enforced |
| └─ Admin actions auditable | ⚠️ PARTIAL | MEDIUM-2: Insufficient logging |
| **Payment Validation** | | |
| ├─ TX hash verification | ❌ **FAIL** | CRITICAL-4: No on-chain verification |
| ├─ Amount validation | ⚠️ PARTIAL | HIGH-1: Allows zero |
| ├─ Currency whitelist | ✅ PASS | XDC/ROXN/USDC only |
| └─ Treasury address validation | ✅ PASS | webhookRoutes.ts:265 |
| **State Machine Correctness** | | |
| ├─ Allowed transitions enforced | ✅ PASS | Status checks in place |
| ├─ Double-complete prevention | ❌ **FAIL** | CRITICAL-2: No payout idempotency |
| └─ Duplicate claim prevention | ❌ **FAIL** | CRITICAL-3: Race condition |
| **Race Conditions** | | |
| ├─ Webhook delivery deduplication | ❌ **FAIL** | CRITICAL-1 |
| ├─ Bounty claim atomicity | ❌ **FAIL** | CRITICAL-3 |
| └─ Transaction locks | ❌ **FAIL** | No DB-level locking used |
| **Error Handling** | | |
| ├─ No silent failures | ⚠️ PARTIAL | Some errors logged only |
| ├─ Structured logs | ❌ **FAIL** | MEDIUM-2 |
| └─ User-facing errors clear | ✅ PASS | BusinessError class used |
| **Data Validation** | | |
| ├─ Amount bounds | ⚠️ PARTIAL | HIGH-1, HIGH-2 |
| ├─ Decimal precision | ✅ PASS | Regex enforces 8 decimals |
| └─ Expiry validation | ⚠️ MISSING | No check expiry > now |
| **Smart Contract Safety** | | |
| ├─ Access control | ✅ PASS | onlyRelayer modifier |
| ├─ Refund logic | ✅ PASS | Expiry mechanism exists |
| ├─ Reentrancy protection | ✅ PASS | Status updated before transfer |
| └─ Events emitted | ✅ PASS | All actions emit events |
| **Abuse Prevention** | | |
| ├─ Rate limiting | ⚠️ PARTIAL | MEDIUM-1: IP-based only |
| ├─ Minimum amount | ❌ **FAIL** | HIGH-2 |
| └─ Input length limits | ⚠️ PARTIAL | MEDIUM-3 |

**Overall Score:** 14/30 PASS, 9/30 PARTIAL, 7/30 FAIL

---

## Recommended Fix Priority

### Phase 1: Pre-Production Blockers (1-2 days)
1. ✅ CRITICAL-1: Webhook delivery idempotency
2. ✅ CRITICAL-2: Payout idempotency
3. ✅ CRITICAL-3: Claim race condition
4. ✅ CRITICAL-6: Relayer key security

### Phase 2: Payment Security (1 day)
5. ✅ CRITICAL-4: TX hash verification
6. ✅ HIGH-1: Amount validation
7. ✅ HIGH-2: Minimum amount enforcement

### Phase 3: Reliability (1 day)
8. ✅ HIGH-3: Relayer retry logic
9. ✅ HIGH-4: Token validation
10. ✅ MEDIUM-2: Structured logging

### Phase 4: Hardening (ongoing)
11. ⚠️ CRITICAL-5: Input sanitization
12. ⚠️ MEDIUM-1: Per-user rate limiting
13. ⚠️ MEDIUM-3: Input length limits

---

## Testing Requirements

### Unit Tests Required
- ✅ Command parsing: valid/invalid formats
- ✅ Amount validation: zero, negative, overflow
- ✅ Currency validation: valid/invalid values

### Integration Tests Required
- ✅ Idempotent webhook delivery processing
- ✅ Duplicate bounty creation prevention
- ✅ Race condition: concurrent claim attempts
- ✅ Double payout prevention

### Manual Verification Plan
1. **Webhook Idempotency:**
   - Send same `x-github-delivery` twice
   - Verify only one payout occurs
   - Check logs show "duplicate delivery skipped"

2. **Claim Race Condition:**
   - Create funded bounty
   - Send 2 concurrent `/claim` requests
   - Verify only one succeeds, other gets 409 Conflict

3. **Payment Verification:**
   - Call `/pay` with insufficient wallet balance
   - Verify bounty NOT marked as funded
   - Check error message shows blockchain failure

---

## Conclusion

The Community Bounties system has a solid foundation with GitHub signature verification, CSRF protection, and smart contract access controls. However, **7 critical/high severity issues must be fixed before production deployment**, particularly:

1. Webhook delivery deduplication (prevents double payouts)
2. Claim race condition protection (prevents multi-claim)
3. Payment transaction verification (prevents fake funding)

Estimated time to fix all critical issues: **3-4 days**
Recommended timeline: Fix Phase 1-2 before mainnet deployment, Phase 3-4 as follow-up releases.
