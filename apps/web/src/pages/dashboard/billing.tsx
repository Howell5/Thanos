import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { CREDIT_PACKAGES, formatPrice } from "@repo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, CreditCard, Zap } from "lucide-react";
import { useState } from "react";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function BillingPage() {
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ["user", "me"],
    queryFn: async () => {
      const response = await api.api.user.me.$get();
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to fetch user data");
      }
      return json.data;
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (packageId: string) => {
      const response = await api.api.checkout.$post({
        json: { packageId },
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to create checkout session");
      }
      return json.data;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
  });

  const handlePurchase = (packageId: string) => {
    setSelectedPackage(packageId);
    checkoutMutation.mutate(packageId);
  };

  return (
    <div className="space-y-8">
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="mt-2 text-muted-foreground">Manage your credits and purchases</p>
      </motion.div>

      {/* Current Balance */}
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {isLoadingUser ? (
                <span className="text-muted-foreground">...</span>
              ) : (
                (userData?.credits.toLocaleString() ?? 0)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">credits available</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Credit Packages */}
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="mb-4 text-xl font-semibold">Purchase Credits</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_PACKAGES.map((pkg) => (
            <Card
              key={pkg.id}
              className={`relative cursor-pointer transition-all hover:border-primary ${
                pkg.popular ? "border-primary ring-1 ring-primary" : ""
              }`}
              onClick={() => !checkoutMutation.isPending && handlePurchase(pkg.id)}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Best Value
                  </span>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle className="text-lg">{pkg.name}</CardTitle>
                <CardDescription>{pkg.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="mb-2 text-3xl font-bold">
                  {formatPrice(pkg.price, pkg.currency)}
                </div>
                <div className="mb-4 text-sm text-muted-foreground">
                  {pkg.credits.toLocaleString()} credits
                </div>

                <ul className="mb-6 space-y-2 text-left text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Instant delivery</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>No expiration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" />
                    <span>Secure payment</span>
                  </li>
                </ul>

                <Button
                  className="w-full"
                  variant={pkg.popular ? "default" : "outline"}
                  disabled={checkoutMutation.isPending}
                >
                  {checkoutMutation.isPending && selectedPackage === pkg.id ? (
                    <>
                      <CreditCard className="mr-2 h-4 w-4 animate-pulse" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-4 w-4" />
                      Purchase
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {checkoutMutation.isError && (
          <p className="mt-4 text-center text-sm text-destructive">
            Failed to create checkout session. Please try again.
          </p>
        )}
      </motion.div>
    </div>
  );
}
