import { relations } from "drizzle-orm";
import { boolean, integer, json, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Users table
 * Better Auth will manage this table's authentication-related columns
 */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", {
    mode: "date",
    withTimezone: true,
  }),
  image: text("image"),
  credits: integer("credits").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sessions table
 * Managed by Better Auth
 */
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/**
 * Accounts table
 * For OAuth providers, managed by Better Auth
 */
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    mode: "date",
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    mode: "date",
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * Verification tokens table
 * For email verification, managed by Better Auth
 */
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * Posts table
 * Example business logic table
 */
export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * Orders table
 * Tracks credit purchase transactions
 */
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  packageId: text("package_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  credits: integer("credits").notNull(),
  status: text("status").notNull().default("pending"),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * Projects table
 * Each user can create multiple canvas projects
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  // tldraw canvas state stored as JSON
  canvasData: json("canvas_data").notNull().default([]),
  // Optional preview thumbnail (R2 URL)
  thumbnail: text("thumbnail"),
  isPublic: boolean("is_public").notNull().default(false),
  // Soft delete support
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * AI Generated Images table
 * Tracks all AI-generated images within projects
 */
export const aiImages = pgTable("ai_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Generation parameters
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  model: text("model").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  // Storage info
  r2Key: text("r2_key").notNull().unique(),
  r2Url: text("r2_url").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull().default("image/png"),
  // Cost tracking
  creditsUsed: integer("credits_used").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  // Status
  status: text("status").notNull().default("completed"),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * AI Usage History table
 * Detailed tracking of all AI API calls (for analytics and debugging)
 */
export const aiUsageHistory = pgTable("ai_usage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  imageId: uuid("image_id").references(() => aiImages.id, { onDelete: "set null" }),
  // Operation details
  operation: text("operation").notNull(), // text-to-image, image-upscale, background-remove
  model: text("model").notNull(),
  provider: text("provider").notNull().default("vertex-ai"),
  // Cost calculation
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  creditsCharged: integer("credits_charged").notNull(),
  // Performance metrics
  durationMs: integer("duration_ms"),
  success: boolean("success").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

/**
 * Relations
 */
export const userRelations = relations(user, ({ many }) => ({
  posts: many(posts),
  sessions: many(session),
  accounts: many(account),
  orders: many(orders),
  projects: many(projects),
  aiImages: many(aiImages),
  aiUsageHistory: many(aiUsageHistory),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(user, {
    fields: [posts.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(user, {
    fields: [orders.userId],
    references: [user.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  images: many(aiImages),
}));

export const aiImagesRelations = relations(aiImages, ({ one }) => ({
  project: one(projects, {
    fields: [aiImages.projectId],
    references: [projects.id],
  }),
  user: one(user, {
    fields: [aiImages.userId],
    references: [user.id],
  }),
}));

export const aiUsageHistoryRelations = relations(aiUsageHistory, ({ one }) => ({
  user: one(user, {
    fields: [aiUsageHistory.userId],
    references: [user.id],
  }),
  project: one(projects, {
    fields: [aiUsageHistory.projectId],
    references: [projects.id],
  }),
  image: one(aiImages, {
    fields: [aiUsageHistory.imageId],
    references: [aiImages.id],
  }),
}));
