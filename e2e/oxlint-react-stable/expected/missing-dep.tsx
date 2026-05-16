// @ts-ignore

import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

export const RedirectOnLogout = ({ user }: { user: unknown }) => {
  const navigate = useNavigate();

  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    if (!user) {
      navigateEvent("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
};
