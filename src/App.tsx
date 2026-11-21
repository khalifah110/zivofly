import React, { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { AlertTriangle, Loader2, RefreshCw, LogOut, User as UserIcon } from 'lucide-react';
import { Header } from './components/Header';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ConnectChannelPage } from './pages/ConnectChannelPage';
import { ChannelSettingsPage } from './pages/ChannelSettingsPage';
import { AgentsPage } from './pages/AgentsPage';
import { AgentDetailPage } from './pages/AgentDetailPage';
import { InboxPage } from './pages/InboxPage';
import { BillingPage } from './pages/BillingPage';
import { ProfilePage } from './pages/ProfilePage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { SupportPage } from './pages/SupportPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import {
  Agent,
  ChannelConnection,
  Conversation,
  User,
  OwnerWorkspace,
} from './types';
import { apiFetch } from './lib/api';
import { supabase } from './lib/supabaseClient';
import {
  GOOGLE_OAUTH_RETURN_STORAGE_KEY,
  clearActiveWorkspaceCache,
  getOwnerWorkspace,
  processGoogleWorkspaceOAuthCallbackFromUrl,
  saveWorkspaceNameHint,
  setActiveWorkspaceId,
} from './lib/supabaseService';
import { ThemeProvider, useTheme } from './context/ThemeContext';

function normalizePathname(rawPath: string): string {
  const base = (rawPath || '/').split('?')[0].split('#')[0].trim();
  return base || '/';
}

function isWorkspaceProtectedRoute(path: string): boolean {
  return (
    path === '/dashboard' ||
    path === '/inbox' ||
    path === '/profile' ||
    path.startsWith('/connect/') ||
    path.startsWith('/channels/') ||
    path === '/agents' ||
    path.startsWith('/agents/') ||
    path === '/billing' ||
    path === '/billing-tokens'
  );
}

function AppContent() {
  const { theme } = useTheme();
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('google_oauth')) {
      try {
        const saved = sessionStorage.getItem(GOOGLE_OAUTH_RETURN_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (
            parsed?.path &&
            typeof parsed.path === 'string' &&
            parsed.path.startsWith('/agents/')
          ) {
            const search = window.location.search || '';
            const cleanTarget = normalizePathname(parsed.path);
            window.history.replaceState({}, '', `${cleanTarget}${search}`);
            return cleanTarget;
          }
        }
      } catch {
        // ignore
      }
    }
    return normalizePathname(window.location.pathname || '/');
  });
  const [user, setUser] = useState<User | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<OwnerWorkspace | null>(null);
  const [workspaceRecoveryError, setWorkspaceRecoveryError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastWorkspaceIdRef = useRef<string | null>(null);

  // Sync with browser navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizePathname(window.location.pathname || '/'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(normalizePathname(path));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Initial data loading
  const loadData = async () => {
    setIsLoading(true);
    try {
      let sessionFallbackUser: User | null = null;
      let resolvedWorkspace: OwnerWorkspace | null = null;

      // First verify Supabase session directly
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session?.user) {
          setUser(null);
          setActiveWorkspace(null);
          setWorkspaceRecoveryError(null);
          setAgents([]);
          setConnections([]);
          setConversations([]);
          lastWorkspaceIdRef.current = null;
          clearActiveWorkspaceCache();
          localStorage.removeItem('zivofly_agents');
          localStorage.removeItem('zivofly_connections');
          localStorage.removeItem('zivofly_conversations');
          setIsLoading(false);
          return;
        }

        const authUser = sessionData.session.user;
        sessionFallbackUser = {
          id: authUser.id,
          email: authUser.email || '',
          name:
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            authUser.email?.split('@')[0] ||
            'User',
          businessName: '',
          avatarUrl:
            authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture,
        };

        try {
          resolvedWorkspace = await getOwnerWorkspace(authUser.id);
        } catch (wsErr: any) {
          resolvedWorkspace = null;
          setWorkspaceRecoveryError(
            wsErr?.message ||
              'Unable to load or provision your workspace right now.'
          );
        }

        if (resolvedWorkspace) {
          if (
            lastWorkspaceIdRef.current &&
            lastWorkspaceIdRef.current !== resolvedWorkspace.id
          ) {
            localStorage.removeItem('zivofly_agents');
            localStorage.removeItem('zivofly_connections');
            localStorage.removeItem('zivofly_conversations');
            localStorage.removeItem('zivofly_inbox_conv_status_overrides_v1');
          }
          lastWorkspaceIdRef.current = resolvedWorkspace.id;

          setActiveWorkspaceId(
            authUser.id,
            resolvedWorkspace.id,
            resolvedWorkspace.name
          );
          setActiveWorkspace(resolvedWorkspace);
          setWorkspaceRecoveryError(null);
        } else {
          lastWorkspaceIdRef.current = null;
          setActiveWorkspace(null);
          clearActiveWorkspaceCache(authUser.id);
          setWorkspaceRecoveryError((prev) =>
            prev ||
            'Your account is signed in, but no owner workspace is currently linked to it. Retry workspace setup or contact support if the issue persists.'
          );
        }
      }

      const [userRes, agentsRes, connRes, convsRes] = await Promise.all([
        apiFetch('/api/user/profile'),
        apiFetch('/api/agents'),
        apiFetch('/api/connections'),
        apiFetch('/api/conversations'),
      ]);

      if (userRes.ok) {
        const ct = userRes.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const uData = await userRes.json();
          if (uData.user) setUser(uData.user);
          else setUser(sessionFallbackUser);
        } else if (sessionFallbackUser) {
          setUser(sessionFallbackUser);
        }
      } else if (sessionFallbackUser) {
        setUser(sessionFallbackUser);
      }

      if (agentsRes.ok) {
        const ct = agentsRes.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const aData = await agentsRes.json();
          setAgents(Array.isArray(aData.agents) ? aData.agents : []);
        }
      } else {
        setAgents([]);
      }

      if (connRes.ok) {
        const ct = connRes.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const cData = await connRes.json();
          const list = Array.isArray(cData.data)
            ? cData.data
            : Array.isArray(cData.connections)
            ? cData.connections
            : [];
          setConnections(list);
        }
      } else {
        setConnections([]);
      }

      if (convsRes.ok) {
        const ct = convsRes.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const cvData = await convsRes.json();
          setConversations(Array.isArray(cvData.conversations) ? cvData.conversations : []);
        }
      } else {
        setConversations([]);
      }
    } catch (err) {
      console.error('Failed to load initial data', err);
      setUser(null);
      setActiveWorkspace(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();

    if (supabase) {
      const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          localStorage.removeItem('zivofly_agents');
          localStorage.removeItem('zivofly_connections');
          localStorage.removeItem('zivofly_conversations');
          void loadData();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setActiveWorkspace(null);
          setWorkspaceRecoveryError(null);
          setAgents([]);
          setConnections([]);
          setConversations([]);
          lastWorkspaceIdRef.current = null;
          clearActiveWorkspaceCache();
          localStorage.removeItem('zivofly_agents');
          localStorage.removeItem('zivofly_connections');
          localStorage.removeItem('zivofly_conversations');
        }
      });

      return () => {
        authListener?.subscription?.unsubscribe();
      };
    }
  }, []);

  // Ensure Google OAuth callback query parameters are handled even if the Edge Function redirects to '/' or '/dashboard'
  useEffect(() => {
    if (isLoading) return;
    const search = window.location.search || '';
    if (!search) return;

    const params = new URLSearchParams(search);
    if (!params.has('google_oauth')) return;

    if (!currentPath.startsWith('/agents/')) {
      if (user && agents.length > 0) {
        const targetPath = `/agents/${agents[0].id}`;
        window.history.replaceState({}, '', `${targetPath}${search}`);
        setCurrentPath(targetPath);
        return;
      }

      void processGoogleWorkspaceOAuthCallbackFromUrl().then((res) => {
        if (!res.handled) return;
        if (res.outcome === 'success') {
          toast.success(
            res.message ||
              `Connected ${res.serviceLabel || 'Google Workspace'} successfully!`
          );
        } else if (res.outcome === 'error') {
          toast.error(
            res.message ||
              'Google Workspace authorization could not be completed.'
          );
        }
      });
    }
  }, [isLoading, currentPath, user, agents]);

  // Handlers for state updates
  const handleSignOut = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    localStorage.removeItem('zivofly_token');
    localStorage.removeItem('zivofly_supabase_auth_token');
    lastWorkspaceIdRef.current = null;
    clearActiveWorkspaceCache(user?.id);
    setUser(null);
    setActiveWorkspace(null);
    setWorkspaceRecoveryError(null);
    setAgents([]);
    setConnections([]);
    setConversations([]);
    toast.success('Signed out');
    navigate('/');
  };

  const handleAccountDeleted = () => {
    localStorage.removeItem('zivofly_token');
    localStorage.removeItem('zivofly_user');
    localStorage.removeItem('zivofly_agents');
    localStorage.removeItem('zivofly_connections');
    localStorage.removeItem('zivofly_conversations');
    lastWorkspaceIdRef.current = null;
    clearActiveWorkspaceCache(user?.id);
    setUser(null);
    setActiveWorkspace(null);
    setWorkspaceRecoveryError(null);
    setAgents([]);
    setConnections([]);
    setConversations([]);
    navigate('/');
  };

  const handleConnectionCreated = (newConn: ChannelConnection) => {
    setConnections((prev) => [newConn, ...prev.filter((c) => c.id !== newConn.id)]);
  };

  const handleConnectionUpdated = (updated: ChannelConnection) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const handleAgentCreated = (newAgent: Agent) => {
    setAgents((prev) => [newAgent, ...prev.filter((a) => a.id !== newAgent.id)]);
  };

  const handleAgentUpdated = (updated: Agent) => {
    setAgents((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a))
    );
  };

  const handleAgentDeleted = (deletedId: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== deletedId));
    setConnections((prev) =>
      prev.map((c) =>
        c.agent_id === deletedId
          ? { ...c, agent_id: null, agents: undefined }
          : c
      )
    );
  };

  const handleUpdateConversation = (updated: Conversation) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  // Route matching
  const renderCurrentView = () => {
    if (currentPath === '/reset-password') {
      return (
        <ResetPasswordPage
          onNavigate={navigate}
          onSessionCleared={() => {
            clearActiveWorkspaceCache(user?.id);
            setUser(null);
            setActiveWorkspace(null);
            setWorkspaceRecoveryError(null);
            setAgents([]);
            setConnections([]);
            setConversations([]);
          }}
        />
      );
    }

    if (currentPath === '/auth') {
      return (
        <AuthPage
          onSignInSuccess={(u) => {
            setUser(u);
            void loadData();
          }}
          onNavigate={navigate}
        />
      );
    }

    if (currentPath === '/privacy' || currentPath === '/privacy-policy') {
      return (
        <PrivacyPolicyPage
          onNavigate={navigate}
          isAuthenticated={Boolean(user)}
        />
      );
    }

    if (currentPath === '/terms' || currentPath === '/terms-of-service') {
      return (
        <TermsOfServicePage
          onNavigate={navigate}
          isAuthenticated={Boolean(user)}
        />
      );
    }

    if (currentPath === '/support' || currentPath === '/contact') {
      return <SupportPage onNavigate={navigate} user={user} />;
    }

    if (currentPath === '/' && !user) {
      return <LandingPage onNavigate={navigate} isAuthenticated={false} />;
    }

    if (currentPath === '/' && user) {
      return <LandingPage onNavigate={navigate} isAuthenticated={true} />;
    }

    if (isLoading && isWorkspaceProtectedRoute(currentPath)) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">Loading workspace…</p>
        </div>
      );
    }

    if (
      supabase &&
      user &&
      !activeWorkspace &&
      isWorkspaceProtectedRoute(currentPath) &&
      currentPath !== '/profile'
    ) {
      return (
        <div className="mx-auto max-w-lg py-12">
          <div className="surface-card p-6 sm:p-8 text-center space-y-5">
            <div className="mx-auto size-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium tracking-tight text-foreground">
                Workspace Recovery Needed
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {workspaceRecoveryError ||
                  'Your account is signed in, but we could not locate or provision an owner workspace for your account.'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void loadData()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-95 transition-opacity cursor-pointer"
              >
                <RefreshCw className="size-3.5" />
                <span>Retry Workspace Setup</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <UserIcon className="size-3.5" />
                <span>Account Profile</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <LogOut className="size-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (currentPath === '/dashboard') {
      return (
        <DashboardPage
          key={activeWorkspace?.id || 'default'}
          connections={connections}
          onNavigate={navigate}
        />
      );
    }

    if (currentPath.startsWith('/connect/')) {
      const channelKey = currentPath.split('/')[2] || 'whatsapp';
      return (
        <ConnectChannelPage
          channelKey={channelKey}
          agents={agents}
          onNavigate={navigate}
          onConnectionCreated={handleConnectionCreated}
        />
      );
    }

    if (currentPath.startsWith('/channels/')) {
      const connectionId = currentPath.split('/')[2] || '';
      return (
        <ChannelSettingsPage
          connectionId={connectionId}
          connections={connections}
          agents={agents}
          onNavigate={navigate}
          onConnectionUpdated={handleConnectionUpdated}
        />
      );
    }

    if (currentPath === '/agents') {
      return (
        <AgentsPage
          agents={agents}
          onNavigate={navigate}
          onAgentCreated={handleAgentCreated}
          onAgentUpdated={handleAgentUpdated}
          onAgentDeleted={handleAgentDeleted}
        />
      );
    }

    if (currentPath.startsWith('/agents/')) {
      const agentId = currentPath.split('/')[2] || '';
      return (
        <AgentDetailPage
          agentId={agentId}
          agents={agents}
          connections={connections}
          onNavigate={navigate}
          onAgentCreated={handleAgentCreated}
          onAgentUpdated={handleAgentUpdated}
          onAgentDeleted={handleAgentDeleted}
        />
      );
    }

    if (currentPath === '/inbox') {
      return (
        <InboxPage
          key={activeWorkspace?.id || 'default'}
          conversations={conversations}
          onUpdateConversation={handleUpdateConversation}
        />
      );
    }

    if (currentPath === '/billing' || currentPath === '/billing-tokens') {
      return <BillingPage />;
    }

    if (currentPath === '/profile') {
      return (
        <ProfilePage
          key={activeWorkspace?.id || 'default'}
          user={user}
          agents={agents}
          connections={connections}
          activeWorkspace={activeWorkspace}
          workspaceRecoveryError={workspaceRecoveryError}
          onRetryWorkspace={() => void loadData()}
          onUserUpdated={(updated) => {
            setUser(updated);
            const updatedBiz =
              typeof updated?.businessName === 'string'
                ? updated.businessName.trim()
                : '';
            if (
              activeWorkspace &&
              updatedBiz &&
              updatedBiz !== 'My Business' &&
              updatedBiz !== 'My Workspace'
            ) {
              saveWorkspaceNameHint(activeWorkspace.id, updatedBiz);
              if (updated?.id) {
                setActiveWorkspaceId(updated.id, activeWorkspace.id, updatedBiz);
              }
              setActiveWorkspace((prev) =>
                prev ? { ...prev, name: updatedBiz } : prev
              );
            }
            if (supabase && updated?.id) {
              void getOwnerWorkspace(updated.id)
                .then((ws) => {
                  if (ws) {
                    setActiveWorkspace(ws);
                    setWorkspaceRecoveryError(null);
                  }
                })
                .catch(() => {});
            }
          }}
          onAccountDeleted={handleAccountDeleted}
          onNavigate={navigate}
          onSignOut={handleSignOut}
        />
      );
    }

    // Default fallback to dashboard if signed in (or recovery view if no workspace), else landing
    if (user) {
      if (supabase && !activeWorkspace) {
        return (
          <div className="mx-auto max-w-lg py-12">
            <div className="surface-card p-6 sm:p-8 text-center space-y-5">
              <div className="mx-auto size-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-6" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-medium tracking-tight text-foreground">
                  Workspace Recovery Needed
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {workspaceRecoveryError ||
                    'Your account is signed in, but we could not locate or provision an owner workspace for your account.'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => void loadData()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-95 transition-opacity cursor-pointer"
                >
                  <RefreshCw className="size-3.5" />
                  <span>Retry Workspace Setup</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  <UserIcon className="size-3.5" />
                  <span>Account Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  <LogOut className="size-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <DashboardPage
          key={activeWorkspace?.id || 'default'}
          connections={connections}
          onNavigate={navigate}
        />
      );
    }

    return <LandingPage onNavigate={navigate} isAuthenticated={false} />;
  };

  const isFullBleedPublicPage =
    currentPath === '/' ||
    currentPath === '/auth' ||
    currentPath === '/reset-password' ||
    currentPath === '/privacy' ||
    currentPath === '/privacy-policy' ||
    currentPath === '/terms' ||
    currentPath === '/terms-of-service' ||
    currentPath === '/support' ||
    currentPath === '/contact';

  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans selection:bg-primary/20 selection:text-primary transition-colors">
      <Toaster position="top-right" richColors theme={theme as 'light' | 'dark'} />

      {/* Header */}
      <Header
        user={user}
        currentPath={currentPath}
        onNavigate={navigate}
        onSignOut={handleSignOut}
      />

      {/* Main View Container */}
      <main
        className={
          isFullBleedPublicPage
            ? ''
            : 'mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8'
        }
      >
        {renderCurrentView()}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
