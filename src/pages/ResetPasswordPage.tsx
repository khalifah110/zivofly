import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { clearActiveWorkspaceCache, signOutFromSupabase } from '../lib/supabaseService';

type RecoveryPageState = 'verifying' | 'ready' | 'invalid';

interface ResetPasswordPageProps {
  onNavigate: (path: string) => void;
  onSessionCleared?: () => void;
}

const MIN_PASSWORD_LENGTH = 6;

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  onNavigate,
  onSessionCleared,
}) => {
  const [pageState, setPageState] = useState<RecoveryPageState>('verifying');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Resend reset email controls for invalid/expired links
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const cleanRecoveryUrl = () => {
      if (typeof window === 'undefined') return;
      if (window.location.search || window.location.hash) {
        window.history.replaceState({}, '', '/reset-password');
      }
    };

    if (!supabase) {
      setPageState('invalid');
      setStatusError('Authentication service is not configured.');
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);

    const urlError =
      searchParams.get('error_description') ||
      hashParams.get('error_description') ||
      searchParams.get('error') ||
      hashParams.get('error');

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || (session?.user && event === 'SIGNED_IN')) {
        setPageState('ready');
        setStatusError(null);
        cleanRecoveryUrl();
      }
    });

    const establishRecoverySession = async () => {
      if (!supabase) return;

      if (urlError) {
        cleanRecoveryUrl();
        if (!cancelled) {
          setPageState('invalid');
          setStatusError(
            urlError.replace(/\+/g, ' ').trim() ||
              'This password reset link is invalid or has expired.'
          );
        }
        return;
      }

      try {
        // 1. Let Supabase finish detectSessionInUrl (handles hash access_token and PKCE code)
        const { data: initialSessionData } = await supabase.auth.getSession();
        if (initialSessionData?.session) {
          cleanRecoveryUrl();
          if (!cancelled) {
            setPageState('ready');
            setStatusError(null);
          }
          return;
        }

        // 2. Fallback for PKCE ?code=... if not already exchanged
        const code = searchParams.get('code')?.trim();
        if (code) {
          const { data: exchangeData, error: exchangeErr } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeData?.session && !exchangeErr) {
            cleanRecoveryUrl();
            if (!cancelled) {
              setPageState('ready');
              setStatusError(null);
            }
            return;
          }

          // Re-check getSession in case detectSessionInUrl consumed the single-use code concurrently
          const { data: postCodeSession } = await supabase.auth.getSession();
          if (postCodeSession?.session) {
            cleanRecoveryUrl();
            if (!cancelled) {
              setPageState('ready');
              setStatusError(null);
            }
            return;
          }

          cleanRecoveryUrl();
          if (!cancelled) {
            setPageState('invalid');
            setStatusError(
              exchangeErr?.message ||
                'This password reset link is invalid or has expired. Please request a new reset email.'
            );
          }
          return;
        }

        // 3. Fallback for ?token_hash=...&type=recovery email templates
        const tokenHash = searchParams.get('token_hash')?.trim();
        const typeParam = (searchParams.get('type') || hashParams.get('type') || 'recovery').trim();
        if (tokenHash) {
          const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: (typeParam as EmailOtpType) || 'recovery',
          });
          if (otpData?.session && !otpErr) {
            cleanRecoveryUrl();
            if (!cancelled) {
              setPageState('ready');
              setStatusError(null);
            }
            return;
          }

          cleanRecoveryUrl();
          if (!cancelled) {
            setPageState('invalid');
            setStatusError(
              otpErr?.message ||
                'This password reset link is invalid or has expired. Please request a new reset email.'
            );
          }
          return;
        }

        // 4. Fallback for implicit hash tokens if detectSessionInUrl didn't establish session
        const accessToken = hashParams.get('access_token')?.trim();
        const refreshToken = hashParams.get('refresh_token')?.trim();
        if (accessToken && refreshToken) {
          const { data: setSessionData, error: setSessionErr } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          if (setSessionData?.session && !setSessionErr) {
            cleanRecoveryUrl();
            if (!cancelled) {
              setPageState('ready');
              setStatusError(null);
            }
            return;
          }

          cleanRecoveryUrl();
          if (!cancelled) {
            setPageState('invalid');
            setStatusError(
              setSessionErr?.message ||
                'This password reset link is invalid or has expired. Please request a new reset email.'
            );
          }
          return;
        }

        // No valid recovery session or tokens found
        if (!cancelled) {
          setPageState('invalid');
          setStatusError(
            'This password reset link is invalid or has expired. Please request a new reset email below.'
          );
        }
      } catch (err: any) {
        cleanRecoveryUrl();
        if (!cancelled) {
          setPageState('invalid');
          setStatusError(
            err?.message ||
              'Unable to verify your password reset link. Please request a new reset email.'
          );
        }
      }
    };

    void establishRecoverySession();

    return () => {
      cancelled = true;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    if (!supabase) {
      setFormError('Authentication service is not configured.');
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setFormError(error.message || 'Could not update your password.');
        toast.error(error.message || 'Could not update your password.');
        setIsUpdating(false);
        return;
      }

      setNewPassword('');
      setConfirmPassword('');

      try {
        await signOutFromSupabase();
      } catch {
        // ignore sign-out error after password update
      }
      localStorage.removeItem('zivofly_token');
      localStorage.removeItem('zivofly_supabase_auth_token');
      clearActiveWorkspaceCache();
      if (onSessionCleared) {
        onSessionCleared();
      }

      toast.success('Your password has been updated. Please sign in with your new password.');
      onNavigate('/auth?reset=success');
    } catch (err: any) {
      const msg = err?.message || 'An error occurred while updating your password.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRequestNewResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendError(null);
    setResendSent(false);

    const trimmedEmail = resendEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setResendError('Please enter a valid email address.');
      return;
    }

    if (!supabase) {
      setResendError('Authentication service is not configured.');
      return;
    }

    setIsResending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setResendError(error.message || 'Failed to send reset link.');
        toast.error(error.message || 'Failed to send reset link.');
        return;
      }

      setResendSent(true);
      toast.success('Password reset instructions sent to your email.');
    } catch (err: any) {
      const msg = err?.message || 'Failed to send reset link.';
      setResendError(msg);
      toast.error(msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="hero-glow flex min-h-screen items-center justify-center px-4 sm:px-6 py-12">
      <div className="w-full max-w-md">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="font-display text-2xl font-normal text-foreground hover:opacity-90 cursor-pointer"
          >
            Zivofly
          </button>
        </div>

        <div className="surface-card mt-6 p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
          {pageState === 'verifying' && (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <h1 className="text-lg font-medium text-foreground">
                Verifying reset link…
              </h1>
              <p className="text-xs text-muted-foreground">
                Please wait while we validate your password recovery session.
              </p>
            </div>
          )}

          {pageState === 'ready' && (
            <div className="space-y-5">
              <div>
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/25 text-primary">
                  <KeyRound className="size-5" />
                </div>
                <h1 className="text-2xl font-medium tracking-tight text-foreground">
                  Set a new password
                </h1>
                <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
                  Choose a new password with at least {MIN_PASSWORD_LENGTH} characters for your Zivofly account.
                </p>
              </div>

              {formError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-new-password"
                    className="text-xs font-medium text-foreground"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-new-password"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                    >
                      {showNewPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="reset-confirm-password"
                    className="text-xs font-medium text-foreground"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      placeholder="Re-enter your new password"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={
                        showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-2xs flex items-center justify-center gap-2"
                >
                  {isUpdating && <Loader2 className="size-4 animate-spin" />}
                  <span>{isUpdating ? 'Updating password…' : 'Update password'}</span>
                </button>
              </form>
            </div>
          )}

          {pageState === 'invalid' && (
            <div className="space-y-5">
              <div>
                <button
                  type="button"
                  onClick={() => onNavigate('/auth')}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>Back to sign in</span>
                </button>
                <h1 className="text-2xl font-medium tracking-tight text-foreground">
                  Reset link invalid or expired
                </h1>
                <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground">
                  {statusError ||
                    'This password reset link is no longer valid. Request a new reset email below.'}
                </p>
              </div>

              {resendError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{resendError}</span>
                </div>
              )}

              {resendSent && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                  <span>Check your inbox for a fresh password reset link.</span>
                </div>
              )}

              <form onSubmit={handleRequestNewResetEmail} className="space-y-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="resend-reset-email"
                    className="text-xs font-medium text-foreground"
                  >
                    Account email
                  </label>
                  <div className="relative">
                    <Mail className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="resend-reset-email"
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResending}
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer shadow-2xs flex items-center justify-center gap-2"
                >
                  {isResending && <Loader2 className="size-4 animate-spin" />}
                  <span>
                    {isResending ? 'Sending reset link…' : 'Send another reset email'}
                  </span>
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/privacy');
            }}
            className="hover:text-foreground underline-offset-2 hover:underline transition-colors"
          >
            Privacy Policy
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/terms');
            }}
            className="hover:text-foreground underline-offset-2 hover:underline transition-colors"
          >
            Terms of Service
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/support"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/support');
            }}
            className="hover:text-foreground underline-offset-2 hover:underline transition-colors"
          >
            Support
          </a>
        </div>
      </div>
    </div>
  );
};
