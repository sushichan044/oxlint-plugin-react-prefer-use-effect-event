// @ts-ignore

import { useEffect } from "react";
import { useToast } from "@/hooks/useToast";

export const Component = () => {
  const toast = useToast();
  useEffect(() => {
    toast("hello");
  }, [toast]);
};
