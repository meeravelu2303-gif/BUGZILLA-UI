import { Navigate, Route, Routes } from 'react-router-dom';
import { PermissionGate } from './components/layout/PermissionGate';
import { RequireAuth } from './components/layout/RequireAuth';
import { BugDetail } from './pages/BugDetail';
import { BugList } from './pages/BugList';
import { CreateBug } from './pages/CreateBug';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { CreateUser } from './pages/admin/CreateUser';
import { Products } from './pages/admin/Products';
import { UserDetail } from './pages/admin/UserDetail';
import { Users } from './pages/admin/Users';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/bugs"
        element={
          <RequireAuth>
            <BugList />
          </RequireAuth>
        }
      />
      <Route
        path="/bugs/new"
        element={
          <RequireAuth>
            <CreateBug />
          </RequireAuth>
        }
      />
      <Route
        path="/bugs/:id"
        element={
          <RequireAuth>
            <BugDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAuth>
            <PermissionGate permission="canManageUsers">
              <Users />
            </PermissionGate>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users/new"
        element={
          <RequireAuth>
            <PermissionGate permission="canManageUsers">
              <CreateUser />
            </PermissionGate>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/users/:id"
        element={
          <RequireAuth>
            <PermissionGate permission="canManageUsers">
              <UserDetail />
            </PermissionGate>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/products"
        element={
          <RequireAuth>
            <PermissionGate permission="canManageProducts">
              <Products />
            </PermissionGate>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
