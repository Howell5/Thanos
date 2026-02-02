import { CTASection } from "@/components/landing/cta-section";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { PricingSection } from "@/components/landing/pricing-section";

export function LandingPage() {
  return (
    <>
      <Hero />
      <Features />
      <PricingSection />
      <CTASection />
    </>
  );
}
