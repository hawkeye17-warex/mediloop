import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/index';
import About from './pages/about';
import Contact from './pages/contact';
import Product from './pages/product';
import Clinics from './pages/clinics';
import Login from './pages/login';
import Register from './pages/register';
import RequestAccess from './pages/request-access';
import Dashboard from './pages/dashboard';
import PatientDetail from './pages/patient-detail';

function Shell() {
  const location = useLocation();
  const hideChrome = location.pathname.startsWith('/dashboard');
  return (
    <>
      {!hideChrome && <Navbar />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/product" element={<Product />} />
        <Route path="/clinics" element={<Clinics />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/request-access" element={<RequestAccess />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/patients/:id" element={<PatientDetail />} />
      </Routes>
      {!hideChrome && <Footer />}
    </>
  );
}

function App() {
  return (
    <Router>
      <Shell />
    </Router>
  );
}

export default App;
