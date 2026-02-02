/**
 * Credit package pricing configuration
 * Hardcoded for simplicity - change here and redeploy to update pricing
 */

export const CREDIT_PACKAGES = [
  {
    id: "starter",
    name: "Starter Pack",
    description: "Perfect for trying out the platform",
    credits: 100,
    price: 999, // $9.99 in cents
    currency: "usd",
    popular: false,
  },
  {
    id: "professional",
    name: "Professional Pack",
    description: "Best value for regular users",
    credits: 500,
    price: 3999, // $39.99 in cents
    currency: "usd",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise Pack",
    description: "For power users and teams",
    credits: 1500,
    price: 9999, // $99.99 in cents
    currency: "usd",
    popular: false,
  },
] as const;

export type CreditPackage = (typeof CREDIT_PACKAGES)[number];

/**
 * Helper to find package by ID
 */
export function getCreditPackage(packageId: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find((pkg) => pkg.id === packageId);
}

/**
 * Helper to format price for display
 */
export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}
