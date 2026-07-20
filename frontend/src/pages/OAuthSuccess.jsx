import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function OAuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { applyGoogleToken } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      applyGoogleToken(token);
      navigate("/", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [searchParams]);

  return <p>Signing you in...</p>;
}