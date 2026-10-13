import type { Diagnostic, DesignSystem, Input } from "../index.js";
import { findPermutation } from "./permutation.js";

/**
 * The diagnostics about one token or group, for showing on its own page: those at its path, and
 * those about a reference it holds. A reference to a token that does not exist is reported once,
 * naming every token that uses it, and a loop of references names every token in it, so each of
 * them gets it. With an `input`, only the diagnostics in that permutation; an input that picks no
 * permutation the read built gives none.
 *
 * @example
 * diagnosticsFor(ds, "color.brand")                   // includes "color.missing does not exist" if it refers to it
 * diagnosticsFor(ds, "color.brand", { mode: "dark" }) // only those in mode: dark
 */
export function diagnosticsFor(ds: DesignSystem, path: string, input?: Input): Diagnostic[] {
    const chosen = input && findPermutation(ds, input);
    if (chosen && "reason" in chosen) return [];
    return ds.diagnostics.filter(
        (found) =>
            isAbout(found, path) &&
            (!chosen || !found.permutations || found.permutations.includes(chosen)),
    );
}

function isAbout(found: Diagnostic, path: string): boolean {
    if (found.path === path) return true;
    if (found.kind === "missing-reference") return found.detail.referencedBy.includes(path);
    if (found.kind === "circular-reference") return found.detail.chain.includes(path);
    return false;
}
