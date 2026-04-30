/** Specifies that a handler is declared in `path` and the export is named `name`. */
type FileSource = {
  from: "file";
  /**
   * The name of the export that is the handler.
   *
   * @example
   *   "navigate";
   */
  name: string;
  /**
   * The path to the file, relative to the project root.
   *
   * @example
   *   "src/hooks/useToast.ts";
   */
  path: string;
};

/** Specifies that a handler is imported from `package` and the export is named `name`. */
type PackageSource = {
  from: "package";
  /**
   * The name of the export that is the handler.
   *
   * @example
   *   "useNavigate";
   */
  name: string;
  /**
   * The name of the package.
   *
   * @example
   *   "react-router";
   */
  package: string;
};

type Source = FileSource | PackageSource;

/**
 * Declares a handler is direct value of the source.
 *
 * ```ts
 * import { useEffect, useEffectEvent } from "react";
 * import { notify } from "pkg";
 *
 * // `notify` is the handler
 * const notifyEvent = useEffectEvent(notify);
 * useEffect(() => {
 *   // existing logic
 *   notifyEvent();
 * }, [deps]);
 * ```
 *
 * @example
 *   { kind: "direct" }
 */
type DirectValueDerivation = {
  kind: "direct";
};

/**
 * Declares a handler is the return value of the call expression of the source.
 *
 * ```ts
 * import { useEffect, useEffectEvent } from "react";
 * import { useNotify } from "pkg";
 *
 * // `notify` is the handler
 * const notify = useNotify();
 * const notifyEvent = useEffectEvent(notify);
 * useEffect(() => {
 *   // existing logic
 *   notifyEvent();
 * }, [deps]);
 * ```
 *
 * @example
 *   { kind: "call-return" }
 */
type CallReturnDerivation = {
  kind: "call-return";
};

/**
 * Declares a handler is the property of the return value of the call expression of the source.
 *
 * The property name is specified in `properties`.
 *
 * ```ts
 * import { useEffect, useEffectEvent } from "react";
 * import { useNotify } from "pkg";
 *
 * // `notify` is the handler
 * const { notify } = useNotify();
 * const notifyEvent = useEffectEvent(notify);
 * useEffect(() => {
 *   // existing logic
 *   notifyEvent();
 * }, [deps]);
 * ```
 *
 * @example
 *   { kind: "call-return-properties", properties: ["notify"] }
 */
type CallReturnPropertiesDerivation = {
  kind: "call-return-properties";
  properties: string[];
};

type Derivation = DirectValueDerivation | CallReturnDerivation | CallReturnPropertiesDerivation;

export type TargetSpec = {
  source: Source;
  derivation: Derivation;
};
