// @ts-ignore

import { useEffect } from "react";
import { useNavigate } from "react-router";

export const RedirectOnLogout = ({ user }: { user: unknown }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
};
