/**
 * Community Bounties Explorer Page
 *
 * WHY THIS PAGE:
 * - Browse all active community bounties
 * - Filter by status, currency, repository
 * - Create new bounties (any authenticated user)
 * - Claim bounties by submitting PR
 *
 * FEATURES:
 * - Search and filter bounties
 * - View bounty details
 * - Create bounty modal
 * - Payment flow modal
 * - Claim bounty modal
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { communityBountiesAPI, type CommunityBounty } from "@/lib/community-bounties-api";
import { Plus, Search, Filter, GitBranch, Coins, Users, ExternalLink, Trophy, Wallet } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-yellow-500/20 text-yellow-500",
  funded: "bg-green-500/20 text-green-500",
  claimed: "bg-blue-500/20 text-blue-500",
  completed: "bg-purple-500/20 text-purple-500",
  refunded: "bg-gray-500/20 text-gray-500",
  expired: "bg-red-500/20 text-red-500",
  failed_verification: "bg-red-500/20 text-red-500",
};

const CURRENCY_ICONS: Record<string, string> = {
  XDC: "💎",
  ROXN: "🪙",
  USDC: "💵",
};

export default function CommunityBountiesPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("funded");
  const [currencyFilter, setCurrencyFilter] = useState<string>("");
  const [selectedBounty, setSelectedBounty] = useState<CommunityBounty | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["community-bounties", statusFilter, currencyFilter],
    queryFn: () =>
      communityBountiesAPI.getAll({
        status: statusFilter || undefined,
        currency: currencyFilter || undefined,
        limit: 50,
      }),
  });

  const filteredBounties = data?.bounties.filter((bounty) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      bounty.title.toLowerCase().includes(query) ||
      bounty.description?.toLowerCase().includes(query) ||
      bounty.githubRepoOwner.toLowerCase().includes(query) ||
      bounty.githubRepoName.toLowerCase().includes(query)
    );
  }) || [];

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Community Bounties</h1>
          <p className="text-muted-foreground">
            Permissionless bounties on any public GitHub repository
          </p>
        </div>
        {user && (
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Bounty
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bounties</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Available to claim</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredBounties.reduce((sum, b) => sum + parseFloat(b.amount || '0'), 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Across all currencies</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contributors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(filteredBounties.map(b => b.claimedByGithubUsername).filter(Boolean)).size}
            </div>
            <p className="text-xs text-muted-foreground">Active claimers</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search bounties, repos, or issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="funded">Funded</SelectItem>
              <SelectItem value="claimed">Claimed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending_payment">Pending Payment</SelectItem>
            </SelectContent>
          </Select>
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="w-[150px]">
              <Coins className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Currencies</SelectItem>
              <SelectItem value="XDC">XDC</SelectItem>
              <SelectItem value="ROXN">ROXN</SelectItem>
              <SelectItem value="USDC">USDC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bounties Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredBounties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No bounties found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery || statusFilter || currencyFilter
                ? "Try adjusting your filters"
                : "Be the first to create a community bounty!"}
            </p>
            {user && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Bounty
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBounties.map((bounty) => (
            <Card
              key={bounty.id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedBounty(bounty)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">{bounty.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <GitBranch className="h-3 w-3" />
                      <span className="text-xs">
                        {bounty.githubRepoOwner}/{bounty.githubRepoName} #{bounty.githubIssueNumber}
                      </span>
                    </CardDescription>
                  </div>
                  <Badge className={STATUS_COLORS[bounty.status]}>
                    {bounty.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bounty.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {bounty.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{CURRENCY_ICONS[bounty.currency]}</span>
                      <div>
                        <div className="text-lg font-bold">{bounty.amount} {bounty.currency}</div>
                        <div className="text-xs text-muted-foreground">Reward</div>
                      </div>
                    </div>
                    {bounty.claimedByGithubUsername && (
                      <div className="text-right">
                        <div className="text-sm font-medium">@{bounty.claimedByGithubUsername}</div>
                        <div className="text-xs text-muted-foreground">Claimer</div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>By @{bounty.createdByGithubUsername}</span>
                    <span>{format(new Date(bounty.createdAt), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bounty Detail Dialog */}
      {selectedBounty && (
        <Dialog open={!!selectedBounty} onOpenChange={() => setSelectedBounty(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-2xl mb-2">{selectedBounty.title}</DialogTitle>
                  <DialogDescription className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    <a
                      href={selectedBounty.githubIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      {selectedBounty.githubRepoOwner}/{selectedBounty.githubRepoName} #
                      {selectedBounty.githubIssueNumber}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </DialogDescription>
                </div>
                <Badge className={STATUS_COLORS[selectedBounty.status]}>
                  {selectedBounty.status.replace('_', ' ')}
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {selectedBounty.description && (
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedBounty.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Reward</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{CURRENCY_ICONS[selectedBounty.currency]}</span>
                    <div>
                      <div className="text-xl font-bold">
                        {selectedBounty.amount} {selectedBounty.currency}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Creator</h4>
                  <div className="text-sm">@{selectedBounty.createdByGithubUsername}</div>
                  <div className="text-xs text-muted-foreground">
                    Created {format(new Date(selectedBounty.createdAt), 'PPP')}
                  </div>
                </div>
              </div>

              {selectedBounty.claimedByGithubUsername && (
                <div>
                  <h4 className="font-semibold mb-2">Claimed By</h4>
                  <div className="text-sm">@{selectedBounty.claimedByGithubUsername}</div>
                  {selectedBounty.claimedPrUrl && (
                    <a
                      href={selectedBounty.claimedPrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                    >
                      PR #{selectedBounty.claimedPrNumber}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {selectedBounty.status === 'funded' && user && (
                <div className="pt-4 border-t">
                  <Button
                    className="w-full"
                    onClick={() => {
                      // TODO: Implement claim modal
                      toast({
                        title: "Claim Bounty",
                        description: "Submit a PR that closes this issue to claim the bounty.",
                      });
                    }}
                  >
                    <Trophy className="mr-2 h-4 w-4" />
                    Claim Bounty
                  </Button>
                </div>
              )}

              {selectedBounty.escrowTxHash && (
                <div className="text-xs text-muted-foreground">
                  <a
                    href={`https://explorer.xdc.org/tx/${selectedBounty.escrowTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    View escrow transaction
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Bounty Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Community Bounty</DialogTitle>
            <DialogDescription>
              Create a bounty on any public GitHub issue. You'll pay after reviewing the details.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Create bounty form coming soon...
            </p>
            <Button className="mt-4" onClick={() => setShowCreateDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
