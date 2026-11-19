import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  MailWarning,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { User, WorkspaceRole } from '../types';
import { supabase } from '../lib/supabaseClient';
import {
  acceptWorkspaceInvite,
  PENDING_INVITE_TOKEN_STORAGE_KEY,
  signOutFromSupabase,
} from '../lib/supabaseService';

export type InviteAcceptPageState =
  | 'pending_auth'
  | 'pending_accept'
  | 'accepted'
  | 'expired'
  | 'revoked'
  | 'wrong_account'
  | 'error';

interface AcceptInvitePageProps {
  user: User | null;
  isAuthLoading: boolean;
  onNavigate: (path: string) => void;
  onInviteAccepted: (workspaceId?: string) => Promise<void> | void;
  onSignedOut?: () => void;
}

function readInviteTokenFromLocationOrStorage(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const queryToken = (
    params.get('invite_token') ||
    params.get('token') ||
    ''
  ).trim();
  if (queryToken) {
    try {
      sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, queryToken);
    } catch {
      // ignore storage failures
    }
    return queryToken;
  }

  try {
    return (sessionStorage.getItem(PENDING_INVITE_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

export const AcceptInvitePage: React.FC<AcceptInvitePageProps> = ({
  user,
  isAuthLoading,
  onNavigate,
  onInviteAccepted,
  onSignedOut,
}) => {
  const [inviteToken] = useState<string>(() => readInviteTokenFromLocationOrStorage());
  const [pageState, setPageState] = useState<InviteAcceptPageState>(() =>
    !inviteToken ? 'error' : user ? 'pending_accept' : 'pending_auth'
  );
  const [statusMessage, setStatusMessage] = useState<string>(() =>
    !inviteToken
      ? 'This invitation link is missing an invite_token parameter.'
      : 'Sign in with the verified email address that received this invitation to join the workspace.'
  );
  const [acceptedWorkspaceName, setAcceptedWorkspaceName] = useState<string | null>(null);
  const [acceptedRole, setAcceptedRole] = useState<WorkspaceRole>('member');
  const [signedInEmail, setSignedInEmail] = useState<string | null>(user?.email || null);
  const [invitedEmailHint, setInvitedEmailHint] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const attemptedForUserRef = useRef<string | null>(null);

  // Keep invite_token in URL bar if restored from sessionStorage after an OAuth redirect
  useEffect(() => {
    if (!inviteToken || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('invite_token')) {
      params.set('invite_token', inviteToken);
      const nextUrl = `/accept-invite?${params.toString()}`;
      window.history.replaceState({}, '', nextUrl);
    }
  }, [inviteToken]);

  const runAcceptFlow = async () => {
    if (!inviteToken) {
      setPageState('error');
      setStatusMessage('This invitation link is missing an invite_token parameter.');
      return;
    }

    setPageState('pending_accept');
    setStatusMessage('Verifying your account and accepting your workspace invitation…');
    setIsBusy(true);

    try {
      const result = await acceptWorkspaceInvite(inviteToken);
      setSignedInEmail(result.userEmail || user?.email || null);
      if (result.invitedEmail) {
        setInvitedEmailHint(result.invitedEmail);
      }

      if (result.status === 'accepted') {
        try {
          sessionStorage.removeItem(PENDING_INVITE_TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }
        setAcceptedWorkspaceName(result.workspaceName || null);
        setAcceptedRole(result.role || 'member');
        setPageState('accepted');
        setStatusMessage(result.message);
        await onInviteAccepted(result.workspaceId);
        toast.success(result.message);
        return;
      }

      if (result.status === 'expired') {
        try {
          sessionStorage.removeItem(PENDING_INVITE_TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }
        setPageState('expired');
        setStatusMessage(result.message);
        return;
      }

      if (result.status === 'revoked') {
        try {
          sessionStorage.removeItem(PENDING_INVITE_TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }
        setPageState('revoked');
        setStatusMessage(result.message);
        return;
      }

      if (result.status === 'wrong_account') {
        setPageState('wrong_account');
        setStatusMessage(result.message);
        return;
      }

      setPageState('error');
      setStatusMessage(result.message);
    } catch (err: any) {
      setPageState('error');
      setStatusMessage(err?.message || 'Unable to accept workspace invitation.');
    } finally {
      setIsBusy(false);
    }
  };

  useEffect(() => {
    if (!inviteToken) {
      setPageState('error');
      setStatusMessage('This invitation link is missing an invite_token parameter.');
      return;
    }

    if (isAuthLoading) return;

    if (!user) {
      attemptedForUserRef.current = null;
      setSignedInEmail(null);
      setPageState('pending_auth');
      setStatusMessage(
        'Sign in or create an account using the exact verified email address that received this invitation.'
      );
      return;
    }

    const attemptKey = `${user.id}:${inviteToken}`;
    if (attemptedForUserRef.current === attemptKey) {
      return;
    }
    attemptedForUserRef.current = attemptKey;
    void runAcceptFlow();
  }, [user, isAuthLoading, inviteToken]);

  const handleGoToAuth = (authMode: 'signin' | 'signup') => {
    if (inviteToken) {
      try {
        sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, inviteToken);
      } catch {
        // ignore
      }
      const params = new URLSearchParams();
      params.set('invite_token', inviteToken);
      if (authMode === 'signup') {
        params.set('mode', 'signup');
      }
      onNavigate(`/auth?${params.toString()}`);
    } else {
      onNavigate('/auth');
    }
  };

  const handleDirectGoogleAuth = async () => {
    if (!supabase) {
      handleGoToAuth('signin');
      return;
    }

    setIsBusy(true);
    try {
      if (inviteToken) {
        try {
          sessionStorage.setItem(PENDING_INVITE_TOKEN_STORAGE_KEY, inviteToken);
        } catch {
          // ignore
        }
      }
      const redirectTo = inviteToken
        ? `${window.location.origin}/accept-invite?invite_token=${encodeURIComponent(inviteToken)}`
        : `${window.location.origin}/accept-invite`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      if (error) {
        toast.error(error.message);
        setIsBusy(false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not start Google sign-in.');
      setIsBusy(false);
    }
  };

  const handleSwitchAccount = async () => {
    setIsBusy(true);
    try {
      await signOutFromSupabase();
    } catch {
      // ignore sign-out error
    }
    localStorage.removeItem('zivofly_token');
    localStorage.removeItem('zivofly_supabase_auth_token');
    if (onSignedOut) {
      onSignedOut();
    }
    attemptedForUserRef.current = null;
    handleGoToAuth('signin');
    setIsBusy(false);
  };

  const renderBadge = () => {
    switch (pageState) {
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            <span>Accepted</span>
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Clock className="size-3.5" />
            <span>Expired</span>
          </span>
        );
      case 'revoked':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/30 px-2.5 py-1 text-xs font-semibold text-destructive">
            <Ban className="size-3.5" />
            <span>Revoked</span>
          </span>
        );
      case 'wrong_account':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <MailWarning className="size-3.5" />
            <span>Wrong Account</span>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 border border-destructive/30 px-2.5 py-1 text-xs font-semibold text-destructive">
            <AlertCircle className="size-3.5" />
            <span>Error</span>
          </span>
        );
      case 'pending_auth':
      case 'pending_accept':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/25 px-2.5 py-1 text-xs font-semibold text-primary">
            <Clock className="size-3.5" />
            <span>Pending</span>
          </span>
        );
    }
  };

  return (
    <div className="hero-glow flex min-h-screen items-center justify-center px-4 sm:px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="font-display text-2xl font-normal text-foreground hover:opacity-90 cursor-pointer"
          >
            Zivofly
          </button>
        </div>

        <div className="surface-card p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Workspace Invitation
            </h1>
            {renderBadge()}
          </div>

          {pageState === 'pending_auth' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs sm:text-sm text-muted-foreground leading-relaxed space-y-2">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <ShieldCheck className="size-4 text-primary shrink-0" />
                  <span>Verified email required</span>
                </div>
                <p>{statusMessage}</p>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleDirectGoogleAuth}
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <svg className="size-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGoToAuth('signin')}
                  disabled={isBusy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs sm:text-sm font-medium text-primary-foreground hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <span>Sign in with Email</span>
                  <ArrowRight className="size-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleGoToAuth('signup')}
                  disabled={isBusy}
                  className="w-full rounded-xl border border-border bg-card py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Don&apos;t have an account? Create one
                </button>
              </div>
            </div>
          )}

          {pageState === 'pending_accept' && (
            <div className="py-6 flex flex-col items-center text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">
                Accepting workspace invitation…
              </p>
              <p className="text-xs text-muted-foreground">
                {statusMessage}
              </p>
            </div>
          )}

          {pageState === 'accepted' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                  <UserCheck className="size-4 shrink-0" />
                  <span>You&apos;ve joined the workspace</span>
                </div>
                <p className="text-foreground/90">{statusMessage}</p>
                {acceptedWorkspaceName && (
                  <div className="pt-1 text-xs text-muted-foreground">
                    Workspace:{' '}
                    <span className="font-semibold text-foreground">
                      {acceptedWorkspaceName}
                    </span>{' '}
                    ({acceptedRole === 'member' ? 'Team Member' : acceptedRole})
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  onNavigate(acceptedRole === 'member' ? '/inbox' : '/dashboard')
                }
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground hover:opacity-95 transition-opacity cursor-pointer shadow-2xs"
              >
                <span>
                  {acceptedRole === 'member' ? 'Open Shared Inbox' : 'Open Workspace'}
                </span>
                <ArrowRight className="size-4" />
              </button>
            </div>
          )}

          {pageState === 'expired' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-200 space-y-1.5">
                <p className="font-semibold">This invitation has expired</p>
                <p className="text-xs leading-relaxed opacity-90">{statusMessage}</p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate(user ? '/inbox' : '/')}
                className="w-full rounded-xl border border-border bg-card py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                {user ? 'Go to Workspace' : 'Back to Home'}
              </button>
            </div>
          )}

          {pageState === 'revoked' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs sm:text-sm text-destructive space-y-1.5">
                <p className="font-semibold">Invitation revoked</p>
                <p className="text-xs leading-relaxed opacity-90">{statusMessage}</p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate(user ? '/inbox' : '/')}
                className="w-full rounded-xl border border-border bg-card py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                {user ? 'Go to Workspace' : 'Back to Home'}
              </button>
            </div>
          )}

          {pageState === 'wrong_account' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-900 dark:text-amber-200 space-y-2">
                <p className="font-semibold">Different or unverified email account</p>
                <p className="text-xs leading-relaxed opacity-90">{statusMessage}</p>
                {signedInEmail && (
                  <p className="text-xs pt-1">
                    Signed in as:{' '}
                    <span className="font-mono font-semibold">{signedInEmail}</span>
                  </p>
                )}
                {invitedEmailHint && (
                  <p className="text-xs">
                    Invited email:{' '}
                    <span className="font-mono font-semibold">{invitedEmailHint}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  disabled={isBusy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
                >
                  <LogOut className="size-4" />
                  <span>Sign out &amp; switch account</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/')}
                  className="w-full rounded-xl border border-border bg-card py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  Back to Home
                </button>
              </div>
            </div>
          )}

          {pageState === 'error' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs sm:text-sm text-destructive space-y-1.5">
                <p className="font-semibold">Could not process invitation</p>
                <p className="text-xs leading-relaxed opacity-90">{statusMessage}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                {inviteToken && user && (
                  <button
                    type="button"
                    onClick={() => {
                      attemptedForUserRef.current = null;
                      void runAcceptFlow();
                    }}
                    disabled={isBusy}
                    className="flex-1 rounded-xl bg-primary py-2.5 text-xs sm:text-sm font-medium text-primary-foreground hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate(user ? '/inbox' : '/')}
                  className="flex-1 rounded-xl border border-border bg-card py-2.5 text-xs sm:text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  {user ? 'Go to Workspace' : 'Back to Home'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
