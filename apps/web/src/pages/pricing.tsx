import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { CREDIT_PACKAGES, formatPrice } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";

export function PricingPage() {
  const { data: session } = useSession();

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
      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    },
    onError: (error) => {
      console.error("Checkout error:", error);
      alert(`Failed to create checkout: ${error.message}`);
    },
  });

  const handlePurchase = (packageId: string) => {
    if (!session) {
      alert("Please sign in to purchase credits");
      return;
    }
    checkoutMutation.mutate(packageId);
  };

  return (
    <div className="container mx-auto py-12">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold">Choose Your Credit Package</h1>
        <p className="text-lg text-muted-foreground">Select the perfect plan for your needs</p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {CREDIT_PACKAGES.map((pkg) => (
          <Card key={pkg.id} className={pkg.popular ? "border-primary shadow-lg" : ""}>
            <CardHeader>
              {pkg.popular && (
                <div className="mb-2 inline-block rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Most Popular
                </div>
              )}
              <CardTitle className="text-2xl">{pkg.name}</CardTitle>
              <CardDescription>{pkg.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <span className="text-4xl font-bold">{formatPrice(pkg.price, pkg.currency)}</span>
              </div>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>{pkg.credits} credits</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Never expires</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span>Secure payment</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={() => handlePurchase(pkg.id)}
                disabled={checkoutMutation.isPending}
                variant={pkg.popular ? "default" : "outline"}
              >
                {checkoutMutation.isPending ? "Processing..." : "Purchase"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
