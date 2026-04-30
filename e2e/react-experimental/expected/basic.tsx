import { useEffect, experimental_useEffectEvent } from "react";
import { useNavigate } from "react-router";

void experimental_useEffectEvent;

export const Component = () => {
  const navigate = useNavigate();
  const navigateEvent = experimental_useEffectEvent(navigate);
  useEffect(() => {
    navigateEvent("/path");
  }, []);
};
