# oxlint-plugin-react-prefer-use-effect-event/prefer-use-effect-event

📝 Wrap event handlers passed into `useEffect` with `useEffectEvent` to avoid stale closures and unnecessary effect re-runs.

🔧 This rule is automatically fixable by the [`--fix` CLI option](https://eslint.org/docs/latest/user-guide/command-line-interface#--fix).

<!-- end auto-generated rule header -->

## Rule Details

This rule reports calls inside `useEffect` to handlers that originate from configured `targets` (e.g. `navigate` returned by `useNavigate`), and suggests wrapping them with [`useEffectEvent`](https://react.dev/reference/react/experimental_useEffectEvent).

Without `useEffectEvent`, including such handlers in the dependency array often causes effects to re-run more than intended, while omitting them produces stale closures.

### ❌ Incorrect

```tsx
import { useEffect } from "react";
import { notify } from "some-notification-library";

export function RedirectOnAuth({ user }) {
  useEffect(() => {
    if (!user) {
      notify("User is not authenticated");
      return;
    }
    // other logic that depends on user
  }, [user, notify]); // We must include notify as a dependency, causing this effect to re-run whenever notify changes, even though the notification logic itself doesn't depend on user.
}
```

### ✅ Correct

```tsx
import { useEffect, useEffectEvent } from "react";
import { notify } from "some-notification-library";

export function RedirectOnAuth({ user }) {
  const notifyUserNotAuthenticated = useEffectEvent(() => {
    notify("User is not authenticated");
  });

  useEffect(() => {
    if (!user) {
      notifyUserNotAuthenticated();
      return;
    }
    // other logic that depends on user
  }, [user]); // No need to mark notification logic as a dependency
}
```

## Options

### `targets`

Specifies which bindings should be considered "handlers" that must be wrapped. Each entry has:

- `source` — where the handler comes from
  - `{ from: "package", package: "<npm package>", name: "<export name>" }` — match a named export from an npm package
  - `{ from: "file", path: "<relative path>", name: "<export name>" }` — match a named export from a project-local file
- `derivation` — how the handler is obtained from the source
  - `{ kind: "direct" }` — the import itself is the handler (e.g. `import { handler } from "..."`)
  - `{ kind: "call-return" }` — the handler is the return value of calling the import (e.g. `const navigate = useNavigate()`)
  - `{ kind: "call-return-properties", properties: ["<prop>", ...] }` — the handler is a property of the call's return value (e.g. `const { mutate } = useMutation()`)

### `experimentalUseEffectEvent`

Set this to `true` if you are on a React version that exports `experimental_useEffectEvent` instead of the stable `useEffectEvent`. Autofix will then import and reference `experimental_useEffectEvent` (aliased as `useEffectEvent`).
