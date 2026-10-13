import { thrownMessages } from "../error-messages.js";
import type {
    CompleteInput,
    DesignTokens,
    Input,
    Permutation,
    PermutationErrorDetail,
    ResolverModifier,
} from "../index.js";
import { findByName } from "../read/permutations.js";

/**
 * Thrown by {@link DesignTokens.permutation} when there is no permutation for the input. The
 * message says why in plain words; `detail` holds the facts it is worded from, for a tool to word
 * it itself.
 *
 * @example
 * try {
 *   tokens.permutation({ mode: "sepia" });
 * } catch (error) {
 *   if (error instanceof PermutationError) error.detail // { reason: "unknown-context", … }
 * }
 */
export class PermutationError extends Error {
    readonly detail: PermutationErrorDetail;

    constructor(detail: PermutationErrorDetail) {
        super(thrownMessages.permutation(detail));
        this.name = "PermutationError";
        this.detail = detail;
    }
}

export function permutationIn(tokens: DesignTokens, input: Input = {}): Permutation {
    const found = findPermutation(tokens, input);
    if ("reason" in found) throw new PermutationError(found);
    return found;
}

export function findPermutation(
    tokens: DesignTokens,
    input: Input = {},
): Permutation | PermutationErrorDetail {
    const complete = completeInput(tokens, input);
    if (!complete.ok) {
        const { ok: _, ...detail } = complete;
        return detail;
    }
    const found = tokens.permutations.find((each) => sameInput(tokens, each.input, complete.input));
    return found ?? { reason: "not-read", input: complete.input };
}

export function sameInput(tokens: DesignTokens, a: Input, b: Input): boolean {
    return modifiersOf(tokens).every(({ name }) => a[name] === b[name]);
}

/**
 * An input with every modifier given, defaults filled in, and each name as the resolver writes
 * it, or why there is none. Names match whatever their case, as the resolver spec asks.
 *
 * @example
 * completeInput(tokens, { Theme: "DARK" })   // { ok: true, input: { theme: "dark", density: "comfy" } }
 * completeInput(tokens, { theme: "sepia" })  // { ok: false, reason: "unknown-context", modifier: "theme", context: "sepia" }
 */
export function completeInput(tokens: DesignTokens, input: Input): CompleteInput {
    const full: Input = {};
    for (const [key, value] of Object.entries(input)) {
        const found = modifierIn(tokens, key);
        if (!found) return { ok: false, reason: "unknown-modifier", modifier: key };
        const context = findByName(found.contexts, value, ({ name }) => name);
        if (context === undefined) {
            return { ok: false, reason: "unknown-context", modifier: found.name, context: value };
        }
        full[found.name] = context.name;
    }
    for (const { name, default: fallback, contexts } of modifiersOf(tokens)) {
        const context = full[name] ?? fallback;
        if (context === undefined) {
            const valid = contexts.map((each) => each.name);
            return { ok: false, reason: "no-default", modifier: name, valid };
        }
        full[name] = context;
    }
    return { ok: true, input: full };
}

export function modifierIn(tokens: DesignTokens, name: string): ResolverModifier | undefined {
    return findByName(modifiersOf(tokens), name, (each) => each.name);
}

function modifiersOf(tokens: DesignTokens): ResolverModifier[] {
    return tokens.resolver?.modifiers ?? [];
}
