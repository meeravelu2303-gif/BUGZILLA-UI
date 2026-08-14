import { Navigate, Route, Routes } from 'react-router-dom';
import { PermissionGate } from './components/layout/PermissionGate';
import { RequireAuth } from './components/layout/RequireAuth';
import { AdvancedSearch } from './pages/AdvancedSearch';
import { BugDetail } from './pages/BugDetail';
import { BugList } from './pages/BugList';
import { CreateBug } from './pages/CreateBug';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { MyBugs } from './pages/MyBugs';
import { Preferences } from './pages/Preferences';
import { Reports } from './pages/Reports';
import { CreateUser } from './pages/admin/CreateUser';
import { NativeAdmin } from './pages/admin/NativeAdmin';
import { Products } from './pages/admin/Products';
import { UserDetail } from './pages/admin/UserDetail';
import { Users } from './pages/admin/Users';

/** Wraps an element in the authenticated app shell. */
function Protected({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/my-bugs" element={<Protected><MyBugs /></Protected>} />
      <Route path="/bugs" element={<Protected><BugList /></Protected>} />
      <Route path="/bugs/new" element={<Protected><CreateBug /></Protected>} />
      <Route path="/bugs/:id" element={<Protected><BugDetail /></Protected>} />
      <Route path="/search" element={<Protected><AdvancedSearch /></Protected>} />
      <Route path="/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/preferences" element={<Protected><Preferences /></Protected>} />

      <Route
        path="/admin/users"
        element={
          <Protected>
            <PermissionGate permission="canManageUsers">
              <Users />
            </PermissionGate>
          </Protected>
        }
      />
      <Route
        path="/admin/users/new"
        element={
          <Protected>
            <PermissionGate permission="canManageUsers">
              <CreateUser />
            </PermissionGate>
          </Protected>
        }
      />
      <Route
        path="/admin/users/:id"
        element={
          <Protected>
            <PermissionGate permission="canManageUsers">
              <UserDetail />
            </PermissionGate>
          </Protected>
        }
      />
      <Route
        path="/admin/products"
        element={
          <Protected>
            <PermissionGate permission="canManageProducts">
              <Products />
            </PermissionGate>
          </Protected>
        }
      />
      <Route path="/admin/native/:page" element={<Protected><NativeAdmin /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
