import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { UserManager, type User } from "oidc-client-ts";
import { loadRuntimeConfig, type RuntimeConfig } from "../runtimeConfig";

interface AuthContextValue {
  user: User | null;
  idToken: string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function buildUserManager(config: RuntimeConfig): UserManager {
  return new UserManager({
    // Cognito's OIDC discovery document (at this issuer) resolves authorization/token
    // endpoints to the Hosted UI domain automatically.
    authority: `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`,
    client_id: config.userPoolClientId,
    redirect_uri: window.location.origin + "/",
    post_logout_redirect_uri: window.location.origin + "/",
    response_type: "code",
    scope: "openid email profile",
    automaticSilentRenew: true,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userManager, setUserManager] = useState<UserManager | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const config = await loadRuntimeConfig();
      const manager = buildUserManager(config);
      setUserManager(manager);

      if (window.location.search.includes("code=")) {
        const returnedUser = await manager.signinRedirectCallback();
        window.history.replaceState({}, document.title, "/");
        setUser(returnedUser);
      } else {
        const existing = await manager.getUser();
        setUser(existing && !existing.expired ? existing : null);
      }
      setLoading(false);
    })();
  }, []);

  const login = () => userManager?.signinRedirect();
  const logout = () => userManager?.signoutRedirect();

  if (loading) return <div className="centered">Loading...</div>;

  return (
    <AuthContext.Provider value={{ user, idToken: user?.id_token ?? null, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
