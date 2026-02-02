import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { motion } from "framer-motion";
import { Home } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-8xl font-bold tracking-tighter">404</h1>
        <p className="mt-4 text-xl text-muted-foreground">
          Oops! The page you're looking for doesn't exist.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">It might have been moved or deleted.</p>
        <Button asChild className="mt-8">
          <Link to={ROUTES.HOME}>
            <Home className="mr-2 h-4 w-4" />
            Back to Home
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
