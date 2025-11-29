import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { GitFork, Link as LinkIcon, Loader2, Search, PlusCircle, Check, AlertCircle, CheckCircle2, Github, ListChecks, Lock, Activity } from 'lucide-react';
import { STAGING_API_URL } from '../config';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import csrfService from '../lib/csrf';
import { OrgReposSection } from './org-repos-section';

// Interface for registered repository data from backend
interface RegisteredRepository {
  id: number;
  userId: number;
  githubRepoId: string;
  githubRepoFullName: string;
  installationId: string | null;
  isActive: boolean;
  registeredAt: string;
}

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  private?: boolean; // Add private flag
  owner: {
    login: string;
  };
  permissions: {
    admin: boolean;
  };
  installationId?: string; // Add optional installationId
}

export function MyRepositories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [location, setLocation] = useLocation();
  const [localRegisteredRepos, setLocalRegisteredRepos] = useState<Set<string>>(new Set());

  // Only show this component to pool managers
  if (user?.role !== 'poolmanager') {
    return null;
  }

  // 1. Get user's GitHub repositories where they have admin rights (using fetch)
  const { data: userRepos, isLoading: isLoadingUserRepos } = useQuery({
    queryKey: ['githubUserAdminRepos', user?.githubUsername],
    queryFn: async () => {
      const response = await fetch(`${STAGING_API_URL}/api/github/user/repos`, {
        credentials: 'include' // Auth handled by session cookie
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try parsing error
        throw new Error(errorData?.error || 'Failed to fetch GitHub repositories');
      }
      const data = await response.json();
      return data.repositories as Repository[];
    },
    enabled: !!user?.githubUsername, 
    staleTime: 1000 * 60 * 5, 
  });

  // 2. Get repositories already registered by this user in our DB (using fetch)
  const { data: registeredReposData, isLoading: isLoadingRegistered } = useQuery({
    queryKey: ['registeredRepositories', user?.id],
    queryFn: async () => {
      const response = await fetch(`${STAGING_API_URL}/api/repositories/registered`, {
        credentials: 'include' // Auth handled by session cookie
      });
       if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to fetch registered repositories');
      }
      const data = await response.json();
      return data.repositories as RegisteredRepository[];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  // 3. Check if user has private repository access
  const { data: privateAccessData } = useQuery({
    queryKey: ['privateAccessStatus', user?.id],
    queryFn: async () => {
      const response = await fetch(`${STAGING_API_URL}/api/auth/private-access-status`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch private access status');
      }
      return response.json();
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const hasPrivateAccess = privateAccessData?.hasPrivateAccess || false;

  const registeredRepoIds = new Set(registeredReposData?.map((r: RegisteredRepository) => String(r.githubRepoId)) || []);

  // Create lookup map for registered status including installation ID and active status
  const registeredRepoMap = new Map(registeredReposData?.map((r: RegisteredRepository) =>
      [String(r.githubRepoId), { registered: true, installed: !!r.installationId, isActive: r.isActive || false }]
  ) || []);

  // Track GitHub app installation status client-side
  const [hasInstalledApp, setHasInstalledApp] = useState<boolean>(() => {
    // Check localStorage for prior installation
    return localStorage.getItem('hasInstalledGitHubApp') === 'true';
  });

  // Combine server data with local cache for UI display
  useEffect(() => {
    if (registeredReposData?.length) {
      const newSet = new Set<string>();
      // Add existing items from localRegisteredRepos
      localRegisteredRepos.forEach(id => newSet.add(id));
      // Add items from server data
      registeredReposData.forEach(repo => newSet.add(String(repo.githubRepoId)));
      setLocalRegisteredRepos(newSet);
    }
  }, [registeredReposData]);

  // Check if the GitHub app is already installed by any repo
  // Use both server data and local storage flag
  const isAppInstalled = hasInstalledApp || registeredReposData?.some(repo => !!repo.installationId) || false;

  // Filter user's GitHub repos based on search term
  const filteredRepos = searchTerm
    ? userRepos?.filter((repo: Repository) => 
        repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        repo.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
    : userRepos;

  // --- NEW: Finalize Installation Mutation ---
  const finalizeInstallationMutation = useMutation({
      mutationFn: async (installationId: string) => {
          // Call the new backend endpoint
          const csrfToken = await csrfService.getToken();
          const response = await fetch(`${STAGING_API_URL}/api/github/app/finalize-installation`, {
              method: 'POST',
              credentials: 'include',
              headers: {
                  'Content-Type': 'application/json',
                  'X-CSRF-Token': csrfToken
              },
              body: JSON.stringify({ installationId, _csrf: csrfToken })
          });
          const responseData = await response.json();
          if (!response.ok) {
               throw new Error(responseData?.error || 'Failed to finalize installation');
          }
          return responseData;
      },
      onSuccess: (data) => {
          // Show a better message when no repositories are linked
          if (data.count === 0) {
              toast({ 
                  title: 'Success', 
                  description: 'GitHub App successfully installed! You can now register your repositories.' 
              });
          } else {
              toast({ 
                  title: 'Success', 
                  description: `Successfully linked ${data.count} repositories.` 
              });
          }
          
          // Invalidate registered repos query to update the UI
          queryClient.invalidateQueries({ queryKey: ['registeredRepositories', user?.id] });
          // Remove query params from URL after processing
          setLocation(location.split('?')[0], { replace: true }); 
      },
      onError: (error: any) => {
           toast({ title: 'Installation Link Error', description: error.message, variant: 'destructive' });
      }
  });

  // --- Effect to trigger finalize mutation on redirect back from GitHub ---
  useEffect(() => {
      const searchParams = new URLSearchParams(window.location.search);
      const installationId = searchParams.get('installation_id');
      const setupAction = searchParams.get('setup_action');

      // Only proceed if we have installation parameters
      if (installationId && (setupAction === 'install' || setupAction === 'update')) {
          console.log(`Detected installation: ${installationId}. Processing...`);
          
          // Mark the app as installed in localStorage
          localStorage.setItem('hasInstalledGitHubApp', 'true');
          localStorage.setItem('lastInstallationId', installationId);
          setHasInstalledApp(true);
          
          // Trigger the mutation to link installation to user
          finalizeInstallationMutation.mutate(installationId);
          
          // Clean the URL without processing again
          setLocation(location.split('?')[0], { replace: true });
      }
  }, [location]);  // Only depend on location changes

  // Handler for initiating App installation
  const handleInstallApp = async () => {
    // Check for too many redirects to prevent loops
    const redirectAttempts = parseInt(localStorage.getItem('redirectAttemptCount') || '0');
    if (redirectAttempts > 3) {
      toast({
        title: 'Installation Error',
        description: 'Too many redirect attempts. Please contact support.',
        variant: 'destructive'
      });
      localStorage.removeItem('redirectAttemptCount'); // Reset for next time
      return;
    }
    
    // Increment count before redirect
    localStorage.setItem('redirectAttemptCount', (redirectAttempts + 1).toString());
    
    setIsRedirecting(true); // Show loading state on button
    try {
        // Fetch the installation URL from the backend
        const response = await fetch(`${STAGING_API_URL}/api/github/app/install-url`, {
             credentials: 'include' // Send cookies for requireAuth
        });
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(errorData?.error || 'Failed to get installation URL');
        }
        const data = await response.json();
        if (!data.installUrl) {
             throw new Error('Installation URL not received from backend');
        }
        // Redirect user to GitHub
        window.location.href = data.installUrl;
        // No need to set loading false, page redirects
    } catch (error) {
        toast({
            title: 'Error Initiating Installation',
            description: error instanceof Error ? error.message : 'Could not start installation process',
            variant: 'destructive'
        });
        setIsRedirecting(false); // Reset loading state ONLY on error
    }
  };

  // Register repository directly (when app is already installed)
  const registerRepositoryMutation = useMutation({
    mutationFn: async (repo: Repository) => {
      // Get a fresh CSRF token
      const csrfToken = await csrfService.getToken();
      
      // First ensure we're authenticated by touching the session endpoint
      try {
        await fetch(`${STAGING_API_URL}/api/auth/session`, {
          method: 'GET',
          credentials: 'include'
        });
      } catch (e) {
        console.warn("Session check failed, proceeding anyway", e);
      }
      
      const response = await fetch(`${STAGING_API_URL}/api/repositories/register`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ 
          githubRepoId: repo.id,
          githubRepoFullName: repo.full_name,
          installationId: repo.installationId,
          _csrf: csrfToken 
        })
      });
      
      if (!response.ok) {
        // Check content type to handle different response formats
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          
          // Check if this is a GitHub App installation redirect
          if (errorData.installUrl) {
            setIsRedirecting(true);
            // Store the repository we were trying to register
            localStorage.setItem('pendingRegistrationRepo', JSON.stringify(repo));
            // Redirect to GitHub App installation
            window.location.href = errorData.installUrl;
            // Return a special object to signal redirection
            return { redirecting: true };
          }
          
          throw new Error(errorData?.error || 'Failed to register repository');
        } else {
          // Handle non-JSON responses
          const errorText = await response.text();
          console.error('Non-JSON error response:', errorText);
          throw new Error('Server returned an invalid response format');
        }
      }
      
      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return { ...response.json(), repoId: repo.id, fullName: repo.full_name };
      } else {
        console.log('Successful response but not JSON format:', await response.text());
        return { success: true, repoId: repo.id, fullName: repo.full_name };
      }
    },
    onSuccess: (data) => {
      // If we're redirecting, don't update state
      if (data.redirecting) return;
      
      // Update local state immediately regardless of server state
      const newSet = new Set(localRegisteredRepos);
      newSet.add(String(data.repoId));
      setLocalRegisteredRepos(newSet);
      
      // Store the registered repo details in localStorage as a fallback
      try {
        const storedRepos = JSON.parse(localStorage.getItem('registeredRepos') || '[]');
        storedRepos.push({
          id: data.repoId,
          fullName: data.fullName,
          registeredAt: new Date().toISOString()
        });
        localStorage.setItem('registeredRepos', JSON.stringify(storedRepos));
      } catch (e) {
        console.error('Failed to store repo in localStorage', e);
      }
      
      toast({
        title: 'Success',
        description: 'Repository registered successfully'
      });
      
      // Refresh the list of registered repositories
      queryClient.invalidateQueries({ queryKey: ['registeredRepositories', user?.id] });
      
      // Also refresh public repositories to ensure the repo shows up in /repos page
      queryClient.invalidateQueries({ queryKey: ['publicRepositories'] });
    },
    onError: (error: any) => {
      // Check if the error response contains an installation URL
      if (error.response && error.response.data && error.response.data.installUrl) {
        setIsRedirecting(true);
        // Store the repository we were trying to register
        localStorage.setItem('pendingRegistrationRepo', JSON.stringify(error.repo));
        // Redirect to GitHub App installation
        window.location.href = error.response.data.installUrl;
        return;
      }
      
      toast({
        title: 'Error',
        description: error.message || 'Failed to register repository',
        variant: 'destructive'
      });
    }
  });

  // Toggle repository active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ repoId, isActive }: { repoId: string; isActive: boolean }) => {
      const csrfToken = await csrfService.getToken();
      const response = await fetch(`${STAGING_API_URL}/api/repositories/${repoId}/active`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ isActive, _csrf: csrfToken })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to update active status');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Success',
        description: `Repository marked as ${variables.isActive ? 'active' : 'inactive'}`
      });
      queryClient.invalidateQueries({ queryKey: ['registeredRepositories', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['publicRepositories'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update active status',
        variant: 'destructive'
      });
    }
  });

  // Handle repository registration (no need to check app installation - server handles it)
  const handleRepoRegistration = (repo: Repository) => {
    // Check if we have a stored installation ID from previous installation
    const storedInstallationId = localStorage.getItem('lastInstallationId');
    
    if (storedInstallationId) {
      console.log('Using stored installation ID for registration:', storedInstallationId);
      registerRepositoryMutation.mutate({
        ...repo,
        installationId: storedInstallationId
      });
    } else {
      // Proceed with normal registration
      registerRepositoryMutation.mutate(repo);
    }
  };

  // Navigate to repository details page
  const navigateToRepo = (repoFullName: string) => {
    window.location.href = `/repos/${repoFullName}`;
  };

  // Get registration status for a repository
  const getRegistrationStatus = (repo: Repository) => {
    const status = registeredRepoMap.get(String(repo.id)) || { registered: false, installed: false, isActive: false };

    // If we have it in our local cache, consider it registered too
    if (localRegisteredRepos.has(String(repo.id))) {
      status.registered = true;
    }

    return status;
  };

  // Check if the user can install the app on this repository
  const canInstall = true; // We're always allowing installation/registration attempts

  // Loading state combines both queries
  const isLoading = isLoadingUserRepos || isLoadingRegistered;

  // Add useEffect to check for pending repository registration after GitHub App installation
  useEffect(() => {
    // Check if we were redirected back from GitHub App installation
    const urlParams = new URLSearchParams(window.location.search);
    const installation_id = urlParams.get('installation_id');
    
    if (installation_id) {
      // Mark as installed in localStorage
      localStorage.setItem('githubAppInstalled', 'true');
      // Also store the installation ID for future use
      localStorage.setItem('lastInstallationId', installation_id);
      console.log('GitHub App installed, installation ID:', installation_id);
      
      // Check if we have a pending registration
      const pendingRepo = localStorage.getItem('pendingRegistrationRepo');
      if (pendingRepo) {
        try {
          const repoData = JSON.parse(pendingRepo);
          // Show toast for pending registration
          toast({
            title: 'GitHub App Installed',
            description: 'Registering repository...',
            duration: 5000,
          });
          
          // Clear pending registration
          localStorage.removeItem('pendingRegistrationRepo');
          
          // Wait a moment before trying to register (give backend time to process webhook)
          setTimeout(() => {
            // Include the installation_id when registering the repository
            registerRepositoryMutation.mutate({ 
              ...repoData, 
              installationId: installation_id 
            });
          }, 1500);
        } catch (err) {
          console.error('Error parsing pending repository data:', err);
        }
      }
      
      // Clean URL after processing
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Reset all GitHub app installation related data
  const resetInstallationData = () => {
    localStorage.removeItem('processedInstallations');
    localStorage.removeItem('hasInstalledGitHubApp');
    localStorage.removeItem('githubAppInstalled');
    localStorage.removeItem('pendingRegistrationRepo');
    localStorage.removeItem('lastInstallationId');
    localStorage.removeItem('redirectAttemptCount');
    setHasInstalledApp(false);
    setLocalRegisteredRepos(new Set());
    
    toast({
      title: 'Installation Data Reset',
      description: 'All GitHub app installation data has been cleared.',
      duration: 3000
    });
  };

  return (
    <>
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <GitFork className="h-5 w-5 text-primary" />
          My GitHub Repositories (Admin)
        </CardTitle>
        <CardDescription>
          Register repositories you administer to enable funding.
          {isAppInstalled && (
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-2" 
              onClick={resetInstallationData}
            >
              Reset Installation
            </Button>
          )}
        </CardDescription>
      </CardHeader>

      {/* Private Repository Upgrade Banner */}
      {!hasPrivateAccess && (
        <div className="mx-6 mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                Want to add private repositories?
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                Upgrade your GitHub access to register and manage private repositories on Roxonn.
              </p>
              <Button
                onClick={() => window.location.href = `${STAGING_API_URL}/api/auth/github/upgrade-private?returnTo=/repos`}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Enable Private Repositories
              </Button>
            </div>
          </div>
        </div>
      )}

      <CardContent className="space-y-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary/70" />
          </div>
        ) : filteredRepos?.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            <p>No repositories found where you have admin rights.</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {filteredRepos?.map((repo: Repository) => {
              const registrationStatus = getRegistrationStatus(repo);
              const canInstall = repo.permissions.admin;
              
              return (
                <div 
                  key={repo.id} 
                  className="flex items-center justify-between p-3 rounded-md border border-border hover:bg-accent/5 transition-colors"
                >
                  <div className="overflow-hidden">
                    <div className="font-medium truncate">{repo.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{repo.full_name}</div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Admin badge */}
                    {repo.permissions.admin ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200 dark:border-green-900">
                        <Check className="h-3 w-3 mr-1" /> Admin
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900">
                        <AlertCircle className="h-3 w-3 mr-1" /> No Admin
                      </Badge>
                    )}

                    {/* Private repository badge */}
                    {repo.private && (
                      <Badge variant="secondary" className="bg-purple-500/10 text-purple-700 border-purple-200 dark:border-purple-900">
                        <Lock className="h-3 w-3 mr-1" /> Private
                      </Badge>
                    )}

                    {/* App installation status or action buttons */}
                    {isAppInstalled && (
                      <Badge variant="secondary" className="ml-2">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> App Installed
                      </Badge>
                    )} 
                    
                    {/* Register button - only show if repo not registered yet */}
                    {(!registrationStatus.registered && canInstall) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRepoRegistration(repo)}
                        disabled={isRedirecting || registerRepositoryMutation.isPending}
                        className="ml-2"
                      >
                        {isRedirecting || registerRepositoryMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Github className="mr-2 h-4 w-4" />
                        )}
                        {isAppInstalled ? 'Register' : 'Install App & Register'}
                      </Button>
                    )}
                    
                    {!repo.permissions.admin && !registrationStatus.registered && (
                      <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-900">
                        <AlertCircle className="h-3 w-3 mr-1" /> Requires Admin
                      </Badge>
                    )}

                    <Button 
                      variant="ghost" 
                      size="icon" 
                      asChild
                      className="h-8 w-8"
                    >
                      <a href={repo.html_url} target="_blank" rel="noopener noreferrer">
                        <LinkIcon className="h-4 w-4" />
                      </a>
                    </Button>
                    
                    {/* Active toggle and Fund/Manage button - show if repo is registered */}
                    {registrationStatus.registered && (
                      <>
                        <Button
                          variant={registrationStatus.isActive ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleActiveMutation.mutate({
                            repoId: String(repo.id),
                            isActive: !registrationStatus.isActive
                          })}
                          disabled={toggleActiveMutation.isPending}
                          className={`ml-2 ${registrationStatus.isActive ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                          title={registrationStatus.isActive ? 'Click to mark as inactive' : 'Click to mark as active'}
                        >
                          {toggleActiveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Activity className="h-4 w-4 mr-1" />
                              {registrationStatus.isActive ? 'Active' : 'Set Active'}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigateToRepo(repo.full_name)}
                          className="ml-2"
                        >
                          Fund / Manage
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" size="sm" asChild>
          <a href="/repos" className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" />
            View All Registered Repositories
          </a>
        </Button>
      </CardFooter>
    </Card>

    {/* Organization Repositories Section */}
    <OrgReposSection />
    </>
  );
}
