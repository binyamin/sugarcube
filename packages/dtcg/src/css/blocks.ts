import { stacksOn } from "./stacks-on.js";
import type { CSSDeclaration } from "./writer.js";

/** A block of custom properties: what it declares, under which selector, inside which at-rules. */
export interface CSSBlockInput {
    readonly declarations: readonly CSSDeclaration[];
    readonly selector: string | readonly string[];
    /** Outermost first, such as `["@media (min-width: 640px)"]`. */
    readonly atRules?: readonly string[];
    /**
     * Whether the block writes again every declaration referring to something it changes, so an
     * element anywhere under its selector gets the right values. `false` suits a block that can
     * only match the root element, which nothing above it inherits from.
     * @default true
     */
    readonly redeclare?: boolean;
}

/** A block, with what it must write. */
export interface CSSBlock extends CSSBlockInput {
    /** The declarations written in its rule. */
    readonly inRule: readonly CSSDeclaration[];
    /** The declarations whose `supports` alternatives it writes, under `@supports`. */
    readonly underSupports: readonly CSSDeclaration[];
}

/**
 * What each block must write, in order: only what differs from the earlier blocks that reach it,
 * then, unless it says `redeclare: false`, every declaration referring to what it changed, through
 * every step, since a variable referring to another is worked out where it is declared. An earlier
 * block reaches a later one when it applies to every element and every screen the later one does:
 * its selectors include `:root` or all of the later block's, and it has no at-rules, the same
 * ones, or a width query every screen the later one matches also matches. A block nothing reaches
 * is written in full, which is always right, so whatever this cannot be sure of is.
 *
 * @example
 * const writer = cssWriter();
 * const blocks = cssBlocks([
 *     { declarations: writer.declarations(tokens.permutation()).declarations, selector: ":root" },
 *     {
 *         declarations: writer.declarations(tokens.permutation({ mode: "dark" })).declarations,
 *         selector: '[data-mode="dark"]',
 *     },
 * ]);
 * row(cssText(blocks));
 */
export function cssBlocks(blocks: readonly CSSBlockInput[]): CSSBlock[] {
    const made: CSSBlock[] = [];
    for (const block of blocks) {
        const inEffect = new Map<string, CSSDeclaration>();
        for (const earlier of made.filter((each) => reaches(each, block))) {
            for (const line of earlier.declarations) inEffect.set(line.name, line);
        }
        const all = block.declarations;
        const changed = all.filter((line) => changedFrom(inEffect.get(line.name), line));
        const inRule =
            block.redeclare === false ? changed : [...changed, ...dependents(all, changed)];
        const names = new Set(inRule.map(({ name }) => name));
        const underSupports = all.filter(
            (line) =>
                line.supports !== undefined &&
                (names.has(line.name) ||
                    !sameSupports(inEffect.get(line.name)?.supports, line.supports)),
        );
        made.push({ ...block, inRule, underSupports });
    }
    return made;
}

function reaches(earlier: CSSBlockInput, later: CSSBlockInput): boolean {
    const reach = [earlier.selector].flat();
    const target = [later.selector].flat();
    const everyElement = reach.includes(":root") || target.every((each) => reach.includes(each));
    return everyElement && everyScreen(earlier.atRules ?? [], later.atRules ?? []);
}

function everyScreen(earlier: readonly string[], later: readonly string[]): boolean {
    if (earlier.length === 0) return true;
    if (earlier.length === later.length && earlier.every((each, index) => each === later[index])) {
        return true;
    }
    return earlier.length === 1 && later.length === 1 && stacksOn(earlier[0], later[0]);
}

function changedFrom(earlier: CSSDeclaration | undefined, line: CSSDeclaration): boolean {
    return earlier?.value !== line.value || (earlier.supports !== undefined && !line.supports);
}

function sameSupports(
    earlier: CSSDeclaration["supports"],
    later: NonNullable<CSSDeclaration["supports"]>,
): boolean {
    return (
        earlier?.length === later.length &&
        earlier.every(
            (each, index) =>
                each.condition === later[index]?.condition && each.value === later[index]?.value,
        )
    );
}

function dependents(
    all: readonly CSSDeclaration[],
    changed: readonly CSSDeclaration[],
): CSSDeclaration[] {
    const users = new Map<string, CSSDeclaration[]>();
    for (const line of all) {
        for (const { path } of line.refersTo) {
            const found = users.get(path);
            if (found) found.push(line);
            else users.set(path, [line]);
        }
    }
    const reached = new Set<string>();
    const queue = [...new Set(changed.map(({ token }) => token.path))];
    for (const path of queue) {
        for (const { token } of users.get(path) ?? []) {
            if (reached.has(token.path)) continue;
            reached.add(token.path);
            queue.push(token.path);
        }
    }
    const written = new Set(changed.map(({ name }) => name));
    return all.filter(({ name, token }) => reached.has(token.path) && !written.has(name));
}
