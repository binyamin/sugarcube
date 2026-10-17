import { thrownMessages } from "../error-messages.js";
import type {
    CompleteInput,
    DesignTokens,
    Input,
    Permutation,
    PermutationErrorDetail,
    ResolverModifier,
} from "../index.js";
import { checkedInput, findByName } from "../read/input.js";
import { keptBy } from "../read/kept.js";

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
    const found = tokens.permutations.find((each) => sameInput(each.input, complete.input));
    return found ?? { reason: "not-read", input: complete.input };
}

function sameInput(built: Input, complete: Input): boolean {
    return Object.keys(complete).every((name) => built[name] === complete[name]);
}

/**
 * An input with every modifier given, defaults filled in, and each name as the resolver writes
 * it, or why there is none. Names match whatever their case, as the resolver spec asks.
 *
 * @example
 * completeInput(tokens, { Theme: "DARK" })   // { ok: true, input: { theme: "dark", density: "comfy" } }
 * completeInput(tokens, { theme: "sepia" })  // { ok: false, reason: "unknown-context", modifier: "theme", context: "sepia", valid: ["light", "dark"] }
 */
export function completeInput(tokens: DesignTokens, input: Input): CompleteInput {
    const checked = checkedInput(keptBy(tokens).modifiers, input);
    return checked.ok ? checked : { ok: false, ...checked.problems[0] };
}

export function modifierIn(tokens: DesignTokens, name: string): ResolverModifier | undefined {
    return findByName(tokens.resolver?.modifiers ?? [], name, (each) => each.name);
}
