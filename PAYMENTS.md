# Razorpay payments

Juniper supports Razorpay Standard Checkout alongside pay-at-counter. The menu has 36 seeded items across eight categories. Online checkout stays disabled until backend credentials are configured.

## Enable test payments

1. Open your Razorpay Dashboard in **Test Mode** and generate API keys under the account/API key settings.
2. Fill these entries in `backend/.env`:

   ```dotenv
   RAZORPAY_KEY_ID=rzp_test_your_key_id
   RAZORPAY_KEY_SECRET=your_test_key_secret
   RAZORPAY_WEBHOOK_SECRET=your_separate_webhook_secret
   ```

   Use your actual values. Do not put secrets in frontend files or variables starting with `VITE_`, and do not commit `.env`. Only the public Key ID is sent to Checkout. No card numbers, CVV or UPI PIN are stored by this application.

3. In the Razorpay Dashboard, configure **automatic capture**. An authorized payment alone does not confirm an order in Juniper.
4. Restart the Node server (`npm start`). If a previous server is running, stop it first.
5. Register/sign in, add menu items, choose **Pay online**, and click **Continue to payment**. The app shows a test-mode notice when the Key ID starts with `rzp_test_`. Use Razorpay's documented test payment details in the Checkout window. Do not enter real card details for project testing.
6. Verify that the confirmed order shows **Paid online · Razorpay**, appears in the staff queue exactly once, and has the expected amount. Test failure and window dismissal too.

The Checkout window presents payment methods available for your Razorpay account and device, including supported UPI, cards, netbanking and wallets. A separate integration per method is not needed. The site does not force a UPI collect flow; method/device availability is controlled by Razorpay.

## Configure webhook recovery

Use a publicly reachable HTTPS backend URL:

```text
https://YOUR_DOMAIN/api/payments/razorpay/webhook
```

Set the webhook secret to match `RAZORPAY_WEBHOOK_SECRET` and subscribe to:

- `payment.captured`
- `order.paid`
- `refund.processed`

Localhost cannot receive Razorpay webhooks directly. Deploy to a staging HTTPS host for webhook testing, or use a tunnel accepted by Razorpay. The webhook is signature-verified using the exact raw request bytes before processing. Repeated events cannot create duplicate café orders.

If Checkout closes or the callback fails after payment, the customer can open **My orders → Check payment status**. That queries Razorpay on the server and confirms a captured payment. **Resume payment** reuses the existing Razorpay order, and an already-authorized payment is not offered for another payment. A configured webhook completes the same recovery without waiting for the customer to return.

## How it works

1. Backend validates item availability, sizes, milk choices, quantities and prices.
2. It stores a payment attempt and creates a Razorpay order for the server-calculated total in **paise**, using Basic authentication on the backend.
3. The browser opens Standard Checkout with the public Key ID and Razorpay order ID.
4. Backend verifies HMAC-SHA256 using its stored Razorpay order ID and the returned payment ID.
5. Backend fetches the payment and order from Razorpay, checking amount, INR currency, order ownership, captured payment and paid order status.
6. Only then is one café order inserted and made visible to staff. Pending, failed or merely authorized payments never reach the kitchen.

Test and live payments share the same application order flow. Use a separate staging database for payment testing so test orders are not mixed with commercial orders.

## Cancellation and refunds

Cancelling a paid café order marks it **Refund due**; it does not pretend to issue a refund. Staff must process the refund in the Razorpay Dashboard using the payment reference shown on the order. A signed `refund.processed` webhook updates the café record to **Refunded** or **Partially refunded** after verifying the latest payment with Razorpay. If webhooks are not configured, refund updates will not synchronize automatically.

No automatic refund API is called by this app. Counter orders retain their original pay-at-café behavior.

## Go live

Complete the activation and website requirements shown in your Razorpay Dashboard, deploy the backend and frontend behind HTTPS, configure a persistent database and the live webhook, enable automatic capture, and replace test credentials with live credentials. Confirm business contact, cancellation/refund policies, real menu/prices and café locations before accepting live payments.

## Verification completed in this workspace

- Production frontend build.
- Browser checks at 390px and 1440px: expanded categories, new item customization, cart totals, and missing-key payment fallback; no horizontal overflow or browser console errors observed.
- Backend integration tests with an injected simulated Razorpay provider: paise conversion and server pricing, authenticated ownership, invalid signatures, mismatched amounts/currency/order IDs, authorized/failed payments, concurrent duplicate requests, callback/webhook races, recovery, refunds, and backward-compatible database migration.
- The real Razorpay hosted payment window and live/test gateway transaction cannot be fully verified without merchant credentials. No real payment has been made by these tests.

## Official references

- [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps)
- [Create an order](https://razorpay.com/docs/api/orders/create/)
- [Fetch a payment](https://razorpay.com/docs/api/payments/fetch-with-id/)
- [Webhook signature verification and testing](https://razorpay.com/docs/webhooks/validate-test/)
