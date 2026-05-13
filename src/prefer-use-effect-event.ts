/**
 * `prefer-use-effect-event` rule, structured as three phases.
 *
 * Effect hooks recognised: `useEffect`, `useLayoutEffect`, `useInsertionEffect`. All three share
 * the same dependency-array semantics, so the rule treats them uniformly.
 *
 * ## Inputs
 *
 * - `targets: TargetSpec[]` — handler bindings to track. Empty disables the rule for the file.
 * - `experimentalUseEffectEvent?: boolean` — picks the wrapper export name. `false` (default) →
 *   `useEffectEvent`. `true` → `experimental_useEffectEvent`.
 *
 * ## Collect (`ImportDeclaration`, `VariableDeclarator`)
 *
 * Builds per-file state read by Detect/Fix:
 *
 * - `ReactImportState` — per-hook binding/local-name map for `useEffect` / `useLayoutEffect` /
 *   `useInsertionEffect`, default/namespace specifier, existing
 *   `useEffectEvent`/`experimental_useEffectEvent` local name.
 * - `trackedHandlers` — Variable → TargetSpec, indexed by handler kind:
 *
 *   - `value` → the imported binding itself.
 *   - `call-return` → the LHS Identifier of `const x = importedFn(...)`.
 *   - `call-return-property` → each LHS ObjectPattern property whose key is in `properties`.
 *
 * ## Detect (`CallExpression`)
 *
 * For every Identifier in the dependency array of an effect hook call, emit a `HandlerViolation`
 * iff all four conditions hold:
 *
 * 1. The Identifier resolves to a tracked handler.
 * 2. The first argument is an inline arrow / function expression with a body.
 * 3. Every reference to the handler inside that body is a direct callee (no value pass, no
 *    reassignment, no JSX use).
 * 4. The body contains at least one such call site (a stray dep is ignored).
 *
 * Effect hooks are recognised as the named-import form (via `reactImport.effectHookBindings`) or
 * the `<ns>.useEffect` / `<ns>.useLayoutEffect` / `<ns>.useInsertionEffect` form (via
 * `reactImport.namespaceVariable`); other shapes are rejected.
 *
 * ## Fix (when `${handlerName}Event` is available in the insertion scope)
 *
 * Four steps, in source order:
 *
 * - Fix-A — Add `useEffectEvent` to the React named imports if missing. Skipped when the local name
 *   is already known or when the React import has only a default/namespace specifier.
 * - Fix-B — Insert `const ${handlerName}Event = <calleeText>(${handlerName});` before the effect hook
 *   call.
 * - Fix-C — Replace each direct-callee call site inside the callback body with the wrapper name.
 * - Fix-D — Remove the handler from the dependency array.
 *
 * `<calleeText>` priority: existing `useEffectEvent` local name → `<ns>.useEffectEvent` (when the
 * React import has no named specifiers) → the export name from options (added by Fix-A).
 */
import type { TargetSpec } from "./types";

import { defineRule } from "@oxlint/plugins";
import {
  collectHandlerBindings,
  collectTrackedImport,
  type CollectedTracking,
} from "./handler-collection";
import {
  collectReactImport,
  EFFECT_HOOK_NAMES,
  EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT,
  isEffectHookCall,
  isReactImport,
  type ReactImportState,
  USE_EFFECT_EVENT_EXPORT,
} from "./react-import-state";
import { Resolver } from "./resolver";

import { isBindingNameAvailable, ScopeIndex } from "./scope-utils";
import { getRuleDocsURL } from "./utils";
import { detectViolations } from "./violation-detection";
import { buildViolationFix } from "./violation-fix";

type TargetOption = {
  targets: TargetSpec[];
  /**
   * Set this to true if you are using this plugin in an environment where React exports
   * `experimental_useEffectEvent`.
   *
   * @default false
   */
  experimentalUseEffectEvent?: boolean;
};

export type Options = [TargetOption?];
type MessageIds = "preferUseEffectEvent";

const preferUseEffectEvent = defineRule({
  meta: {
    defaultOptions: [] satisfies Options,
    type: "problem",
    docs: {
      description:
        "Wrap event handlers passed into React effect hooks (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) with `useEffectEvent` to avoid stale closures and unnecessary effect re-runs.",
      url: getRuleDocsURL("prefer-use-effect-event"),
    },
    messages: {
      preferUseEffectEvent: "Wrap the call of {{handlerName}} with useEffectEvent.",
    } satisfies Record<MessageIds, string>,
    fixable: "code",
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          experimentalUseEffectEvent: {
            type: "boolean",
            description:
              "Set to `true` for React versions that export `experimental_useEffectEvent` instead of the stable `useEffectEvent`.",
          },
          targets: {
            type: "array",
            description:
              "Handler bindings inside React effect hooks (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) that should be wrapped with `useEffectEvent`.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "handler"],
              properties: {
                source: {
                  description: "Where the handler binding originates.",
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["from", "package", "name"],
                      properties: {
                        from: {
                          const: "package",
                          description: "Track an export from an npm package.",
                        },
                        package: {
                          type: "string",
                          description: "npm package name to import the handler from.",
                        },
                        name: {
                          type: "string",
                          description:
                            'Named export to track on the package. Use `"default"` to match the default export (`import handler from "pkg"`).',
                        },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["from", "path", "name"],
                      properties: {
                        from: {
                          const: "file",
                          description: "Track an export from a project-local file.",
                        },
                        path: {
                          type: "string",
                          description:
                            "Path to the file declaring the export, relative to the nearest oxlint config (`.oxlintrc.json` or `oxlint.config.*`). Imports are resolved through the nearest tsconfig so TS path aliases match too.",
                        },
                        name: {
                          type: "string",
                          description:
                            'Named export to track on the file. Use `"default"` to match the default export (`import handler from "…"`).',
                        },
                      },
                    },
                  ],
                },
                handler: {
                  description: "How the handler is obtained from `source`.",
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind"],
                      properties: {
                        kind: {
                          const: "value",
                          description: "The imported binding itself is the handler.",
                        },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind"],
                      properties: {
                        kind: {
                          const: "call-return",
                          description:
                            "The handler is the return value of calling the imported binding.",
                        },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind", "properties"],
                      properties: {
                        kind: {
                          const: "call-return-property",
                          description:
                            "The handler is a property of the value returned by calling the imported binding.",
                        },
                        properties: {
                          type: "array",
                          items: { type: "string" },
                          minItems: 1,
                          description: "Property names on the call's return value to track.",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  },
  createOnce: (context) => {
    const resolver = new Resolver();
    let fileTargets: TargetSpec[] = [];
    let hasFileTargets = false;
    // Some experimental React versions export `experimental_useEffectEvent` instead of `useEffectEvent`...
    let useEffectEventExportName = USE_EFFECT_EVENT_EXPORT;

    // Per-file state. `before` is not guaranteed to fire, so reset on `Program` too.
    let tracking: CollectedTracking = {
      trackedImports: new Map(),
      trackedHandlers: new Map(),
    };
    let reactImport: ReactImportState | null = null;
    let scopeIndex: ScopeIndex | null = null;
    let configDir: string | null | undefined;

    function resetState() {
      tracking = { trackedImports: new Map(), trackedHandlers: new Map() };
      reactImport = null;
      scopeIndex = null;
      configDir = undefined;
    }

    function ensureScopeIndex(): ScopeIndex {
      if (!scopeIndex) scopeIndex = new ScopeIndex(context.sourceCode.scopeManager);
      return scopeIndex;
    }

    function ensureConfigDir(): string | null {
      if (configDir === undefined) {
        configDir = hasFileTargets ? resolver.findOxlintConfigDir(context.physicalFilename) : null;
      }
      return configDir;
    }

    return {
      before() {
        const opts = (context.options as Options | null)?.[0];
        fileTargets = opts?.targets ?? [];
        hasFileTargets = fileTargets.some((t) => t.source.from === "file");
        // No targets means no rule output is possible — skip the file entirely.
        if (fileTargets.length === 0) return false;
        // Skip the file when it doesn't mention any of the effect hooks the rule looks at.
        const text = context.sourceCode.text;
        if (!EFFECT_HOOK_NAMES.some((name) => text.includes(name))) {
          return false;
        }

        useEffectEventExportName = opts?.experimentalUseEffectEvent
          ? EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT
          : USE_EFFECT_EVENT_EXPORT;

        return true;
      },

      Program: () => {
        resetState();
      },

      ImportDeclaration(node) {
        const index = ensureScopeIndex();

        if (isReactImport(node)) {
          reactImport = collectReactImport(node, index);
        }

        collectTrackedImport(node, tracking, {
          index,
          fileTargets,
          configDir: ensureConfigDir(),
          resolveImportSource: (src) => resolver.resolveImportSource(context.physicalFilename, src),
        });
      },

      VariableDeclarator(node) {
        // Without any tracked imports, no `const x = source(...)` can produce a handler.
        if (tracking.trackedImports.size === 0) return;

        collectHandlerBindings(node, tracking, ensureScopeIndex());
      },

      CallExpression(node) {
        // Nothing to report when no handlers have been tracked yet.
        if (tracking.trackedHandlers.size === 0) return;

        const index = ensureScopeIndex();
        if (!isEffectHookCall(node, reactImport, index)) return;

        const violations = detectViolations(node, index, tracking.trackedHandlers);

        for (const violation of violations) {
          const eventName = `${violation.handlerName}Event`;
          const insertScope = context.sourceCode.getScope(node);
          // Drop the autofix when the coined name would clash with an existing binding visible in
          // the effect scope. Renaming to `${name}Event_1` etc. would force the user to read a
          // generated suffix; reporting without a fix lets them pick a name that fits the codebase.
          const canAutofix = isBindingNameAvailable(eventName, insertScope, violation.callbackArg);
          const capturedReactImport = reactImport;
          const capturedExportName = useEffectEventExportName;

          context.report({
            node: violation.depElement,
            messageId: "preferUseEffectEvent",
            data: { handlerName: violation.handlerName },
            fix: canAutofix
              ? (fixer) =>
                  buildViolationFix(
                    violation,
                    capturedReactImport,
                    capturedExportName,
                    context.sourceCode,
                    fixer,
                  )
              : undefined,
          });
        }
      },
    };
  },
});

export default preferUseEffectEvent;
