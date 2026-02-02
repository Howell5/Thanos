import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { CREDIT_PACKAGES, formatPrice } from "@repo/shared";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export function PricingSection() {
  return (
    <section className="border-t py-24 md:py-32">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <motion.h2
            className="text-3xl font-bold tracking-tight sm:text-4xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Simple, transparent pricing
          </motion.h2>
          <motion.p
            className="mt-4 text-lg text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Pay for what you use. No hidden fees, no subscriptions.
          </motion.p>
        </div>

        <motion.div
          className="mx-auto mt-16 grid max-w-5xl gap-8 lg:grid-cols-3"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {CREDIT_PACKAGES.map((pkg) => (
            <motion.div
              key={pkg.id}
              className={`relative rounded-2xl border bg-card p-8 ${
                pkg.popular ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
              variants={itemVariants}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center">
                <h3 className="text-lg font-semibold">{pkg.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{pkg.description}</p>

                <div className="mt-6">
                  <span className="text-4xl font-bold">{formatPrice(pkg.price, pkg.currency)}</span>
                </div>

                <div className="mt-2 text-sm text-muted-foreground">
                  {pkg.credits.toLocaleString()} credits
                </div>

                <Button
                  asChild
                  className="mt-8 w-full"
                  variant={pkg.popular ? "default" : "outline"}
                >
                  <Link to={ROUTES.LOGIN}>Get Started</Link>
                </Button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
