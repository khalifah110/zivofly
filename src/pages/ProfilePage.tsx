import React, { useState } from 'react';
import {
  Mail,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  Bot,
  LayoutGrid,
  Coins,
  LogOut,
  Building2,
  UserPlus,
  Send,
  Clock,
  Ban,
  Loader2,
  Inbox,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  User,
  Agent,
  ChannelConnection,
  WorkspaceMembership,
  WorkspaceInvite,
  WorkspaceMember,
} from '../types';
import { apiFetch } from '../lib/api';
import {
  listWorkspaceInvites,
  listWorkspaceMembers,
  sendWorkspaceInvite,
  revokeWorkspaceInvite,
  broadcastMemberProfileUpdate,
  subscribeToWorkspaceMemberProfileUpdates,
  MemberProfileUpdateEvent,
} from '../lib/supabaseService';
import { DeleteAccountModal } from '../components/DeleteAccountModal';

interface ProfilePageProps {
  user: User | null;
  agents: Agent[];
  connections: ChannelConnection[];
  workspaces?: WorkspaceMembership[];
  activeWorkspace?: WorkspaceMembership | null;
  onSwitchWorkspace?: (workspaceId: string) => void;
  onUserUpdated: (updatedUser: User) => void;
  onAccountDeleted: () => void;
  onNavigate: (path: string) => void;
  onSignOut: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  user,
  agents,
  connections,
  workspaces = [],
  activeWorkspace = null,
  onSwitchWorkspace,
  onUserUpdated,
  onAccountDeleted,
  onNavigate,
  onSignOut,
}) => {
  // Form edit states
  const resolveCleanBusinessName = (u: User | null) => {
    if (!u?.businessName) return '';
    const trimmed = u.businessName.trim();
    if (trimmed === 'My Business' || trimmed === 'My Workspace') {
      return '';
    }
    return trimmed;
  };

  const [name, setName] = useState(user?.name || '');
  const [businessName, setBusinessName] = useState(() => resolveCleanBusinessName(user));
  const [isSaving, setIsSaving] = useState(false);

  const isTeamMember = activeWorkspace?.role === 'member';

  // Invite state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  // Workspace members state (owner view only)
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Deletion modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state if user prop changes
  React.useEffect(() => {
    if (user) {
      setName(user.name || '');
      setBusinessName(resolveCleanBusinessName(user));
    }
  }, [user]);

  const invitesRef = React.useRef<WorkspaceInvite[]>([]);
  React.useEffect(() => {
    invitesRef.current = invites;
  }, [invites]);

  const loadWorkspaceInvitesList = React.useCallback(
    async (workspaceId: string, options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      if (!silent) {
        setIsLoadingInvites(true);
        setIsLoadingMembers(true);
        setInvitesError(null);
        setMembersError(null);
      }

      let loadedInvites: WorkspaceInvite[] | undefined;
      try {
        const list = await listWorkspaceInvites(workspaceId);
        loadedInvites = list;
        invitesRef.current = list;
        setInvites(list);
      } catch (err: any) {
        if (!silent) {
          setInvitesError(err?.message || 'Unable to load workspace invitations.');
        }
      } finally {
        if (!silent) {
          setIsLoadingInvites(false);
        }
      }

      try {
        const memberList = await listWorkspaceMembers(
          workspaceId,
          activeWorkspace?.ownerUserId || user?.id,
          loadedInvites ?? invitesRef.current
        );
        setMembers(memberList);
        if (!silent) {
          setMembersError(null);
        }
      } catch (err: any) {
        if (!silent) {
          setMembersError(err?.message || 'Unable to load workspace members.');
        }
      } finally {
        if (!silent) {
          setIsLoadingMembers(false);
        }
      }
    },
    [activeWorkspace?.ownerUserId, user?.id]
  );

  const refreshWorkspaceMembersSilently = React.useCallback(
    async (workspaceId: string) => {
      try {
        const memberList = await listWorkspaceMembers(
          workspaceId,
          activeWorkspace?.ownerUserId || user?.id,
          invitesRef.current.length > 0 ? invitesRef.current : undefined
        );
        setMembers(memberList);
      } catch {
        // Keep current list on transient background refresh failures
      }
    },
    [activeWorkspace?.ownerUserId, user?.id]
  );

  React.useEffect(() => {
    if (!activeWorkspace?.id || isTeamMember) {
      setInvites([]);
      invitesRef.current = [];
      setMembers([]);
      setInvitesError(null);
      setMembersError(null);
      setIsInviteOpen(false);
      return;
    }
    void loadWorkspaceInvitesList(activeWorkspace.id);
  }, [activeWorkspace?.id, isTeamMember, loadWorkspaceInvitesList]);

  // Live reflection whenever a workspace member updates their full name (Realtime, cross-tab, focus, and periodic sync)
  React.useEffect(() => {
    if (!activeWorkspace?.id || isTeamMember) return;
    const workspaceId = activeWorkspace.id;

    const applyMemberPatch = (patch: MemberProfileUpdateEvent) => {
      const nextName = patch.fullName?.trim();
      if (!nextName) return;
      const patchEmailLower = patch.email?.trim().toLowerCase() || '';

      setMembers((prev) => {
        let changed = false;
        const updated = prev.map((member) => {
          const idMatch =
            Boolean(patch.userId) &&
            (member.userId === patch.userId || member.id === patch.userId);
          const emailMatch =
            Boolean(patchEmailLower) &&
            Boolean(member.email) &&
            member.email.trim().toLowerCase() === patchEmailLower;

          if (idMatch || emailMatch) {
            changed = true;
            return {
              ...member,
              userId: member.userId || patch.userId || undefined,
              name: nextName,
              avatarUrl: patch.avatarUrl || member.avatarUrl,
            };
          }
          return member;
        });

        if (!changed) return prev;
        return updated.sort((a, b) => {
          const labelA = (a.name || a.email || '').toLowerCase();
          const labelB = (b.name || b.email || '').toLowerCase();
          return labelA.localeCompare(labelB);
        });
      });
    };

    const unsubscribe = subscribeToWorkspaceMemberProfileUpdates({
      workspaceId,
      onProfilePatch: applyMemberPatch,
      onRefresh: () => {
        void refreshWorkspaceMembersSilently(workspaceId);
      },
    });

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshWorkspaceMembersSilently(workspaceId);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleVisibilityOrFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    }

    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refreshWorkspaceMembersSilently(workspaceId);
    }, 15000);

    return () => {
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleVisibilityOrFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      }
      clearInterval(intervalId);
    };
  }, [activeWorkspace?.id, isTeamMember, refreshWorkspaceMembersSilently]);

  const hasEnteredValidBusinessName = (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return false;
    if (trimmed === 'My Business' || trimmed === 'My Workspace') return false;
    return true;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Full name cannot be empty');
      return;
    }

    const savedName = (user?.name || '').trim();
    const trimmedBiz = businessName.trim();
    const savedBiz = resolveCleanBusinessName(user);
    const nameChanged = trimmedName !== savedName;
    const bizChanged = !isTeamMember && trimmedBiz !== savedBiz;
    const workspaceNeedsSync =
      !isTeamMember &&
      hasEnteredValidBusinessName(trimmedBiz) &&
      activeWorkspace?.name !== trimmedBiz;

    const payload: Record<string, string> = {};
    if (nameChanged) {
      payload.name = trimmedName;
    }
    if (bizChanged || workspaceNeedsSync) {
      payload.businessName = trimmedBiz;
      if (activeWorkspace?.id) {
        payload.workspaceId = activeWorkspace.id;
      }
    }

    if (!nameChanged && !bizChanged && !workspaceNeedsSync) {
      toast.info('No profile changes to save');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const updated = data.user || {
          ...user,
          ...(nameChanged ? { name: trimmedName } : {}),
          ...(bizChanged || workspaceNeedsSync ? { businessName: trimmedBiz } : {}),
        };
        onUserUpdated(updated);

        // Broadcast updated full name only when full_name actually changed
        if (nameChanged && updated?.id && updated?.name) {
          const targetWorkspaceIds = Array.from(
            new Set(
              [
                ...(workspaces || []).map((w) => w.id),
                activeWorkspace?.id || '',
              ].filter(Boolean)
            )
          );
          void broadcastMemberProfileUpdate({
            userId: updated.id,
            fullName: updated.name,
            email: updated.email || user?.email,
            avatarUrl: updated.avatarUrl,
            workspaceIds: targetWorkspaceIds,
          });
        }

        toast.success('Profile details saved successfully', {
          icon: <CheckCircle2 className="size-4 text-emerald-500" />,
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData?.error || 'Failed to update profile');
      }
    } catch {
      toast.error('An error occurred while saving your profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (isTeamMember) return;
    if (!activeWorkspace?.id) {
      toast.error('No active workspace found for sending invitations.');
      return;
    }

    const trimmedBiz = businessName.trim();
    if (!hasEnteredValidBusinessName(trimmedBiz)) {
      toast.error('Please enter your Business Name before sending an invite.');
      const bizInput = document.getElementById('profile-business-name') as HTMLInputElement | null;
      bizInput?.focus();
      return;
    }

    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      toast.error('Please enter a valid email address to invite');
      return;
    }

    setIsSendingInvite(true);
    try {
      const savedBiz = resolveCleanBusinessName(user);
      if (trimmedBiz !== savedBiz || activeWorkspace.name !== trimmedBiz) {
        const profileRes = await apiFetch('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: trimmedBiz,
            workspaceId: activeWorkspace.id,
          }),
        });
        if (!profileRes.ok) {
          const errData = await profileRes.json().catch(() => ({}));
          toast.error(
            errData?.error || 'Failed to save your Business Name before sending the invite.'
          );
          return;
        }
        const profileData = await profileRes.json().catch(() => ({}));
        const updatedUser = profileData.user || {
          ...user,
          businessName: trimmedBiz,
        };
        onUserUpdated(updatedUser);
      }

      const res = await sendWorkspaceInvite(activeWorkspace.id, trimmedEmail);
      toast.success(res.message || `Invitation sent to ${trimmedEmail}`, {
        icon: <CheckCircle2 className="size-4 text-emerald-500" />,
      });
      setInviteEmail('');
      await loadWorkspaceInvitesList(activeWorkspace.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send invitation');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    if (isTeamMember || !activeWorkspace?.id || !invitationId) return;
    setRevokingInviteId(invitationId);
    try {
      const res = await revokeWorkspaceInvite(activeWorkspace.id, invitationId);
      toast.success(res.message || 'Invitation revoked.');
      await loadWorkspaceInvitesList(activeWorkspace.id);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to revoke invitation');
    } finally {
      setRevokingInviteId(null);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await apiFetch('/api/user/account', {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Your account and all associated data have been permanently deleted.');
        setIsDeleteModalOpen(false);
        onAccountDeleted();
      } else {
        toast.error('Failed to delete account. Please try again.');
      }
    } catch (err) {
      console.error('Delete account error:', err);
      toast.error('Failed to delete account. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // User initials for avatar
  const getInitials = (userName?: string, userEmail?: string) => {
    if (userName && userName.trim()) {
      const parts = userName.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (userEmail) return userEmail.slice(0, 2).toUpperCase();
    return 'ZI';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-display">
              Account Profile
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your personal profile, credentials, and account preferences.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer"
          >
            <LogOut className="size-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Profile Info & Workspace Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Profile Card & Edit Form (7 cols) */}
        <div className="lg:col-span-7 surface-card p-6 sm:p-7 space-y-6">
          {/* Avatar and Identity */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-5 border-b border-border">
            <div className="relative">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || 'User avatar'}
                  className="size-16 rounded-2xl object-cover border border-border shadow-md"
                />
              ) : (
                <div className="size-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold font-mono shadow-md">
                  {getInitials(user?.name, user?.email)}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 size-4 rounded-full bg-emerald-500 ring-2 ring-card" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">
                {user?.name || 'Zivofly User'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="size-3.5 text-muted-foreground shrink-0" />
                <span>{user?.email || 'user@example.com'}</span>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="profile-name" className="text-xs font-bold text-foreground">
                Full name
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary shadow-2xs font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="profile-email" className="text-xs font-bold text-foreground">
                Account Email
              </label>
              <div className="relative">
                <input
                  id="profile-email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-xs text-muted-foreground cursor-not-allowed shadow-2xs"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Verified
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Your primary login email address.
              </p>
            </div>

            {!isTeamMember && (
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <label htmlFor="profile-business-name" className="text-xs font-bold text-foreground">
                    Business Name
                  </label>
                  <div className="relative">
                    <Building2 className="size-3.5 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="profile-business-name"
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g Zivofly"
                      className="w-full rounded-xl border border-input bg-card pl-9 pr-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary shadow-2xs font-medium"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isInviteOpen && !hasEnteredValidBusinessName(businessName)) {
                        toast.error('Please enter your Business Name before sending an invite.');
                        const bizInput = document.getElementById('profile-business-name') as HTMLInputElement | null;
                        bizInput?.focus();
                        return;
                      }
                      setIsInviteOpen((prev) => !prev);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary px-4 py-2.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                  >
                    <UserPlus className="size-3.5" />
                    <span>Invite Team Member</span>
                  </button>
                  {!hasEnteredValidBusinessName(businessName) && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Enter your Business Name above before sending team invitations.
                    </p>
                  )}
                </div>

                {isInviteOpen && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3 animate-in fade-in duration-150">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleSendInvite();
                            }
                          }}
                          disabled={isSendingInvite}
                          placeholder="Enter team member email address…"
                          className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSendInvite()}
                          disabled={isSendingInvite}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                        >
                          {isSendingInvite ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Send className="size-3" />
                          )}
                          <span>{isSendingInvite ? 'Sending…' : 'Send Invite'}</span>
                        </button>
                      </div>

                      {/* Invitations list */}
                      {isLoadingInvites ? (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
                          <Loader2 className="size-3 animate-spin" />
                          <span>Loading team invitations…</span>
                        </div>
                      ) : invitesError ? (
                        <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
                          <span>{invitesError}</span>
                          {activeWorkspace?.id && (
                            <button
                              type="button"
                              onClick={() => void loadWorkspaceInvitesList(activeWorkspace.id)}
                              className="underline font-semibold shrink-0 cursor-pointer"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      ) : invites.length > 0 ? (
                        <div className="space-y-1.5 pt-1 border-t border-border/60">
                          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Team Invitations
                          </div>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                            {invites.map((inv) => {
                              const statusLower = String(inv.status || 'pending').toLowerCase();
                              const isPending = statusLower === 'pending';
                              const isAccepted = statusLower === 'accepted';
                              const isRevoked = statusLower === 'revoked' || statusLower === 'cancelled';
                              const isExpired = statusLower === 'expired';

                              return (
                                <div
                                  key={inv.id}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium text-foreground truncate">
                                      {inv.email}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span
                                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${
                                          isAccepted
                                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                                            : isRevoked
                                            ? 'bg-destructive/10 border-destructive/25 text-destructive'
                                            : isExpired
                                            ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                                            : 'bg-primary/10 border-primary/25 text-primary'
                                        }`}
                                      >
                                        {isPending && <Clock className="size-2.5" />}
                                        {isAccepted && <CheckCircle2 className="size-2.5" />}
                                        {isRevoked && <Ban className="size-2.5" />}
                                        <span className="capitalize">{statusLower}</span>
                                      </span>
                                      {inv.expires_at && isPending && (
                                        <span className="text-[10px] text-muted-foreground">
                                          Expires {new Date(inv.expires_at).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {isPending && (
                                    <button
                                      type="button"
                                      onClick={() => void handleRevokeInvite(inv.id)}
                                      disabled={revokingInviteId === inv.id}
                                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 px-2 py-1 text-[11px] font-semibold text-destructive transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                    >
                                      {revokingInviteId === inv.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <Ban className="size-3" />
                                      )}
                                      <span>Revoke</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          No invitations sent yet for this workspace.
                        </p>
                      )}
                    </div>
                )}
              </div>
            )}

            {(!isTeamMember || name.trim() !== (user?.name || '').trim()) && (
              <div className="pt-3 border-t border-border flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save className="size-3.5" />
                  <span>{isSaving ? 'Saving changes…' : 'Save Profile Changes'}</span>
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Workspace Quick Overview & Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Workspace Resources Summary Card */}
          <div className="surface-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                Workspace Overview
              </h3>
              {activeWorkspace && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[10px] font-semibold text-foreground capitalize">
                  {isTeamMember ? 'Member' : activeWorkspace.role}
                </span>
              )}
            </div>

            {workspaces.length > 0 && onSwitchWorkspace && (
              <div className="space-y-1.5">
                <label
                  htmlFor="profile-workspace-selector"
                  className="text-xs font-semibold text-foreground block"
                >
                  Active Workspace
                </label>
                <div className="relative flex items-center">
                  <Building2 className="size-3.5 text-muted-foreground absolute left-3 pointer-events-none" />
                  <select
                    id="profile-workspace-selector"
                    value={activeWorkspace?.id || workspaces[0]?.id || ''}
                    onChange={(e) => onSwitchWorkspace(e.target.value)}
                    className="w-full rounded-xl border border-input bg-card pl-8 pr-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary shadow-2xs cursor-pointer"
                  >
                    {workspaces.map((ws) => {
                      const roleLabel =
                        ws.role === 'owner'
                          ? 'Owner'
                          : ws.role === 'admin'
                          ? 'Admin'
                          : 'Member';
                      return (
                        <option key={ws.id} value={ws.id}>
                          {ws.name} ({roleLabel})
                        </option>
                      );
                    })}
                  </select>
                </div>
                {workspaces.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Switch between your owned, admin, and member workspaces linked to this email.
                  </p>
                )}
              </div>
            )}

            {isTeamMember ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-1.5">
                  <div className="text-xs font-semibold text-foreground">
                    {activeWorkspace?.name || 'Business Workspace'}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    You can view connected channels, reply in the shared inbox, and manage human handoffs.
                  </p>
                </div>

                <div
                  onClick={() => onNavigate('/dashboard')}
                  className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-1 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-xs font-medium">Channels</span>
                    <LayoutGrid className="size-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {connections.length}
                  </div>
                  <span className="text-[10px] text-muted-foreground">Connected Lines</span>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('/inbox')}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Inbox className="size-3.5" />
                  <span>Open Shared Inbox</span>
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => onNavigate('/agents')}
                    className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-1 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">AI Agents</span>
                      <Bot className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-foreground">
                      {agents.length}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Active Assistants</span>
                  </div>

                  <div
                    onClick={() => onNavigate('/dashboard')}
                    className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-1 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="text-xs font-medium">Channels</span>
                      <LayoutGrid className="size-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-foreground">
                      {connections.length}
                    </div>
                    <span className="text-[10px] text-muted-foreground">Connected Lines</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                      <Coins className="size-4.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground block">
                        Available Token
                      </span>
                      <span className="text-xs font-mono font-semibold text-muted-foreground">
                        {(Number(localStorage.getItem('zivofly_token_balance')) || 0).toLocaleString()} Tokens
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('/billing')}
                    className="rounded-lg bg-card border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-2xs cursor-pointer shrink-0"
                  >
                    Billing
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Workspace Members Card (Owner account only) */}
          {!isTeamMember && (
            <div className="surface-card p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-primary shrink-0" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                    Workspace Members
                  </h3>
                </div>
                <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-mono font-semibold text-foreground">
                  {members.length}
                </span>
              </div>

              {isLoadingMembers && members.length === 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Loading workspace members…</span>
                </div>
              ) : membersError && members.length === 0 ? (
                <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                  <span>{membersError}</span>
                  {activeWorkspace?.id && (
                    <button
                      type="button"
                      onClick={() => void loadWorkspaceInvitesList(activeWorkspace.id)}
                      className="underline font-semibold shrink-0 cursor-pointer"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : members.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-[11px] text-muted-foreground leading-relaxed">
                  No members have joined this workspace yet. Use{' '}
                  <span className="font-semibold text-foreground">Invite Team Member</span>{' '}
                  to add teammates.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.name || member.email || 'Workspace member'}
                            className="size-8 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="size-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[11px] font-bold font-mono shrink-0">
                            {getInitials(member.name, member.email)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground truncate">
                            {member.name || member.email || 'Workspace Member'}
                          </div>
                          {member.name && member.email && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {member.email}
                            </div>
                          )}
                          {member.joinedAt && (
                            <div className="text-[10px] text-muted-foreground">
                              Joined {new Date(member.joinedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>

                      <span className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold text-foreground capitalize shrink-0">
                        {member.role === 'admin' ? 'Admin' : 'Member'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* DANGER ZONE: ACCOUNT DELETION                                */}
      {/* ============================================================ */}
      <div className="surface-card rounded-2xl border-2 border-destructive/40 bg-destructive/5 dark:bg-destructive/10 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-destructive font-bold text-sm">
              <AlertTriangle className="size-4.5 text-destructive shrink-0" />
              <span>Danger Zone</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Permanently Delete Your Account
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Permanently delete your personal profile, all active AI agents, connected WhatsApp and telephony phone lines, customer conversation history, and remaining token balances. This action is irreversible.
            </p>
          </div>

          <button
            id="open-delete-account-modal-btn"
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive hover:bg-destructive/90 active:scale-[0.98] text-destructive-foreground px-5 py-2.5 text-xs font-semibold shadow-xs transition-all cursor-pointer shrink-0"
          >
            <Trash2 className="size-4" />
            <span>Delete Account</span>
          </button>
        </div>

        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive space-y-1">
          <span className="font-bold">Please note before proceeding:</span>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            All trained prompt knowledge, custom cloned voices, document vectors, and external Google Sheets / CRM webhook integrations mapped to this account will be permanently unlinked and erased from Zivofly systems.
          </p>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        user={user}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDeleteAccount}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
};
