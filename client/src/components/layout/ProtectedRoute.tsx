import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Spinner } from '../common/Spinner';
import type { UserRole } from '@obliplan/shared';

export function ProtectedRoute({ requiredRole }: { requiredRole?: UserRole | UserRole[] }) {
  const { user, isInitialized } = useAuthStore();

  if (!isInitialized) return <Spinner className="h-screen" />;
  if (!user) return <Navigate to="/login" replace />;

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(user.role)) return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
