import type { DesignTokens } from "../index.js";
import type { Modifier } from "./input.js";

export interface Kept {
    texts: Readonly<Record<string, string>>;
    modifiers: Modifier[];
    readFiles(files: Record<string, string>, previous: DesignTokens): DesignTokens;
}

const kept = new WeakMap<DesignTokens, Kept>();

export function keep(tokens: DesignTokens, beside: Kept): void {
    kept.set(tokens, beside);
}

export function keptBy(tokens: DesignTokens): Kept {
    return kept.get(tokens) as Kept;
}
