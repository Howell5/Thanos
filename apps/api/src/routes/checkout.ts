import { zValidator } from "@hono/zod-validator";
import { createCheckoutSchema, getCreditPackage } from "@repo/shared";
import { Hono } from "hono";
import { auth } from "../auth";
import { errors, ok } from "../lib/response";
import { getStripe } from "../lib/stripe";

const checkoutRoute = new Hono()
  /**
   * POST /checkout
   * Create a Stripe Checkout session for purchasing credits
   */
  .post("/", zValidator("json", createCheckoutSchema), async (c) => {
    // Check Stripe configuration
    if (!process.env.STRIPE_SECRET_KEY) {
      return errors.serviceUnavailable(
        c,
        "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.",
      );
    }

    // Authentication check
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { packageId } = c.req.valid("json");

    // Validate package exists
    const creditPackage = getCreditPackage(packageId);
    if (!creditPackage) {
      return errors.badRequest(c, "Invalid package ID");
    }

    try {
      const stripe = getStripe();
      const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

      // Create Stripe Checkout Session
      const checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: creditPackage.currency,
              product_data: {
                name: creditPackage.name,
                description: `${creditPackage.credits} credits`,
              },
              unit_amount: creditPackage.price,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${FRONTEND_URL.replace(/\/$/, "")}/dashboard/orders?success=true`,
        cancel_url: `${FRONTEND_URL.replace(/\/$/, "")}/pricing?canceled=true`,
        client_reference_id: session.user.id,
        metadata: {
          userId: session.user.id,
          packageId: creditPackage.id,
          credits: creditPackage.credits.toString(),
        },
      });

      if (!checkoutSession.url) {
        return errors.internal(c, "Failed to create checkout session");
      }

      return ok(c, {
        checkoutUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
      });
    } catch (error) {
      console.error("Stripe checkout error:", error);
      return errors.internal(c, "Failed to create checkout session");
    }
  });

export default checkoutRoute;
