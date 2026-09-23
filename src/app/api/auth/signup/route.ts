import { NextResponse } from "next/server";
import { createUser, toPublicUser } from "@/lib/data/users";
import { createSessionToken, publicUserToSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { withNoStore } from "@/lib/http";
import { clientIp, recordAttempt, retryAfterSeconds, tooManyAttempts } from "@/lib/rate-limit";
import { isExportFormatId } from "@/lib/marketplace/formats";
import { isFamilyId } from "@/lib/data/families";

export const dynamic = "force-dynamic";

/** Trims, drops control characters and caps the length of a free-text signup field. */
function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, max);
  return trimmed || undefined;
}

/** Keeps only the ids we actually know about (formats / families declared at signup). */
function knownIds(value: unknown, isKnown: (id: unknown) => boolean, max: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.filter((id): id is string => typeof id === "string" && isKnown(id)))].slice(0, max);
  return ids.length ? ids : undefined;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    /* seller-only fields */
    phone?: string;
    city?: string;
    specialty?: string;
    instagram?: string;
    portfolioUrl?: string;
    studioName?: string;
    experience?: string;
    bio?: string;
    formats?: string[];
    families?: string[];
    terms?: boolean;
  } | null;

  if (!body?.name || !body?.email || !body?.password) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, withNoStore({ status: 400 }));
  }
  if (body.password.length < 6) {
    return NextResponse.json({ ok: false, error: "password_too_short" }, withNoStore({ status: 400 }));
  }

  // Rate-limit by IP (counts ALL attempts, not just failures — prevents enumeration)
  const key = `signup:${clientIp(req)}`;
  if (tooManyAttempts(key)) {
    const retryAfter = retryAfterSeconds(key);
    const res = NextResponse.json({ ok: false, error: "too_many_attempts" }, withNoStore({ status: 429 }));
    if (retryAfter > 0) res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  // Count every attempt (not just failures) to prevent account-farm enumeration
  recordAttempt(key);

  // Validate role — only "user" and "artist" allowed via public API
  const role = body.role === "artist" ? "artist" : "user";

  /*
   * Buyers sign up with the short form (/signup); designers register on the
   * seller page (/creators/join), which is one single-page form: the account,
   * the field of practice and the city, plus an *optional* studio block —
   * studio name, years of practice, a short bio, the delivery formats, the
   * product families and the seller terms. None of it is required: an empty
   * answer is simply not stored and can be completed later from the artist
   * dashboard. Both doors land in the same account model — the seller fields
   * are captured on the Artist record that self-registration creates.
   */
  let extra;
  if (role === "artist") {
    extra = {
      phone: clean(body.phone, 24),
      city: clean(body.city, 60),
      specialty: clean(body.specialty, 80),
      instagram: clean(body.instagram, 80),
      portfolioUrl: clean(body.portfolioUrl, 200),
      studioName: clean(body.studioName, 80),
      experience: clean(body.experience, 16),
      bio: clean(body.bio, 400),
      formats: knownIds(body.formats, isExportFormatId, 7),
      families: knownIds(body.families, isFamilyId, 8),
      // recorded only when the designer actually accepted them
      ...(body.terms === true ? { termsAt: new Date().toISOString() } : {}),
    };
  }

  try {
    const stored = await createUser(body.name, body.email, body.password, role, undefined, extra);
    const pub = toPublicUser(stored);
    const session = publicUserToSession(pub);
    const res = NextResponse.json({ ok: true, user: session }, withNoStore());
    res.cookies.set(SESSION_COOKIE, await createSessionToken(session), sessionCookieOptions());
    return res;
  } catch (e) {
    if (e instanceof Error && e.message === "email_taken") {
      // Don't expose that the email is taken (prevents enumeration) — generic error
      return NextResponse.json({ ok: false, error: "email_taken" }, withNoStore({ status: 409 }));
    }
    return NextResponse.json({ ok: false, error: "server_error" }, withNoStore({ status: 500 }));
  }
}
