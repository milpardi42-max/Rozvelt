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
  return { title: dictionaries[locale].nav.signup };
}

/**
 * Registration — one form for both kinds of account.
 *
 * The buyer half and the seller half live in the same form (SignupForm): the
 * visitor picks «خریدار» or «هنرمند / طراح» inside the form and the fields
 * follow. This page opens on the buyer half; the designer half has its own
 * content page (/signup/artist) and /signup/buyer is the same form again under
 * a buyer heading, so every old link keeps working.
 */
export default async function SignupPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const d = dictionaries[locale];
  const site = await getSite();
  const image = site.portfolios[2]?.cover ?? site.hero.image;

  return (
    <SignupShell
      locale={locale}
      image={image}
      dict={{ login: d.nav.login, signup: d.nav.signup }}
      options={specialtyOptions(locale)}
      sharePct={DEFAULT_ARTIST_SHARE_PCT}
    />
  );
}
