// @ts-ignore

import { useEffect, useEffectEvent } from "react";
import { useToast } from "@/hooks/useToast";

export const Component = () => {
  const toast = useToast();
  const toastEvent = useEffectEvent(toast);
  useEffect(() => {
    toastEvent("hello");
  }, []);
};
