// Checks a config that maps each theme to a CSS selector. Any entry that matches no theme in the
// tokens is reported, saying what is wrong with it.
import { type DesignSystem, type Input, PermutationError } from "@sugarcube-sh/dtcg";

declare const ds: DesignSystem;
declare const config: { permutations: { input: Input; selector: string; atRule?: string }[] };

for (const entry of config.permutations) {
    try {
        const p = ds.permutation(entry.input);
        row(entry.selector, p.label, p.tokens.length);
    } catch (error) {
        if (!(error instanceof PermutationError)) throw error;
        showMessage(`${entry.selector}: ${error.message}`);
    }
}
