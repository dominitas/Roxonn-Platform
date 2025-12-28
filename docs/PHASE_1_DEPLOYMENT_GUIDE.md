# Phase 1 Deployment Guide
**Date:** 2025-12-28
**Branch:** `feature-fix-Security`
**Commits:** 601d69d, f236a49, 5585bdd

---

## Pre-Deployment Checklist

- [ ] All commits pushed to `feature-fix-Security` branch
- [ ] Code review completed (or approved for direct deploy)
- [ ] Database backup completed
- [ ] Maintenance window scheduled (optional - no downtime expected)

---

## Deployment Steps

### Step 1: Merge to Main/Production Branch

```bash
# On your local machine
git checkout main  # or your production branch name
git pull origin main
git merge feature-fix-Security
git push origin main
```

**Or create Pull Request:**
- Go to GitHub: https://github.com/dominitas/Roxonn-Platform
- Create PR from `feature-fix-Security` → `main`
- Use the PR description I provided earlier
- Merge when ready

---

### Step 2: Deploy Backend Code

**Option A: PM2 Deployment**
```bash
# SSH into your server
ssh user@your-server.com

# Navigate to app directory
cd /path/to/Roxonn-Platform

# Pull latest code
git pull origin main

# Install any new dependencies (none in Phase 1, but safe to run)
npm install

# Restart backend
pm2 restart all

# Check logs
pm2 logs --lines 100
```

**Option B: Docker Deployment**
```bash
# Rebuild and restart containers
docker-compose down
docker-compose up -d --build

# Check logs
docker-compose logs -f server
```

---

### Step 3: Run Database Migrations

**Important:** Migrations run automatically when the server starts (if your setup uses auto-migration). If not, run manually:

```bash
# Option A: Using Drizzle Kit (if configured)
npx drizzle-kit push

# Option B: Manual SQL execution
psql -h your-db-host -U your-db-user -d your-db-name

# Then run each migration in order:
\i migrations/0021_add_webhook_deliveries.sql
\i migrations/0022_add_payouts.sql
\i migrations/0023_update_community_bounties_fee_model.sql

# Verify tables were created
\dt webhook_deliveries
\dt payouts
\d community_bounties  -- Should show new fee columns

# Exit psql
\q
```

---

### Step 4: Verify Deployment

#### 4.1 Check Tables Created

```sql
-- Connect to database
psql -h your-db-host -U your-db-user -d your-db-name

-- Verify webhook_deliveries table
SELECT COUNT(*) FROM webhook_deliveries;
-- Expected: 0 (new table, no data yet)

-- Verify payouts table
SELECT COUNT(*) FROM payouts;
-- Expected: 0 (new table, no data yet)

-- Verify community_bounties has new fee columns
SELECT
  id,
  amount,
  base_bounty_amount,
  client_fee_amount,
  contributor_fee_amount,
  total_platform_fee,
  total_paid_by_client
FROM community_bounties
LIMIT 1;
-- Expected: All fee columns should exist and have values
-- Old bounties should have fees calculated (from migration backfill)
```

#### 4.2 Check Backend Logs

```bash
# PM2 logs
pm2 logs --lines 50 | grep -i "error\|migration\|webhook\|bounty"

# Docker logs
docker-compose logs server --tail 50 | grep -i "error\|migration"

# Expected: No errors, should see successful startup
```

#### 4.3 Test API Endpoints (Existing Functionality)

```bash
# Test GET bounties (should still work)
curl https://your-domain.com/api/community-bounties

# Expected: Returns bounty list with new fee fields

# Test GET single bounty
curl https://your-domain.com/api/community-bounties/1

# Expected: Returns bounty with fee breakdown
```

#### 4.4 Verify Schema Validation

```bash
# Try creating bounty with amount = 0 (should fail)
curl -X POST https://your-domain.com/api/community-bounties \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "githubRepoOwner": "test",
    "githubRepoName": "repo",
    "githubIssueNumber": 1,
    "githubIssueId": "123",
    "githubIssueUrl": "https://github.com/test/repo/issues/1",
    "title": "Test",
    "amount": "0",
    "currency": "USDC"
  }'

# Expected: Error "Amount must be greater than 0"

# Try creating bounty with amount < 1 (should fail)
curl -X POST https://your-domain.com/api/community-bounties \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    ...
    "amount": "0.5",
    ...
  }'

# Expected: Error "Minimum bounty amount is 1 USDC/XDC/ROXN"
```

---

### Step 5: Monitor for Issues

**Watch for 1-2 hours after deployment:**

```bash
# Continuous log monitoring
pm2 logs --lines 100 --follow

# Or with Docker
docker-compose logs -f server

# Watch for:
# ✅ No errors in logs
# ✅ Webhook deliveries being recorded (if webhooks arrive)
# ✅ Database queries succeeding
# ❌ Any "column does not exist" errors (would indicate migration didn't run)
# ❌ Any "constraint violation" errors
```

**Check key metrics:**
- API response times (should be unchanged)
- Database connection pool (should be stable)
- Memory usage (should be stable)
- CPU usage (should be stable)

---

## Rollback Plan (If Needed)

If critical issues arise, rollback is simple because **Phase 1 only adds data, doesn't modify existing functionality**:

### Option 1: Code Rollback (Keeps New Tables)
```bash
# Revert to previous commit
git revert HEAD~3..HEAD  # Reverts last 3 commits
git push origin main

# Restart server
pm2 restart all

# New tables remain but aren't used - safe to keep
```

### Option 2: Full Rollback (Remove New Tables)
```bash
# Code rollback (as above)
# Then remove new tables:
psql -h your-db-host -U your-db-user -d your-db-name

DROP TABLE IF EXISTS webhook_deliveries CASCADE;
DROP TABLE IF EXISTS payouts CASCADE;

-- Revert community_bounties fee columns
ALTER TABLE community_bounties
  DROP COLUMN IF EXISTS base_bounty_amount,
  DROP COLUMN IF EXISTS client_fee_amount,
  DROP COLUMN IF EXISTS contributor_fee_amount,
  DROP COLUMN IF EXISTS total_platform_fee,
  DROP COLUMN IF EXISTS total_paid_by_client;
```

**Rollback Risk:** ⚠️ If any payouts or webhook deliveries were recorded, DROP TABLE loses that data. Recommend Option 1 (keep tables) unless absolutely necessary.

---

## Post-Deployment Validation

### Test Checklist (30 minutes after deployment)

- [ ] **Existing Bounties Displayed Correctly**
  - Visit: https://your-domain.com/community-bounties
  - Verify bounty list loads
  - Check fee fields show correctly (if UI updated)

- [ ] **Create Bounty Works**
  - Create test bounty via UI or bot command
  - Verify amount validation (try 0, try 0.5, try 100)
  - Check fee calculation correct

- [ ] **Claim Bounty Works**
  - Try claiming existing funded bounty
  - Should work as before (atomic claim not yet implemented)

- [ ] **Webhook Processing Works**
  - Trigger test webhook (create issue comment)
  - Check `webhook_deliveries` table has new row
  - Verify duplicate delivery ignored (send same webhook twice)

- [ ] **No Regressions**
  - Pool bounties still work
  - User registration still works
  - Wallet creation still works

---

## Known Limitations (Until Phase 2)

**What Phase 1 Does NOT Fix:**
- ❌ Webhook duplicate processing (table exists, but code doesn't use it yet)
- ❌ Payout duplicate prevention (table exists, but code doesn't check it yet)
- ❌ Claim race condition (table exists, but code doesn't use atomic method yet)

**What Phase 1 DOES Fix:**
- ✅ Amount validation (0 and <1 blocked immediately)
- ✅ Fee structure ready (tables + columns exist)
- ✅ Database schema ready for Phase 2 code

**Action Items:**
- Phase 1 can run in production safely
- Phase 2 code implementation should follow within 1-2 weeks
- Until Phase 2, existing security risks remain (double payout possible)
- **Recommendation:** Deploy Phase 1 to staging first, then production after 24-hour soak test

---

## Timeline Recommendation

**Deployment Strategy:**

**Option A (Conservative - Recommended):**
1. **Today:** Deploy Phase 1 to staging
2. **Today + 24h:** Monitor staging, test all flows
3. **Today + 48h:** Deploy Phase 1 to production
4. **Today + 72h:** Begin Phase 2 implementation
5. **Today + 1 week:** Deploy Phase 2 to staging
6. **Today + 1.5 weeks:** Deploy Phase 2 to production

**Option B (Aggressive - If Low Traffic):**
1. **Today:** Deploy Phase 1 to production
2. **Today + 1h:** Monitor logs, verify no issues
3. **Tomorrow:** Begin Phase 2 implementation
4. **Today + 3 days:** Deploy Phase 2 to production

**Option C (Safest - If High Stakes):**
1. **Today:** Deploy Phase 1 to staging
2. **Today + 1 week:** Extensive staging testing
3. **Today + 1 week:** Complete Phase 2 implementation
4. **Today + 1 week:** Deploy Phase 1 + Phase 2 together to production

---

## Support Contacts

**If Issues Arise:**
- Technical Issues: [your-team-slack-channel]
- Database Issues: [your-dba-contact]
- Emergency Rollback: [on-call-engineer]

**Escalation Path:**
1. Check logs first (see Step 5)
2. Review rollback plan (see Rollback section)
3. Contact on-call if user-facing errors occur
4. Database backup available at: [backup-location]

---

## Success Criteria

**Phase 1 Deployment Successful When:**
- ✅ All 3 migrations completed without errors
- ✅ Backend starts successfully
- ✅ API endpoints return 200 OK
- ✅ New tables visible in database
- ✅ Fee columns populated for existing bounties
- ✅ Amount validation rejects 0 and <1
- ✅ No errors in logs for 2 hours
- ✅ Existing functionality unchanged

**Phase 1 Deployment Failed If:**
- ❌ Migrations error out
- ❌ Backend fails to start
- ❌ API returns 500 errors
- ❌ Users report broken functionality
- ❌ "Column does not exist" errors in logs

---

## Next Steps After Successful Deploy

Once Phase 1 is stable:

1. **Monitor for 24-48 hours**
2. **Proceed with Phase 2 implementation** (use docs/SECURITY_FIXES_IMPLEMENTATION.md)
3. **Update BOT_COMMANDS.md** with fee structure (once Phase 2 live)
4. **Announce new fee model** to users (via blog post, Discord, etc.)
5. **Schedule Phase 2 deployment** (estimated 1-2 weeks after Phase 1)

---

**Questions or Issues?**
Refer to:
- **Implementation Plan:** docs/SECURITY_FIXES_IMPLEMENTATION.md
- **Security Audit:** docs/SECURITY_AUDIT_FINDINGS.md
- **Bot Commands:** docs/BOT_COMMANDS.md

**Good luck with deployment! 🚀**
