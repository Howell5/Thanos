/**
 * Route path constants
 * Single source of truth for all application routes
 */
export const ROUTES = {
  // Public routes (marketing / auth)
  LANDING: "/welcome",
  PRICING: "/pricing",
  LOGIN: "/login",
  REGISTER: "/register",

  // Protected routes - App
  HOME: "/",
  PROJECTS: "/projects",
  CANVAS: "/canvas/:id",
  SETTINGS: "/settings",
  BILLING: "/settings/billing",
  ORDERS: "/orders",
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Helper to generate canvas route with project ID
 */
export function getCanvasRoute(projectId: string): string {
  return `/canvas/${projectId}`;
}
