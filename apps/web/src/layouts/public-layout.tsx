import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { ROUTES } from "@/lib/routes";
import { Outlet, useLocation } from "react-router-dom";

export function PublicLayout() {
  const location = useLocation();

  // Landing page has transparent header
  const isLandingPage = location.pathname === ROUTES.HOME;

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader transparent={isLandingPage} />
      <main className={isLandingPage ? "" : "pt-16"}>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
