import React, { useState } from 'react';
import {
  ArrowLeft,
  LifeBuoy,
  Mail,
  Send,
  CheckCircle2,
  Unplug,
  Trash2,
  Shield,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { User } from '../types';
import { PublicFooter } from '../components/PublicFooter';

interface SupportPageProps {
  onNavigate: (path: string) => void;
  user?: User | null;
}

type SupportCategory =
  | 'google_workspace'
  | 'data_deletion'
  | 'channels'
  | 'billing'
  | 'general';

export const SupportPage: React.FC<SupportPageProps> = ({
  onNavigate,
  user,
}) => {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [category, setCategory] = useState<SupportCategory>('google_workspace');
  const [message, setMessage] = useState('');
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid contact email address.');
      return;
    }
    if (!message.trim()) {
      toast.error('Please describe how we can help.');
      return;
    }

    const refId = `ZVF-${Date.now().toString(36).toUpperCase()}`;
    setSubmittedRef(refId);
    toast.success('Support request prepared. You can also send directly by email below.');
  };

  const categoryLabels: Record<SupportCategory, string> = {
    google_workspace: 'Google Workspace OAuth / Picker Help',
    data_deletion: 'Account & Data Deletion Request',
    channels: 'Messaging & Phone Channel Setup',
    billing: 'Billing & Workspace Tokens',
    general: 'General Inquiry',
  };

  const mailtoSubject = encodeURIComponent(
    `[Zivofly Support] ${categoryLabels[category]}${submittedRef ? ` (${submittedRef})` : ''}`
  );
  const mailtoBody = encodeURIComponent(
    `Name: ${name || 'Not provided'}\nEmail: ${email || 'Not provided'}\nTopic: ${categoryLabels[category]}\n\nDetails:\n${message}`
  );

  return (
    <div className="hero-glow min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16 flex-1 space-y-10">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Zivofly Home</span>
          </button>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-primary">
              <LifeBuoy className="size-3.5" />
              <span>Contact &amp; Support</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-normal tracking-tight text-foreground">
              How can we help?
            </h1>
            <p className="max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Get help connecting messaging channels, configuring Google Workspace permissions, revoking resource access, or requesting workspace data deletion.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Support Request Form */}
          <div className="lg:col-span-7 surface-card p-6 sm:p-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                Submit a Support or Privacy Request
              </h2>
              <p className="text-xs text-muted-foreground">
                No login required. Use this form for Google Workspace integration support, bug reports, or data deletion inquiries.
              </p>
            </div>

            {submittedRef ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Request ready (Reference: {submittedRef})
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Send your prepared inquiry directly via your email client to reach the Zivofly support team, or edit your message below.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <a
                    href={`mailto:${
                      category === 'data_deletion'
                        ? 'privacy@zivofly.app'
                        : 'support@zivofly.app'
                    }?subject=${mailtoSubject}&body=${mailtoBody}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95 transition-opacity"
                  >
                    <Mail className="size-3.5" />
                    <span>
                      Open in Email (
                      {category === 'data_deletion'
                        ? 'privacy@zivofly.app'
                        : 'support@zivofly.app'}
                      )
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setSubmittedRef(null)}
                    className="rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    Edit Request
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="support-name"
                      className="text-xs font-semibold text-foreground"
                    >
                      Your Name
                    </label>
                    <input
                      id="support-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Jordan Taylor"
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="support-email"
                      className="text-xs font-semibold text-foreground"
                    >
                      Email Address
                    </label>
                    <input
                      id="support-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="support-category"
                    className="text-xs font-semibold text-foreground"
                  >
                    Topic
                  </label>
                  <select
                    id="support-category"
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as SupportCategory)
                    }
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-2 text-xs sm:text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="google_workspace">
                      Google Workspace OAuth / Picker Help
                    </option>
                    <option value="data_deletion">
                      Account &amp; Data Deletion Request
                    </option>
                    <option value="channels">
                      Messaging &amp; Phone Channel Setup
                    </option>
                    <option value="billing">Billing &amp; Workspace Tokens</option>
                    <option value="general">General Inquiry</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="support-message"
                    className="text-xs font-semibold text-foreground"
                  >
                    Details
                  </label>
                  <textarea
                    id="support-message"
                    rows={4}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your question, workspace email, or data deletion request..."
                    className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none resize-y"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground hover:opacity-95 transition-opacity cursor-pointer"
                >
                  <Send className="size-3.5" />
                  <span>Prepare Support Request</span>
                </button>
              </form>
            )}
          </div>

          {/* Right: Direct Contact & Google Self-Service Guides */}
          <div className="lg:col-span-5 space-y-6">
            <div className="surface-card p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Direct Contact
              </h2>
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-border bg-muted/25 p-3.5 space-y-1">
                  <div className="font-semibold text-foreground">
                    General &amp; Technical Support
                  </div>
                  <a
                    href="mailto:support@zivofly.app"
                    className="text-primary underline font-medium inline-flex items-center gap-1.5"
                  >
                    <Mail className="size-3.5" />
                    <span>support@zivofly.app</span>
                  </a>
                </div>
                <div className="rounded-xl border border-border bg-muted/25 p-3.5 space-y-1">
                  <div className="font-semibold text-foreground">
                    Privacy &amp; Data Deletion Inquiries
                  </div>
                  <a
                    href="mailto:privacy@zivofly.app"
                    className="text-primary underline font-medium inline-flex items-center gap-1.5"
                  >
                    <Shield className="size-3.5" />
                    <span>privacy@zivofly.app</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="surface-card p-6 space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Google Integration Self-Service
              </h2>
              <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <Unplug className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Disconnect a Google Service or Remove Files
                    </p>
                    <p className="mt-0.5">
                      Inside your Agent &rarr; Tools &rarr; Google Workspace panel, remove individual Drive, Docs, or Sheets files anytime or click <strong>Disconnect</strong> on any individual service.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ExternalLink className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Revoke Access via Google Account
                    </p>
                    <p className="mt-0.5">
                      Manage third-party app permissions directly at{' '}
                      <a
                        href="https://myaccount.google.com/permissions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        myaccount.google.com/permissions
                      </a>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Trash2 className="size-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground">
                      Delete Your Account &amp; Data
                    </p>
                    <p className="mt-0.5">
                      {user ? (
                        <>
                          Signed-in users can permanently delete their account and workspace data in{' '}
                          <button
                            type="button"
                            onClick={() => onNavigate('/profile')}
                            className="text-primary underline cursor-pointer"
                          >
                            Account Profile
                          </button>
                          .
                        </>
                      ) : (
                        <>
                          Sign in and visit Account Profile &rarr; Delete Account, or submit a data deletion request using the form on this page.
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
};
