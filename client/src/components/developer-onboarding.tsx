import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useAuth } from '@/hooks/use-auth';
import {
  Wallet,
  Github,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Zap,
  Code2,
  DollarSign,
  Search,
  Terminal,
  HelpCircle,
  MessageSquare
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Create a function to manually show the developer onboarding
export const showDeveloperOnboarding = () => {
  localStorage.setItem('roxonn-onboarding-hasSeenDeveloperOnboarding', 'false');
  window.dispatchEvent(new Event('storage'));
};

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 1, title: 'Welcome', description: 'Learn how to earn bounties' },
  { id: 2, title: 'How It Works', description: 'Understand the bounty lifecycle' },
  { id: 3, title: 'Set Up Wallet', description: 'Get ready to receive payments' },
  { id: 4, title: 'Commands', description: 'Learn the GitHub commands' },
  { id: 5, title: 'Complete', description: 'Start earning!' },
];

export function DeveloperOnboarding() {
  const { hasSeenGuide, setHasSeen } = useOnboarding('hasSeenDeveloperOnboarding', false);
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const { user } = useAuth();

  // Only show for contributors (developers)
  const isDeveloper = user?.role === "contributor";

  // Check if user has wallet
  const hasWallet = !!user?.xdcWalletAddress;

  const handleClose = () => {
    setIsOpen(false);
    setHasSeen(true);
  };

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleClose();
  };

  // Initialization and open/close logic
  useEffect(() => {
    setIsInitialized(true);
    const handleStorageChange = () => {
      const value = localStorage.getItem('roxonn-onboarding-hasSeenDeveloperOnboarding');
      if (value === 'false') {
        setCurrentStep(1);
        setIsOpen(true);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Check if we should show the dialog
  useEffect(() => {
    if (isInitialized && !hasSeenGuide && isDeveloper) {
      setIsOpen(true);
    }
  }, [hasSeenGuide, isInitialized, isDeveloper]);

  // Only render when initialized and for developers
  if (!isInitialized || !isDeveloper) {
    return null;
  }

  const progressPercent = ((currentStep - 1) / (ONBOARDING_STEPS.length - 1)) * 100;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) setHasSeen(true);
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Progress indicator */}
        <div className="mb-4">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            {ONBOARDING_STEPS.map((step) => (
              <span
                key={step.id}
                className={currentStep >= step.id ? 'text-primary font-medium' : ''}
              >
                {step.title}
              </span>
            ))}
          </div>
        </div>

        {/* Step 1: Welcome */}
        {currentStep === 1 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <span className="text-4xl">💰</span>
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">Welcome, Developer!</DialogTitle>
              <DialogDescription className="text-center">
                Start earning crypto by solving GitHub issues
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="bg-green-50 dark:bg-green-950/50 p-6 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="font-semibold mb-4 text-green-800 dark:text-green-300">As a developer, you can:</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Browse open bounties across GitHub</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Work on issues that match your skills</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Get paid automatically when your PR merges</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Build your reputation on the leaderboard</span>
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-6 text-center">
                <div className="p-4">
                  <div className="text-3xl font-bold text-primary">5%</div>
                  <div className="text-xs text-muted-foreground">Only 2.5% from you</div>
                </div>
                <div className="p-4">
                  <div className="text-3xl font-bold text-primary flex items-center justify-center gap-1">
                    <Zap className="h-6 w-6" /> 60s
                  </div>
                  <div className="text-xs text-muted-foreground">Auto-payout on merge</div>
                </div>
                <div className="p-4">
                  <div className="text-3xl font-bold text-primary">3</div>
                  <div className="text-xs text-muted-foreground">Currencies supported</div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="ghost" onClick={handleSkip}>
                Skip Tutorial
              </Button>
              <Button onClick={handleNext}>
                Let's Go! <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: How It Works */}
        {currentStep === 2 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Code2 className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">How to Earn Bounties</DialogTitle>
            </DialogHeader>

            <div className="py-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Search className="h-4 w-4" /> Find a bounty
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Browse <a href="/explore" className="text-primary underline">active bounties</a> or look for the Roxonn bot comment on GitHub issues
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Terminal className="h-4 w-4" /> Signal your intent (optional)
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Comment <code className="bg-muted px-2 py-0.5 rounded">/attempt</code> to let others know you're working on it
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Github className="h-4 w-4" /> Submit your solution
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Create a PR with <code className="bg-muted px-2 py-0.5 rounded">fixes #[issue-number]</code> in the description
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <DollarSign className="h-4 w-4" /> Get paid automatically!
                      <Zap className="h-4 w-4 text-yellow-500" />
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      When your PR is merged, payment is sent to your wallet within 60 seconds
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/50 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm">
                  <span className="font-semibold">Important:</span> First merged PR wins the bounty!
                  <br />
                  Check who else is working on an issue before starting.
                </p>
              </div>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleNext}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Set Up Wallet */}
        {currentStep === 3 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">Set Up Your Wallet</DialogTitle>
              <DialogDescription className="text-center">
                You need an XDC wallet to receive bounty payments
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              {hasWallet ? (
                <div className="bg-green-50 dark:bg-green-950/50 p-6 rounded-lg border border-green-200 dark:border-green-800 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Wallet Connected!</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your wallet is ready to receive bounty payments.
                  </p>
                  <code className="bg-white dark:bg-gray-800 px-4 py-2 rounded text-sm">
                    {user?.xdcWalletAddress?.slice(0, 10)}...{user?.xdcWalletAddress?.slice(-8)}
                  </code>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-900 border-2 border-purple-200 dark:border-purple-800 rounded-lg p-6 mb-6">
                    <h3 className="font-semibold mb-4">Two Options:</h3>

                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg">
                        <h4 className="font-semibold mb-2">Option 1: Create a Roxonn Wallet (Easiest)</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          We'll create and manage a wallet for you. No crypto experience needed!
                        </p>
                        <a
                          href="/settings/wallet"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                        >
                          <Wallet className="h-4 w-4" />
                          Create Wallet
                        </a>
                      </div>

                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h4 className="font-semibold mb-2">Option 2: Connect External Wallet</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Connect your existing XDC wallet (XDCPay, MetaMask, etc.)
                        </p>
                        <a
                          href="/settings/wallet"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Connect Wallet
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-950/50 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm">
                      <span className="font-semibold">Don't have a wallet yet?</span><br />
                      No problem! We can create one for you. You can always export the keys later.
                    </p>
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <div className="flex gap-2">
                {!hasWallet && (
                  <Button variant="ghost" onClick={handleNext}>
                    I'll do this later
                  </Button>
                )}
                <Button onClick={handleNext}>
                  {hasWallet ? 'Continue' : 'Next'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* Step 4: Commands Reference */}
        {currentStep === 4 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Terminal className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">GitHub Commands</DialogTitle>
              <DialogDescription className="text-center">
                Commands you can use in GitHub issue comments
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-primary font-mono font-semibold">/attempt</code>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">Developer</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Signal that you're working on this issue. Helps prevent duplicate work.
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-primary font-mono font-semibold">@roxonn status</code>
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">Anyone</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Check the bounty status for this issue (amount, who's working on it, etc.)
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-primary font-mono font-semibold">/bounty &lt;amount&gt; &lt;currency&gt;</code>
                    <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-1 rounded">Client</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create a bounty (e.g., <code className="bg-muted px-1 rounded">/bounty 100 USDC</code>). Anyone can fund a bounty!
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold mb-2">PR Description Tip</h4>
                <p className="text-sm text-muted-foreground">
                  Always include <code className="bg-white dark:bg-gray-800 px-2 py-0.5 rounded">fixes #123</code> or <code className="bg-white dark:bg-gray-800 px-2 py-0.5 rounded">closes #123</code> in your PR description.
                  This links the PR to the issue and triggers auto-payout on merge!
                </p>
              </div>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleNext}>
                Done - Let's Finish! <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 5: Complete */}
        {currentStep === 5 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                  <span className="text-4xl">🎉</span>
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">You're Ready to Earn!</DialogTitle>
              <DialogDescription className="text-center">
                Start browsing bounties and building your reputation
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <a
                  href="/explore"
                  className="bg-green-50 dark:bg-green-950/50 p-4 rounded-lg text-center hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                >
                  <Search className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <h4 className="font-semibold text-sm mb-1">Browse Bounties</h4>
                  <span className="text-xs text-green-600">Find work</span>
                </a>

                <a
                  href="/leaderboard"
                  className="bg-green-50 dark:bg-green-950/50 p-4 rounded-lg text-center hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                >
                  <DollarSign className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <h4 className="font-semibold text-sm mb-1">Leaderboard</h4>
                  <span className="text-xs text-green-600">Top earners</span>
                </a>

                <a
                  href="https://discord.gg/roxonn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-50 dark:bg-green-950/50 p-4 rounded-lg text-center hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                >
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <h4 className="font-semibold text-sm mb-1">Community</h4>
                  <span className="text-xs text-green-600">Join Discord</span>
                </a>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/50 p-6 rounded-lg border border-blue-200 dark:border-blue-800 mb-6">
                <h4 className="font-semibold mb-3">Quick Checklist:</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="rounded" checked={hasWallet} readOnly />
                    <span className={hasWallet ? 'line-through text-muted-foreground' : ''}>Connect XDC wallet</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="rounded" />
                    <span>Browse active bounties</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="rounded" />
                    <span>Find an issue matching your skills</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="rounded" />
                    <span>Submit your first PR</span>
                  </label>
                </div>
              </div>

              <p className="text-sm text-center text-muted-foreground">
                You can re-watch this tutorial anytime from <strong>Help → Getting Started</strong>
              </p>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button onClick={handleClose} className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                Start Earning! 💰
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
