import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CreditCard, History, Settings, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function DashboardPage() {
  const { data: session } = useSession();

  const { data: userData, isLoading } = useQuery({
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

  const quickActions = [
    {
      title: "Buy Credits",
      description: "Purchase more credits to continue using our services",
      icon: CreditCard,
      href: ROUTES.BILLING,
    },
    {
      title: "Order History",
      description: "View your past purchases and transactions",
      icon: History,
      href: ROUTES.ORDERS,
    },
    {
      title: "Settings",
      description: "Manage your account settings and preferences",
      icon: Settings,
      href: ROUTES.SETTINGS,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold">Welcome back, {session?.user.name}</h1>
        <p className="mt-2 text-muted-foreground">Here's an overview of your account</p>
      </motion.div>

      {/* Credits Card */}
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {isLoading ? (
                <span className="text-muted-foreground">...</span>
              ) : (
                (userData?.credits.toLocaleString() ?? 0)
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Credits are used to access premium features
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link to={ROUTES.BILLING}>Get More Credits</Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        variants={fadeInUp}
        initial="initial"
        animate="animate"
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="mb-4 text-xl font-semibold">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link key={action.href} to={action.href}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <action.icon className="h-8 w-8 text-muted-foreground" />
                  <CardTitle className="text-lg">{action.title}</CardTitle>
                  <CardDescription>{action.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
