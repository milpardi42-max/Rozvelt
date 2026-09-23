import type { Metadata } from "next";
import { SignupShell } from "@/components/profile/SignupShell";
import { getSite } from "@/lib/data/queries";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "fa" ? "ثبت‌نام خریدار" : "Buyer signup" };
}

/**
 * Buyer registration — one of the two account-type pages.
 *
 * Same shell and same four-field form buyers always had; the account-type
 * switch above the form links to the designer page (/signup/artist) and the
 * chooser (/signup) is one hop back.
 */
export default async function BuyerSignupPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const d = dictionaries[locale];
  const site = await getSite();
  const image = site.portfolios[2]?.cover ?? site.hero.image;

  return (
    <SignupShell
      locale={locale}
      image={image}
      dict={{ login: d.nav.login, signup: locale === "fa" ? "ثبت‌نام خریدار" : "Buyer signup" }}
      switchCurrent="buyer"
    />
  );
}
