import type { Metadata } from "next";
import { SignupShell } from "@/components/profile/SignupShell";
import { getSite } from "@/lib/data/queries";
import { specialtyOptions } from "@/lib/artist/specialty-options";
import { DEFAULT_ARTIST_SHARE_PCT } from "@/lib/marketplace/config";
import { dictionaries } from "@/lib/i18n/dictionary";
import type { Locale } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "fa" ? "ثبت‌نام خریدار" : "Buyer signup" };
}

/**
 * Buyer registration — the buyer heading over the one shared form.
 *
 * Exactly the same form as /signup (and the same component the designer half
 * uses on /signup/artist): the buyer half opens selected, the account-type
 * switch above it marks this page and links to the seller page.
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
      options={specialtyOptions(locale)}
      sharePct={DEFAULT_ARTIST_SHARE_PCT}
    />
  );
}
