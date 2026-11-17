import React from 'react';
import { Shield, FileText, LifeBuoy } from 'lucide-react';

interface PublicFooterProps {
  onNavigate: (path: string) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({ onNavigate }) => {
  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string
  ) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <footer className="border-t border-border bg-card/60 backdrop-blur-xs">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
          <div className="space-y-2.5 max-w-md">
            <a
              href="/"
              onClick={(e) => handleLinkClick(e, '/')}
              className="font-display text-2xl font-normal tracking-tight text-foreground inline-block hover:opacity-90"
            >
              Zivofly
            </a>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Business conversation automation across WhatsApp, Instagram, Messenger, TikTok, and phone calls, with customer-controlled Google Workspace integrations.
            </p>
            <p className="text-[11px] text-muted-foreground/85 leading-relaxed">
              Zivofly&apos;s use and transfer of information received from Google APIs adheres to the{' '}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-2.5">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Product
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a
                    href="/"
                    onClick={(e) => handleLinkClick(e, '/')}
                    className="hover:text-foreground transition-colors"
                  >
                    Home
                  </a>
                </li>
                <li>
                  <a
                    href="/auth"
                    onClick={(e) => handleLinkClick(e, '/auth')}
                    className="hover:text-foreground transition-colors"
                  >
                    Sign in / Get started
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Legal
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a
                    href="/privacy"
                    onClick={(e) => handleLinkClick(e, '/privacy')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <Shield className="size-3.5 text-primary" />
                    <span>Privacy Policy</span>
                  </a>
                </li>
                <li>
                  <a
                    href="/terms"
                    onClick={(e) => handleLinkClick(e, '/terms')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <FileText className="size-3.5 text-primary" />
                    <span>Terms of Service</span>
                  </a>
                </li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[11px]">
                Help
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a
                    href="/support"
                    onClick={(e) => handleLinkClick(e, '/support')}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    <LifeBuoy className="size-3.5 text-primary" />
                    <span>Contact &amp; Support</span>
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:support@zivofly.app"
                    className="hover:text-foreground transition-colors"
                  >
                    support@zivofly.app
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} Zivofly. All rights reserved.</span>
          <div className="flex items-center gap-4 flex-wrap">
            <a
              href="/privacy"
              onClick={(e) => handleLinkClick(e, '/privacy')}
              className="hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleLinkClick(e, '/terms')}
              className="hover:text-foreground transition-colors"
            >
              Terms of Service
            </a>
            <a
              href="/support"
              onClick={(e) => handleLinkClick(e, '/support')}
              className="hover:text-foreground transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
