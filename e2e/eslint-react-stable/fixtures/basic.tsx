// @ts-ignore

import { useEffect } from "react";
import { useNavigate } from "react-router";

export const Component = () => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/path");
  }, [navigate]);
};
