import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from "react-router-dom";
import SignIn from "./Pages/SignIn";
import ProtectedRoute from "./Components/ProtectedRoute";
import Home from "./Pages/Home";

export default () => {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/SignIn" element={<SignIn />} />

        {/* Private Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/Home" element={<Home />} />
        </Route>

        {/* Redirect logic */}
        <Route path="/" element={<Navigate replace to="/home" />} />
      </Routes>
    </Router>
  );
};
