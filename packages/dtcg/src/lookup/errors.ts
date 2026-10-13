import type { Diagnostic, DesignSystem } from "../index.js";

/**
 * The diagnostics that stop a design system from being used: those with severity `"error"`, in
 * the order the read found them. Warnings and notes are left in `ds.diagnostics`.
 *
 * @example
 * if (errors(ds).length > 0) process.exitCode = 1
 */
export function errors(ds: DesignSystem): Diagnostic[] {
    return ds.diagnostics.filter((each) => each.severity === "error");
}
