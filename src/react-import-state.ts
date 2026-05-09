import type { ESTree, Variable } from "@oxlint/plugins";
import type { ScopeIndex } from "./scope-utils";

const REACT_PACKAGE = "react";
const USE_EFFECT_EXPORT = "useEffect";

export const USE_EFFECT_EVENT_EXPORT = "useEffectEvent";
export const EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT = "experimental_useEffectEvent";

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
   * Variable bound to the named `useEffect` specifier, if present. `null` when the file uses only a
   * default/namespace import.
   *
   * @example
   *   import { useEffect } from "react"; // the `useEffect` binding
   *   import React from "react"; // null
   */
  useEffectVariable: Variable | null;
  /**
   * Local name of the `useEffect` named specifier (i.e. the `as` alias if renamed). Used as a
   * fast-path filter before resolving identifier references.
   *
   * @example
   *   import { useEffect } from "react"; // "useEffect"
   *   import { useEffect as ue } from "react"; // "ue"
   */
  useEffectLocalName: string | null;
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
  let useEffectVariable: Variable | null = null;
  let useEffectLocalName: string | null = null;
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
      if (importedName === USE_EFFECT_EXPORT) {
        useEffectVariable = index.resolveDeclaration(specifier.local);
        useEffectLocalName = specifier.local.name;
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
    useEffectVariable,
    useEffectLocalName,
    useEffectEventLocalName,
    namespaceVariable,
    namespaceLocalName,
  };
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
 * Decide whether a `CallExpression` is the React `useEffect` we care about.
 *
 * Recognises both the named-import form (`useEffect(...)`) and the namespace/default form
 * (`React.useEffect(...)`). Filters by identifier name first to avoid resolving every call site
 * through the scope manager.
 */
export function isUseEffectCall(
  node: ESTree.CallExpression,
  state: ReactImportState | null,
  index: ScopeIndex,
): boolean {
  const { callee } = node;
  if (callee.type === "Identifier") {
    if (state?.useEffectVariable && state.useEffectLocalName !== null) {
      if (callee.name !== state.useEffectLocalName) return false;
      return index.resolveReference(callee) === state.useEffectVariable;
    }
    return callee.name === USE_EFFECT_EXPORT;
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    if (callee.property.type !== "Identifier") return false;
    if (callee.property.name !== USE_EFFECT_EXPORT) return false;
    if (callee.object.type !== "Identifier") return false;
    if (!state?.namespaceVariable) return false;
    return index.resolveReference(callee.object) === state.namespaceVariable;
  }
  return false;
}
