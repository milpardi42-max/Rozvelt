"use client";

import Link from "next/link";
import { useLocale } from "@/components/providers/AppProviders";
import { cn, href } from "@/lib/utils";

/**
 * Account-type switch — the small segmented control on every registration page.
 *
 * Registration is one chooser plus one page per account type:
 *   /signup          → pick the kind of account
 *   /signup/buyer    → the buyer form
 *   /signup/artist   → the designer / seller form
 *
 * This control links between the two type pages (the page you are on is marked
 * with aria-current), so the type is always one click away — even when a visitor
 * lands on a page directly from a search result or an e-mail.
 */
export function AccountTypeSwitch({ current, className }: { current: "buyer" | "artist"; className?: string }) {
  const { locale } = useLocale();
  const fa = locale === "fa";

  const options = [
    { id: "buyer" as const, label: fa ? "خریدار" : "Buyer", url: href(locale, "/signup/buyer") },
    { id: "artist" as const, label: fa ? "هنرمند / طراح" : "Artist / Designer", url: href(locale, "/signup/artist") },
  ];

  return (
    <nav
      aria-label={fa ? "نوع حساب" : "Account type"}
      className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-background-secondary p-1", className)}
    >
      {options.map((option) => {
        if (option.id === current) {
          return (
            <span
              key={option.id}
              aria-current="page"
              className="inline-flex h-8 items-center rounded-full bg-foreground px-4 text-caption font-medium text-background"
            >
              {option.label}
            </span>
          );
        }
        return (
          <Link
            key={option.id}
            href={option.url}
            className="inline-flex h-8 items-center rounded-full px-4 text-caption font-medium text-foreground-secondary transition hover:text-foreground"
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
