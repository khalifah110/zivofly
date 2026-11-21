import React from 'react';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { PublicFooter } from '../components/PublicFooter';

interface TermsOfServicePageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({
  onNavigate,
  isAuthenticated = false,
}) => {
  return (
    <div className="hero-glow min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mx-auto w-full max-w-4xl px-6 py-12 sm:py-16 flex-1 space-y-8">
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
              <FileText className="size-3.5" />
              <span>Terms of Service</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-normal tracking-tight text-foreground">
              Zivofly Terms of Service
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Effective Date: November 17, 2026 · Applies to Zivofly (
              <span className="font-medium text-foreground">zivofly.app</span>)
            </p>
          </div>
        </div>

        <section className="surface-card p-6 sm:p-8 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            1. Scope of Service
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly provides software tools enabling businesses to configure AI conversation agents across supported messaging and voice channels (WhatsApp, Instagram, Messenger, TikTok, and phone calls), manage customer inbox handoffs, and optionally connect third-party tools including Google Workspace (Google Drive, Google Docs, Google Sheets, and Google Calendar).
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            By creating an account or using Zivofly, you agree to these Terms of Service and acknowledge our{' '}
            <button
              type="button"
              onClick={() => onNavigate('/privacy')}
              className="text-primary underline cursor-pointer"
            >
              Privacy Policy
            </button>
            .
          </p>
        </section>

        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              2. Account &amp; Workspace Responsibilities
            </h2>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>You must provide accurate registration information and maintain the confidentiality of your login credentials.</li>
            <li>You are responsible for all activity occurring within your Zivofly workspace, including the prompts, schedules, knowledge sources, and connected integrations you assign to AI agents.</li>
            <li>You must promptly notify us through our{' '}
              <button
                type="button"
                onClick={() => onNavigate('/support')}
                className="text-primary underline cursor-pointer"
              >
                Support page
              </button>{' '}
              if you suspect unauthorized access to your workspace.
            </li>
          </ul>
        </section>

        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <CheckCircle2 className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              3. Connected Channels &amp; Google Workspace Integrations
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            When you connect external messaging channels or Google Workspace services to Zivofly:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>You represent that you have the authority and all necessary rights to connect those accounts, customer conversations, and selected documents or spreadsheets to Zivofly.</li>
            <li>You remain responsible for selecting only the specific Drive files, Google Docs, and Google Sheets you intend your workspace agents to access, and for reviewing agent access assignments before enabling live automation.</li>
            <li>Your use of Google Workspace integrations is also subject to Google&apos;s applicable terms of service, and your use of WhatsApp, Instagram, Messenger, TikTok, or phone services is subject to those respective providers&apos; terms and messaging policies.</li>
            <li>Zivofly is an independent application and does not represent that third-party platform availability or external OAuth integrations will be uninterrupted.</li>
          </ul>
        </section>

        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <AlertCircle className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              4. Acceptable Use &amp; AI Agent Supervision
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            You agree not to use Zivofly to send unlawful spam, infringe intellectual property or privacy rights, impersonate individuals without authorization, bypass platform rate limits, or process prohibited content.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            AI-generated responses depend on the instructions, documents, and business rules you configure. You are responsible for testing your agents, setting appropriate working hours and human handoff rules, and reviewing automated customer communications for accuracy in your business context.
          </p>
        </section>

        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <CreditCard className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              5. Billing, Usage &amp; Termination
            </h2>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>Certain Zivofly plans or automated actions consume workspace tokens or require active subscription billing as displayed inside the Billing section of the application.</li>
            <li>You may disconnect any Google Workspace integration or channel at any time, or delete your Zivofly account from{' '}
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => onNavigate('/profile')}
                  className="text-primary underline cursor-pointer"
                >
                  Account Profile
                </button>
              ) : (
                <span>Account Profile</span>
              )}
              .
            </li>
            <li>Zivofly may suspend or terminate access if an account violates these Terms, abuses third-party APIs, or poses a security or operational risk.</li>
          </ul>
        </section>

        <section className="surface-card p-6 sm:p-8 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            6. Service Disclaimers &amp; Contact
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            To the extent permitted by applicable law, Zivofly is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without implied warranties of uninterrupted uptime or fitness for a particular regulated purpose. Do not rely solely on automated AI responses for emergency, medical, legal, or life-safety matters.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Questions about these Terms or business entity inquiries may be directed to{' '}
            <a
              href="mailto:support@zivofly.app"
              className="text-primary underline font-medium"
            >
              support@zivofly.app
            </a>{' '}
            or submitted via our{' '}
            <button
              type="button"
              onClick={() => onNavigate('/support')}
              className="text-primary underline cursor-pointer"
            >
              Contact &amp; Support page
            </button>
            .
          </p>
        </section>
      </div>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
};
