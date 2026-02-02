import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useScroll } from "@/hooks/use-scroll";
import { useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { Link } from "react-router-dom";

interface PublicHeaderProps {
  transparent?: boolean;
}

export function PublicHeader({ transparent = false }: PublicHeaderProps) {
  const { data: session, isPending } = useSession();
  const scrolled = useScroll(10);

  const showSolid = !transparent || scrolled;

  return (
    <header
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        showSolid
          ? "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
          : "bg-transparent",
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Logo />

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link
            to={ROUTES.PRICING}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Desktop Auth Buttons */}
          <div className="hidden items-center gap-2 md:flex">
            {isPending ? (
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : session ? (
              <Button asChild size="sm">
                <Link to={ROUTES.DASHBOARD}>Dashboard</Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link to={ROUTES.LOGIN}>Sign In</Link>
              </Button>
            )}
          </div>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="sm" className="h-9 w-9 px-0">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <nav className="flex flex-col gap-4 pt-8">
                <Link
                  to={ROUTES.PRICING}
                  className="text-lg font-medium transition-colors hover:text-foreground"
                >
                  Pricing
                </Link>
                <div className="my-4 h-px bg-border" />
                {isPending ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : session ? (
                  <Button asChild>
                    <Link to={ROUTES.DASHBOARD}>Dashboard</Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to={ROUTES.LOGIN}>Sign In</Link>
                  </Button>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
