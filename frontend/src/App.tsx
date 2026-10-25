import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PermissionGate } from './components/layout/PermissionGate';
import { RequireAuth } from './components/layout/RequireAuth';
import { ForgotPassword } from './pages/ForgotPassword';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';

/*
 * Every page behind sign-in is loaded on demand, in its own chunk. Before this,
 * opening /login downloaded the WHOLE app - dashboards, bug editor, admin
 * screens - before the form could appear. The sign-in pages stay in the main
 * bundle so they show at once.
 */
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const AdvancedSearch = page(() => import('./pages/AdvancedSearch'), 'AdvancedSearch');
const BugDetail = page(() => import('./pages/BugDetail'), 'BugDetail');
const BugList = page(() => import('./pages/BugList'), 'BugList');
const CreateBug = page(() => import('./pages/CreateBug'), 'CreateBug');
const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard');
const MyBugs = page(() => import('./pages/MyBugs'), 'MyBugs');
const Preferences = page(() => import('./pages/Preferences'), 'Preferences');
const Reports = page(() => import('./pages/Reports'), 'Reports');
const CreateUser = page(() => import('./pages/admin/CreateUser'), 'CreateUser');
const FieldValues = page(() => import('./pages/admin/FieldValues'), 'FieldValues');
const Groups = page(() => import('./pages/admin/Groups'), 'Groups');
const Parameters = page(() => import('./pages/admin/Parameters'), 'Parameters');
const Products = page(() => import('./pages/admin/Products'), 'Products');
const SanityCheck = page(() => import('./pages/admin/SanityCheck'), 'SanityCheck');
const UserDetail = page(() => import('./pages/admin/UserDetail'), 'UserDetail');
const Teams = page(() => import('./pages/admin/Teams'), 'Teams');
const Users = page(() => import('./pages/admin/Users'), 'Users');
const Workflow = page(() => import('./pages/admin/Workflow'), 'Workflow');

/** Shown in the content area while a page's code arrives; the app shell stays put. */
function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    </div>
  );
}

/** Wraps an element in the authenticated app shell. */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </RequireAuth>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

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
            <PermissionGate permission="canViewUsers">
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
            <PermissionGate permission="canViewUsers">
              <UserDetail />
            </PermissionGate>
          </Protected>
        }
      />
      <Route
        path="/admin/products"
        element={
          <Protected>
            <PermissionGate permission="canViewProducts">
              <Products />
            </PermissionGate>
          </Protected>
        }
      />
      <Route
        path="/admin/teams"
        element={
          <Protected>
            <PermissionGate permission="canManageUsers">
              <Teams />
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
