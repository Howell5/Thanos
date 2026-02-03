import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { ErrorBoundary } from "./components/error-boundary";
import { queryClient } from "./lib/query-client";
import { ROUTES } from "./lib/routes";

// Layouts
import { AppLayout } from "./layouts/app-layout";
import { CanvasLayout } from "./layouts/canvas-layout";
import { PublicLayout } from "./layouts/public-layout";

// App Pages (protected)
import { BillingPage } from "./pages/dashboard/billing";
import { OrdersPage } from "./pages/dashboard/orders";
import { ProjectsPage } from "./pages/dashboard/projects";
import { SettingsPage } from "./pages/dashboard/settings";
import { HomePage } from "./pages/home/index";

// Canvas Pages
import { CanvasPage } from "./pages/canvas/index";

// Public Pages
import { LandingPage } from "./pages/landing";
import { LoginPage } from "./pages/login";
import { NotFoundPage } from "./pages/not-found";
import { PricingPage } from "./pages/pricing";
import { RegisterPage } from "./pages/register";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Routes>
          {/* Public routes (marketing / auth) */}
          <Route element={<PublicLayout />}>
            <Route path={ROUTES.LANDING} element={<LandingPage />} />
            <Route path={ROUTES.PRICING} element={<PricingPage />} />
            <Route path={ROUTES.LOGIN} element={<LoginPage />} />
            <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
          </Route>

          {/* Protected routes - App */}
          <Route element={<AppLayout />}>
            <Route path={ROUTES.HOME} element={<HomePage />} />
            <Route path={ROUTES.PROJECTS} element={<ProjectsPage />} />
            <Route path={ROUTES.SETTINGS} element={<SettingsPage />} />
            <Route path={ROUTES.BILLING} element={<BillingPage />} />
            <Route path={ROUTES.ORDERS} element={<OrdersPage />} />
          </Route>

          {/* Protected routes - Canvas (full screen) */}
          <Route element={<CanvasLayout />}>
            <Route path={ROUTES.CANVAS} element={<CanvasPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <ReactQueryDevtools initialIsOpen={false} />
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
