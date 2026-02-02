import { zValidator } from "@hono/zod-validator";
import { createPostSchema, paginationSchema, postIdSchema, updatePostSchema } from "@repo/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth";
import { db } from "../db";
import { posts } from "../db/schema";
import { errors, ok } from "../lib/response";

const postsRoute = new Hono()
  /**
   * GET /posts
   * List all posts (public, with pagination)
   */
  .get("/", zValidator("query", paginationSchema), async (c) => {
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const allPosts = await db.query.posts.findMany({
      limit,
      offset,
      orderBy: (posts, { desc }) => [desc(posts.createdAt)],
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return ok(c, {
      posts: allPosts,
      pagination: { page, limit },
    });
  })

  /**
   * GET /posts/:id
   * Get a single post by ID (public)
   */
  .get("/:id", zValidator("param", postIdSchema), async (c) => {
    const { id } = c.req.valid("param");

    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!post) {
      return errors.notFound(c, "Post not found");
    }

    return ok(c, post);
  })

  /**
   * POST /posts
   * Create a new post (requires authentication)
   */
  .post("/", zValidator("json", createPostSchema), async (c) => {
    // Check authentication
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { title, content } = c.req.valid("json");

    const [newPost] = await db
      .insert(posts)
      .values({
        title,
        content,
        userId: session.user.id,
      })
      .returning();

    return ok(c, newPost, 201);
  })

  /**
   * PATCH /posts/:id
   * Update a post (requires authentication and ownership)
   */
  .patch(
    "/:id",
    zValidator("param", postIdSchema),
    zValidator("json", updatePostSchema),
    async (c) => {
      // Check authentication
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) {
        return errors.unauthorized(c);
      }

      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");

      // Check if post exists and user owns it
      const post = await db.query.posts.findFirst({
        where: eq(posts.id, id),
      });

      if (!post) {
        return errors.notFound(c, "Post not found");
      }

      if (post.userId !== session.user.id) {
        return errors.forbidden(c);
      }

      const [updatedPost] = await db
        .update(posts)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, id))
        .returning();

      return ok(c, updatedPost);
    },
  )

  /**
   * DELETE /posts/:id
   * Delete a post (requires authentication and ownership)
   */
  .delete("/:id", zValidator("param", postIdSchema), async (c) => {
    // Check authentication
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { id } = c.req.valid("param");

    // Check if post exists and user owns it
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
    });

    if (!post) {
      return errors.notFound(c, "Post not found");
    }

    if (post.userId !== session.user.id) {
      return errors.forbidden(c);
    }

    await db.delete(posts).where(eq(posts.id, id));

    return ok(c, { message: "Post deleted successfully" });
  });

export default postsRoute;
