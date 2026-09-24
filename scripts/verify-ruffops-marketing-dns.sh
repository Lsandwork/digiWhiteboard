#!/usr/bin/env bash
# Verify ruffops.com / www.ruffops.com DNS points at Vercel (not IONOS Apache).
set -euo pipefail

APEX="ruffops.com"
WWW="www.ruffops.com"
IONOS_A="74.208.236.54"
IONOS_AAAA="2607:f1c0:100f:f000::200"
VERCEL_CNAME_HINT="vercel-dns"

fail=0

apex_a="$(dig +short A "$APEX" | head -1 | tr -d '\r')"
apex_aaaa="$(dig +short AAAA "$APEX" | head -1 | tr -d '\r')"
www_cname="$(dig +short CNAME "$WWW" | head -1 | tr -d '\r' | sed 's/\.$//')"
staff_cname="$(dig +short CNAME staff.ruffops.com | head -1 | tr -d '\r' | sed 's/\.$//')"

echo "ruffops.com A     = ${apex_a:-<none>}"
echo "ruffops.com AAAA  = ${apex_aaaa:-<none>}"
echo "www CNAME         = ${www_cname:-<none>}"
echo "staff CNAME       = ${staff_cname:-<none>}"

if [[ "$apex_a" == "$IONOS_A" ]]; then
  echo "FAIL: apex A still points at IONOS Apache ($IONOS_A)"
  fail=1
elif [[ -z "$apex_a" ]]; then
  echo "FAIL: apex A missing"
  fail=1
else
  echo "OK: apex A is not the old IONOS address"
fi

if [[ "$apex_aaaa" == "$IONOS_AAAA" ]]; then
  echo "FAIL: apex AAAA still points at IONOS ($IONOS_AAAA) — remove or update it"
  fail=1
else
  echo "OK: apex AAAA is not the old IONOS address"
fi

if [[ -n "$www_cname" && "$www_cname" == *"$VERCEL_CNAME_HINT"* ]]; then
  echo "OK: www CNAME targets Vercel"
elif [[ -n "$staff_cname" && "$www_cname" == "$staff_cname" ]]; then
  echo "OK: www CNAME matches staff Vercel target"
else
  echo "FAIL: www should CNAME to the same Vercel target as staff ($staff_cname)"
  fail=1
fi

code_apex="$(curl -s -o /dev/null -w "%{http_code}" -A "Mozilla/5.0" --max-time 20 "https://$APEX/" || true)"
code_www="$(curl -s -o /dev/null -w "%{http_code}" -A "Mozilla/5.0" --max-time 20 "https://$WWW/" || true)"
echo "HTTPS ruffops.com  → $code_apex"
echo "HTTPS www.ruffops.com → $code_www"

if [[ "$code_apex" != "200" && "$code_apex" != "308" && "$code_apex" != "307" && "$code_apex" != "301" && "$code_apex" != "302" ]]; then
  echo "FAIL: apex HTTPS expected 200/3xx, got $code_apex"
  fail=1
fi
if [[ "$code_www" != "200" && "$code_www" != "308" && "$code_www" != "307" && "$code_www" != "301" && "$code_www" != "302" ]]; then
  echo "FAIL: www HTTPS expected 200/3xx, got $code_www"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "See docs/ruffops-marketing-domain-dns.md for the IONOS → Vercel cutover."
  exit 1
fi

echo "DNS + HTTPS look good for the marketing domain."
