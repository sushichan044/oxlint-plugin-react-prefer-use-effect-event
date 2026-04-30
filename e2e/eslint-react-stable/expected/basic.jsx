import { useEffect, useEffectEvent } from "react";
import { useNavigate } from "react-router";

export const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};
