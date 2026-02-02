import { z } from "zod";

/**
 * Order status enum
 */
export const orderStatusEnum = z.enum(["pending", "completed", "failed"]);
export type OrderStatus = z.infer<typeof orderStatusEnum>;

/**
 * Schema for creating a checkout session
 */
export const createCheckoutSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
});

export type CreateCheckout = z.infer<typeof createCheckoutSchema>;

/**
 * Order entity schema
 */
export const orderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  packageId: z.string(),
  amount: z.number().int().positive(), // Amount in cents
  currency: z.string(),
  credits: z.number().int().positive(),
  status: orderStatusEnum,
  stripeSessionId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Order = z.infer<typeof orderSchema>;

/**
 * Checkout response schema
 */
export const checkoutResponseSchema = z.object({
  checkoutUrl: z.string().url(),
  sessionId: z.string(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/**
 * Query parameters for orders list
 */
export const ordersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type OrdersQuery = z.infer<typeof ordersQuerySchema>;

/**
 * Pagination metadata for orders response
 */
export const ordersPaginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type OrdersPagination = z.infer<typeof ordersPaginationSchema>;

/**
 * Orders list response schema
 */
export const ordersResponseSchema = z.object({
  orders: z.array(orderSchema),
  pagination: ordersPaginationSchema,
});

export type OrdersResponse = z.infer<typeof ordersResponseSchema>;
