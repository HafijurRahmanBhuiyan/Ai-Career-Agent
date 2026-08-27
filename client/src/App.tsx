import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import GitHubIntegrations from "./pages/GitHubIntegrations";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/dashboard/integrations" element={<GitHubIntegrations />} />
    </Routes>
  );
}

export default App;
