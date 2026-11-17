import React from 'react';
import {
  ArrowLeft,
  Shield,
  Lock,
  FolderCheck,
  Bot,
  Unplug,
  Trash2,
  Server,
  Mail,
} from 'lucide-react';
import {
  GmailLogo,
  GoogleDriveLogo,
  GoogleDocsLogo,
  GoogleSheetsLogo,
  GoogleCalendarLogo,
} from '../components/BrandLogos';
import { PublicFooter } from '../components/PublicFooter';

interface PrivacyPolicyPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated?: boolean;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({
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
              <Shield className="size-3.5" />
              <span>Privacy Policy</span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-normal tracking-tight text-foreground">
              Zivofly Privacy Policy
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Effective Date: November 17, 2026 · Applies to Zivofly (
              <span className="font-medium text-foreground">zivofly.app</span>)
            </p>
          </div>
        </div>

        {/* Summary Banner */}
        <div className="surface-card p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            Overview &amp; Google API Services Limited Use
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly provides AI-assisted customer conversation automation across messaging and phone channels, along with optional customer-authorized integrations with Google Workspace (Gmail, Google Drive, Google Docs, Google Sheets, and Google Calendar).
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly&apos;s use and transfer to any other app of information received from Google APIs adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:opacity-85"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </div>

        {/* 1. Account & Workspace Data */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            1. Information You Provide to Zivofly
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            When you create a Zivofly account and configure a workspace, Zivofly collects the information needed to operate your account and customer agents, including:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>Account registration details such as your name, email address, and optional business name.</li>
            <li>Agent configuration data, such as agent role instructions, tone, availability schedules, and knowledge text/files you explicitly upload to train your workspace agents.</li>
            <li>Connected messaging or phone channel metadata and customer conversation records managed inside your workspace inbox.</li>
          </ul>
        </section>

        {/* 2. How Zivofly Accesses Google User Data */}
        <section className="surface-card p-6 sm:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            2. How Zivofly Accesses Google User Data via OAuth
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Connecting Google services to Zivofly is completely optional. Each Google service is connected independently using standard Google OAuth 2.0 authorization initiated by you from your workspace settings.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>Zivofly never asks for, views, or stores your Google account password.</li>
            <li>Each of the five integrations—Gmail, Google Drive, Google Docs, Google Sheets, and Google Calendar—maintains its own separate connection status, account identity, and authorization record. You may connect only the services you want, including across separate Google accounts.</li>
            <li>Zivofly records your Google account identifier/email and connection metadata in your workspace so you can see which Google account is linked to each service.</li>
          </ul>
        </section>

        {/* 3. Specific Purpose of Each Google Integration */}
        <section className="surface-card p-6 sm:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            3. How Each Google Workspace Permission Is Used
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly requests only the permissions required for the specific Google service you choose to connect:
          </p>

          <div className="grid grid-cols-1 gap-3 pt-1">
            <div className="rounded-xl border border-border bg-muted/25 p-4 flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shrink-0">
                <GmailLogo className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  Gmail
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Used strictly to send automated booking confirmations, create or send customer inquiry replies configured by your workspace, and read inbound customer requests when enabled for your workflows.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/25 p-4 flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shrink-0">
                <GoogleDriveLogo className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  Google Drive (<span className="font-mono text-[11px]">drive.file</span>)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Used exclusively with the official Google Picker so you can browse and explicitly select individual uploaded Drive files (such as PDFs, images, CSVs, Word/Excel documents, and archives) for your workspace. Connecting Google Drive does not grant Zivofly automatic access to unselected files, nor does it authorize native Google Docs or Google Sheets.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/25 p-4 flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shrink-0">
                <GoogleDocsLogo className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  Google Docs (<span className="font-mono text-[11px]">drive.file</span> and{' '}
                  <span className="font-mono text-[11px]">documents</span>)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Used to allow you to select specific native Google Docs documents through the Docs Picker and enable authorized workspace AI agents to read standard operating procedures, policy guidelines, or document content you explicitly authorize.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/25 p-4 flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shrink-0">
                <GoogleSheetsLogo className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  Google Sheets (<span className="font-mono text-[11px]">drive.file</span> and{' '}
                  <span className="font-mono text-[11px]">spreadsheets</span>)
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Used to allow you to select specific native Google Sheets spreadsheets through the Sheets Picker and synchronize product catalogs, pricing lookups, or customer lead capture rows strictly within the spreadsheets you select.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/25 p-4 flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card shrink-0">
                <GoogleCalendarLogo className="size-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-semibold text-foreground">
                  Google Calendar
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Used to check real-time appointment slot availability, create customer bookings requested during conversations, and include calendar event or meeting details configured by your business.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Customer-Controlled Resource Selection */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <FolderCheck className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              4. Individual Resource Selection &amp; Strict Service Separation
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            For Google Drive, Google Docs, and Google Sheets, Zivofly enforces explicit customer-controlled resource authorization:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>You select individual files, documents, or spreadsheets using the official Google Picker interface. Only the Google file IDs you choose are submitted to Zivofly&apos;s backend, where file metadata is verified before saving authorization.</li>
            <li>Google Drive, Google Docs, and Google Sheets maintain separate authorized resource lists tied to each service&apos;s own connection ID. Authorizing a file in one service does not automatically authorize or expose it in another service.</li>
            <li>Within each agent&apos;s configuration, you can also toggle which authorized resources that specific agent is permitted to access.</li>
          </ul>
        </section>

        {/* 5. How AI Agents Use Selected Google Resources */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Bot className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              5. How Selected Google Resources Are Used by AI Agents
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Customer-configured AI agents access authorized Google resources only at runtime to perform tasks configured by the workspace owner—such as answering customer questions using an authorized Google Doc or PDF, looking up or recording rows in an authorized Google Sheet, checking Google Calendar slots, or sending/reading Gmail correspondence.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly does <strong>not</strong> use Google user data, selected Drive/Docs/Sheets content, Gmail messages, or Calendar events to train generalized or public AI/ML models.
          </p>
        </section>

        {/* 6. Token Storage & Protection */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Lock className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              6. How OAuth Access &amp; Refresh Tokens Are Handled
            </h2>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>OAuth code exchanges, access tokens, and refresh tokens are processed and stored server-side within Zivofly&apos;s Supabase backend infrastructure, scoped to verified workspace ownership and membership permissions.</li>
            <li>The Zivofly browser application does not store Google OAuth refresh tokens or long-lived access tokens in browser storage (<span className="font-mono text-[11px]">localStorage</span> or <span className="font-mono text-[11px]">sessionStorage</span>).</li>
            <li>When you open Google Picker, Zivofly&apos;s backend issues a short-lived access token solely in memory for that connection so Google Picker can display your files, and verifies account email and required scopes before opening the modal.</li>
            <li>All network communication between the browser, Zivofly backend services, and Google APIs occurs over HTTPS/TLS. Zivofly does not claim third-party security certifications unless explicitly verified and published.</li>
          </ul>
        </section>

        {/* 7. Third-Party Service Providers */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Server className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              7. Data Sharing &amp; Service Providers
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly does not sell your Google user data or personal data, and does not transfer Google user data to third parties for advertising, data brokering, or unrelated marketing purposes.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            To operate the Zivofly application and execute customer-requested AI workflows, Zivofly relies on infrastructure and processing providers solely as necessary to deliver the service:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li><strong>Application &amp; Database Infrastructure:</strong> Supabase (authentication, PostgreSQL workspace database, and server-side Edge Functions) and Cloudflare Pages (web application hosting).</li>
            <li><strong>AI &amp; Conversation Processing:</strong> Server-side AI model APIs used to generate customer conversation responses requested by your configured agents based on authorized workspace data.</li>
            <li><strong>Connected Messaging &amp; Telephony Channels:</strong> Meta (WhatsApp, Instagram, Messenger), TikTok, or voice telephony providers only for messages or calls you configure on those channels.</li>
          </ul>
          <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 border border-border rounded-xl p-3">
            Note: Specific subprocessor lists, legal entity details, and written data processing terms should be confirmed with the Zivofly service operator via{' '}
            <button
              type="button"
              onClick={() => onNavigate('/support')}
              className="text-primary underline cursor-pointer"
            >
              Contact &amp; Support
            </button>
            .
          </p>
        </section>

        {/* 8. Disconnecting & Revocation */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Unplug className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              8. Disconnecting Integrations &amp; Revoking Authorization
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            You remain in full control of your Google permissions and can revoke access at any time:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li><strong>Remove Individual Files:</strong> Click <strong>Remove</strong> next to any authorized file in the Google Drive, Google Docs, or Google Sheets card to revoke Zivofly&apos;s authorization for that item in that service. Your original file in Google is never deleted.</li>
            <li><strong>Disconnect Any Service:</strong> Click <strong>Disconnect</strong> on Gmail, Google Drive, Google Docs, Google Sheets, or Google Calendar to revoke and remove Zivofly&apos;s stored credentials for that service independently without disrupting your other integrations.</li>
            <li><strong>Revoke Directly via Google:</strong> You can also revoke Zivofly&apos;s access at any time in your Google Account permissions dashboard at{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline hover:opacity-85"
              >
                myaccount.google.com/permissions
              </a>
              .
            </li>
          </ul>
        </section>

        {/* 9. Data Deletion & Retention */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Trash2 className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              9. Data Deletion &amp; Retention
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Zivofly retains account, workspace configuration, and authorized resource records while your account remains active or until you disconnect an integration or delete your account. Exact backup and log retention durations are maintained operationally by the workspace/platform administrator and are not represented as fixed statutory guarantees here.
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            You can request or perform deletion of your data in two ways:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            <li>
              <strong>Self-Service Account Deletion:</strong> If you are signed in, go to{' '}
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => onNavigate('/profile')}
                  className="text-primary underline cursor-pointer"
                >
                  Account Profile &rarr; Delete Account
                </button>
              ) : (
                <span>Account Profile &rarr; Delete Account</span>
              )}{' '}
              to permanently delete your profile, agents, channel configurations, and workspace data.
            </li>
            <li>
              <strong>Support Deletion Request:</strong> Submit a data deletion request through our{' '}
              <button
                type="button"
                onClick={() => onNavigate('/support')}
                className="text-primary underline cursor-pointer"
              >
                Support page
              </button>{' '}
              or email{' '}
              <a
                href="mailto:privacy@zivofly.app"
                className="text-primary underline"
              >
                privacy@zivofly.app
              </a>
              .
            </li>
          </ul>
        </section>

        {/* 10. Contact */}
        <section className="surface-card p-6 sm:p-8 space-y-3">
          <div className="flex items-center gap-2 text-foreground">
            <Mail className="size-4 text-primary shrink-0" />
            <h2 className="text-lg font-semibold">
              10. Privacy Contact Information
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            If you have questions about this Privacy Policy, Google Workspace data access, or data deletion requests, contact us at{' '}
            <a
              href="mailto:privacy@zivofly.app"
              className="text-primary underline font-medium"
            >
              privacy@zivofly.app
            </a>{' '}
            or{' '}
            <a
              href="mailto:support@zivofly.app"
              className="text-primary underline font-medium"
            >
              support@zivofly.app
            </a>
            , or visit our{' '}
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
