import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import GitHubIntegrations from "./pages/GitHubIntegrations";
import Jobs from "./pages/Jobs";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/integrations" element={<GitHubIntegrations />} />
      <Route path="/dashboard/jobs" element={<Jobs />} />
    </Routes>
  );
}

export default App;
