# oxlint-plugin-react-prefer-use-effect-event

An [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) / [ESLint](https://eslint.org/) plugin that suggests wrapping calls to event handlers of your choice inside React effect hooks (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) with [`useEffectEvent`](https://react.dev/reference/react/experimental_useEffectEvent).

## What it does

Given a `targets` config that marks `notify` from `some-notification-library` as a handler, the plugin flags calls to `notify` inside any of `useEffect` / `useLayoutEffect` / `useInsertionEffect` and suggests wrapping them with `useEffectEvent`.

See [extracting non-reactive logic out of the effect - react.dev](https://react.dev/learn/separating-events-from-effects#extracting-non-reactive-logic-out-of-effects) for more motivation and examples.

```json
{
  "rules": {
    "oxlint-plugin-react-prefer-use-effect-event/prefer-use-effect-event": [
      "error",
      {
        "targets": [
          {
            "source": {
              "from": "package",
              "package": "some-notification-library",
              "name": "notify"
            },
            "handler": { "kind": "value" }
          }
        ]
      }
    ]
  }
}
```

```tsx
// ❌ Before — notify must be listed as a dep, causing the effect to re-run whenever notify changes
import { useEffect } from "react";
import { notify } from "some-notification-library";

function App({ user }) {
  useEffect(() => {
    if (!user) notify("Not authenticated");
  }, [user, notify]);
  //         ^^^^^^ flagged by the rule
}
```

```tsx
// ✅ After (autofix applied) — notify is extracted as an Effect Event, separating event handler logic from the effect
import { useEffect, useEffectEvent } from "react";
import { notify } from "some-notification-library";

function App({ user }) {
  const notifyEvent = useEffectEvent(notify);

  useEffect(() => {
    if (!user) notifyEvent("Not authenticated");
  }, [user]);
}
```

The same pattern applies to hook return values (`kind: "call-return"`) and destructured hook return values (`kind: "call-return-property"`). See [docs/rules/prefer-use-effect-event.md](docs/rules/prefer-use-effect-event.md) for details and all configuration options.

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
            "source": {
              "from": "package",
              "package": "some-notification-library",
              "name": "notify"
            },
            "handler": { "kind": "value" }
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
import useEffectEvent from "oxlint-plugin-react-prefer-use-effect-event";

export default defineConfig({
  plugins: {
    "react-prefer-use-effect-event": useEffectEvent,
  },
  rules: {
    "react-prefer-use-effect-event/prefer-use-effect-event": [
      "error",
      {
        targets: [
          {
            source: { from: "package", package: "some-notification-library", name: "notify" },
            handler: { kind: "value" },
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

| Name                                                             | Description                                                                                                                                                                             | 🔧  |
| :--------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-- |
| [prefer-use-effect-event](docs/rules/prefer-use-effect-event.md) | Wrap event handlers passed into React effect hooks (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) with `useEffectEvent` to avoid stale closures and unnecessary effect re-runs. | 🔧  |

<!-- end auto-generated rules list -->

## Contributing

Contributions are welcome!
