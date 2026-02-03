import { zValidator } from "@hono/zod-validator";
import {
  createProjectSchema,
  paginationSchema,
  projectIdSchema,
  updateProjectSchema,
} from "@repo/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { auth } from "../auth";
import { db } from "../db";
import { projects } from "../db/schema";
import { errors, ok } from "../lib/response";

const projectsRoute = new Hono()
  /**
   * GET /projects
   * List user's projects with pagination
   */
  .get("/", zValidator("query", paginationSchema), async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const userProjects = await db.query.projects.findMany({
      where: and(eq(projects.userId, session.user.id), isNull(projects.deletedAt)),
      limit,
      offset,
      orderBy: [desc(projects.updatedAt)],
      with: {
        images: {
          limit: 1,
          orderBy: (images, { desc }) => [desc(images.createdAt)],
        },
      },
    });

    return ok(c, {
      projects: userProjects,
      pagination: { page, limit },
    });
  })

  /**
   * GET /projects/:id
   * Get project details with full canvas data and recent images
   */
  .get("/:id", zValidator("param", projectIdSchema), async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { id } = c.req.valid("param");

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
      with: {
        images: {
          orderBy: (images, { desc }) => [desc(images.createdAt)],
          limit: 50,
        },
      },
    });

    if (!project) {
      return errors.notFound(c, "Project not found");
    }

    // Check access: owner or public project
    if (project.userId !== session.user.id && !project.isPublic) {
      return errors.forbidden(c);
    }

    return ok(c, project);
  })

  /**
   * POST /projects
   * Create a new project
   */
  .post("/", zValidator("json", createProjectSchema), async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const data = c.req.valid("json");

    const [newProject] = await db
      .insert(projects)
      .values({
        ...data,
        userId: session.user.id,
        canvasData: [],
      })
      .returning();

    return ok(c, newProject, 201);
  })

  /**
   * PATCH /projects/:id
   * Update a project (name, description, canvas data, etc.)
   */
  .patch(
    "/:id",
    zValidator("param", projectIdSchema),
    zValidator("json", updateProjectSchema),
    async (c) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) {
        return errors.unauthorized(c);
      }

      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, id), isNull(projects.deletedAt)),
      });

      if (!project) {
        return errors.notFound(c, "Project not found");
      }

      if (project.userId !== session.user.id) {
        return errors.forbidden(c);
      }

      const [updatedProject] = await db
        .update(projects)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();

      return ok(c, updatedProject);
    },
  )

  /**
   * DELETE /projects/:id
   * Soft delete a project
   */
  .delete("/:id", zValidator("param", projectIdSchema), async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return errors.unauthorized(c);
    }

    const { id } = c.req.valid("param");

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), isNull(projects.deletedAt)),
    });

    if (!project) {
      return errors.notFound(c, "Project not found");
    }

    if (project.userId !== session.user.id) {
      return errors.forbidden(c);
    }

    // Soft delete
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));

    return ok(c, { message: "Project deleted successfully" });
  });

export default projectsRoute;
