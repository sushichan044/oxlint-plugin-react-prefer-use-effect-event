import type { ESTree, Variable } from "@oxlint/plugins";
import type { ScopeIndex } from "./scope-utils";

const REACT_PACKAGE = "react";

export const EFFECT_HOOK_NAMES = ["useEffect", "useLayoutEffect", "useInsertionEffect"] as const;
export type EffectHookName = (typeof EFFECT_HOOK_NAMES)[number];

const EFFECT_HOOK_NAME_SET: ReadonlySet<string> = new Set(EFFECT_HOOK_NAMES);

export const USE_EFFECT_EVENT_EXPORT = "useEffectEvent";
export const EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT = "experimental_useEffectEvent";

/**
 * One imported effect hook binding (the resolved `Variable` and the local name actually used in
 * source — accounting for `as` aliases). Stored per hook name in `ReactImportState`.
 *
 * @example
 *   import { useEffect } from "react"; // { variable, localName: "useEffect" }
 *   import { useLayoutEffect as ule } from "react"; // { variable, localName: "ule" }
 */
export type EffectHookBinding = {
  variable: Variable;
  localName: string;
};

export type ReactImportState = {
  /**
   * The `import ... from "react"` declaration node itself. Kept around so the autofix can mutate
   * its specifier list (e.g. add `useEffectEvent`) without re-finding the declaration.
   *
   * @example
   *   import React, { useEffect } from "react"; // this whole node
   */
  node: ESTree.ImportDeclaration;
  /**
   * Imported effect hook bindings, keyed by the React export name. Only hooks present in the
   * `import` declaration appear in the map; absent hooks have no entry.
   *
   * @example
   *   import { useEffect, useLayoutEffect as ule } from "react";
   *   // Map {
   *   //   "useEffect" => { variable, localName: "useEffect" },
   *   //   "useLayoutEffect" => { variable, localName: "ule" },
   *   // }
   */
  effectHookBindings: Map<EffectHookName, EffectHookBinding>;
  /**
   * Local name under which `useEffectEvent` (or `experimental_useEffectEvent`) is already imported,
   * accounting for `as` aliases. `null` when no event binding is imported yet.
   *
   * @example
   *   import { useEffectEvent } from "react"; // "useEffectEvent"
   *   import { experimental_useEffectEvent as useEffectEvent } from "react"; // "useEffectEvent"
   *   import { useEffect } from "react"; // null
   */
  useEffectEventLocalName: string | null;
  /**
   * Variable bound to the default or namespace specifier (e.g. `import React from "react"` or
   * `import * as React from "react"`). Used to recognise `React.useEffect(...)` calls.
   *
   * @example
   *   import React from "react"; // the `React` binding
   *   import * as React from "react"; // the `React` binding
   *   import { useEffect } from "react"; // null
   */
  namespaceVariable: Variable | null;
  /**
   * Local name of the namespace/default specifier — used when emitting the wrapper callee in the
   * `React.useEffectEvent` form.
   *
   * @example
   *   import React from "react"; // "React"
   *   import R from "react"; // "R"
   *   import * as React from "react"; // "React"
   *   import { useEffect } from "react"; // null
   */
  namespaceLocalName: string | null;
};

export function isReactImport(node: ESTree.ImportDeclaration): boolean {
  return node.source.value === REACT_PACKAGE;
}

/**
 * Build a `ReactImportState` from an `import ... from "react"` declaration. Caller must ensure the
 * node is a React import (use `isReactImport`).
 */
export function collectReactImport(
  node: ESTree.ImportDeclaration,
  index: ScopeIndex,
): ReactImportState {
  const effectHookBindings = new Map<EffectHookName, EffectHookBinding>();
  let useEffectEventLocalName: string | null = null;
  let namespaceVariable: Variable | null = null;
  let namespaceLocalName: string | null = null;

  for (const specifier of node.specifiers) {
    if (
      specifier.type === "ImportDefaultSpecifier" ||
      specifier.type === "ImportNamespaceSpecifier"
    ) {
      namespaceVariable = index.resolveDeclaration(specifier.local);
      namespaceLocalName = specifier.local.name;
      continue;
    }
    if (specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier") {
      const importedName = specifier.imported.name;
      if (isEffectHookName(importedName)) {
        const variable = index.resolveDeclaration(specifier.local);
        if (variable) {
          effectHookBindings.set(importedName, { variable, localName: specifier.local.name });
        }
      } else if (
        importedName === USE_EFFECT_EVENT_EXPORT ||
        importedName === EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT
      ) {
        useEffectEventLocalName = specifier.local.name;
      }
    }
  }

  return {
    node,
    effectHookBindings,
    useEffectEventLocalName,
    namespaceVariable,
    namespaceLocalName,
  };
}

function isEffectHookName(name: string): name is EffectHookName {
  return EFFECT_HOOK_NAME_SET.has(name);
}

/**
 * Decide which expression text to use as the wrapper callee.
 *
 * Priority:
 *
 * 1. An existing `useEffectEvent` (or `experimental_useEffectEvent`) named import — use the local
 *    name.
 * 2. A React namespace/default import with no named specifiers — use `<ns>.useEffectEvent`.
 * 3. Otherwise — use the export name determined by options (added to named imports by the fix).
 */
export function resolveEventCalleeText(state: ReactImportState | null, exportName: string): string {
  if (state === null) return exportName;
  if (state.useEffectEventLocalName !== null) {
    return state.useEffectEventLocalName;
  }
  const hasNamedSpecifier = state.node.specifiers.some((s) => s.type === "ImportSpecifier");
  if (!hasNamedSpecifier && state.namespaceLocalName !== null) {
    return `${state.namespaceLocalName}.${exportName}`;
  }
  return exportName;
}

/**
 * Decide whether a `CallExpression` is a React effect hook the rule cares about (`useEffect`,
 * `useLayoutEffect`, or `useInsertionEffect`).
 *
 * Recognises both the named-import form (`useEffect(...)`) and the namespace/default form
 * (`React.useEffect(...)`). Filters by identifier name first to avoid resolving every call site
 * through the scope manager.
 */
export function isEffectHookCall(
  node: ESTree.CallExpression,
  state: ReactImportState | null,
  index: ScopeIndex,
): boolean {
  const { callee } = node;
  if (callee.type === "Identifier") {
    if (state) {
      for (const binding of state.effectHookBindings.values()) {
        if (callee.name !== binding.localName) continue;
        if (index.resolveReference(callee) === binding.variable) return true;
      }
      // Fall through: no React effect hook binding matched. If the file imports React but no
      // effect hooks, treat a bare `useEffect(...)` etc. as not-a-hook — it would shadow a local.
      if (state.effectHookBindings.size > 0) return false;
    }
    // No React import detected (or React imported only as namespace/default): fall back to the
    // bare identifier match so files that call `useEffect(...)` without an explicit named import
    // are still recognised.
    return isEffectHookName(callee.name);
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    if (callee.property.type !== "Identifier") return false;
    if (!isEffectHookName(callee.property.name)) return false;
    if (callee.object.type !== "Identifier") return false;
    if (!state?.namespaceVariable) return false;
    return index.resolveReference(callee.object) === state.namespaceVariable;
  }
  return false;
}
