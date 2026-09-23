"use client";

import Link from "next/link";
import { useLocale } from "@/components/providers/AppProviders";
import { cn, href } from "@/lib/utils";

/**
 * Account-type switch — the small segmented control on every registration page.
 *
 * Registration is one shared form (SignupForm) that the visitor fills in on
 * whichever page they reach:
 *   /signup          → the form, opening on the buyer half
 *   /signup/buyer    → the same form under the buyer heading
 *   /signup/artist   → the designer / seller content page with the same form
 *
 * The account type itself is chosen inside the form; this control only moves
 * between the buyer page and the designer page (the page you are on is marked
 * with aria-current), so the designer content is always one click away — even
 * when a visitor lands here from a search result or an e-mail.
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
