import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { Navigate, Outlet, useLocation } from "react-router-dom";

export function AppLayout() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  // Show loading while checking auth
  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!session) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - desktop only */}
      <div className="hidden lg:block">
        <AppSidebar />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
