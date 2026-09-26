import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import OverviewPage from './pages/OverviewPage';
import ProjectsPage from './pages/ProjectsPage';
import TopologyPage from './pages/TopologyPage';
import InstancesPage from './pages/InstancesPage';
import GatewayPage from './pages/GatewayPage';
import LoadGenPage from './pages/LoadGenPage';
import FailureLabPage from './pages/FailureLabPage';
import EventsPage from './pages/EventsPage';
import MetricsPage from './pages/MetricsPage';
import DatabasePage from './pages/DatabasePage';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/topology" element={<TopologyPage />} />
              <Route path="/instances" element={<InstancesPage />} />
              <Route path="/gateway" element={<GatewayPage />} />
              <Route path="/load-gen" element={<LoadGenPage />} />
              <Route path="/failure-lab" element={<FailureLabPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/metrics" element={<MetricsPage />} />
              <Route path="/database" element={<DatabasePage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}
