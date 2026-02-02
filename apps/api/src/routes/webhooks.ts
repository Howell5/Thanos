import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type Stripe from "stripe";
import { db } from "../db";
import { orders, user } from "../db/schema";
import { errors, ok } from "../lib/response";
import { getStripe } from "../lib/stripe";

const webhooksRoute = new Hono()
  /**
   * POST /webhooks/stripe
   * Handle Stripe webhook events
   * IMPORTANT: This endpoint must receive raw body for signature verification
   */
  .post("/stripe", async (c) => {
    // Check Stripe configuration
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.error("⚠️  Stripe webhook received but Stripe is not configured");
      return errors.serviceUnavailable(
        c,
        "Stripe is not configured. Please set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables.",
      );
    }

    const stripe = getStripe();
    const signature = c.req.header("stripe-signature");

    if (!signature) {
      return errors.badRequest(c, "Missing stripe-signature header");
    }

    let event: Stripe.Event;

    try {
      // Get raw body for signature verification
      const rawBody = await c.req.text();

      // Verify webhook signature
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      return errors.badRequest(c, "Invalid signature");
    }

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Extract metadata
      const userId = session.metadata?.userId;
      const packageId = session.metadata?.packageId;
      const creditsStr = session.metadata?.credits;

      if (!userId || !packageId || !creditsStr) {
        console.error("Missing required metadata in webhook:", session.metadata);
        return errors.badRequest(c, "Missing metadata");
      }

      const credits = Number.parseInt(creditsStr, 10);
      if (Number.isNaN(credits)) {
        return errors.badRequest(c, "Invalid credits value");
      }

      try {
        // Use transaction for atomicity
        await db.transaction(async (tx) => {
          // Idempotency check: verify this session hasn't been processed
          const existingOrder = await tx.query.orders.findFirst({
            where: eq(orders.stripeSessionId, session.id),
          });

          if (existingOrder) {
            console.log(`Order already processed for session ${session.id}`);
            return; // Exit transaction early (idempotent)
          }

          // Create order record
          await tx.insert(orders).values({
            userId,
            packageId,
            amount: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            credits,
            status: "completed",
            stripeSessionId: session.id,
          });

          // Increment user credits
          await tx
            .update(user)
            .set({
              credits: sql`${user.credits} + ${credits}`,
              updatedAt: new Date(),
            })
            .where(eq(user.id, userId));

          console.log(`✅ Order completed: ${credits} credits added to user ${userId}`);
        });

        return ok(c, { received: true });
      } catch (error) {
        console.error("Transaction failed:", error);
        return errors.internal(c, "Failed to process order");
      }
    }

    // For other event types, just acknowledge receipt
    return ok(c, { received: true });
  });

export default webhooksRoute;
