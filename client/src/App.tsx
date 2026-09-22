import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import PageLoader from "./components/PageLoader";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const MakeCV = lazy(() => import("./pages/MakeCV"));
const GitHubIntegrations = lazy(() => import("./pages/GitHubIntegrations"));
const Connections = lazy(() => import("./pages/Connections"));
const ProfessionalContent = lazy(() => import("./pages/ProfessionalContent"));
const Jobs = lazy(() => import("./pages/Jobs"));
const JobMatches = lazy(() => import("./pages/JobMatches"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const Applications = lazy(() => import("./pages/Applications"));
const CareerEmails = lazy(() => import("./pages/CareerEmails"));
const FollowUps = lazy(() => import("./pages/FollowUps"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/make-cv"
          element={
            <ProtectedRoute>
              <MakeCV />
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
          path="/dashboard/connections"
          element={
            <ProtectedRoute>
              <Connections />
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
      </Suspense>
    </AuthProvider>
  );
}

export default App;
