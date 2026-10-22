import { Link, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Spinner } from './components/ui';
import { homePathFor, useAuth } from './lib/auth';
import LoginPage from './pages/Login';
import AuthorDashboard from './pages/author/Dashboard';
import MyBooks from './pages/author/MyBooks';
import SubmitQuery from './pages/author/SubmitQuery';
import MyTickets from './pages/author/MyTickets';
import AuthorTicketDetail from './pages/author/TicketDetail';
import TicketQueue from './pages/admin/TicketQueue';
import AdminTicketDetail from './pages/admin/TicketDetail';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={user ? homePathFor(user) : '/login'} replace />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="btn-primary mt-4">
        Go home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/author"
        element={
          <ProtectedRoute role="AUTHOR">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AuthorDashboard />} />
        <Route path="books" element={<MyBooks />} />
        <Route path="tickets" element={<MyTickets />} />
        <Route path="tickets/new" element={<SubmitQuery />} />
        <Route path="tickets/:id" element={<AuthorTicketDetail />} />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute role="ADMIN">
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TicketQueue />} />
        <Route path="tickets/:id" element={<AdminTicketDetail />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
