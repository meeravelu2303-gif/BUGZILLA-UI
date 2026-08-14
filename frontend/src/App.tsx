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
import { FieldValues } from './pages/admin/FieldValues';
import { Groups } from './pages/admin/Groups';
import { Parameters } from './pages/admin/Parameters';
import { Products } from './pages/admin/Products';
import { SanityCheck } from './pages/admin/SanityCheck';
import { UserDetail } from './pages/admin/UserDetail';
import { Users } from './pages/admin/Users';
import { Workflow } from './pages/admin/Workflow';

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
      <Route path="/admin/field-values" element={<Protected><FieldValues /></Protected>} />
      <Route path="/admin/workflow" element={<Protected><Workflow /></Protected>} />
      <Route path="/admin/groups" element={<Protected><Groups /></Protected>} />
      <Route path="/admin/parameters" element={<Protected><Parameters /></Protected>} />
      <Route path="/admin/sanity-check" element={<Protected><SanityCheck /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
