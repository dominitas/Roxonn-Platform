import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { STAGING_API_URL } from "@/config";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  GitBranch,
  Coins,
  Lock,
  Globe,
  Filter,
  LayoutGrid,
  List,
  Zap,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Crown,
  Sparkles,
  ChevronRight,
  X,
  Activity,
} from "lucide-react";

interface Repository {
  id: number;
  githubRepoId: string;
  githubRepoFullName: string;
  registeredAt: string;
  isPrivate?: boolean;
  isActive?: boolean;
  xdcPoolRewards?: string;
  roxnPoolRewards?: string;
}

// Repository Card Component
function RepoCard({ repo, index }: { repo: Repository; index: number }) {
  const [owner, name] = repo.githubRepoFullName.split("/");
  const xdcRewards = parseFloat(repo.xdcPoolRewards || "0");
  const roxnRewards = parseFloat(repo.roxnPoolRewards || "0");
  const hasFunding = xdcRewards > 0 || roxnRewards > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link href={`/repos/${repo.githubRepoFullName}`}>
        <div className="group relative card-noir p-6 cursor-pointer card-hover">
          {/* Gradient Border on Hover */}
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-xl" />
          </div>

          {/* Top Bar */}
          <div className="flex items-start justify-between mb-4 relative">
            <div className="flex items-center gap-3">
              {/* Repo Icon */}
              <div className={`p-2.5 rounded-xl ${hasFunding ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <GitBranch className="w-5 h-5" />
              </div>

              {/* Status Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {repo.isPrivate ? (
                  <Badge variant="outline" className="bg-violet-500/10 text-violet-500 border-violet-500/30 text-xs">
                    <Lock className="w-3 h-3 mr-1" />
                    Private
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-xs">
                    <Globe className="w-3 h-3 mr-1" />
                    Public
                  </Badge>
                )}
                {hasFunding && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs">
                    <Coins className="w-3 h-3 mr-1" />
                    Funded
                  </Badge>
                )}
                {repo.isActive && (
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 text-xs animate-pulse">
                    <Activity className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
            </div>

            {/* Arrow Icon */}
            <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform group-hover:translate-x-1 group-hover:-translate-y-1">
              <ArrowUpRight className="w-5 h-5 text-primary" />
            </div>
          </div>

          {/* Repository Name */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground font-mono">{owner}</p>
            <h3 className="text-xl font-bold truncate group-hover:text-primary transition-colors">
              {name}
            </h3>
          </div>

          {/* Rewards Display */}
          <div className="flex items-center gap-3 mb-4">
            {xdcRewards > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <Zap className="w-4 h-4 text-cyan-500" />
                <span className="font-mono font-semibold text-cyan-500">
                  {xdcRewards.toFixed(2)} XDC
                </span>
              </div>
            )}
            {roxnRewards > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <Coins className="w-4 h-4 text-violet-500" />
                <span className="font-mono font-semibold text-violet-500">
                  {roxnRewards.toFixed(2)} ROXN
                </span>
              </div>
            )}
            {!hasFunding && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground">
                <Coins className="w-4 h-4" />
                <span className="text-sm">No active bounties</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Registered {formatDistanceToNow(new Date(repo.registeredAt))} ago</span>
            </div>
            <span className="font-mono opacity-0 group-hover:opacity-100 transition-opacity">
              View Details
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// Skeleton Card
function RepoCardSkeleton() {
  return (
    <div className="card-noir p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="w-20 h-5 rounded-full" />
        </div>
      </div>
      <Skeleton className="w-24 h-3 mb-2" />
      <Skeleton className="w-40 h-7 mb-4" />
      <Skeleton className="w-32 h-10 rounded-lg mb-4" />
      <Skeleton className="w-full h-3" />
    </div>
  );
}

// Filter Button Component
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function ReposExplorerPage() {
  const { user } = useAuth();
  const [showOnlyFunded, setShowOnlyFunded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Fetch subscription status
  const { data: subscriptionStatus } = useQuery({
    queryKey: ["/api/subscription/status"],
    queryFn: async () => {
      const response = await fetch(`${STAGING_API_URL}/api/subscription/status`, {
        credentials: "include",
      });
      if (!response.ok) return { active: false };
      return response.json();
    },
    enabled: !!user,
  });

  // Fetch repositories
  const { data, isLoading, error } = useQuery({
    queryKey: user ? ["/api/repositories/accessible"] : ["/api/repositories/public"],
    queryFn: async () => {
      const endpoint = user ? "/api/repositories/accessible" : "/api/repositories/public";
      const response = await fetch(`${STAGING_API_URL}${endpoint}`, {
        credentials: user ? "include" : "omit",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch repositories");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 2,
  });

  // Filter repositories
  const filteredRepos = (data?.repositories || []).filter((repo: Repository) => {
    // Apply funding filter
    if (showOnlyFunded) {
      const hasFunding =
        (repo.xdcPoolRewards && parseFloat(repo.xdcPoolRewards) > 0) ||
        (repo.roxnPoolRewards && parseFloat(repo.roxnPoolRewards) > 0);
      if (!hasFunding) return false;
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return repo.githubRepoFullName.toLowerCase().includes(query);
    }

    return true;
  });

  // Stats
  const totalRepos = data?.repositories?.length || 0;
  const fundedRepos = (data?.repositories || []).filter((repo: Repository) => {
    return (
      (repo.xdcPoolRewards && parseFloat(repo.xdcPoolRewards) > 0) ||
      (repo.roxnPoolRewards && parseFloat(repo.roxnPoolRewards) > 0)
    );
  }).length;

  const totalXdc = (data?.repositories || []).reduce((acc: number, repo: Repository) => {
    return acc + parseFloat(repo.xdcPoolRewards || "0");
  }, 0);

  return (
    <div className="min-h-screen bg-background noise-bg">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-4xl sm:text-5xl font-bold">
                  Explore <span className="gradient-text-cyan">Bounties</span>
                </h1>
                {subscriptionStatus?.active && (
                  <Badge className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-orange-600 border-orange-500/30">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                )}
              </div>
              <p className="text-lg text-muted-foreground">
                Find funded repositories and earn crypto for your contributions
              </p>
            </div>

            {/* Stats Badges */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border/50">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="font-mono font-semibold">{fundedRepos}</span>
                <span className="text-sm text-muted-foreground">Funded</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border/50">
                <Zap className="w-4 h-4 text-cyan-500" />
                <span className="font-mono font-semibold">{totalXdc.toFixed(0)}</span>
                <span className="text-sm text-muted-foreground">XDC Pool</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Premium Upsell Banner */}
        {!user && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 card-noir p-6 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-transparent to-cyan-500/10" />
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-violet-500/20">
                  <Crown className="w-6 h-6 text-violet-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg">Premium Membership</h3>
                    <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-xs">
                      Early Bird $10/year
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Access GitHub bounties ($100-$5000), courses, and earn while you learn
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/membership">
                  <Button className="btn-primary">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Get Premium
                  </Button>
                </Link>
                <Link href="/auth">
                  <Button variant="outline">Sign In</Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {/* Filters & Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8"
        >
          <div className="card-noir p-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background/50 border-border/50 h-12"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50">
                  <FilterButton
                    active={showOnlyFunded}
                    onClick={() => setShowOnlyFunded(true)}
                  >
                    <Coins className="w-4 h-4 inline mr-2" />
                    Funded
                  </FilterButton>
                  <FilterButton
                    active={!showOnlyFunded}
                    onClick={() => setShowOnlyFunded(false)}
                  >
                    All Repos
                  </FilterButton>
                </div>

                {/* View Toggle */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 ml-2">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded transition-colors ${
                      viewMode === "grid"
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2 rounded transition-colors ${
                      viewMode === "list"
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Results Count */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mb-6 flex items-center justify-between"
        >
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-semibold text-foreground">{filteredRepos.length}</span>{" "}
            {showOnlyFunded ? "funded " : ""}
            {filteredRepos.length === 1 ? "repository" : "repositories"}
            {searchQuery && (
              <span>
                {" "}
                matching "<span className="text-primary">{searchQuery}</span>"
              </span>
            )}
          </p>
          {user?.role === "poolmanager" && (
            <Link href="/my-repos">
              <Button variant="outline" size="sm">
                <GitBranch className="w-4 h-4 mr-2" />
                Manage My Repos
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </motion.div>

        {/* Repository Grid/List */}
        {isLoading ? (
          <div
            className={`grid gap-6 ${
              viewMode === "grid"
                ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                : "grid-cols-1"
            }`}
          >
            {[...Array(6)].map((_, i) => (
              <RepoCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="card-noir p-12 text-center">
            <div className="text-destructive mb-4">
              <X className="w-12 h-12 mx-auto" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Error Loading Repositories</h3>
            <p className="text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </p>
          </div>
        ) : filteredRepos.length === 0 ? (
          <div className="card-noir p-12 text-center">
            <div className="text-muted-foreground mb-4">
              <GitBranch className="w-12 h-12 mx-auto opacity-50" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Repositories Found</h3>
            <p className="text-muted-foreground mb-4">
              {showOnlyFunded
                ? "No repositories with active bounties found."
                : "No repositories match your search."}
            </p>
            {showOnlyFunded && (
              <Button variant="outline" onClick={() => setShowOnlyFunded(false)}>
                Show All Repositories
              </Button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div
              className={`grid gap-6 ${
                viewMode === "grid"
                  ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                  : "grid-cols-1"
              }`}
            >
              {filteredRepos.map((repo: Repository, index: number) => (
                <RepoCard key={repo.id} repo={repo} index={index} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
