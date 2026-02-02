/**
 * Route path constants
 * Single source of truth for all application routes
 */
export const ROUTES = {
  // Public routes
  HOME: "/",
  PRICING: "/pricing",
  LOGIN: "/login",
  REGISTER: "/register",

  // Protected routes
  DASHBOARD: "/dashboard",
  SETTINGS: "/settings",
  BILLING: "/settings/billing",
  ORDERS: "/orders",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
