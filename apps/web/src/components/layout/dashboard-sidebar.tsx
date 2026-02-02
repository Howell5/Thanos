import { Logo } from "@/components/common/logo";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { CreditCard, LayoutDashboard, Receipt, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  {
    title: "Dashboard",
    href: ROUTES.DASHBOARD,
    icon: LayoutDashboard,
  },
  {
    title: "Orders",
    href: ROUTES.ORDERS,
    icon: Receipt,
  },
  {
    title: "Settings",
    href: ROUTES.SETTINGS,
    icon: Settings,
  },
  {
    title: "Billing",
    href: ROUTES.BILLING,
    icon: CreditCard,
  },
];

export function DashboardSidebar() {
  const location = useLocation();

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r bg-background lg:block">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-6">
          <Logo />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
