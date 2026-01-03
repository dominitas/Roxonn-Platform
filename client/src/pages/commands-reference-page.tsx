import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Terminal,
  Users,
  Wallet,
  Code2,
  HelpCircle,
  MessageSquare,
  FileCode,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface CommandCardProps {
  command: string;
  example: string;
  description: string;
  who: 'Anyone' | 'Developers' | 'Clients';
  notes?: string;
}

function CommandCard({ command, example, description, who, notes }: CommandCardProps) {
  const whoColors = {
    'Anyone': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    'Developers': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'Clients': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <code className="text-lg font-mono font-semibold text-primary">{command}</code>
          <Badge className={whoColors[who]} variant="secondary">{who}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg font-mono text-sm mb-3">
          <span className="text-muted-foreground">Example: </span>
          <code className="text-foreground">{example}</code>
        </div>
        {notes && (
          <p className="text-sm text-muted-foreground">
            <HelpCircle className="h-4 w-4 inline mr-1" />
            {notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function CommandsReferencePage() {
  return (
    <div className="container max-w-4xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Terminal className="h-10 w-10 text-primary" />
          Command Reference
        </h1>
        <p className="text-lg text-muted-foreground">
          All GitHub commands you can use with Roxonn
        </p>
      </div>

      {/* For Bounty Creators */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-purple-600" />
          For Bounty Creators (Clients)
        </h2>

        <CommandCard
          command="/bounty <amount> <currency>"
          example="/bounty 100 USDC"
          description="Create a bounty on the current GitHub issue"
          who="Clients"
          notes="Supported currencies: XDC, ROXN, USDC. After posting, you'll receive a payment link to fund the escrow."
        />

        <CommandCard
          command="/bounty pool <amount> <currency>"
          example="/bounty pool 50 XDC"
          description="Allocate a bounty from your repository's pre-funded pool"
          who="Clients"
          notes="Only available for registered repositories with funded pools. Pool managers only."
        />
      </section>

      {/* For Developers */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Code2 className="h-6 w-6 text-blue-600" />
          For Developers (Contributors)
        </h2>

        <CommandCard
          command="/attempt"
          example="/attempt"
          description="Signal that you're working on this issue"
          who="Developers"
          notes="Optional but helpful. Prevents duplicate work and shows up in the attempt tracker."
        />

        <CommandCard
          command="/claim #<prNumber>"
          example="/claim #42"
          description="Manually claim a bounty after your PR is merged (legacy)"
          who="Developers"
          notes="Usually not needed - payouts are automatic when PR merges with 'fixes #issue' in description."
        />
      </section>

      {/* For Everyone */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Users className="h-6 w-6 text-gray-600" />
          For Everyone
        </h2>

        <CommandCard
          command="@roxonn status"
          example="@roxonn status"
          description="Check the bounty status for this issue"
          who="Anyone"
          notes="Shows bounty amount, who's working on it, and current status."
        />

        <CommandCard
          command="/bounty"
          example="/bounty"
          description="Request that a bounty be added to this issue"
          who="Anyone"
          notes="Notifies repository maintainers that someone wants a bounty on this issue."
        />
      </section>

      {/* PR Description */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <FileCode className="h-6 w-6 text-green-600" />
          Pull Request Keywords
        </h2>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Link PR to Issue (Required for Auto-Payout)</CardTitle>
            <CardDescription>
              Include one of these keywords in your PR description to automatically link it to an issue and trigger auto-payout on merge.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <code className="text-sm">fixes #123</code>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <code className="text-sm">closes #123</code>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <code className="text-sm">resolves #123</code>
              </div>
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <code className="text-sm">fixed #123</code>
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-950/50 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>When your PR with these keywords is merged, the bounty is automatically paid to your wallet within 60 seconds!</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Valid Submission Requirements */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-green-600" />
          Valid Submission Requirements
        </h2>

        <Card>
          <CardContent className="pt-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>PR must reference the issue using <code className="bg-muted px-2 py-0.5 rounded">fixes #[issue-number]</code> in description</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>PR must be merged (not just closed)</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Developer must have an XDC wallet linked to their Roxonn account</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Code must meet the acceptance criteria listed in the issue</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* FAQ */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-amber-600" />
          Frequently Asked Questions
        </h2>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What if multiple people attempt the same issue?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                The first merged PR wins the bounty. We recommend coordinating in the issue comments or checking who's already working on it before starting.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What are the fees?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                5% total platform fee: 2.5% from the client (added to bounty amount) and 2.5% from the developer (deducted from payout). This is the lowest in the industry!
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">When do I get paid?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Automatically within 60 seconds after your PR is merged. No manual claim needed if you have a wallet connected and included "fixes #issue" in your PR.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Can I use fiat (credit card) to pay?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Yes! When you create a bounty, you'll receive a payment link. You can pay with crypto wallet or credit card via our Onramp.money integration.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Need Help? */}
      <section className="mb-8">
        <Card className="bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <MessageSquare className="h-8 w-8 text-blue-600 flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-2">Need Help?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Have questions or need assistance? We're here to help!
                </p>
                <div className="flex gap-3">
                  <a
                    href="https://discord.gg/roxonn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Join Discord
                  </a>
                  <a
                    href="https://roxonn.com/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                  >
                    <FileCode className="h-4 w-4" />
                    Full Docs
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
