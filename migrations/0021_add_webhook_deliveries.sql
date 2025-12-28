-- Migration: Add Webhook Deliveries Tracking
-- Description: Prevents duplicate webhook processing via delivery ID deduplication
-- Security: Fixes CRITICAL-1 - Webhook delivery idempotency missing

/*
 * WHY THIS TABLE:
 * - GitHub sends duplicate webhook deliveries for same event (network retries, failures)
 * - Without deduplication, same event could trigger double payouts or duplicate bounties
 * - This table tracks processed delivery IDs to ensure idempotent processing
 *
 * SECURITY IMPACT:
 * - Prevents double payouts when issue closed webhook is retried
 * - Prevents duplicate bounty claims from concurrent webhooks
 * - Provides audit trail of all webhook deliveries
 */

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  -- Primary key
  id SERIAL PRIMARY KEY,

  -- GitHub delivery ID (globally unique per webhook delivery)
  -- WHY: GitHub includes x-github-delivery header with unique ID per delivery
  delivery_id VARCHAR(255) NOT NULL UNIQUE,

  -- Event type
  event_type VARCHAR(50) NOT NULL,  -- 'issue_comment', 'issues', 'pull_request', etc.
  event_action VARCHAR(50),          -- 'created', 'closed', 'opened', etc.

  -- Repository info (for filtering/analytics)
  repository_id TEXT,                -- GitHub repository ID
  repository_name TEXT,              -- Full repo name (owner/repo)

  -- Installation ID (for GitHub App context)
  installation_id TEXT,

  -- Processing status
  status VARCHAR(20) NOT NULL DEFAULT 'processing',
  -- 'processing' - Currently being processed
  -- 'completed' - Successfully processed
  -- 'failed' - Processing failed
  -- 'ignored' - Event ignored (not relevant)

  -- Timestamps
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE,

  -- Error tracking
  error_message TEXT,

  -- Metadata (store full payload for debugging if needed)
  metadata JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT check_status CHECK (status IN ('processing', 'completed', 'failed', 'ignored'))
);

-- Indexes for performance
-- WHY: delivery_id is checked on every webhook request (hot path)
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_deliveries_delivery_id
  ON webhook_deliveries(delivery_id);

-- WHY: Useful for querying recent webhooks by event type
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event
  ON webhook_deliveries(event_type, event_action);

-- WHY: Useful for cleanup queries (delete old deliveries after 30 days)
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_received_at
  ON webhook_deliveries(received_at);

-- WHY: Filter failed deliveries for monitoring
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries(status)
  WHERE status IN ('failed', 'processing');

/*
 * USAGE PATTERN:
 *
 * 1. Webhook received with x-github-delivery: "abc-123-xyz"
 * 2. INSERT INTO webhook_deliveries (delivery_id, event_type, status) VALUES ('abc-123-xyz', 'issues', 'processing')
 *    ON CONFLICT (delivery_id) DO NOTHING RETURNING id
 * 3. If INSERT returns id: process webhook (first time seeing this delivery)
 * 4. If INSERT returns NULL: skip processing (duplicate delivery)
 * 5. After processing: UPDATE webhook_deliveries SET status='completed', processed_at=NOW() WHERE delivery_id='abc-123-xyz'
 *
 * This ensures atomic check-and-insert, preventing race conditions.
 */

/*
 * CLEANUP POLICY:
 * - Keep webhook deliveries for 30 days (audit trail)
 * - Run cleanup job weekly: DELETE FROM webhook_deliveries WHERE received_at < NOW() - INTERVAL '30 days'
 * - Rationale: GitHub doesn't retry after 24 hours, 30 days provides sufficient audit trail
 */
