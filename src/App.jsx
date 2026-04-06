import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/client/Home'; 
import CheckoutReview from './pages/client/CheckoutReview';
import AdminDash from "./pages/admin/AdminDashMain"; 
import ProtectedRoute from './components/ui/ProtectedRoute'; 

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/checkout" element={<CheckoutReview />} />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute>
              <AdminDash/>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App; 