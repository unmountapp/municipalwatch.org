# Municipal Watch: measurement setup (do this before any ad spend)

This change makes every sale measurable, so the Growth Engine can judge ads by real subscriptions
instead of clicks. Until the IDs below are filled in, nothing new loads and the site behaves exactly as before.

## What's in this change
- `index.html`: search/social description tags, `data-checkout` on both Subscribe buttons, loads `tracking.js`.
- `tracking.js`: GA4 + Meta Pixel (only if IDs are set), remembers ad clicks/UTMs for 90 days,
  passes the visitor's GA4 id to Stripe, fires "begin checkout" on Subscribe clicks.
- `thanks.html`: post-payment page; fires the browser Purchase with Stripe's session id.
- `stripe-webhook/`: Cloudflare Worker. Stripe tells it about each sale; it verifies the signature and
  reports the sale to Meta (Conversions API) and GA4 (Measurement Protocol). Test: `node stripe-webhook/test.mjs`.
- `robots.txt`, `sitemap.xml`.

## Steps (about an hour)
1. **GA4:** create a property + web data stream for municipalwatch.org. Copy the Measurement ID (G-...).
   Admin > Data streams > Measurement Protocol API secrets > create one.
2. **Meta:** create a Business Manager owned by Municipal Watch, an ad account, a Facebook Page, and a
   Pixel (Events Manager). Generate a Conversions API access token for the Pixel (Events Manager > Settings).
3. Paste the GA4 ID and Pixel ID into `window.MW_TRACKING` in **both** `index.html` and `thanks.html`.
4. **Stripe Payment Links:** edit each link > After payment > "Don't show confirmation page" > redirect to
   - Starter: `https://municipalwatch.org/thanks.html?plan=starter&value=49&session_id={CHECKOUT_SESSION_ID}`
   - Pro:     `https://municipalwatch.org/thanks.html?plan=pro&value=99&session_id={CHECKOUT_SESSION_ID}`
5. **Webhook:** `cd stripe-webhook`, fill IDs in `wrangler.toml`, then
   `npx wrangler deploy`, and `npx wrangler secret put` for STRIPE_WEBHOOK_SECRET, META_ACCESS_TOKEN, GA4_API_SECRET.
   In Stripe > Developers > Webhooks, add the worker URL for `checkout.session.completed`, and copy its
   signing secret into STRIPE_WEBHOOK_SECRET.
6. **Test:** in Meta Events Manager > Test events, and GA4 > DebugView, run one real $49 purchase
   (refund it after). You should see exactly one Purchase in each.
7. **Google Ads (when ready):** link GA4 to Google Ads and import the GA4 `purchase` as the conversion.

## Not fixed here, needs a decision from you
- Coverage is now worldwide: each pilot tells us its city. Deliver the first brief within a week so the
  pilot converts.
