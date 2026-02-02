import { zValidator } from "@hono/zod-validator";
import { ordersQuerySchema } from "@repo/shared";
import { count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth";
import { db } from "../db";
import { orders } from "../db/schema";
import { errors, ok } from "../lib/response";

const ordersRoute = new Hono()
  /**
   * GET /orders
   * Get current user's order history with pagination
   */
  .get("/", zValidator("query", ordersQuerySchema), async (c) => {
    // Authentication check
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    // Get total count for pagination
    const [{ total }] = await db
      .select({ total: count() })
      .from(orders)
      .where(eq(orders.userId, session.user.id));

    // Query user's orders with pagination
    const userOrders = await db.query.orders.findMany({
      where: eq(orders.userId, session.user.id),
      orderBy: (orders, { desc }) => [desc(orders.createdAt)],
      limit,
      offset,
    });

    return ok(c, {
      orders: userOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

export default ordersRoute;
