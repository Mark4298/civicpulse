import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import type { UserProfile, UserRole } from "@civicpulse/shared";
import {
  getCurrentUserProfile,
  registerAccount,
  type SignupRequest,
} from "../api/client";
import { auth } from "../lib/firebase";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authError(error: unknown): Error {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (code.includes("invalid-credential") || code.includes("wrong-password")) {
      return new Error("Email or password is incorrect.");
    }
    if (code.includes("user-not-found")) return new Error("No account exists for this email.");
    if (code.includes("too-many-requests")) return new Error("Too many attempts. Try again later.");
    if (code.includes("invalid-api-key")) return new Error("Firebase client configuration is missing.");
  }
  return error instanceof Error ? error : new Error("Authentication failed. Please try again.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    let generation = 0;
    const unsubscribe = onIdTokenChanged(auth, (nextUser) => {
      const currentGeneration = ++generation;
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setRole(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      void getCurrentUserProfile()
        .then(({ user: nextProfile }) => {
          if (currentGeneration !== generation) return;
          setProfile(nextProfile);
          setRole(nextProfile.role);
        })
        .catch(() => {
          if (currentGeneration !== generation) return;
          setProfile(null);
          setRole("citizen");
        })
        .finally(() => {
          if (currentGeneration === generation) setLoading(false);
        });
    });
    return () => {
      generation += 1;
      unsubscribe();
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    if (!auth) throw new Error("Firebase client configuration is missing.");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw authError(error);
    }
  }

  async function signup(input: SignupRequest): Promise<void> {
    if (!auth) throw new Error("Firebase client configuration is missing.");
    try {
      await registerAccount(input);
      await signInWithEmailAndPassword(auth, input.email, input.password);
    } catch (error) {
      throw authError(error);
    }
  }

  async function logout(): Promise<void> {
    try {
      sessionStorage.removeItem("civicpulse-report-draft");
    } catch {
      // ignore sessionStorage failures
    }
    if (auth) await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, profile, role, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}