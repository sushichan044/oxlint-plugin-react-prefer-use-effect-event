import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

export const RedirectOnLogout = ({ user }) => {
  const navigate = useNavigate();

  // The dep array intentionally omits `navigate`; the rule should still wrap the call.
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    if (!user) {
      navigateEvent("/login");
    }
  }, [user]);
};
