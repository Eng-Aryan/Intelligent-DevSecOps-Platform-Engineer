import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth'; import Layout from './components/Layout'; import Login from './pages/Login';
import Overview from './pages/Overview'; import Projects from './pages/Projects'; import Repos from './pages/Repos'; import Pipelines from './pages/Pipelines'; import Quality from './pages/Quality';
import Security from './pages/Security'; import Docker from './pages/Docker'; import Deployments from './pages/Deployments'; import Monitoring from './pages/Monitoring'; import AIAssistant from './pages/AIAssistant';
import Reports from './pages/Reports'; import Notifications from './pages/Notifications'; import Audit from './pages/Audit'; import Team from './pages/Team'; import Integrations from './pages/Integrations'; import Settings from './pages/Settings';
export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-muted">Loading…</div>;
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
    <Route element={user ? <Layout /> : <Navigate to="/login" />}>
      <Route index element={<Overview />} /><Route path="projects" element={<Projects />} /><Route path="repos" element={<Repos />} /><Route path="pipelines" element={<Pipelines />} />
      <Route path="quality" element={<Quality />} /><Route path="security" element={<Security />} /><Route path="docker" element={<Docker />} /><Route path="deployments" element={<Deployments />} />
      <Route path="monitoring" element={<Monitoring />} /><Route path="ai" element={<AIAssistant />} /><Route path="reports" element={<Reports />} /><Route path="notifications" element={<Notifications />} />
      <Route path="audit" element={user?.role === 'admin' ? <Audit /> : <Navigate to="/" />} /><Route path="team" element={user?.role === 'admin' ? <Team /> : <Navigate to="/" />} />
      <Route path="integrations" element={<Integrations />} /><Route path="settings" element={<Settings />} /><Route path="*" element={<Navigate to="/" />} />
    </Route></Routes>;
}
