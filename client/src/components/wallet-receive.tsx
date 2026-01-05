import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/use-wallet';
import { useAuth } from '../hooks/use-auth';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Loader2, Copy, Check, RefreshCw, Plus, ArrowDownUp, ExternalLink, DollarSign, Coins, Zap } from 'lucide-react';
import { ethers } from 'ethers';
import { Alert, AlertDescription } from './ui/alert';
import { TransactionHistory } from './transaction-history';
import { QRCodeSVG } from 'qrcode.react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { STAGING_API_URL } from '../config';
import { useNotification } from './ui/notification';
import { useQuery } from '@tanstack/react-query';

// New hook for USDC balance
const useUsdcBalance = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['usdcBalance', user?.id],
    queryFn: async (): Promise<string> => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const response = await fetch(`/api/wallet/multi-currency-balances/${user.id}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch wallet balances');
      }
      
      const balances = await response.json();
      // Find USDC balance from the balances array
      const usdcBalance = balances.find((b: any) => b.currency === 'USDC');
      return usdcBalance?.balance || '0';
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
  });
};

const getCurrencyIcon = (currency: string) => {
  switch (currency.toUpperCase()) {
    case 'XDC':
      return Zap;
    case 'ROXN':
      return Coins;
    case 'USDC':
      return DollarSign;
    default:
      return Coins;
  }
};

const getNetworkColor = (network: string) => {
  switch (network.toLowerCase()) {
    case 'xdc':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

const getExplorerUrl = (network: string, address: string) => {
  const baseUrls = {
    xdc: 'https://xdcscan.io/address',
  };
  
  const baseUrl = baseUrls[network.toLowerCase() as keyof typeof baseUrls];
  if (!baseUrl) return null;
  
  // Convert XDC address format for explorer
  const explorerAddress = network.toLowerCase() === 'xdc' 
    ? address.replace(/^xdc/, '0x') 
    : address;
    
  return `${baseUrl}/${explorerAddress}`;
};

export function WalletReceive() {
  const { data: walletInfo, isLoading, refetch } = useWallet();
  const { user } = useAuth();
  const { addNotification } = useNotification();
  
  // USDC balance
  const { data: usdcBalance, isLoading: isUsdcLoading, refetch: refetchUsdcBalance } = useUsdcBalance();
  
  const [copied, setCopied] = useState(false);
  const [isBuyingXdc, setIsBuyingXdc] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  
  // Off-ramp (sell) functionality
  const [isSellingXdc, setIsSellingXdc] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  
  // Format USDC balance
  const formattedUsdcBalance = usdcBalance 
    ? parseFloat(usdcBalance).toFixed(2) 
    : "0.00";
  
  // Function to handle selling XDC via Onramp.money (off-ramp)
  const handleSellXdc = async () => {
    try {
      setIsSellingXdc(true);
      setSellError(null);
      
      // Call our backend API to get the Onramp.money sell URL
      const response = await fetch(`${STAGING_API_URL}/api/wallet/sell-xdc-url`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        // Parse error response
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `API error: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Show info notification
      addNotification({
        type: 'info',
        title: 'Withdrawal Initiated',
        message: 'You will be redirected to complete your USDC withdrawal.',
        duration: 5000
      });
      
      // Open Onramp.money in a new tab
      window.open(data.url, '_blank');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate USDC withdrawal';
      console.error('Error initiating USDC withdrawal:', error);
      setSellError(errorMessage);
      
      // Show error notification
      addNotification({
        type: 'error',
        title: 'Withdrawal Error',
        message: errorMessage,
        duration: 10000
      });
    } finally {
      setIsSellingXdc(false);
    }
  };
  
  // Function to handle buying XDC via Onramp.money
  const handleBuyXdc = async () => {
    try {
      setIsBuyingXdc(true);
      setBuyError(null);
      
      // Call our backend API to get the Onramp.money URL
      const response = await fetch(`${STAGING_API_URL}/api/wallet/buy-xdc-url`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        // Parse error response
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || `API error: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Show info notification
      addNotification({
        type: 'info',
        title: 'Purchase Initiated',
        message: 'You will be redirected to complete your USDC purchase.',
        duration: 5000
      });
      
      // Open Onramp.money in a new tab
      window.open(data.url, '_blank');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to initiate USDC purchase';
      console.error('Error initiating USDC purchase:', error);
      setBuyError(errorMessage);
      
      // Show error notification
      addNotification({
        type: 'error',
        title: 'Purchase Error',
        message: errorMessage,
        duration: 10000
      });
    } finally {
      setIsBuyingXdc(false);
    }
  };
  
  // Handle return from Onramp.money
  useEffect(() => {
    // Check for status parameters in URL
    const url = new URL(window.location.href);
    const status = url.searchParams.get('status');
    const orderId = url.searchParams.get('orderId');
    
    if (status && orderId) {
      // Clear URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Refresh wallet balance
      refetch();
      refetchUsdcBalance();
      
      // Show appropriate notification based on status
      const statusLower = status.toLowerCase();
      if (statusLower === 'success') {
        addNotification({
          type: 'success',
          title: 'Purchase Successful',
          message: `Your USDC purchase (Order #${orderId}) was successful. Your balance will update shortly.`,
          duration: 10000
        });
      } else if (statusLower === 'failed') {
        addNotification({
          type: 'error',
          title: 'Purchase Failed',
          message: `Your USDC purchase (Order #${orderId}) could not be completed. Please try again.`,
          duration: 10000
        });
      } else {
        addNotification({
          type: 'info',
          title: 'Purchase Update',
          message: `Your USDC purchase (Order #${orderId}) status: ${status}`,
          duration: 7000
        });
      }
      
      console.log(`Onramp.money transaction ${orderId} status: ${status}`);
    }
  }, [refetch, addNotification]);
  
  // Copy wallet address to clipboard
  const copyToClipboard = () => {
    if (walletInfo?.address) {
      navigator.clipboard.writeText(walletInfo.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  // Generate QR code value
  const qrValue = walletInfo?.address 
    ? `xdc:${walletInfo.address.replace('xdc', '')}` 
    : '';

  return (
    <div className="space-y-4">
      <Tabs defaultValue="wallet" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="wallet">XDC Wallet</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="wallet" className="space-y-4 pt-2">
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">XDC Wallet</h2>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => { refetch(); refetchUsdcBalance(); }} 
                  disabled={isLoading || isUsdcLoading}
                >
                  {isLoading || isUsdcLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
                </div>
              ) : walletInfo?.address ? (
                <>
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                      <QRCodeSVG 
                        value={qrValue} 
                        size={180} 
                        includeMargin={true}
                        level="H"
                      />
                    </div>
                    
                    <div className="flex-1 space-y-4">
                      <div>
                        <h3 className="text-md font-medium mb-1">Your Wallet Address</h3>
                        <div className="flex items-center gap-2">
                          <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm break-all text-gray-900 dark:text-gray-100">
                            {walletInfo.address}
                          </div>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            onClick={copyToClipboard}
                            className="flex-shrink-0"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500">XDC Balance:</span>
                          <span className="font-medium">
                            {walletInfo?.balance ? ethers.formatEther(walletInfo.balance) : '0'} XDC
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">ROXN Balance:</span>
                          <span className="font-medium">
                            {walletInfo?.tokenBalance ? ethers.formatEther(walletInfo.tokenBalance) : '0'} ROXN
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            USDC Balance:
                          </span>
                          <span className="font-medium">
                            {isUsdcLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              `${formattedUsdcBalance} USDC`
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Onramp.money Integration - Buy and Sell USDC on XDC */}
                  <div className="mt-6 space-y-4">
                    {/* Buy USDC on XDC Button */}
                    <div>
                      <Button 
                        variant="default" 
                        size="lg" 
                        className="w-full"
                        onClick={handleBuyXdc}
                        disabled={isBuyingXdc || isLoading || !walletInfo?.address}
                      >
                        {isBuyingXdc ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Preparing...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Buy USDC (Fiat → Crypto)
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-gray-500 mt-1">
                        💳 Pay with EUR, USD, GBP, INR, or 50+ currencies • ✅ Receive USDC in your Roxonn wallet (XDC Network) • ⚡ Instant via Onramp.money
                      </p>
                      {buyError && (
                        <p className="text-sm text-red-500 mt-1">{buyError}</p>
                      )}
                    </div>
                    
                    {/* Sell USDC on XDC Button */}
                    <div>
                      <Button 
                        variant="outline" 
                        size="lg" 
                        className="w-full"
                        onClick={handleSellXdc}
                        disabled={isSellingXdc || isLoading || !walletInfo?.address || !(parseFloat(usdcBalance || '0') > 0)}
                      >
                        {isSellingXdc ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Preparing...
                          </>
                        ) : (
                          <>
                            <ArrowDownUp className="h-4 w-4 mr-2" />
                            Withdraw USDC (Crypto → Fiat)
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-gray-500 mt-1">
                        Withdraw USDC to any fiat currency (EUR, USD, GBP, INR, and 50+ more) via Onramp.money
                      </p>
                      {sellError && (
                        <p className="text-sm text-red-500 mt-1">{sellError}</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <Alert>
                  <AlertDescription>
                    No wallet is connected. Please check your profile settings.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4 pt-2">
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Token Balances</h2>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchUsdcBalance()} 
                  disabled={isUsdcLoading}
                >
                  {isUsdcLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>
              
              <div className="space-y-4">
                {/* XDC Balance */}
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Zap className="h-8 w-8 p-1.5 bg-muted rounded-full text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">XDC</span>
                        <Badge 
                          variant="secondary" 
                          className="text-xs text-white bg-blue-500"
                        >
                          XDC
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {walletInfo?.address ? walletInfo.address.slice(0, 6) + "..." + walletInfo.address.slice(-4) : "Not connected"}
                        </span>
                        {walletInfo?.address && (
                          <a
                            href={`https://xdcscan.io/address/${walletInfo.address.replace(/^xdc/, '0x')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-medium">
                      {walletInfo?.balance 
                        ? parseFloat(ethers.formatEther(walletInfo.balance)).toFixed(4) + " XDC"
                        : "0.0000 XDC"}
                    </div>
                  </div>
                </div>

                {/* ROXN Balance */}
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Coins className="h-8 w-8 p-1.5 bg-muted rounded-full text-purple-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">ROXN</span>
                        <Badge 
                          variant="secondary" 
                          className="text-xs text-white bg-purple-500"
                        >
                          XDC
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {walletInfo?.address ? walletInfo.address.slice(0, 6) + "..." + walletInfo.address.slice(-4) : "Not connected"}
                        </span>
                        {walletInfo?.address && (
                          <a
                            href={`https://xdcscan.io/address/${walletInfo.address.replace(/^xdc/, '0x')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-medium">
                      {walletInfo?.tokenBalance 
                        ? parseFloat(ethers.formatEther(walletInfo.tokenBalance)).toFixed(2) + " ROXN"
                        : "0.00 ROXN"}
                    </div>
                  </div>
                </div>

                {/* USDC Balance */}
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <DollarSign className="h-8 w-8 p-1.5 bg-muted rounded-full text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">USDC</span>
                        <Badge 
                          variant="secondary" 
                          className="text-xs text-white bg-blue-600"
                        >
                          XDC
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {walletInfo?.address ? walletInfo.address.slice(0, 6) + "..." + walletInfo.address.slice(-4) : "Not connected"}
                        </span>
                        {walletInfo?.address && (
                          <a
                            href={`https://xdcscan.io/address/${walletInfo.address.replace(/^xdc/, '0x')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-medium">
                      {isUsdcLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        `${formattedUsdcBalance} USDC`
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-3 border-t">
                <div className="text-xs text-muted-foreground text-center">
                  💡 Balances update automatically every 30 seconds
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="pt-2">
          <TransactionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}