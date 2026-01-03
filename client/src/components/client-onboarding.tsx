import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useAuth } from '@/hooks/use-auth';
import {
  Coins,
  Chrome,
  Github,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Zap,
  Users,
  DollarSign,
  FileCode,
  HelpCircle,
  MessageSquare
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Create a function to manually show the client onboarding
export const showClientOnboarding = () => {
  localStorage.setItem('roxonn-onboarding-hasSeenClientOnboarding', 'false');
  window.dispatchEvent(new Event('storage'));
};

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 1, title: 'Welcome', description: 'Learn what you can do as a client' },
  { id: 2, title: 'How It Works', description: 'Understand the bounty lifecycle' },
  { id: 3, title: 'Install Extension', description: 'Get the browser extension' },
  { id: 4, title: 'Try It Out', description: 'Create your first bounty' },
  { id: 5, title: 'Complete', description: 'You\'re ready to go!' },
];

export function ClientOnboarding() {
  const { hasSeenGuide, setHasSeen } = useOnboarding('hasSeenClientOnboarding', false);
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const { user } = useAuth();

  // Only show for pool managers (clients)
  const isClient = user?.role === "poolmanager";

  // Detect browser type
  const [browserType, setBrowserType] = useState<'chrome' | 'firefox' | 'edge' | 'other'>('chrome');

  useEffect(() => {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      setBrowserType('chrome');
    } else if (userAgent.includes('Firefox')) {
      setBrowserType('firefox');
    } else if (userAgent.includes('Edg')) {
      setBrowserType('edge');
    } else {
      setBrowserType('other');
    }
  }, []);

  const extensionLinks = {
    chrome: 'https://chrome.google.com/webstore/detail/roxonn/[ID]',
    firefox: 'https://addons.mozilla.org/firefox/addon/roxonn/',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/roxonn/[ID]',
    other: 'https://roxonn.com/extension'
  };

  const browserNames = {
    chrome: 'Chrome',
    firefox: 'Firefox',
    edge: 'Edge',
    other: 'your browser'
  };

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
      const value = localStorage.getItem('roxonn-onboarding-hasSeenClientOnboarding');
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
    if (isInitialized && !hasSeenGuide && isClient) {
      setIsOpen(true);
    }
  }, [hasSeenGuide, isInitialized, isClient]);

  // Only render when initialized and for clients
  if (!isInitialized || !isClient) {
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
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-4xl">👋</span>
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">Welcome to Roxonn!</DialogTitle>
              <DialogDescription className="text-center">
                You're registered as a <span className="font-semibold text-foreground">Client (Pool Manager)</span>
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="bg-blue-50 dark:bg-blue-950/50 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                <h3 className="font-semibold mb-4 text-blue-800 dark:text-blue-300">As a client, you can:</h3>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Create bounties on any GitHub issue</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Attract top developers to your projects</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Pay only when work is merged</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Lowest fees in the industry (5% total)</span>
                  </li>
                </ul>
              </div>

              <p className="text-center text-muted-foreground mt-6">
                Let's get you started in 4 quick steps!
              </p>
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
                  <Coins className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">How Bounties Work</DialogTitle>
            </DialogHeader>

            <div className="py-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold">Find a GitHub issue you want solved</h4>
                    <p className="text-sm text-muted-foreground">In your own repos or any public repository</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold">Click "Create Roxonn Bounty" button</h4>
                    <p className="text-sm text-muted-foreground">Set amount (XDC/ROXN/USDC) and details</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold">Pay to escrow</h4>
                    <p className="text-sm text-muted-foreground">Crypto wallet or credit card via Onramp</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold flex-shrink-0">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      Developer submits PR → Auto-paid on merge!
                      <Zap className="h-4 w-4 text-yellow-500" />
                    </h4>
                    <p className="text-sm text-muted-foreground">Fully automatic. No manual approval needed.</p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-950/50 p-4 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm">
                  <span className="font-semibold">Fees:</span> 5% total (2.5% from you, 2.5% from contributor)
                  <br />
                  <span className="italic text-muted-foreground">Lowest in the industry - competitors charge 10-23%!</span>
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

        {/* Step 3: Install Extension */}
        {currentStep === 3 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Chrome className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">Install Browser Extension</DialogTitle>
              <DialogDescription className="text-center">
                Create bounties easily with our {browserNames[browserType]} extension
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="bg-white dark:bg-gray-900 border-2 border-purple-200 dark:border-purple-800 rounded-lg p-6 mb-6">
                <h3 className="font-semibold mb-4 text-lg">Step-by-Step Installation:</h3>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Click "Install Extension"</h4>
                      <p className="text-sm text-muted-foreground mb-3">This will open the {browserNames[browserType]} Web Store</p>
                      <a
                        href={extensionLinks[browserType]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                      >
                        <Chrome className="h-4 w-4" />
                        Install Extension for {browserNames[browserType]}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Click "Add to {browserNames[browserType]}"</h4>
                      <p className="text-sm text-muted-foreground">Accept the permissions to allow posting comments</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Pin to toolbar (recommended)</h4>
                      <p className="text-sm text-muted-foreground">Click the puzzle icon → Pin Roxonn extension for easy access</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-950/50 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm">
                  <span className="font-semibold">Don't want to install the extension?</span><br />
                  No problem! You can create bounties manually by commenting <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">/bounty 100 USDC</code> on any GitHub issue.
                </p>
              </div>
            </div>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={handleNext}>
                  Skip (I'll install later)
                </Button>
                <Button onClick={handleNext}>
                  I've Installed It <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* Step 4: Try It Out */}
        {currentStep === 4 && (
          <>
            <DialogHeader>
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <FileCode className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-2xl text-center">Try Creating Your First Bounty</DialogTitle>
              <DialogDescription className="text-center">
                Let's test the extension!
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="bg-blue-50 dark:bg-blue-950/50 p-6 rounded-lg border border-blue-200 dark:border-blue-800 mb-6">
                <ol className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">1</span>
                    <div>
                      <span className="font-semibold">Go to any GitHub issue in your repository</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        Or use our{' '}
                        <a href="https://github.com/roxonn/demo-repo/issues" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                          demo repository
                        </a>
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">2</span>
                    <div>
                      <span className="font-semibold">Click the purple "Create Roxonn Bounty" button</span>
                      <p className="text-sm text-muted-foreground mt-1">You'll see it in the top-right of the issue page</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">3</span>
                    <div>
                      <span className="font-semibold">Fill in the form and submit</span>
                      <p className="text-sm text-muted-foreground mt-1">Try a small test amount like 10 USDC</p>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Having trouble?
                </h4>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>• Make sure the extension is installed and enabled</li>
                  <li>• Refresh the GitHub page</li>
                  <li>• Check that you're on an <strong>issue</strong> page (not PR)</li>
                  <li>• <a href="https://roxonn.com/docs/troubleshooting" target="_blank" className="text-blue-600 underline">View troubleshooting guide</a></li>
                </ul>
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
              <DialogTitle className="text-2xl text-center">You're All Set!</DialogTitle>
              <DialogDescription className="text-center">
                You're ready to create bounties and grow your project!
              </DialogDescription>
            </DialogHeader>

            <div className="py-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <a
                  href="https://roxonn.com/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-purple-50 dark:bg-purple-950/50 p-4 rounded-lg text-center hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <FileCode className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <h4 className="font-semibold text-sm mb-1">Documentation</h4>
                  <span className="text-xs text-purple-600">Read the docs</span>
                </a>

                <a
                  href="https://roxonn.com/tutorials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-purple-50 dark:bg-purple-950/50 p-4 rounded-lg text-center hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <Users className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <h4 className="font-semibold text-sm mb-1">Video Tutorials</h4>
                  <span className="text-xs text-purple-600">Watch videos</span>
                </a>

                <a
                  href="https://discord.gg/roxonn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-purple-50 dark:bg-purple-950/50 p-4 rounded-lg text-center hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                >
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 text-purple-600" />
                  <h4 className="font-semibold text-sm mb-1">Get Help</h4>
                  <span className="text-xs text-purple-600">Join Discord</span>
                </a>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/50 p-6 rounded-lg border border-blue-200 dark:border-blue-800 mb-6">
                <h4 className="font-semibold mb-3">Quick Reference:</h4>
                <div className="text-sm space-y-2">
                  <p>• <strong>Create bounty:</strong> Click extension button OR comment <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">/bounty 100 USDC</code></p>
                  <p>• <strong>Check status:</strong> Comment <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded">@roxonn status</code></p>
                  <p>• <strong>Browse bounties:</strong> <a href="https://roxonn.com/explore" className="text-blue-600 underline">roxonn.com/explore</a></p>
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
              <Button onClick={handleClose} className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
                Start Using Roxonn! 🚀
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
