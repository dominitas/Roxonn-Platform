-- Migration: Add bounty_attempts and issue_comments tables
-- Description: Tracks who is working on bounties and stores welcome comment IDs for updates
-- Purpose:
--   1. bounty_attempts: Track developers who signal intent to work on a bounty
--   2. issue_comments: Store welcome comment IDs to update attempt tracker table

/*
 * BOUNTY ATTEMPTS TABLE
 *
 * WHY THIS TABLE:
 * - Track developers who use /attempt command to signal they're working on an issue
 * - Display "Who's Working on This?" section in GitHub comments
 * - Help prevent duplicate work by showing active attempts
 * - Track attempt status (active, completed, abandoned)
 *
 * RELATIONSHIPS:
 * - Links to community_bounties (bounty_id) - optional, as attempts can exist before bounty
 * - Links to users (user_id) - required for registered users
 */
CREATE TABLE IF NOT EXISTS bounty_attempts (
  id SERIAL PRIMARY KEY,

  -- Bounty reference (nullable - attempts can exist before bounty is created)
  bounty_id INTEGER REFERENCES community_bounties(id) ON DELETE CASCADE,

  -- User reference (nullable - for unregistered users we store github_username only)
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- GitHub identifiers (stored separately for display even if user is deleted)
  github_username TEXT NOT NULL,
  github_repo_owner TEXT NOT NULL,
  github_repo_name TEXT NOT NULL,
  github_issue_number INTEGER NOT NULL,

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Status: active (working), completed (PR merged), abandoned (gave up/inactive)
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),

  -- PR tracking (set when PR is created/merged)
  pr_number INTEGER,
  pr_url TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for fast lookups by bounty
CREATE INDEX IF NOT EXISTS idx_bounty_attempts_bounty_id
  ON bounty_attempts(bounty_id)
  WHERE bounty_id IS NOT NULL;

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_bounty_attempts_user_id
  ON bounty_attempts(user_id)
  WHERE user_id IS NOT NULL;

-- Index for looking up attempts by issue
CREATE INDEX IF NOT EXISTS idx_bounty_attempts_issue
  ON bounty_attempts(github_repo_owner, github_repo_name, github_issue_number);

-- Index for active attempts
CREATE INDEX IF NOT EXISTS idx_bounty_attempts_status_active
  ON bounty_attempts(status)
  WHERE status = 'active';

-- Unique constraint: one active attempt per user per issue
CREATE UNIQUE INDEX IF NOT EXISTS idx_bounty_attempts_unique_active
  ON bounty_attempts(github_username, github_repo_owner, github_repo_name, github_issue_number)
  WHERE status = 'active';

-- Add comment for documentation
COMMENT ON TABLE bounty_attempts IS 'Tracks developers who signal intent to work on bounties via /attempt command';
COMMENT ON COLUMN bounty_attempts.status IS 'active = working on it, completed = PR merged, abandoned = gave up';

/*
 * ISSUE COMMENTS TABLE
 *
 * WHY THIS TABLE:
 * - Store GitHub comment IDs for welcome comments posted by the bot
 * - Allow updating the "Who's Working on This?" table in welcome comments
 * - Track different comment types (welcome, status, etc.)
 *
 * WORKFLOW:
 * 1. Bot posts welcome comment on issue.opened event
 * 2. Comment ID is stored in this table
 * 3. When /attempt is used, welcome comment is updated with attempt info
 * 4. When bounty status changes, welcome comment can be updated
 */
CREATE TABLE IF NOT EXISTS issue_comments (
  id SERIAL PRIMARY KEY,

  -- GitHub identifiers
  github_repo_owner TEXT NOT NULL,
  github_repo_name TEXT NOT NULL,
  github_issue_number INTEGER NOT NULL,

  -- GitHub comment reference
  github_comment_id BIGINT NOT NULL,

  -- Comment type for different bot comments
  -- 'welcome': Initial welcome comment with attempt tracker
  -- 'status': Bounty status update comment
  -- 'payout': Payout confirmation comment
  comment_type TEXT NOT NULL CHECK (comment_type IN ('welcome', 'status', 'payout')),

  -- Installation ID for GitHub API calls
  installation_id TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for finding welcome comment by issue
CREATE INDEX IF NOT EXISTS idx_issue_comments_issue
  ON issue_comments(github_repo_owner, github_repo_name, github_issue_number);

-- Index for finding comments by type
CREATE INDEX IF NOT EXISTS idx_issue_comments_type
  ON issue_comments(comment_type);

-- Unique constraint: one comment per type per issue
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_comments_unique_type
  ON issue_comments(github_repo_owner, github_repo_name, github_issue_number, comment_type);

-- Add comment for documentation
COMMENT ON TABLE issue_comments IS 'Stores GitHub comment IDs for bot comments to allow updates';
COMMENT ON COLUMN issue_comments.github_comment_id IS 'GitHub API comment ID used for updating comments';
COMMENT ON COLUMN issue_comments.comment_type IS 'welcome = initial comment with instructions, status = bounty status, payout = payment confirmation';
