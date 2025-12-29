/**
 * Community Bounties API Client
 *
 * WHY THIS FILE:
 * - Centralized API calls for community bounties
 * - Type-safe interfaces for all bounty operations
 * - Handles authentication and error responses
 *
 * ENDPOINTS:
 * - GET /api/community-bounties - List bounties
 * - GET /api/community-bounties/:id - Get single bounty
 * - POST /api/community-bounties - Create bounty
 * - POST /api/community-bounties/:id/pay - Pay for bounty
 * - POST /api/community-bounties/:id/claim - Claim bounty
 * - GET /api/community-bounties/leaderboard - Top contributors
 */

import csrfService from './csrf';

export interface CommunityBounty {
  id: number;
  githubRepoOwner: string;
  githubRepoName: string;
  githubIssueNumber: number;
  githubIssueId: string;
  githubIssueUrl: string;
  creatorUserId: number | null;
  createdByGithubUsername: string;
  title: string;
  description: string | null;
  amount: string;
  currency: 'XDC' | 'ROXN' | 'USDC';
  escrowTxHash: string | null;
  escrowBlockNumber: number | null;
  escrowDepositedAt: Date | null;
  blockchainBountyId: number | null;
  paymentMethod: string | null;
  paymentStatus: string;
  onrampTransactionId: number | null;
  status: 'pending_payment' | 'funded' | 'claimed' | 'completed' | 'refunded' | 'expired' | 'failed_verification';
  claimedByUserId: number | null;
  claimedByGithubUsername: string | null;
  claimedPrNumber: number | null;
  claimedPrUrl: string | null;
  claimedAt: Date | null;
  payoutTxHash: string | null;
  payoutExecutedAt: Date | null;
  payoutRecipientAddress: string | null;
  expiresAt: Date | null;
  refundTxHash: string | null;
  refundedAt: Date | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  blockchainBountyId: number | null;
}

export interface CreateCommunityBountyInput {
  githubRepoOwner: string;
  githubRepoName: string;
  githubIssueNumber: number;
  githubIssueId: string;
  githubIssueUrl: string;
  title: string;
  description?: string;
  amount: string;
  currency: 'XDC' | 'ROXN' | 'USDC';
  expiresAt?: Date;
}

export interface LeaderboardEntry {
  githubUsername: string;
  bountiesCompleted: number;
  currencies: {
    XDC: string;
    ROXN: string;
    USDC: string;
  };
}

class CommunityBountiesAPI {
  private baseURL = '/api/community-bounties';

  /**
   * Get all community bounties with optional filters
   */
  async getAll(params?: {
    status?: string;
    currency?: string;
    repo?: string;
    creator?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    bounties: CommunityBounty[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.currency) queryParams.set('currency', params.currency);
    if (params?.repo) queryParams.set('repo', params.repo);
    if (params?.creator) queryParams.set('creator', params.creator);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const response = await fetch(`${this.baseURL}?${queryParams.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch bounties: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get a single bounty by ID
   */
  async getById(id: number): Promise<{ bounty: CommunityBounty }> {
    const response = await fetch(`${this.baseURL}/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch bounty: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Create a new community bounty (DB record only, no payment yet)
   */
  async create(input: CreateCommunityBountyInput): Promise<{ bounty: CommunityBounty; message: string }> {
    const csrfHeaders = await csrfService.addTokenToHeaders({
      'Content-Type': 'application/json',
    });

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: csrfHeaders,
      credentials: 'include',
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create bounty');
    }

    return response.json();
  }

  /**
   * Pay for a bounty (creates blockchain escrow)
   */
  async pay(bountyId: number): Promise<{
    txHash: string;
    blockchainBountyId: number;
    status: string;
    bounty: CommunityBounty;
    message: string;
  }> {
    const csrfHeaders = await csrfService.addTokenToHeaders({
      'Content-Type': 'application/json',
    });

    const response = await fetch(`${this.baseURL}/${bountyId}/pay`, {
      method: 'POST',
      headers: csrfHeaders,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Failed to process payment');
    }

    return response.json();
  }

  /**
   * Claim a bounty by submitting PR
   */
  async claim(bountyId: number, prNumber: number, prUrl: string): Promise<{
    status: string;
    bounty: CommunityBounty;
    message: string;
  }> {
    const csrfHeaders = await csrfService.addTokenToHeaders({
      'Content-Type': 'application/json',
    });

    const response = await fetch(`${this.baseURL}/${bountyId}/claim`, {
      method: 'POST',
      headers: csrfHeaders,
      credentials: 'include',
      body: JSON.stringify({ prNumber, prUrl }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to claim bounty');
    }

    return response.json();
  }

  /**
   * Get leaderboard of top contributors
   */
  async getLeaderboard(limit: number = 10): Promise<{ leaderboard: LeaderboardEntry[] }> {
    const response = await fetch(`${this.baseURL}/leaderboard?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
    }
    return response.json();
  }
}

export const communityBountiesAPI = new CommunityBountiesAPI();
