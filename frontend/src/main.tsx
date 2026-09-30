import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { Navbar } from "./components/Navbar";
import { OfflineNotice } from "./components/OfflineNotice";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";
import "./styles.css";

const FoundationRoute = lazy(() => import("./routes/FoundationRoute"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const MyReports = lazy(() => import("./pages/MyReports"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
          <AuthProvider>
            <OfflineNotice />
            <Navbar />
            <Suspense
              fallback={
                <main className="route-loading" role="status">
                  Loading CivicPulse…
                </main>
              }
            >
              <Routes>
                <Route path="/" element={<FoundationRoute />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route
                  path="/my-reports"
                  element={<ProtectedRoute role="citizen"><MyReports /></ProtectedRoute>}
                />
                <Route
                  path="/dashboard"
                  element={<ProtectedRoute role="admin"><Dashboard /></ProtectedRoute>}
                />
                <Route path="*" element={<FoundationRoute />} />
              </Routes>
            </Suspense>
          </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
