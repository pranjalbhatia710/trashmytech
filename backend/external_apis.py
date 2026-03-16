"""trashmy.tech — External API integration layer.

Aggregates data from 9 free external APIs to enrich website analysis.
Every function is async, has a 10-second timeout, and returns None on failure
(never crashes the pipeline). All calls run in parallel via asyncio.gather.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import ssl
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse, quote

import aiohttp

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
INDIVIDUAL_TIMEOUT = 10.0  # seconds per API call
SESSION_TIMEOUT = aiohttp.ClientTimeout(total=30, connect=10)
USER_AGENT = "trashmy.tech/2.0 (website-auditor)"

# API endpoints
PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
OBSERVATORY_ANALYZE_URL = "https://http-observatory.security.mozilla.org/api/v1/analyze"
OBSERVATORY_RESULTS_URL = "https://http-observatory.security.mozilla.org/api/v1/getScanResults"
SAFE_BROWSING_URL = "https://safebrowsing.googleapis.com/v4/threatMatches:find"
CARBON_URL = "https://api.websitecarbon.com/b"
GREEN_WEB_URL = "https://api.thegreenwebfoundation.org/greencheck"
RDAP_URL = "https://rdap.org/domain"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _extract_domain(url: str) -> str:
    """Extract bare domain from URL, stripping www. prefix."""
    hostname = urlparse(url).hostname or ""
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname


def _get_google_api_key() -> str | None:
    """Get Google API key from environment (GEMINI_API_KEY doubles as Google API key)."""
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


# ---------------------------------------------------------------------------
# 1. Google PageSpeed Insights
# ---------------------------------------------------------------------------
async def check_pagespeed(url: str, session: aiohttp.ClientSession) -> dict | None:
    """Check Google PageSpeed Insights for mobile and desktop strategies.

    Requires GEMINI_API_KEY (Google API key). Returns Lighthouse scores
    and Core Web Vitals for both strategies, or None on failure.
    """
    api_key = _get_google_api_key()
    if not api_key:
        logger.warning("PageSpeed: No Google API key found (GEMINI_API_KEY / GOOGLE_API_KEY)")
        return None

    async def _fetch_strategy(strategy: str) -> dict | None:
        try:
            params = {
                "url": url,
                "key": api_key,
                "strategy": strategy,
                "category": ["performance", "accessibility", "seo", "best-practices"],
            }
            async with session.get(PAGESPEED_URL, params=params) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.warning(f"PageSpeed ({strategy}): HTTP {resp.status} — {body[:200]}")
                    return None
                data = await resp.json()

            # Extract Lighthouse scores
            categories = data.get("lighthouseResult", {}).get("categories", {})
            scores = {}
            for cat_key in ("performance", "accessibility", "seo", "best-practices"):
                cat = categories.get(cat_key, {})
                scores[cat_key] = round((cat.get("score") or 0) * 100)

            # Extract Core Web Vitals from audits
            audits = data.get("lighthouseResult", {}).get("audits", {})
            web_vitals = {
                "first_contentful_paint_ms": audits.get("first-contentful-paint", {}).get("numericValue"),
                "largest_contentful_paint_ms": audits.get("largest-contentful-paint", {}).get("numericValue"),
                "total_blocking_time_ms": audits.get("total-blocking-time", {}).get("numericValue"),
                "cumulative_layout_shift": audits.get("cumulative-layout-shift", {}).get("numericValue"),
                "speed_index_ms": audits.get("speed-index", {}).get("numericValue"),
                "time_to_interactive_ms": audits.get("interactive", {}).get("numericValue"),
            }

            # Extract notable failed audits (score < 0.5 and not informative)
            failed_audits = []
            for audit_id, audit in audits.items():
                score = audit.get("score")
                if score is not None and score < 0.5 and audit.get("scoreDisplayMode") != "informative":
                    failed_audits.append({
                        "id": audit_id,
                        "title": audit.get("title", ""),
                        "score": score,
                        "display_value": audit.get("displayValue", ""),
                    })
            failed_audits.sort(key=lambda x: x.get("score", 1))

            return {
                "scores": scores,
                "web_vitals": web_vitals,
                "failed_audits": failed_audits[:15],
            }
        except asyncio.TimeoutError:
            logger.warning(f"PageSpeed ({strategy}): timeout")
            return None
        except aiohttp.ClientError as e:
            logger.warning(f"PageSpeed ({strategy}): HTTP error — {e}")
            return None
        except Exception as e:
            logger.error(f"PageSpeed ({strategy}): unexpected error — {e}", exc_info=True)
            return None

    try:
        mobile, desktop = await asyncio.gather(
            asyncio.wait_for(_fetch_strategy("mobile"), timeout=INDIVIDUAL_TIMEOUT),
            asyncio.wait_for(_fetch_strategy("desktop"), timeout=INDIVIDUAL_TIMEOUT),
            return_exceptions=True,
        )
        if isinstance(mobile, Exception):
            logger.warning(f"PageSpeed mobile failed: {mobile}")
            mobile = None
        if isinstance(desktop, Exception):
            logger.warning(f"PageSpeed desktop failed: {desktop}")
            desktop = None

        if mobile is None and desktop is None:
            return None

        return {"mobile": mobile, "desktop": desktop}
    except Exception as e:
        logger.error(f"PageSpeed: unexpected error — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 2. Mozilla Observatory
# ---------------------------------------------------------------------------
async def check_observatory(domain: str, session: aiohttp.ClientSession) -> dict | None:
    """Check Mozilla Observatory for security headers and configuration.

    Initiates a scan, polls for completion, then fetches detailed results.
    Returns security grade, score, and individual test results.
    """
    try:
        # Step 1: Initiate scan
        async with session.post(
            OBSERVATORY_ANALYZE_URL,
            params={"host": domain},
            data={"hidden": "true", "rescan": "false"},
        ) as resp:
            if resp.status not in (200, 302):
                logger.warning(f"Observatory: HTTP {resp.status} for {domain}")
                return None
            scan = await resp.json()

        scan_id = scan.get("scan_id")
        state = scan.get("state", "")

        # Step 2: Poll if not finished (max 5 retries, 2s delay)
        retries = 0
        while state not in ("FINISHED", "FAILED") and retries < 5:
            await asyncio.sleep(2)
            retries += 1
            async with session.get(
                OBSERVATORY_ANALYZE_URL,
                params={"host": domain},
            ) as resp:
                if resp.status != 200:
                    break
                scan = await resp.json()
                state = scan.get("state", "")
                scan_id = scan.get("scan_id", scan_id)

        if state != "FINISHED" or not scan_id:
            logger.warning(f"Observatory: scan did not finish for {domain} (state={state})")
            # Still return partial data if we have a grade
            if scan.get("grade"):
                return {
                    "grade": scan.get("grade"),
                    "score": scan.get("score"),
                    "state": state,
                    "tests": {},
                }
            return None

        # Step 3: Fetch detailed test results
        async with session.get(
            OBSERVATORY_RESULTS_URL,
            params={"scan": scan_id},
        ) as resp:
            if resp.status != 200:
                logger.warning(f"Observatory results: HTTP {resp.status}")
                return {
                    "grade": scan.get("grade"),
                    "score": scan.get("score"),
                    "state": state,
                    "tests": {},
                }
            tests = await resp.json()

        # Summarize tests
        test_summary = {}
        for test_name, test_data in tests.items():
            test_summary[test_name] = {
                "pass": test_data.get("pass"),
                "result": test_data.get("result"),
                "score_modifier": test_data.get("score_modifier", 0),
                "score_description": test_data.get("score_description", ""),
            }

        return {
            "grade": scan.get("grade"),
            "score": scan.get("score"),
            "state": state,
            "tests_passed": sum(1 for t in tests.values() if t.get("pass")),
            "tests_failed": sum(1 for t in tests.values() if not t.get("pass")),
            "tests": test_summary,
        }

    except asyncio.TimeoutError:
        logger.warning(f"Observatory: timeout for {domain}")
        return None
    except aiohttp.ClientError as e:
        logger.warning(f"Observatory: HTTP error for {domain} — {e}")
        return None
    except Exception as e:
        logger.error(f"Observatory: unexpected error for {domain} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 3. Google Safe Browsing
# ---------------------------------------------------------------------------
async def check_safe_browsing(url: str, session: aiohttp.ClientSession) -> dict | None:
    """Check Google Safe Browsing API for known threats.

    Requires GEMINI_API_KEY (Google API key). Returns whether the URL is
    flagged as malicious with details of any threats found.
    """
    api_key = _get_google_api_key()
    if not api_key:
        logger.warning("Safe Browsing: No Google API key found")
        return None

    try:
        payload = {
            "client": {
                "clientId": "trashmytech",
                "clientVersion": "2.0.0",
            },
            "threatInfo": {
                "threatTypes": [
                    "MALWARE",
                    "SOCIAL_ENGINEERING",
                    "UNWANTED_SOFTWARE",
                    "POTENTIALLY_HARMFUL_APPLICATION",
                ],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": url}],
            },
        }

        endpoint = f"{SAFE_BROWSING_URL}?key={api_key}"
        async with session.post(endpoint, json=payload) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.warning(f"Safe Browsing: HTTP {resp.status} — {body[:200]}")
                return None
            data = await resp.json()

        matches = data.get("matches", [])
        threats = []
        for match in matches:
            threats.append({
                "threat_type": match.get("threatType"),
                "platform_type": match.get("platformType"),
                "url": match.get("threat", {}).get("url", ""),
            })

        return {
            "safe": len(threats) == 0,
            "threats": threats,
            "threats_count": len(threats),
        }

    except asyncio.TimeoutError:
        logger.warning(f"Safe Browsing: timeout for {url}")
        return None
    except aiohttp.ClientError as e:
        logger.warning(f"Safe Browsing: HTTP error for {url} — {e}")
        return None
    except Exception as e:
        logger.error(f"Safe Browsing: unexpected error for {url} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 4. Website Carbon
# ---------------------------------------------------------------------------
async def check_carbon(url: str, session: aiohttp.ClientSession) -> dict | None:
    """Check Website Carbon API for environmental impact metrics.

    Returns CO2 per visit, cleaner-than percentage, and green hosting status.
    """
    try:
        async with session.get(CARBON_URL, params={"url": url}) as resp:
            if resp.status != 200:
                logger.warning(f"Carbon: HTTP {resp.status} for {url}")
                return None
            data = await resp.json()

        # v2 API returns {"c": co2_grams, "p": cleaner_than_percent, "url": "..."}
        # v1 API returns {"statistics": {"co2": {...}, ...}}
        if "c" in data and "p" in data:
            # v2 response
            return {
                "co2_grams_per_visit": data.get("c"),
                "cleaner_than": data.get("p"),
                "green_hosting": data.get("green"),
                "bytes_transferred": data.get("bytes"),
                "energy_per_visit_kwh": None,
            }

        # v1 response fallback
        statistics = data.get("statistics", data)
        co2 = statistics.get("co2", {})
        if isinstance(co2, dict):
            co2_grams = co2.get("grid", {}).get("grams", co2.get("grams"))
        else:
            co2_grams = co2

        return {
            "co2_grams_per_visit": co2_grams,
            "cleaner_than": data.get("cleanerThan", statistics.get("cleanerThan")),
            "green_hosting": data.get("green", statistics.get("green", False)),
            "bytes_transferred": statistics.get("adjustedBytes", statistics.get("bytes")),
            "energy_per_visit_kwh": statistics.get("energy"),
        }

    except asyncio.TimeoutError:
        logger.warning(f"Carbon: timeout for {url}")
        return None
    except aiohttp.ClientError as e:
        logger.warning(f"Carbon: HTTP error for {url} — {e}")
        return None
    except Exception as e:
        logger.error(f"Carbon: unexpected error for {url} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 5. Green Web Foundation
# ---------------------------------------------------------------------------
async def check_green_web(domain: str, session: aiohttp.ClientSession) -> dict | None:
    """Check Green Web Foundation for green hosting status.

    Returns whether the domain uses green energy hosting and provider details.
    """
    try:
        async with session.get(f"{GREEN_WEB_URL}/{domain}") as resp:
            if resp.status != 200:
                logger.warning(f"Green Web: HTTP {resp.status} for {domain}")
                return None
            data = await resp.json()

        return {
            "green": data.get("green", False),
            "hosted_by": data.get("hosted_by"),
            "hosted_by_website": data.get("hosted_by_website"),
            "partner": data.get("partner"),
        }

    except asyncio.TimeoutError:
        logger.warning(f"Green Web: timeout for {domain}")
        return None
    except aiohttp.ClientError as e:
        logger.warning(f"Green Web: HTTP error for {domain} — {e}")
        return None
    except Exception as e:
        logger.error(f"Green Web: unexpected error for {domain} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 6. DNS Check (dnspython)
# ---------------------------------------------------------------------------
def _sync_dns_check(domain: str) -> dict | None:
    """Synchronous DNS check using dnspython. Run via executor."""
    try:
        import dns.resolver
    except ImportError:
        logger.warning("DNS check: dnspython not installed")
        return None

    result: dict[str, Any] = {
        "a_records": [],
        "aaaa_records": [],
        "mx_records": [],
        "ns_records": [],
        "spf": None,
        "dmarc": None,
        "has_spf": False,
        "has_dmarc": False,
        "has_dkim": None,  # Cannot fully verify without selector
    }

    resolver = dns.resolver.Resolver()
    resolver.timeout = 5.0
    resolver.lifetime = 8.0

    # A records
    try:
        answers = resolver.resolve(domain, "A")
        result["a_records"] = [str(r) for r in answers]
    except Exception:
        pass

    # AAAA records (IPv6)
    try:
        answers = resolver.resolve(domain, "AAAA")
        result["aaaa_records"] = [str(r) for r in answers]
    except Exception:
        pass

    # MX records
    try:
        answers = resolver.resolve(domain, "MX")
        result["mx_records"] = [
            {"priority": r.preference, "host": str(r.exchange)}
            for r in answers
        ]
    except Exception:
        pass

    # NS records
    try:
        answers = resolver.resolve(domain, "NS")
        result["ns_records"] = [str(r) for r in answers]
    except Exception:
        pass

    # SPF (TXT records containing v=spf1)
    try:
        answers = resolver.resolve(domain, "TXT")
        for r in answers:
            txt = str(r).strip('"')
            if "v=spf1" in txt:
                result["spf"] = txt
                result["has_spf"] = True
                break
    except Exception:
        pass

    # DMARC (_dmarc.domain TXT)
    try:
        answers = resolver.resolve(f"_dmarc.{domain}", "TXT")
        for r in answers:
            txt = str(r).strip('"')
            if "v=DMARC1" in txt.upper():
                result["dmarc"] = txt
                result["has_dmarc"] = True
                break
    except Exception:
        pass

    return result


async def check_dns(domain: str) -> dict | None:
    """Check DNS records for the domain asynchronously.

    Uses dnspython (synchronous) via asyncio executor.
    Returns SPF, DMARC, MX, NS, A, and AAAA records.
    """
    try:
        loop = asyncio.get_running_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(None, _sync_dns_check, domain),
            timeout=INDIVIDUAL_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning(f"DNS check: timeout for {domain}")
        return None
    except Exception as e:
        logger.error(f"DNS check: unexpected error for {domain} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 7. SSL Certificate Check
# ---------------------------------------------------------------------------
def _sync_ssl_check(domain: str) -> dict | None:
    """Synchronous SSL certificate inspection. Run via executor."""
    try:
        # Try to use certifi for CA certificates (fixes macOS cert issues)
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ctx = ssl.create_default_context()
        conn = ctx.wrap_socket(
            socket.socket(socket.AF_INET, socket.SOCK_STREAM),
            server_hostname=domain,
        )
        conn.settimeout(8.0)
        conn.connect((domain, 443))

        cert = conn.getpeercert()
        cipher = conn.cipher()
        protocol = conn.version()

        conn.close()

        if not cert:
            return {"valid": False, "error": "No certificate returned"}

        # Parse dates
        not_before_str = cert.get("notBefore", "")
        not_after_str = cert.get("notAfter", "")

        try:
            not_after = datetime.strptime(not_after_str, "%b %d %H:%M:%S %Y %Z")
            not_before = datetime.strptime(not_before_str, "%b %d %H:%M:%S %Y %Z")
            now = datetime.utcnow()
            days_until_expiry = (not_after - now).days
            is_valid = not_before <= now <= not_after
        except (ValueError, TypeError):
            days_until_expiry = None
            is_valid = None
            not_after = None
            not_before = None

        # Extract issuer
        issuer_dict = {}
        for entry in cert.get("issuer", ()):
            for key, value in entry:
                issuer_dict[key] = value

        # Extract subject
        subject_dict = {}
        for entry in cert.get("subject", ()):
            for key, value in entry:
                subject_dict[key] = value

        # Extract SANs
        sans = []
        for san_type, san_value in cert.get("subjectAltName", ()):
            sans.append(san_value)

        return {
            "valid": is_valid,
            "days_until_expiry": days_until_expiry,
            "not_before": str(not_before) if not_before else not_before_str,
            "not_after": str(not_after) if not_after else not_after_str,
            "issuer": {
                "common_name": issuer_dict.get("commonName", ""),
                "organization": issuer_dict.get("organizationName", ""),
            },
            "subject": {
                "common_name": subject_dict.get("commonName", ""),
                "organization": subject_dict.get("organizationName", ""),
            },
            "sans": sans[:20],
            "protocol_version": protocol,
            "cipher_suite": cipher[0] if cipher else None,
            "key_size": cipher[2] if cipher and len(cipher) > 2 else None,
            "serial_number": cert.get("serialNumber"),
        }

    except ssl.SSLCertVerificationError as e:
        return {
            "valid": False,
            "error": f"Certificate verification failed: {str(e)[:200]}",
            "self_signed": "self signed" in str(e).lower() or "self-signed" in str(e).lower(),
        }
    except socket.timeout:
        return None
    except socket.gaierror as e:
        logger.warning(f"SSL check: DNS resolution failed for {domain} — {e}")
        return None
    except ConnectionRefusedError:
        logger.warning(f"SSL check: Connection refused for {domain}:443")
        return None
    except OSError as e:
        logger.warning(f"SSL check: OS error for {domain} — {e}")
        return None
    except Exception as e:
        logger.error(f"SSL check: unexpected error for {domain} — {e}", exc_info=True)
        return None


async def check_ssl(domain: str) -> dict | None:
    """Inspect SSL certificate for the domain asynchronously.

    Uses Python's ssl and socket modules via asyncio executor.
    Returns certificate validity, expiry, issuer, cipher info.
    """
    try:
        loop = asyncio.get_running_loop()
        return await asyncio.wait_for(
            loop.run_in_executor(None, _sync_ssl_check, domain),
            timeout=INDIVIDUAL_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning(f"SSL check: timeout for {domain}")
        return None
    except Exception as e:
        logger.error(f"SSL check: unexpected error for {domain} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 8. WHOIS / RDAP
# ---------------------------------------------------------------------------
async def check_whois(domain: str, session: aiohttp.ClientSession) -> dict | None:
    """Check RDAP (Registration Data Access Protocol) for domain info.

    Returns registration date, expiration date, domain age, registrar, and status.
    """
    try:
        async with session.get(f"{RDAP_URL}/{domain}") as resp:
            if resp.status != 200:
                logger.warning(f"RDAP: HTTP {resp.status} for {domain}")
                return None
            data = await resp.json()

        # Parse events (registration, expiration, last changed)
        events = {}
        for event in data.get("events", []):
            action = event.get("eventAction", "")
            date_str = event.get("eventDate", "")
            if action and date_str:
                events[action] = date_str

        # Calculate domain age
        registration_date = events.get("registration")
        expiration_date = events.get("expiration")
        domain_age_days = None

        if registration_date:
            try:
                reg_dt = datetime.fromisoformat(registration_date.replace("Z", "+00:00"))
                domain_age_days = (datetime.now(timezone.utc) - reg_dt).days
            except (ValueError, TypeError):
                pass

        # Extract registrar from entities
        registrar_name = None
        for entity in data.get("entities", []):
            roles = entity.get("roles", [])
            if "registrar" in roles:
                vcard = entity.get("vcardArray", [None, []])
                if isinstance(vcard, list) and len(vcard) > 1:
                    for entry in vcard[1]:
                        if isinstance(entry, list) and len(entry) >= 4 and entry[0] == "fn":
                            registrar_name = entry[3]
                            break
                if not registrar_name:
                    registrar_name = entity.get("handle")

        # Extract nameservers
        nameservers = []
        for ns in data.get("nameservers", []):
            ns_name = ns.get("ldhName", ns.get("unicodeName", ""))
            if ns_name:
                nameservers.append(ns_name)

        # Extract status
        status = data.get("status", [])

        return {
            "registration_date": registration_date,
            "expiration_date": expiration_date,
            "last_changed": events.get("last changed"),
            "domain_age_days": domain_age_days,
            "registrar": registrar_name,
            "status": status,
            "nameservers": nameservers,
            "domain_name": data.get("ldhName", domain),
        }

    except asyncio.TimeoutError:
        logger.warning(f"RDAP: timeout for {domain}")
        return None
    except aiohttp.ClientError as e:
        logger.warning(f"RDAP: HTTP error for {domain} — {e}")
        return None
    except Exception as e:
        logger.error(f"RDAP: unexpected error for {domain} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# 9. Technology Detection (lightweight fingerprinting)
# ---------------------------------------------------------------------------

# Signature database: pattern -> (technology_name, category)
# Checked against HTML source and HTTP headers
_TECH_SIGNATURES: list[tuple[str, str, str]] = [
    # CMS
    ("wp-content/", "WordPress", "CMS"),
    ("wp-includes/", "WordPress", "CMS"),
    ("/wp-json/", "WordPress", "CMS"),
    ("Drupal.settings", "Drupal", "CMS"),
    ("sites/default/files", "Drupal", "CMS"),
    ("content=\"Joomla", "Joomla", "CMS"),
    ("generator\" content=\"Joomla", "Joomla", "CMS"),
    ("Shopify.theme", "Shopify", "CMS"),
    ("cdn.shopify.com", "Shopify", "CMS"),
    ("squarespace.com", "Squarespace", "CMS"),
    ("static1.squarespace.com", "Squarespace", "CMS"),
    ("wix.com", "Wix", "CMS"),
    ("ghost.org", "Ghost", "CMS"),
    ("ghost.io", "Ghost", "CMS"),
    ("webflow.com", "Webflow", "CMS"),
    ("assets.website-files.com", "Webflow", "CMS"),
    ("framer.com", "Framer", "CMS"),

    # JavaScript frameworks
    ("__next", "Next.js", "JavaScript Framework"),
    ("_next/static", "Next.js", "JavaScript Framework"),
    ("__nuxt", "Nuxt.js", "JavaScript Framework"),
    ("/_nuxt/", "Nuxt.js", "JavaScript Framework"),
    ("ng-version", "Angular", "JavaScript Framework"),
    ("ng-app", "Angular", "JavaScript Framework"),
    ("data-reactroot", "React", "JavaScript Framework"),
    ("__REACT", "React", "JavaScript Framework"),
    ("react-app", "React", "JavaScript Framework"),
    ("data-v-", "Vue.js", "JavaScript Framework"),
    ("Vue.createApp", "Vue.js", "JavaScript Framework"),
    ("/app.svelte", "Svelte", "JavaScript Framework"),
    ("__sveltekit", "SvelteKit", "JavaScript Framework"),
    ("gatsby", "Gatsby", "JavaScript Framework"),
    ("astro-island", "Astro", "JavaScript Framework"),
    ("remix.run", "Remix", "JavaScript Framework"),
    ("data-remix", "Remix", "JavaScript Framework"),

    # CSS frameworks
    ("bootstrap", "Bootstrap", "CSS Framework"),
    ("tailwindcss", "Tailwind CSS", "CSS Framework"),
    ("tailwind", "Tailwind CSS", "CSS Framework"),
    ("bulma", "Bulma", "CSS Framework"),
    ("materialize", "Materialize", "CSS Framework"),
    ("foundation.zurb", "Foundation", "CSS Framework"),
    ("chakra-ui", "Chakra UI", "CSS Framework"),

    # Analytics
    ("google-analytics.com", "Google Analytics", "Analytics"),
    ("googletagmanager.com", "Google Tag Manager", "Analytics"),
    ("gtag(", "Google Analytics (gtag)", "Analytics"),
    ("analytics.js", "Google Analytics", "Analytics"),
    ("hotjar.com", "Hotjar", "Analytics"),
    ("plausible.io", "Plausible", "Analytics"),
    ("cdn.segment.com", "Segment", "Analytics"),
    ("mixpanel.com", "Mixpanel", "Analytics"),
    ("amplitude.com", "Amplitude", "Analytics"),
    ("posthog.com", "PostHog", "Analytics"),
    ("clarity.ms", "Microsoft Clarity", "Analytics"),
    ("mc.yandex.ru", "Yandex Metrica", "Analytics"),
    ("matomo", "Matomo", "Analytics"),

    # CDN
    ("cloudflare", "Cloudflare", "CDN"),
    ("cloudfront.net", "Amazon CloudFront", "CDN"),
    ("fastly", "Fastly", "CDN"),
    ("akamai", "Akamai", "CDN"),
    ("cdn.jsdelivr.net", "jsDelivr", "CDN"),
    ("unpkg.com", "unpkg", "CDN"),
    ("cdnjs.cloudflare.com", "cdnjs", "CDN"),

    # Payment
    ("stripe.com", "Stripe", "Payment"),
    ("paypal.com", "PayPal", "Payment"),
    ("braintree", "Braintree", "Payment"),
    ("square.com", "Square", "Payment"),

    # Chat / Support
    ("intercom.io", "Intercom", "Chat Widget"),
    ("crisp.chat", "Crisp", "Chat Widget"),
    ("tawk.to", "Tawk.to", "Chat Widget"),
    ("zendesk.com", "Zendesk", "Chat Widget"),
    ("drift.com", "Drift", "Chat Widget"),
    ("livechatinc.com", "LiveChat", "Chat Widget"),
    ("tidio.co", "Tidio", "Chat Widget"),

    # Hosting indicators
    ("vercel", "Vercel", "Hosting"),
    ("netlify", "Netlify", "Hosting"),
    ("herokuapp.com", "Heroku", "Hosting"),
    ("github.io", "GitHub Pages", "Hosting"),
    ("pages.dev", "Cloudflare Pages", "Hosting"),
    ("firebase", "Firebase", "Hosting"),
    ("render.com", "Render", "Hosting"),

    # Web servers (detected via headers)
    ("nginx", "Nginx", "Web Server"),
    ("apache", "Apache", "Web Server"),
    ("cloudflare", "Cloudflare", "Web Server"),

    # Other
    ("fonts.googleapis.com", "Google Fonts", "Font Service"),
    ("fonts.gstatic.com", "Google Fonts", "Font Service"),
    ("use.typekit.net", "Adobe Fonts", "Font Service"),
    ("sentry.io", "Sentry", "Error Tracking"),
    ("sentry-cdn", "Sentry", "Error Tracking"),
    ("recaptcha", "reCAPTCHA", "Security"),
    ("hcaptcha", "hCaptcha", "Security"),
    ("turnstile", "Cloudflare Turnstile", "Security"),
    ("jquery", "jQuery", "JavaScript Library"),
    ("gsap", "GSAP", "Animation Library"),
    ("lottie", "Lottie", "Animation Library"),
    ("three.js", "Three.js", "3D Library"),
    ("threejs", "Three.js", "3D Library"),
]

# Header-based signatures: (header_name_lower, pattern, tech_name, category)
_HEADER_SIGNATURES: list[tuple[str, str, str, str]] = [
    ("server", "nginx", "Nginx", "Web Server"),
    ("server", "apache", "Apache", "Web Server"),
    ("server", "cloudflare", "Cloudflare", "CDN/Web Server"),
    ("server", "vercel", "Vercel", "Hosting"),
    ("server", "netlify", "Netlify", "Hosting"),
    ("x-powered-by", "express", "Express.js", "Backend Framework"),
    ("x-powered-by", "next.js", "Next.js", "JavaScript Framework"),
    ("x-powered-by", "nuxt", "Nuxt.js", "JavaScript Framework"),
    ("x-powered-by", "php", "PHP", "Programming Language"),
    ("x-powered-by", "asp.net", "ASP.NET", "Backend Framework"),
    ("x-powered-by", "django", "Django", "Backend Framework"),
    ("x-powered-by", "flask", "Flask", "Backend Framework"),
    ("x-drupal-cache", "", "Drupal", "CMS"),
    ("x-generator", "drupal", "Drupal", "CMS"),
    ("x-generator", "wordpress", "WordPress", "CMS"),
    ("x-shopify-stage", "", "Shopify", "CMS"),
    ("x-wix-request-id", "", "Wix", "CMS"),
]


async def check_technologies(
    url: str,
    html: str | None = None,
    headers: dict | None = None,
    session: aiohttp.ClientSession | None = None,
) -> dict | None:
    """Detect technologies used by the website.

    Uses lightweight pattern matching against HTML source and HTTP headers.
    Accepts pre-fetched HTML and headers to avoid redundant requests.
    Falls back to fetching the page if not provided.
    """
    try:
        # Fetch page if HTML/headers not provided
        if html is None or headers is None:
            if session is None:
                logger.warning("Tech detection: no session and no pre-fetched data")
                return None
            try:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        logger.warning(f"Tech detection: HTTP {resp.status} for {url}")
                        return None
                    if html is None:
                        html = await resp.text()
                    if headers is None:
                        headers = {k.lower(): v for k, v in resp.headers.items()}
            except Exception as e:
                logger.warning(f"Tech detection: fetch failed for {url} — {e}")
                # Continue with whatever we have
                if html is None:
                    html = ""
                if headers is None:
                    headers = {}

        html_lower = html.lower() if html else ""
        headers_lower = {k.lower(): v.lower() for k, v in (headers or {}).items()}

        detected: dict[str, set[str]] = {}  # category -> set of tech names

        # Check HTML signatures
        for pattern, tech_name, category in _TECH_SIGNATURES:
            if pattern.lower() in html_lower:
                if category not in detected:
                    detected[category] = set()
                detected[category].add(tech_name)

        # Check header signatures
        for header_name, pattern, tech_name, category in _HEADER_SIGNATURES:
            header_val = headers_lower.get(header_name, "")
            if header_val and (pattern == "" or pattern in header_val):
                if category not in detected:
                    detected[category] = set()
                detected[category].add(tech_name)

        # Convert sets to sorted lists
        result = {
            category: sorted(techs) for category, techs in sorted(detected.items())
        }
        result["total_detected"] = sum(len(v) for v in detected.values())

        return result

    except asyncio.TimeoutError:
        logger.warning(f"Tech detection: timeout for {url}")
        return None
    except Exception as e:
        logger.error(f"Tech detection: unexpected error for {url} — {e}", exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Master Orchestrator
# ---------------------------------------------------------------------------
async def run_all_external_apis(url: str) -> dict:
    """Run all external API checks in parallel and return combined results.

    This is the main entry point. It creates a shared aiohttp session,
    fires all checks concurrently with individual timeouts, and returns
    a dict with results from each API (None for any that failed).

    Args:
        url: The full URL to analyze (e.g., "https://example.com").

    Returns:
        Dict with keys for each API check plus metadata about the run.
    """
    domain = _extract_domain(url)
    start_time = time.monotonic()

    logger.info(f"External APIs: starting all checks for {url} (domain={domain})")

    # Use certifi SSL context for macOS compatibility
    ssl_ctx = None
    try:
        import certifi
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass

    connector = aiohttp.TCPConnector(ssl=ssl_ctx) if ssl_ctx else None
    session = aiohttp.ClientSession(
        timeout=SESSION_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        connector=connector,
    )

    try:
        # Define all tasks
        tasks = [
            asyncio.wait_for(check_pagespeed(url, session), timeout=INDIVIDUAL_TIMEOUT * 3),  # PageSpeed needs more time (2 calls)
            asyncio.wait_for(check_observatory(domain, session), timeout=INDIVIDUAL_TIMEOUT * 3),  # Observatory polls
            asyncio.wait_for(check_safe_browsing(url, session), timeout=INDIVIDUAL_TIMEOUT),
            asyncio.wait_for(check_carbon(url, session), timeout=INDIVIDUAL_TIMEOUT),
            asyncio.wait_for(check_green_web(domain, session), timeout=INDIVIDUAL_TIMEOUT),
            check_dns(domain),  # Already has internal timeout
            check_ssl(domain),  # Already has internal timeout
            asyncio.wait_for(check_whois(domain, session), timeout=INDIVIDUAL_TIMEOUT),
            asyncio.wait_for(check_technologies(url, session=session), timeout=INDIVIDUAL_TIMEOUT),
        ]

        task_keys = [
            "pagespeed",
            "observatory",
            "safe_browsing",
            "carbon",
            "green_web",
            "dns",
            "ssl",
            "whois",
            "technologies",
        ]

        # Fire all in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        output: dict[str, Any] = {}
        apis_succeeded = 0
        apis_failed = 0

        for key, result in zip(task_keys, results):
            if isinstance(result, Exception):
                logger.warning(f"External APIs: {key} failed — {type(result).__name__}: {result}")
                output[key] = None
                apis_failed += 1
            elif result is None:
                output[key] = None
                apis_failed += 1
            else:
                output[key] = result
                apis_succeeded += 1

        elapsed_ms = round((time.monotonic() - start_time) * 1000)

        output["metadata"] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "url_analyzed": url,
            "domain": domain,
            "apis_succeeded": apis_succeeded,
            "apis_failed": apis_failed,
            "total_duration_ms": elapsed_ms,
        }

        logger.info(
            f"External APIs: completed for {url} — "
            f"{apis_succeeded} succeeded, {apis_failed} failed, "
            f"{elapsed_ms}ms total"
        )

        return output

    except Exception as e:
        logger.error(f"External APIs: orchestrator error — {e}", exc_info=True)
        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        return {
            "pagespeed": None,
            "observatory": None,
            "safe_browsing": None,
            "carbon": None,
            "green_web": None,
            "dns": None,
            "ssl": None,
            "whois": None,
            "technologies": None,
            "metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "url_analyzed": url,
                "domain": domain,
                "apis_succeeded": 0,
                "apis_failed": 9,
                "total_duration_ms": elapsed_ms,
                "error": str(e)[:200],
            },
        }

    finally:
        await session.close()


# ---------------------------------------------------------------------------
# Lite Mode Orchestrator — free/local checks only
# ---------------------------------------------------------------------------
async def run_lite_external_checks(url: str) -> dict:
    """Run only the free, local, or non-rate-limited external checks.

    This is the lite-mode counterpart of ``run_all_external_apis()``.
    It skips: PageSpeed, Observatory, Safe Browsing, Carbon, Green Web.
    It keeps: SSL, DNS, WHOIS/RDAP, technology detection.

    Also performs lightweight robots.txt and sitemap.xml existence checks
    (simple HTTP GETs with no API key required).

    Args:
        url: The full URL to analyze (e.g., "https://example.com").

    Returns:
        Dict with the same top-level key structure as ``run_all_external_apis()``
        but with ``None`` for skipped (paid) APIs.
    """
    domain = _extract_domain(url)
    start_time = time.monotonic()

    logger.info(f"Lite external checks: starting for {url} (domain={domain})")

    # Use certifi SSL context for macOS compatibility
    ssl_ctx = None
    try:
        import certifi
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass

    connector = aiohttp.TCPConnector(ssl=ssl_ctx) if ssl_ctx else None
    session = aiohttp.ClientSession(
        timeout=SESSION_TIMEOUT,
        headers={"User-Agent": USER_AGENT},
        connector=connector,
    )

    try:
        # Only free checks
        tasks = [
            check_dns(domain),                                                     # free
            check_ssl(domain),                                                     # free
            asyncio.wait_for(check_whois(domain, session), timeout=INDIVIDUAL_TIMEOUT),  # free
            asyncio.wait_for(check_technologies(url, session=session), timeout=INDIVIDUAL_TIMEOUT),  # free
            asyncio.wait_for(_check_robots_txt(url, session), timeout=INDIVIDUAL_TIMEOUT),  # free
            asyncio.wait_for(_check_sitemap(url, session), timeout=INDIVIDUAL_TIMEOUT),    # free
        ]

        task_keys = [
            "dns",
            "ssl",
            "whois",
            "technologies",
            "robots_txt",
            "sitemap",
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        output: dict[str, Any] = {
            # Paid APIs not run in lite mode
            "pagespeed": None,
            "observatory": None,
            "safe_browsing": None,
            "carbon": None,
            "green_web": None,
        }
        apis_succeeded = 0
        apis_failed = 0

        for key, result in zip(task_keys, results):
            if isinstance(result, Exception):
                logger.warning(f"Lite checks: {key} failed -- {type(result).__name__}: {result}")
                output[key] = None
                apis_failed += 1
            elif result is None:
                output[key] = None
                apis_failed += 1
            else:
                output[key] = result
                apis_succeeded += 1

        elapsed_ms = round((time.monotonic() - start_time) * 1000)

        output["metadata"] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "url_analyzed": url,
            "domain": domain,
            "analysis_mode": "lite",
            "apis_succeeded": apis_succeeded,
            "apis_failed": apis_failed,
            "apis_skipped": 5,  # pagespeed, observatory, safe_browsing, carbon, green_web
            "total_duration_ms": elapsed_ms,
        }

        logger.info(
            f"Lite external checks: completed for {url} -- "
            f"{apis_succeeded} succeeded, {apis_failed} failed, "
            f"5 skipped (paid), {elapsed_ms}ms total"
        )

        return output

    except Exception as e:
        logger.error(f"Lite external checks: orchestrator error -- {e}", exc_info=True)
        elapsed_ms = round((time.monotonic() - start_time) * 1000)
        return {
            "pagespeed": None,
            "observatory": None,
            "safe_browsing": None,
            "carbon": None,
            "green_web": None,
            "dns": None,
            "ssl": None,
            "whois": None,
            "technologies": None,
            "robots_txt": None,
            "sitemap": None,
            "metadata": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "url_analyzed": url,
                "domain": domain,
                "analysis_mode": "lite",
                "apis_succeeded": 0,
                "apis_failed": 6,
                "apis_skipped": 5,
                "total_duration_ms": elapsed_ms,
                "error": str(e)[:200],
            },
        }

    finally:
        await session.close()


# ---------------------------------------------------------------------------
# Lite-mode helper checks (robots.txt, sitemap.xml)
# ---------------------------------------------------------------------------

async def _check_robots_txt(url: str, session: aiohttp.ClientSession) -> dict | None:
    """Fetch and parse robots.txt for basic SEO signals.

    Returns info about whether robots.txt exists, allows common bots,
    and references a sitemap.
    """
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

        async with session.get(robots_url) as resp:
            if resp.status != 200:
                return {"exists": False, "status_code": resp.status}

            text = await resp.text()
            text_lower = text.lower()

            # Parse basic signals
            allows_all = "disallow:" not in text_lower or "disallow: \n" in text_lower or "disallow:\n" in text_lower
            has_sitemap_ref = "sitemap:" in text_lower

            # Check for AI bot permissions
            ai_bots = {
                "gptbot": "gptbot" in text_lower,
                "claudebot": "claudebot" in text_lower,
                "perplexitybot": "perplexitybot" in text_lower,
                "googlebot": "googlebot" in text_lower,
            }

            # Extract sitemap URLs
            sitemap_urls = []
            for line in text.split("\n"):
                stripped = line.strip()
                if stripped.lower().startswith("sitemap:"):
                    sitemap_urls.append(stripped.split(":", 1)[1].strip())

            return {
                "exists": True,
                "status_code": 200,
                "allows_all_bots": allows_all,
                "has_sitemap_reference": has_sitemap_ref,
                "sitemap_urls": sitemap_urls[:5],
                "ai_bot_mentions": ai_bots,
                "content_length": len(text),
            }

    except Exception as e:
        logger.warning(f"robots.txt check: failed for {url} -- {e}")
        return None


async def _check_sitemap(url: str, session: aiohttp.ClientSession) -> dict | None:
    """Check if sitemap.xml exists and is valid.

    Tries /sitemap.xml and /sitemap_index.xml.
    Returns basic info about sitemap presence and size.
    """
    try:
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"

        for path in ("/sitemap.xml", "/sitemap_index.xml"):
            sitemap_url = base + path
            try:
                async with session.get(sitemap_url) as resp:
                    if resp.status == 200:
                        content_type = resp.headers.get("Content-Type", "")
                        text = await resp.text()

                        # Basic validation: contains XML and urlset/sitemapindex
                        is_xml = "<?xml" in text[:200] or "urlset" in text[:500] or "sitemapindex" in text[:500]
                        url_count = text.count("<loc>")

                        return {
                            "exists": True,
                            "url": sitemap_url,
                            "content_type": content_type,
                            "is_valid_xml": is_xml,
                            "url_count": url_count,
                            "size_bytes": len(text.encode("utf-8")),
                        }
            except Exception:
                continue

        return {"exists": False}

    except Exception as e:
        logger.warning(f"Sitemap check: failed for {url} -- {e}")
        return None


# ---------------------------------------------------------------------------
# CLI for quick testing
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    load_dotenv = None
    try:
        from dotenv import load_dotenv as _ld
        load_dotenv = _ld
    except ImportError:
        pass

    if load_dotenv:
        load_dotenv()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    target = sys.argv[1] if len(sys.argv) > 1 else "https://example.com"

    async def _main():
        result = await run_all_external_apis(target)
        print(json.dumps(result, indent=2, default=str))

    asyncio.run(_main())
