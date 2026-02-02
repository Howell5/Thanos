import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function Hero() {
  return (
    <section className="relative overflow-hidden py-24 md:py-32 lg:py-40">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <motion.h1
            className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.5 }}
          >
            Build your SaaS
            <br />
            <span className="text-muted-foreground">in record time</span>
          </motion.h1>

          <motion.p
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            A modern full-stack template with authentication, payments, and everything you need to
            launch your next project.
          </motion.p>

          <motion.div
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
            variants={fadeInUp}
            initial="initial"
            animate="animate"
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Button asChild size="lg" className="min-w-[160px]">
              <Link to={ROUTES.LOGIN}>Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-[160px]">
              <Link to={ROUTES.PRICING}>View Pricing</Link>
            </Button>
          </motion.div>
        </div>

        {/* Product Screenshot */}
        <motion.div
          className="mx-auto mt-16 max-w-5xl md:mt-20"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <div className="relative">
            {/* Browser frame */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-2xl">
              {/* Browser bar */}
              <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                </div>
                <div className="ml-4 flex-1">
                  <div className="mx-auto max-w-md rounded-md bg-background px-3 py-1.5 text-center text-xs text-muted-foreground">
                    yourapp.com/dashboard
                  </div>
                </div>
              </div>
              {/* Screenshot placeholder */}
              <div className="aspect-[16/10] bg-gradient-to-br from-muted/30 to-muted/80">
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <div className="text-6xl opacity-20">📊</div>
                    <p className="mt-4 text-sm text-muted-foreground">
                      Product screenshot placeholder
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative gradient blur */}
            <div className="absolute -inset-x-20 -bottom-20 h-40 bg-gradient-to-t from-background to-transparent" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
