# oxlint-plugin-react-prefer-use-effect-event

An [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [ESLint](https://eslint.org/) plugin that enforces wrapping handler calls inside `useEffect` with [`useEffectEvent`](https://react.dev/reference/react/experimental_useEffectEvent).

## Installation

```bash
pnpm add -D oxlint-plugin-react-prefer-use-effect-event
```

## Usage

### Oxlint

Add the plugin to your `.oxlintrc.json`:

```json
{
  "jsPlugins": ["oxlint-plugin-react-prefer-use-effect-event"],
  "rules": {
    "oxlint-plugin-react-prefer-use-effect-event/prefer-use-effect-event": [
      "error",
      {
        "targets": [
          {
            "source": { "from": "package", "package": "react-router", "name": "useNavigate" },
            "derivation": { "kind": "call-return" }
          }
        ]
      }
    ]
  }
}
```

### ESLint (Flat Config)

```ts
import { defineConfig } from "eslint/config";
import plugin from "oxlint-plugin-react-prefer-use-effect-event";

export default defineConfig({
  plugins: {
    "oxlint-plugin-react-prefer-use-effect-event": plugin,
  },
  rules: {
    "oxlint-plugin-react-prefer-use-effect-event/prefer-use-effect-event": [
      "error",
      {
        targets: [
          {
            source: { from: "package", package: "react-router", name: "useNavigate" },
            derivation: { kind: "call-return" },
          },
        ],
      },
    ],
  },
});
```

## Rules

<!-- begin auto-generated rules list -->

🔧 Automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/user-guide/command-line-interface#--fix).

| Name                                                             | Description                                                                                                               | 🔧  |
| :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :-- |
| [prefer-use-effect-event](docs/rules/prefer-use-effect-event.md) | Wrap event handlers passed into `useEffect` with `useEffectEvent` to avoid stale closures and unnecessary effect re-runs. | 🔧  |

<!-- end auto-generated rules list -->

## Contributing

Contributions are welcome!
