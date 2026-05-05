/**
 * Specifies that a handler comes from a project-local file identified by its on-disk location.
 *
 * The plugin walks upwards from the file being linted to find the nearest oxlint config
 * (`.oxlintrc.json` or `oxlint.config.{ts,mts,cts,js,mjs,cjs}`) and treats `path` as relative to
 * that config's directory. Each import site is resolved through unrs-resolver using the nearest
 * `tsconfig.json`, so TS path aliases (`paths`) and relative imports both reduce to the same
 * absolute path before comparison.
 */
type FileSource = {
  from: "file";
  /**
   * The name of the export that is the handler. Use `"default"` to match the module's default
   * export (`import handler from "..."`).
   *
   * @example
   *   "navigate";
   *   "default";
   */
  name: string;
  /**
   * Path to the file declaring the export, **relative to the nearest oxlint config**.
   *
   * Use forward slashes; an explicit extension (e.g. `.ts`) is recommended so resolution is
   * unambiguous.
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
   * The name of the export that is the handler. Use `"default"` to match the module's default
   * export (`import handler from "pkg"`).
   *
   * @example
   *   "useNavigate";
   *   "default";
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
 * The source value itself is the handler.
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
 *   { kind: "value" }
 */
type HandlerValue = {
  kind: "value";
};

/**
 * The handler is the return value of calling the source.
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
type HandlerCallReturn = {
  kind: "call-return";
};

/**
 * The handler is a property of the return value of calling the source.
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
 *   { kind: "call-return-property", properties: ["notify"] }
 */
type HandlerCallReturnProperty = {
  kind: "call-return-property";
  properties: string[];
};

type Handler = HandlerValue | HandlerCallReturn | HandlerCallReturnProperty;

export type TargetSpec = {
  source: Source;
  handler: Handler;
};
