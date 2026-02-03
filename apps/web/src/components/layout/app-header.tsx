import { Logo } from "@/components/common/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, LogOut, Menu, Receipt, Settings, Zap } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppSidebar } from "./app-sidebar";

export function AppHeader() {
  const { data: session } = useSession();
  const navigate = useNavigate();

  const { data: userData } = useQuery({
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

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate(ROUTES.LOGIN);
  };

  const userInitials =
    session?.user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        {/* Mobile Menu */}
        <Sheet>
          <SheetTrigger asChild className="lg:hidden">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <AppSidebar />
          </SheetContent>
        </Sheet>

        {/* Mobile Logo */}
        <div className="lg:hidden">
          <Logo />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Credits Display */}
          <div className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-sm sm:flex">
            <Zap className="h-3.5 w-3.5 text-yellow-500" />
            <span className="font-medium">{userData?.credits?.toLocaleString() ?? "..."}</span>
          </div>

          <ThemeToggle />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session?.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session?.user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Credits - Mobile */}
              <div className="flex items-center gap-2 px-2 py-1.5 sm:hidden">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">
                  {userData?.credits?.toLocaleString() ?? "..."} credits
                </span>
              </div>
              <DropdownMenuSeparator className="sm:hidden" />

              <DropdownMenuItem asChild>
                <Link to={ROUTES.SETTINGS}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={ROUTES.ORDERS}>
                  <Receipt className="mr-2 h-4 w-4" />
                  Order History
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={ROUTES.BILLING}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Buy Credits
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
