import { useState } from "react";
import { AudioLines, LogIn, LogOut, Menu, X } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Navbar() {
  const { user, role, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    navigate("/");
  }

  return (
    <header className="app-navbar">
      <div className="app-navbar-inner">
        <Link className="app-brand" to="/" aria-label="CivicPulse home" onClick={() => setMenuOpen(false)}>
          <span className="app-brand-icon"><AudioLines size={18} /></span>
          <span>Civic<span>Pulse</span></span>
        </Link>
        <button
          type="button"
          className="app-menu-toggle"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav
          id="primary-navigation"
          className={`app-nav${menuOpen ? " is-open" : ""}`}
          aria-label="Primary navigation"
        >
          <NavLink to="/" end className="app-nav-link" onClick={() => setMenuOpen(false)}>
            Report an issue
          </NavLink>
          {user && role === "citizen" && (
            <NavLink to="/my-reports" className="app-nav-link" onClick={() => setMenuOpen(false)}>
              My Reports
            </NavLink>
          )}
          {user && role === "admin" && (
            <NavLink to="/dashboard" className="app-nav-link" onClick={() => setMenuOpen(false)}>
              Dashboard
            </NavLink>
          )}
          {user ? (
            <button type="button" className="app-auth-action" onClick={handleLogout}>
              <LogOut size={16} /> Log out
            </button>
          ) : (
            <>
              <Link className="app-auth-action" to="/login?next=%2F" onClick={() => setMenuOpen(false)}>
                <LogIn size={16} /> Log in
              </Link>
              <Link className="app-auth-action" to="/signup?next=%2F" onClick={() => setMenuOpen(false)}>
                <LogIn size={16} /> Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}