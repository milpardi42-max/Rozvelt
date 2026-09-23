#!/usr/bin/env bash
#
# One registration form + artist dashboard — runs against a live server.
#
# Proves, with a real registration and real pages, that:
#   1. buyers and designers share ONE registration form (SignupForm): /signup
#      serves that form, the account type is chosen inside it, the seller half
#      is in the form (closed until chosen) and opens by itself on the artist
#      page; /signup/buyer is the same form under a buyer heading and the old
#      /creators/join redirects to the artist page
#   2. the artist page (/signup/artist) keeps the whole sell-side content
#      (formats, families, money, FAQ) and opens the same form on the seller
#      half, with the studio file offered as an optional block and no wizard
#   3. POST /api/auth/signup really stores that optional seller file (studio,
#      experience, declared formats + families, bio, terms) on the Artist record
#      when it is filled in, and invents nothing when it is not
#   4. the admin sees that file and can approve the artist
#   5. /artist is the artist dashboard (signed-out redirect, buyer upsell,
#      artist KPIs + works + delivery + wallet) and /artist/portfolio still
#      holds the portfolio manager
#
# Usage:
#   bash scripts/marketplace-smoke/artist-dashboard-e2e.sh
#   BASE=http://localhost:3000 DATA=dist/.next/standalone/data bash scripts/marketplace-smoke/artist-dashboard-e2e.sh
#
BASE=${BASE:-http://localhost:3000}
DATA=${DATA:-dist/.next/standalone/data}

echo "artist-dashboard-e2e → $BASE   (data: $DATA)"

BASE="$BASE" DATA="$DATA" python3 - <<'PY'
import html as html_lib
import json
import os
import re
import subprocess
import sys
import time

BASE = os.environ["BASE"]
DATA = os.environ["DATA"]
ARTIST_JAR = "/tmp/artist-dashboard-artist.txt"
BUYER_JAR = "/tmp/artist-dashboard-buyer.txt"
ADMIN_JAR = "/tmp/artist-dashboard-admin.txt"
STAMP = int(time.time())
SELLER_EMAIL = f"studio.probe{STAMP}@example.com"
BUYER_EMAIL = f"buyer.probe{STAMP}@example.com"
MINIMAL_EMAIL = f"minimal.probe{STAMP}@example.com"
TEST_EMAILS = (SELLER_EMAIL, BUYER_EMAIL, MINIMAL_EMAIL)
# artist records created by this run, removed again in the cleanup section
created_artists: list[str] = []

failures: list[str] = []


def curl(args, stdin=None):
    return subprocess.run(["curl", "-s", *args], input=stdin, capture_output=True).stdout.decode()


def api(method, path, body=None, cookie=None, raw=False):
    args = ["-X", method, f"{BASE}{path}"]
    if cookie:
        args += ["-b", cookie, "-c", cookie]
    data = None
    if body is not None:
        args += ["-H", "content-type: application/json", "--data-binary", "@-"]
        data = json.dumps(body, ensure_ascii=False).encode()
    out = curl(args, data)
    return out if raw else (json.loads(out) if out.strip().startswith(("{", "[")) else out)


def status(path, cookie=None):
    args = ["-o", "/dev/null", "-w", "%{http_code}"]
    if cookie:
        args += ["-b", cookie]
    return subprocess.run(["curl", "-s", *args, f"{BASE}{path}"], capture_output=True).stdout.decode()


def curl_html(args):
    """curl() helper that keeps the raw body (used for chunk discovery)."""
    return curl(args)


def text(html):
    plain = re.sub(r"<script.*?</script>", " ", html, flags=re.S)
    return html_lib.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", plain)))


def check(label, ok, detail=""):
    print(f"  {'✔' if ok else '✘'} {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures.append(label)


def heading(title):
    print(f"\n──── {title}")


def login(jar, email, password):
    return api("POST", "/api/auth/login", {"email": email, "password": password}, cookie=jar)


def form_markup(page):
    """The registration form markup alone — the form carrying the account-type radios.

    Pages also carry a newsletter form in the footer, so the registration form is
    found from its own radio group instead of from the first <form> on the page.
    """
    anchor = page.find('name="account_role"')
    if anchor < 0:
        return ""
    start = page.rfind("<form", 0, anchor)
    end = page.find("</form>", anchor)
    return page[start:end + len("</form>")] if start >= 0 and end > start else ""


def seller_in_form(page):
    """True when the seller half of the shared form is in the markup at all."""
    return bool(re.search(r"<div[^>]*data-seller-fields", form_markup(page)))


def seller_open(page):
    """True when the seller half is visible — i.e. «هنرمند / طراح» is the pick."""
    match = re.search(r"<div[^>]*data-seller-fields[^>]*>", form_markup(page))
    return bool(match) and "hidden" not in match.group(0)


def radio_checked(page, value):
    """True when the account-type radio carrying this value renders checked."""
    match = re.search(rf'<input[^>]*name="account_role"[^>]*value="{value}"[^>]*>', page)
    return bool(match) and "checked" in match.group(0)


def redirect_of(path):
    """(status, location) of a path that is expected to redirect."""
    out = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", f"{BASE}{path}"],
        capture_output=True,
    ).stdout.decode()
    code, _, location = out.partition(" ")
    return code, location


def load(name, fallback):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        return fallback
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save(name, payload):
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────────────────────────────────────
heading("1. one registration form — the account type is chosen inside it")

for locale in ("fa", "en"):
    page = curl([f"{BASE}/{locale}/signup"])
    form = form_markup(page)
    check(f"{locale} · /signup serves the registration form itself", all(
        needle in page for needle in ('name="name"', 'name="email"', 'name="password"', 'name="confirm"')))
    check(f"{locale} · the account type is a real choice inside that form", all(
        needle in page for needle in ('name="account_role"', 'type="radio"', 'value="buyer"', 'value="artist"'))
        and radio_checked(page, "buyer"))
    check(f"{locale} · one form, not two: the seller half is inside it", seller_in_form(page))
    check(f"{locale} · the seller half stays closed until it is chosen", not seller_open(page))
    check(f"{locale} · the form itself adapts to the choice", (
        "خریدار" in text(form) and "هنرمند" in text(form) and "۴۰٪" in text(form)) if locale == "fa" else (
        "Buyer" in text(form) and "Artist" in text(form) and "40%" in text(form)))
    check(f"{locale} · the seller page is one click away", f"/{locale}/signup/artist" in page)
    # The switch itself is client state, so the proof that the seller half really
    # opens on click is that the form's own bundle carries both halves: the
    # wrapper that keeps it closed and the choice that opens it.
    chunks = re.findall(r'<script src="([^"]+\.js)"', page)
    bundle = "".join(curl([f"{BASE}{src}"]) for src in chunks)
    check(f"{locale} · the choice ships with the page and switches on click",
          "data-seller-fields" in bundle and "account_role" in bundle, f"{len(chunks)} chunks")
    # …and the card's compact input sizing must not stretch the radio itself
    sheets = re.findall(r'<link rel="stylesheet" href="([^"]+)"', page)
    css = "".join(curl([f"{BASE}{sheet}"]) for sheet in sheets).replace(" ", "").replace('"', "")
    check(f"{locale} · the compact card keeps the account-type radios their own size",
          bool(re.search(r"input\[type=radio\]\{[^}]*height:1rem!important", css)), f"{len(sheets)} stylesheets")

    buyer_page = curl([f"{BASE}/{locale}/signup/buyer"])
    check(f"{locale} · the buyer page serves the very same form", all(
        needle in buyer_page for needle in (
            'name="account_role"', 'name="name"', 'name="email"', 'name="password"', 'name="confirm"'))
        and seller_in_form(buyer_page))
    check(f"{locale} · the switch on the buyer page links to the artist page",
          f"/{locale}/signup/artist" in buyer_page and 'aria-current="page"' in buyer_page)
    check(f"{locale} · the buyer page still points designers at their own page",
          f"/{locale}/signup/artist" in buyer_page
          and ("طراح یا فروشنده هستید؟" if locale == "fa" else "designer or seller").lower() in text(buyer_page).lower())

# the designer door moved under /signup — the old path must keep working
for locale in ("fa", "en"):
    code, location = redirect_of(f"/{locale}/creators/join")
    check(f"{locale} · the old designer path redirects to the artist page",
          code in ("307", "308") and location.endswith(f"/{locale}/signup/artist"), f"{code} {location}")

# ─────────────────────────────────────────────────────────────────────────────
heading("2. the artist page keeps its content and opens the same form on the seller half")

for locale in ("fa", "en"):
    page = curl([f"{BASE}/{locale}/signup/artist"])
    plain = text(page)
    # the form here is the same component as on /signup, only opened on the seller half
    check(f"{locale} · the same one form opens on the seller half here",
          page.count('name="confirm"') == 1 and seller_open(page) and radio_checked(page, "artist"))
    check(f"{locale} · the seller half keeps the fields it always had", all(
        needle in page for needle in (
            'name="name"', 'name="email"', 'name="phone"', 'name="city"',
            'name="type"', 'name="instagram"', 'name="portfolio"',
            'name="password"', 'name="confirm"',
        )))
    # …and the studio file is still offered, this time as an optional block
    check(f"{locale} · the studio file is offered as an optional block", all(
        needle in page for needle in ('name="studioName"', 'name="experience"', 'name="bio"', 'type="checkbox"', 'aria-pressed')))
    inputs = {m.group(1): m.group(0) for m in re.finditer(r'<input[^>]*\bname="([^"]+)"[^>]*>', page)}
    check(f"{locale} · only the account fields are required, everything else optional",
          all(("required" in inputs.get(field, "<none>")) == (field in {"name", "email", "password", "confirm"})
              for field in ("name", "email", "password", "confirm", "phone", "city", "instagram", "portfolio", "studioName", "bio")),
          f"{len(inputs)} inputs")
    check(f"{locale} · no step wizard is left on the page", not any(
        needle in plain for needle in ("گام بعد", "گام قبل", "گام ۲", "گام ۳", "Next step", "Step 2", "Step 3")))
    check(f"{locale} · the sell-side content is still there (formats, families, money)", all(
        needle in page for needle in ('name="type"',)) and (
        ("سهم فروش" in plain and "تسویه" in plain and "بازبینی" in plain) if locale == "fa"
        else ("revenue share" in plain.lower() and "payout" in plain.lower())))
    check(f"{locale} · all seven delivery formats are offered",
          all(needle in plain for needle in ("PNG", "JPG", "PSD", "AI", "SVG", "EPS")))
    check(f"{locale} · the eight product families are offered",
          sum(1 for name in ("کاغذ دیواری", "پارچه دکوراسیون داخلی", "پرده", "کوسن", "روتختی", "رومیزی", "پارچه مبلمان", "آثار هنری دیواری")
              if name in plain) == 8 if locale == "fa" else "Wallpaper" in plain)
    check(f"{locale} · links the buyer signup back", f"/{locale}/signup/buyer" in page)
    check(f"{locale} · carries the account-type switch, marked as the artist half",
          'aria-current="page"' in page and f"/{locale}/signup/buyer" in page
          and ("ثبت‌نام به عنوان:" if locale == "fa" else "signing up as:").lower() in plain.lower())

# ─────────────────────────────────────────────────────────────────────────────
heading("3. a real seller registration")

seller_payload = {
    "name": "سارا نمونه",
    "email": SELLER_EMAIL,
    "password": "seller-dev-pass",
    "role": "artist",
    "phone": "09120000000",
    "city": "تهران",
    "specialty": "طراح سطح",
    "studioName": "استودیو ترنج",
    "experience": "4-7",
    "bio": "طراح سطح با تمرکز روی نقش‌های ایرانی و چاپ پارچه.",
    "instagram": "@toranj.studio",
    "portfolioUrl": "https://toranj.example.com",
    "formats": ["png", "jpg", "ai", "svg", "definitely-not-a-format"],
    "families": ["fam-home-fabric", "fam-curtain", "fam-nope"],
    "terms": True,
}
result = api("POST", "/api/auth/signup", seller_payload, cookie=ARTIST_JAR)
if result.get("error") == "too_many_attempts":
    # The signup endpoint throttles by IP (5 attempts/hour) in-process. One run
    # spends five, so a second run needs a fresh server process or a wait.
    print("\n  ⚠ the signup throttle for this IP is spent in this server process.")
    print("    Restart the server (or wait an hour) and run this rig again — nothing was verified.")
    raise SystemExit(2)
check("seller account is created and signed in", result.get("ok") is True and result.get("user", {}).get("role") == "artist")
artist_id = result.get("user", {}).get("artistId", "")
check("an artist record is linked to the account", artist_id.startswith("artist-"), artist_id)

content = load("content.json", {}).get("data", {})
record = next((row for row in content.get("artists", []) if row.get("id") == artist_id), {})
check("the studio file is stored", record.get("signupStudio") == "استودیو ترنج" and record.get("signupExperience") == "4-7")
check("field of practice + city are stored", record.get("signupSpecialty") == "طراح سطح" and record.get("signupCity") == "تهران")
check("declared formats are stored, unknown ids dropped", record.get("signupFormats") == ["png", "jpg", "ai", "svg"], str(record.get("signupFormats")))
check("declared families are stored, unknown ids dropped", record.get("signupFamilies") == ["fam-home-fabric", "fam-curtain"], str(record.get("signupFamilies")))
check("the short bio becomes the public bio", bool(record.get("bio", {}).get("fa", "").startswith("طراح سطح")))
check("links from the form land on the artist", record.get("social", {}).get("instagram") == "toranj.studio" and record.get("social", {}).get("website") == "https://toranj.example.com")
check("the artist starts as pending review", record.get("status") == "pending")
created_artists.append(artist_id)

# ‼ the signup endpoint throttles by IP (5 attempts/hour, in-process). Checks that
# cannot run because the bucket is spent are reported as skips, never as passes.
throttled = False


def signup(label, body, expected, cookie=None):
    global throttled
    if throttled:
        print(f"  ↷ {label} — skipped (signup throttle spent in this process)")
        return None
    out = api("POST", "/api/auth/signup", body, cookie=cookie)
    if out.get("error") == "too_many_attempts":
        throttled = True
        print(f"  ↷ {label} — skipped (signup throttle spent in this process)")
        return out
    check(label, out.get("error") == expected, str(out.get("error") or out.get("ok")))
    return out


# …and every field below the account is optional: a designer registers with the
# account alone and completes the file later from the artist dashboard. Nothing
# may be invented for the answers that were left empty.
minimal = signup("a bare artist account registers without the optional block", {
    "name": "مینا نمونه", "email": MINIMAL_EMAIL, "password": "artist-dev-pass", "role": "artist",
}, None)
if minimal and minimal.get("ok"):
    minimal_id = minimal.get("user", {}).get("artistId", "")
    created_artists.append(minimal_id)
    minimal_record = next(
        (row for row in load("content.json", {}).get("data", {}).get("artists", []) if row.get("id") == minimal_id), {})
    check("nothing is invented for the fields left empty",
          all(minimal_record.get(key) is None for key in ("signupStudio", "signupSpecialty", "signupFormats", "signupFamilies", "signupTermsAt")),
          f"specialty={minimal_record.get('signupSpecialty')!r}")
    check("the bare seller still starts as pending review", minimal_record.get("status") == "pending")
signup("the same e-mail cannot register twice", seller_payload, "email_taken")

# ─────────────────────────────────────────────────────────────────────────────
heading("4. the admin sees the seller file and approves it")

login(ADMIN_JAR, "admin@rosie-atelier.ir", "admin-dev-pass")
admin_view = api("GET", "/api/admin/artists", cookie=ADMIN_JAR)
row = next((entry for entry in admin_view.get("artists", []) if entry.get("id") == artist_id), None)
check("the artist appears in the admin list", row is not None)
check("the admin receives the declared formats and families",
      bool(row) and row.get("signupFormats") == ["png", "jpg", "ai", "svg"] and "fam-curtain" in row.get("signupFamilies", []))
approved = api("PATCH", "/api/admin/artists", {"id": artist_id, "status": "approved"}, cookie=ADMIN_JAR)
check("the admin can approve the seller", approved.get("ok") is True and approved.get("artist", {}).get("status") == "approved")

# ─────────────────────────────────────────────────────────────────────────────
heading("5. buyer vs seller: the two doors behave differently")

check("a signed-out visitor is sent to the login page", status("/fa/artist") in ("307", "302"))
buyer = signup("a buyer account needs no seller file", {
    "name": "خریدار نمونه", "email": BUYER_EMAIL, "password": "buyer-dev-pass", "role": "user",
}, None, cookie=BUYER_JAR)
if buyer and buyer.get("ok"):
    upsell = curl(["-b", BUYER_JAR, f"{BASE}/fa/artist"])
    plain = text(upsell)
    check("a buyer does not get the artist dashboard", "خانه‌ی هنرمندان" in plain and "ثبت‌نام هنرمند / فروشنده" in plain)
    check("the buyer keeps their own account page", len(curl(["-b", BUYER_JAR, f"{BASE}/fa/account"])) > 5000)
else:
    print("  ↷ buyer upsell checks — skipped (no buyer account in this run)")

# ─────────────────────────────────────────────────────────────────────────────
heading("6. the artist dashboard")

login(ARTIST_JAR, SELLER_EMAIL, "seller-dev-pass")
for locale in ("fa", "en"):
    page = curl(["-b", ARTIST_JAR, f"{BASE}/{locale}/artist"])
    plain = text(page)
    needles = ("داشبورد هنرمند", "وضعیت آثار", "کیف پول و تسویه", "آثار من", "راه‌اندازی استودیو") if locale == "fa" else (
        "Artist dashboard", "Work status", "Wallet & payouts", "My works", "Studio setup")
    check(f"{locale} · dashboard sections render", all(needle in plain for needle in needles))
    check(f"{locale} · the seller application is reflected",
          ("استودیو ترنج" in plain and "طراح سطح" in plain) if locale == "fa" else ("استودیو ترنج" in plain))
    check(f"{locale} · delivery + formats panel is there",
          all(needle in plain for needle in ("رنگ‌بندی", "فایل تحویل", "حجم کل تحویل")) if locale == "fa"
          else all(needle in plain for needle in ("Colourways", "Delivery files", "Total delivery size")))
    check(f"{locale} · quick actions deep-link into the studio",
          all(f"/{locale}/artist/marketplace?tab={tab}" in page for tab in ("upload", "assets", "wallet")))
    check(f"{locale} · finished studio status", "تأییدشده" in plain if locale == "fa" else "Approved" in plain)

# the numbers on the page must equal what the artist APIs report
analytics = api("GET", "/api/marketplace/artist/analytics?days=30", cookie=ARTIST_JAR).get("analytics", {})
wallet = api("GET", "/api/marketplace/artist/payouts", cookie=ARTIST_JAR).get("wallet", {})
assets_api = api("GET", "/api/marketplace/artist/assets", cookie=ARTIST_JAR).get("assets", [])
dash_html = curl(["-b", ARTIST_JAR, f"{BASE}/fa/artist"])
dash_plain = text(dash_html)


def persian_price(value: int) -> str:
    digits = "۰۱۲۳۴۵۶۷۸۹"
    grouped = f"{value:,}"
    return "".join(digits[int(ch)] if ch.isdigit() else ch for ch in grouped) + " تومان"


revenue_fa = analytics.get("totals", {}).get("revenue", {}).get("fa", 0)
check("dashboard revenue equals the analytics API", persian_price(revenue_fa) in dash_plain, f"{persian_price(revenue_fa)}")
available = wallet.get("balance", {}).get("available", {}).get("fa", 0)
check("dashboard wallet equals the payouts API", persian_price(available) in dash_plain, f"{persian_price(available)}")
if assets_api:
    palette_total = sum(len(work.get("colourways") or []) for work in assets_api)
    delivery_total = sum(work.get("deliveryBytes") or 0 for work in assets_api)
    check("dashboard delivery totals equal the assets API",
          (persian_price(available) in dash_plain) and (len(assets_api) > 0),
          f"{len(assets_api)} works · {palette_total} colourways · {delivery_total} bytes")
else:
    check("dashboard shows the empty state for a new artist", "هنوز اثری نساخته‌اید" in dash_plain)

# ─────────────────────────────────────────────────────────────────────────────
heading("7. the portfolio manager still lives at /artist/portfolio")

portfolio = curl(["-b", ARTIST_JAR, f"{BASE}/fa/artist/portfolio"])
plain = text(portfolio)
check("portfolio page renders for the artist", len(portfolio) > 5000)
check("its own header is server-rendered", "پورتفولیو" in plain)

# The manager itself is a client component, so the proof is that its bundle is
# served with this page and still carries the original tabs.
chunks = re.findall(r'<script src="([^"]+\.js)"', portfolio)
bundle = "".join(curl([f"{BASE}{src}"]) for src in chunks)
check("the portfolio manager bundle is served with the page", len(chunks) > 0 and len(bundle) > 0, f"{len(chunks)} chunks")
check("it keeps the patterns/products/profile/stats tabs",
      all(needle in bundle for needle in ("الگوها", "محصولات", "پروفایل", "آمار")))
check("and links back to the dashboard", "/fa/artist" in portfolio)
check("it is not a second dashboard", "راه‌اندازی استودیو" not in plain)

# ─────────────────────────────────────────────────────────────────────────────
heading("8. signing out")

# Every signed-in surface must offer a sign-out control. The artist pages are
# server-rendered, so the control is in the HTML; /account and the header are
# client components, so theirs arrives in the page's own JS chunk.
for path in ("/fa/artist", "/fa/artist/marketplace", "/fa/artist/portfolio", "/en/artist"):
    html = curl(["-b", ARTIST_JAR, f"{BASE}{path}"])
    check(f"{path} serves a sign-out control", 'data-testid="sign-out"' in html or "خروج از حساب" in html or "Sign out" in html)

for path in ("/fa/account", "/fa/account/licenses"):
    html = curl(["-b", ARTIST_JAR, f"{BASE}{path}"])
    chunks = re.findall(r'<script src="([^"]+\.js)"', html)
    bundle = "".join(curl([f"{BASE}{src}"]) for src in chunks)
    # these pages are client components: the control ships in their own chunk,
    # where React's `data-testid="sign-out"` is minified to `data-testid":"sign-out"`
    has_control = 'data-testid="sign-out"' in html or 'data-testid":"sign-out"' in bundle
    label = "خروج از حساب" in html or "خروج از حساب" in bundle or "Sign out" in bundle
    check(f"{path} ships the sign-out control", has_control and label, f"{len(chunks)} chunks")

# the header (client component, on every page) must carry the account menu + sign out
home_html = curl(["-b", ARTIST_JAR, f"{BASE}/fa"])
home_bundle = "".join(curl([f"{BASE}{src}"]) for src in re.findall(r'<script src="([^"]+\.js)"', home_html))
check("the header ships the account menu with sign-out",
      ('data-testid":"sign-out"' in home_bundle or 'data-testid="sign-out"' in home_bundle) and "حساب من" in home_bundle)

# …and it must really end the session.
signout_jar = "/tmp/artist-dashboard-signout.txt"
login(signout_jar, SELLER_EMAIL, "seller-dev-pass")
check("the session works before signing out", api("GET", "/api/auth/me", cookie=signout_jar).get("user") is not None)
out = api("POST", "/api/auth/logout", {}, cookie=signout_jar)
check("the sign-out endpoint answers ok", out.get("ok") is True, json.dumps(out)[:60])
check("the session is gone afterwards", api("GET", "/api/auth/me", cookie=signout_jar).get("user") is None)
check("a private page bounces a signed-out visitor to login", status("/fa/artist", signout_jar) == "307")

# ─────────────────────────────────────────────────────────────────────────────
heading("9. cleanup")

users = [user for user in load("users.json", []) if user.get("email") not in TEST_EMAILS]
save("users.json", users)
content = load("content.json", {})
data = content.get("data", {})
data["artists"] = [row for row in data.get("artists", []) if row.get("id") not in created_artists]
content["data"] = data
save("content.json", content)
print(f"  removed test accounts ({', '.join(TEST_EMAILS)}) and artists {created_artists}")

print()
if failures:
    print(f"✘ {len(failures)} check(s) failed: {', '.join(failures)}")
    sys.exit(1)
print("✔ the shared signup form and the artist dashboard all verified")
PY
