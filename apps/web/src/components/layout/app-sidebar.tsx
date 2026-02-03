import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { FolderKanban, Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const navItems = [
  {
    title: "Home",
    href: ROUTES.HOME,
    icon: Home,
  },
  {
    title: "Projects",
    href: ROUTES.PROJECTS,
    icon: FolderKanban,
  },
];

export function AppSidebar() {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-full flex-col border-r bg-background transition-all duration-200",
          isExpanded ? "w-48" : "w-14",
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-center border-b px-2">
          {isExpanded ? (
            <Logo />
          ) : (
            <Link to={ROUTES.HOME} className="flex items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                B
              </div>
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item) => {
            const isActive =
              item.href === ROUTES.HOME
                ? location.pathname === item.href
                : location.pathname.startsWith(item.href);

            if (isExpanded) {
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
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            }

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.href}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Toggle Button */}
        <div className="border-t p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsExpanded(!isExpanded)}
                className={cn("h-10 w-10", isExpanded && "w-full justify-start gap-3 px-3")}
              >
                {isExpanded ? (
                  <>
                    <PanelLeftClose className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">Collapse</span>
                  </>
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            {!isExpanded && <TooltipContent side="right">Expand</TooltipContent>}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
