import { eslintCompatPlugin } from "@oxlint/plugins";
import pkg from "../package.json" with { type: "json" };
import preferUseEffectEvent from "./prefer-use-effect-event";

const plugin = eslintCompatPlugin({
  meta: {
    name: pkg.name,
  },
  rules: {
    "prefer-use-effect-event": preferUseEffectEvent,
  },
});

export default plugin;
