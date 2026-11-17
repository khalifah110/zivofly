import React from 'react';
import {
  ArrowRight,
  Check,
  MessageSquareText,
  Clock,
  ShieldCheck,
  FolderCheck,
} from 'lucide-react';
import { ChannelIcon } from '../components/ChannelIcon';
import {
  GoogleWorkspaceLogo,
  GmailLogo,
  GoogleDriveLogo,
  GoogleDocsLogo,
  GoogleSheetsLogo,
  GoogleCalendarLogo,
} from '../components/BrandLogos';
import { PublicFooter } from '../components/PublicFooter';

interface LandingPageProps {
  onNavigate: (path: string) => void;
  isAuthenticated: boolean;
}

const GOOGLE_TOOLS = [
  {
    name: 'Gmail',
    logo: GmailLogo,
    summary:
      'Send booking confirmations, draft client replies, and read inbound requests linked to your customer workflows.',
    control: 'Independent OAuth connection',
  },
  {
    name: 'Google Drive',
    logo: GoogleDriveLogo,
    summary:
      'Share PDFs, product sheets, images, Word/Excel files, and archives explicitly selected through Google Picker.',
    control: 'File-by-file Picker authorization',
  },
  {
    name: 'Google Docs',
    logo: GoogleDocsLogo,
    summary:
      'Let agents reference your selected standard operating procedures, FAQs, and policy guidelines.',
    control: 'Native Google Docs only',
  },
  {
    name: 'Google Sheets',
    logo: GoogleSheetsLogo,
    summary:
      'Look up pricing or inventory catalogs and record customer leads strictly inside spreadsheets you choose.',
    control: 'Native Google Sheets only',
  },
  {
    name: 'Google Calendar',
    logo: GoogleCalendarLogo,
    summary:
      'Check real-time slot availability, schedule customer appointments, and create calendar invites.',
    control: 'Independent OAuth connection',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  isAuthenticated,
}) => {
  const ctaPath = isAuthenticated ? '/dashboard' : '/auth';

  return (
    <div className="hero-glow min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24 flex-1">
        {/* Hero Section */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            AI agents for every conversation
          </p>

          <h1 className="mt-4 font-display text-5xl sm:text-6xl md:text-7xl font-normal leading-[1.08] tracking-tight text-foreground">
            Your customers write everywhere.
            <br />
            <em className="italic">One agent answers them all.</em>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            Zivofly automates customer conversations across WhatsApp, Instagram,
            Messenger, TikTok, and phone calls. Configure an AI agent in minutes,
            connect only the Google Workspace tools your business uses, and step
            into any conversation whenever you want.
          </p>

          <div className="mt-8 flex flex-col items-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => onNavigate(ctaPath)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-medium text-primary-foreground shadow-sm hover:opacity-95 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>
                  {isAuthenticated ? 'Go to dashboard' : 'Connect your account'}
                </span>
                <ArrowRight className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/support')}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3.5 text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <span>Contact &amp; Support</span>
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              No developer needed. No app settings to configure.
            </p>
          </div>
        </div>

        {/* 5 Channels Preview Grid */}
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div
            onClick={() =>
              onNavigate(isAuthenticated ? '/connect/whatsapp' : '/auth')
            }
            className="surface-card p-6 cursor-pointer hover:border-border/80 hover:shadow-md transition-all group"
          >
            <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <ChannelIcon channel="whatsapp" size={22} />
            </div>
            <h3 className="text-lg font-medium text-foreground">WhatsApp</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Answer chats on your business number.
            </p>
          </div>

          <div
            onClick={() =>
              onNavigate(isAuthenticated ? '/connect/instagram' : '/auth')
            }
            className="surface-card p-6 cursor-pointer hover:border-border/80 hover:shadow-md transition-all group"
          >
            <div className="size-10 rounded-xl bg-rose-500/10 flex items-center justify-center mb-4">
              <ChannelIcon channel="instagram" size={22} />
            </div>
            <h3 className="text-lg font-medium text-foreground">Instagram</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Reply to DMs, comments and tags.
            </p>
          </div>

          <div
            onClick={() =>
              onNavigate(isAuthenticated ? '/connect/tiktok' : '/auth')
            }
            className="surface-card p-6 cursor-pointer hover:border-border/80 hover:shadow-md transition-all group"
          >
            <div className="size-10 rounded-xl bg-neutral-900/10 flex items-center justify-center mb-4">
              <ChannelIcon channel="tiktok" size={22} />
            </div>
            <h3 className="text-lg font-medium text-foreground">TikTok</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Reply to TikTok DMs, comments and mentions.
            </p>
          </div>

          <div
            onClick={() =>
              onNavigate(isAuthenticated ? '/connect/call' : '/auth')
            }
            className="surface-card p-6 cursor-pointer hover:border-border/80 hover:shadow-md transition-all group"
          >
            <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4">
              <ChannelIcon channel="call" size={22} />
            </div>
            <h3 className="text-lg font-medium text-foreground">Phone call</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              A voice agent that picks up the line.
            </p>
          </div>

          <div
            onClick={() =>
              onNavigate(isAuthenticated ? '/connect/messenger' : '/auth')
            }
            className="surface-card p-6 cursor-pointer hover:border-border/80 hover:shadow-md transition-all group"
          >
            <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
              <ChannelIcon channel="messenger" size={22} />
            </div>
            <h3 className="text-lg font-medium text-foreground">Messenger</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Handle Page messages automatically.
            </p>
          </div>
        </div>

        {/* How Zivofly Automates Business Conversations */}
        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          <div className="surface-card p-6 space-y-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <MessageSquareText className="size-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Consistent Omnichannel Replies
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Every customer inquiry arriving via WhatsApp, Instagram, Messenger,
              TikTok, or phone calls routes into one unified workspace inbox with
              consistent tone and business knowledge.
            </p>
          </div>

          <div className="surface-card p-6 space-y-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Clock className="size-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Working Hours &amp; Human Takeover
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Define active agent schedules, reply triggers, and business rules.
              Your team can pause automation and take over any live conversation
              at any time.
            </p>
          </div>

          <div className="surface-card p-6 space-y-2.5">
            <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ShieldCheck className="size-4.5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              Workspace-Scoped Control
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Every external channel and Google integration is authorized by the
              workspace owner, clearly labeled with the connected account, and
              can be disconnected independently.
            </p>
          </div>
        </section>

        {/* Google Workspace Integrations Showcase */}
        <section className="surface-card mt-16 p-6 sm:p-8 md:p-10 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex size-11 items-center justify-center rounded-xl bg-white dark:bg-muted border border-border shadow-2xs shrink-0 p-2">
                <GoogleWorkspaceLogo className="size-6" />
              </div>
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-normal text-foreground">
                  Optional Google Workspace integrations
                </h2>
                <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Give your customer-facing agents accurate answers, booking
                  availability, and follow-up workflows using the exact Google
                  tools you choose to connect.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {GOOGLE_TOOLS.map((tool) => {
              const ToolLogo = tool.logo;
              return (
                <div
                  key={tool.name}
                  className="rounded-xl border border-border bg-background/60 p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-white dark:bg-muted p-1.5 shrink-0">
                        <ToolLogo className="size-4.5" />
                      </div>
                      <h3 className="text-xs font-bold text-foreground">
                        {tool.name}
                      </h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {tool.summary}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border/70 text-[10px] font-medium text-muted-foreground">
                    {tool.control}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-2.5">
              <FolderCheck className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong className="text-foreground">Strict per-service separation:</strong>{' '}
                Drive, Docs, and Sheets each maintain separate OAuth
                connections and explicit Google Picker file selections.
                Review full details in our{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('/privacy')}
                  className="text-primary underline cursor-pointer"
                >
                  Privacy Policy
                </button>
                .
              </span>
            </div>
          </div>
        </section>

        {/* Set up in four steps Section */}
        <div className="surface-card mt-16 p-5 sm:p-8 md:p-12">
          <h2 className="font-display text-3xl sm:text-4xl font-normal text-foreground">
            Set up in four steps
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground text-sm sm:text-base leading-relaxed">
            Sign in with the account you already use, allow the agent to learn
            from your profile and authorized documents, and go live. Everything
            else is handled for you.
          </p>

          <ul className="mt-8 space-y-3.5 sm:space-y-4 overflow-x-auto">
            <li className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Check className="size-3.5" />
              </span>
              <span className="text-[11px] min-[390px]:text-xs sm:text-sm md:text-base text-foreground whitespace-nowrap">
                Connect your account securely — no passwords shared with us
              </span>
            </li>
            <li className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Check className="size-3.5" />
              </span>
              <span className="text-[11px] min-[390px]:text-xs sm:text-sm md:text-base text-foreground whitespace-nowrap">
                Train the agent on your bio, past chats, posts and documents
              </span>
            </li>
            <li className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Check className="size-3.5" />
              </span>
              <span className="text-[11px] min-[390px]:text-xs sm:text-sm md:text-base text-foreground whitespace-nowrap">
                Choose what it replies to: messages, comments, tags
              </span>
            </li>
            <li className="flex items-center gap-2.5 sm:gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Check className="size-3.5" />
              </span>
              <span className="text-[11px] min-[390px]:text-xs sm:text-sm md:text-base text-foreground whitespace-nowrap">
                Set the hours it works, and take over any chat yourself
              </span>
            </li>
          </ul>
        </div>
      </div>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  );
};

