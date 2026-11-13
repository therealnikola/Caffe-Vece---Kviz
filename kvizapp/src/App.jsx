import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AdminPanel from './pages/AdminPanel';
import CaptainView from './pages/CaptainView';
import TVView from './pages/TVView';
import MasterAdmin from './pages/MasterAdmin';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/master" element={<MasterAdmin />} />
        <Route path="/admin/:eventId" element={<AdminPanel />} />
        <Route path="/captain/:eventId/:teamCode" element={<CaptainView />} />
        <Route path="/tv/:eventId" element={<TVView />} />
        <Route path="/tv" element={<TVView />} />
      </Routes>
    </Router>
  );
}

export default App;
