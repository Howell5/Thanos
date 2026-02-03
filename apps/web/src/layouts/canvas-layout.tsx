import { useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/routes";
import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * Canvas layout - full screen without sidebar
 * Used for the canvas editor page
 */
export function CanvasLayout() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  // Show loading while checking auth
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!session) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}
