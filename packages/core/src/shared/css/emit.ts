import type { InternalConfig } from "../../types/config.js";
import type { Reported } from "../../types/diagnostics.js";
import type { CSSFileOutput } from "../../types/generate.js";
import { diagnostic } from "../diagnostics.js";
import { cssBlocks, cssText } from "@sugarcube-sh/dtcg/css";
import type { Declarations, Entry } from "./declare.js";

/**
 * Writes the design tokens' CSS variables, named from the config's `prefix` or `variableName`,
 * with every reference to a token that has its own variable written as `var()`. Each permutation
 * is a block under its selector, inside its `atRule` if it has one, in its own `path` or the
 * config's. A block writes only what differs from the earlier blocks in its file that reach every
 * element and every screen it does (a selector list holding `:root` or all of its selectors; no
 * at-rule, the same one, or a media query it stacks on), the later winning, so a block nothing
 * reaches is written in full. After what it changes, a block writes again every variable that
 * refers to something it changed, unless `redeclareDependents` is `false`, so a theme set on any
 * element gives the right values. With `colorFallbackStrategy: "polyfill"`, a color outside sRGB
 * and HSL is written as its `hex`, and as itself inside an `@supports` block for browsers that
 * can show it. Hands back a warning when the config still says `propagateDependents`; what
 * reading and declaring found is in `declared.diagnostics`.
 *
 * @example
 * const tokens = await read(config.resolver, readOptions(config));
 * const { files, diagnostics } = emitCSS(declare(tokens, config), config);
 */
export function emitCSS(
    declared: Declarations,
    config: InternalConfig,
): { files: CSSFileOutput; diagnostics: Reported[] } {
    const { redeclare, renamed } = redeclaring(config);
    const byFile = new Map<string, Entry[]>();
    for (const entry of declared.entries) {
        const inFile = byFile.get(entry.path);
        if (inFile) inFile.push(entry);
        else byFile.set(entry.path, [entry]);
    }
    const files = [...byFile].flatMap(([path, entries]) => {
        const css = cssText(
            cssBlocks(
                entries.map(({ declared: { declarations }, selector, atRule }) => ({
                    declarations,
                    selector,
                    ...(atRule && { atRules: [atRule] }),
                    redeclare,
                })),
            ),
        );
        return css ? [{ path, css }] : [];
    });
    return { files, diagnostics: renamed };
}

function redeclaring(config: InternalConfig): { redeclare: boolean; renamed: Reported[] } {
    const { redeclareDependents, propagateDependents } = config.variables;
    return {
        redeclare: redeclareDependents ?? propagateDependents ?? true,
        renamed:
            propagateDependents === undefined
                ? []
                : [
                      diagnostic("option-renamed", {
                          from: "propagateDependents",
                          to: "redeclareDependents",
                      }),
                  ],
    };
}
