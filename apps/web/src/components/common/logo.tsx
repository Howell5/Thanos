import { ROUTES } from "@/lib/routes";
import { Link } from "react-router-dom";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <Link to={ROUTES.HOME} className={`text-xl font-bold tracking-tight ${className}`}>
      Morph
    </Link>
  );
}
