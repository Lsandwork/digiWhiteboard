# Traffic-aware route optimization

Fitdog Route Generator optimizes for **fastest drive time**, not straight-line distance.

## What we use

| Need | Provider | Why |
|------|----------|-----|
| Stop geocoding | **Google Geocoding API** | Real lat/lng for household addresses (cached) |
| Morning / midday route solve | **Google Routes API** `computeRouteMatrix` with `TRAFFIC_AWARE_OPTIMAL` | Rush-hour + live/historical traffic between stops |
| Owner “X min away” | **Google Routes API** `computeRoutes` + **Samsara GPS** | Live van position + live traffic to the stop |

**Waze:** there is no public Waze multi-stop routing API. Google Routes traffic is the industry option that covers LA rush hour and live incidents for this product.

## Accounts you need

1. **Google Cloud** project with billing enabled  
2. Enable APIs: **Geocoding API** and **Routes API**  
3. Create an API key → set `GOOGLE_MAPS_API_KEY` on Vercel (Production + Preview)  
4. Keep **Samsara** token for live van GPS (`SAMSARA_API_TOKEN`) — already used  

Optional: set `ROUTE_OPTIMIZATION_ENABLED=true` (auto-on when a Google key exists).

## Departure times (Pacific)

Traffic matrix assumes:

- Pickup routes leave around **7:00 AM**
- Drop-off routes around **11:00 AM** (covers outing 10:30 and club noon waves)

## Fallback

If the Google key is missing or the API errors, the optimizer falls back to a LA road-distance heuristic so generation still works — but it will **not** be true live traffic until the key is configured.
