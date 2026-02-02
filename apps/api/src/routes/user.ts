import { zValidator } from "@hono/zod-validator";
import { updateUserSchema } from "@repo/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";
import { errors, ok } from "../lib/response";

const userRoute = new Hono()
  /**
   * GET /user/me
   * Get current user's profile including credits
   */
  .get("/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const userData = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        id: true,
        name: true,
        email: true,
        credits: true,
      },
    });

    if (!userData) {
      return errors.notFound(c, "User not found");
    }

    return ok(c, userData);
  })

  /**
   * PATCH /user/me
   * Update current user's profile
   */
  .patch("/me", zValidator("json", updateUserSchema), async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { name } = c.req.valid("json");

    const [updatedUser] = await db
      .update(user)
      .set({ name, updatedAt: new Date() })
      .where(eq(user.id, session.user.id))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        credits: user.credits,
      });

    if (!updatedUser) {
      return errors.notFound(c, "User not found");
    }

    return ok(c, updatedUser);
  });

export default userRoute;
