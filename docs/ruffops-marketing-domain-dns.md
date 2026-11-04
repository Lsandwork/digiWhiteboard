# Fix ruffops.com 403 Forbidden (marketing domain DNS)

## Symptom

`https://ruffops.com` and `https://www.ruffops.com` return Apache **403 Forbidden**.

The Next.js marketing site is already deployed and works when traffic hits Vercel
(for example `https://staff.ruffops.com/ruffops-site`). Middleware already rewrites
`ruffops.com` / `www.ruffops.com` → `/ruffops-site/*`.

## Root cause

DNS for the apex still points at the old IONOS/1&1 webspace, not Vercel.

| Host | Current record | Resolves to | Result |
| --- | --- | --- | --- |
| `ruffops.com` | `A 74.208.236.54` + `AAAA 2607:f1c0:100f:f000::200` | IONOS Apache | 403 |
| `www.ruffops.com` | `CNAME → ruffops.com` | same IONOS host | 403 |
| `staff.ruffops.com` (working) | `CNAME → bf7e747ae6aa8fd1.vercel-dns-017.com` | Vercel | OK |

Nameservers are IONOS (`ns*.ui-dns.*`). Email (`MX mx00/mx01.ionos.com`, SPF TXT) must stay.

## Fix (IONOS DNS panel)

1. In **Vercel → Project → Settings → Domains**, add both:
   - `ruffops.com`
   - `www.ruffops.com`
   - Confirm the exact A / CNAME values Vercel shows for this project (use those if they differ from below).

2. In **IONOS → Domains → ruffops.com → DNS**:

   **Apex (`@` / `ruffops.com`)**
   - Delete the existing `A` record `74.208.236.54`
   - Delete the existing `AAAA` record `2607:f1c0:100f:f000::200` (IPv6 still hits IONOS)
   - Add `A @ → 76.76.21.21` (or the A value shown on the Vercel domain card)
   - Do **not** remove `MX` or SPF `TXT` records

   **www**
   - Change `www` from `CNAME → ruffops.com` to:
     - `CNAME www → bf7e747ae6aa8fd1.vercel-dns-017.com`
     - (same target as `staff` / `lobby` / `fitdog`)

3. Wait for DNS propagation (often a few minutes; TTL here is 3600s).

4. Verify:

```bash
dig +short A ruffops.com
dig +short AAAA ruffops.com
dig +short CNAME www.ruffops.com
curl -sI https://ruffops.com/ | head
curl -sI https://www.ruffops.com/ | head
npm run test:ruffops-site-domain
bash scripts/verify-ruffops-marketing-dns.sh
```

Expected:
- Apex `A` is a Vercel address (not `74.208.236.54`)
- Apex `AAAA` is empty or Vercel (not the IONOS `2607:f1c0:…` address)
- `www` CNAME is the Vercel DNS target
- HTTPS returns `200` with the RuffOps marketing title

## Do not

- Point apex with a CNAME (invalid at zone apex alongside NS/MX)
- Remove IONOS MX / SPF unless email is being moved
- Expect a code deploy alone to fix this — traffic never reaches the app today
