import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import GitHubIntegrations from "./pages/GitHubIntegrations";
import ProfessionalContent from "./pages/ProfessionalContent";
import Jobs from "./pages/Jobs";
import JobMatches from "./pages/JobMatches";
import Opportunities from "./pages/Opportunities";
import Applications from "./pages/Applications";
import CareerEmails from "./pages/CareerEmails";
import FollowUps from "./pages/FollowUps";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/integrations"
          element={
            <ProtectedRoute>
              <GitHubIntegrations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/professional-content"
          element={
            <ProtectedRoute>
              <ProfessionalContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/jobs"
          element={
            <ProtectedRoute>
              <Jobs />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/job-matches"
          element={
            <ProtectedRoute>
              <JobMatches />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/opportunities"
          element={
            <ProtectedRoute>
              <Opportunities />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/applications"
          element={
            <ProtectedRoute>
              <Applications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/follow-ups"
          element={
            <ProtectedRoute>
              <FollowUps />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/emails"
          element={
            <ProtectedRoute>
              <CareerEmails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/analytics"
          element={
            <ProtectedRoute>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
