import type { Move } from "./index.js";

/**
 * The path a token stands for: a group's own `$root` token gives its group's path (Format 6.2),
 * and any other path is returned as it is. A `$root` at the top of a file has no group name, so it
 * stays `$root`. Use it wherever a token is named for people, such as a CSS variable or a utility
 * class, so `color.accent.$root` reads as `color.accent`.
 *
 * @example
 * withoutRoot("color.accent.$root") // "color.accent"
 * withoutRoot("color.brand")        // "color.brand"
 */
export function withoutRoot(path: string): string {
    return path.endsWith(".$root") ? path.slice(0, -".$root".length) : path;
}

/**
 * The rest of a path inside a group, or `undefined` when the path is not inside it. The group
 * itself is not inside, and neither is a sibling whose name merely starts the same way. `""` is the
 * group named `""` (Format 5.1); the top level of the files has no path.
 *
 * @example
 * pathBelow("color.brand.ink", "color") // "brand.ink"
 * pathBelow("colors.ink", "color")      // undefined
 */
export function pathBelow(path: string, group: string): string | undefined {
    return path.startsWith(`${group}.`) ? path.slice(group.length + 1) : undefined;
}

/**
 * Where a token or group is after a list of {@link Move}s, made in order. A group's move carries
 * everything inside it; a path no move reaches stays as it is.
 *
 * @example
 * movedPath("color.brand.500", [{ from: "color.brand", to: "color.house" }]) // "color.house.500"
 */
export function movedPath(path: string, moved: readonly Move[]): string {
    return moved.reduce((current, { from, to }) => {
        if (current === from) return to;
        const rest = pathBelow(current, from);
        return rest === undefined ? current : `${to}.${rest}`;
    }, path);
}

const FORBIDDEN = [".", "{", "}"] as const;

/**
 * The character that stops `name` from being a token or group name (Format 5.1.1), or `undefined`
 * when it can be one: a leading `$`, which marks a property, except `$root` (Format 6.2), or a `.`,
 * `{` or `}` anywhere, which references use.
 *
 * @example
 * forbiddenInName("brand.500") // "."
 * forbiddenInName("$root")     // undefined
 */
export function forbiddenInName(name: string): "$" | (typeof FORBIDDEN)[number] | undefined {
    if (name.startsWith("$") && name !== "$root") return "$";
    return FORBIDDEN.find((each) => name.includes(each));
}

/**
 * The group a token or group is directly inside, or `undefined` at the top level of the files. A
 * group may be named `""` (Format 5.1), so `""` is that group's path, never the top level.
 *
 * @example
 * parentOf("color.brand.500") // "color.brand"
 * parentOf("color")           // undefined: at the top level
 * parentOf(".x")              // "": inside the group named ""
 */
export function parentOf(path: string): string | undefined {
    const dot = path.lastIndexOf(".");
    return dot === -1 ? undefined : path.slice(0, dot);
}

/**
 * The path of `name` inside `parent`, built as Format 6.7.2 builds paths: joined with a dot. Leave
 * `parent` out for the top level.
 *
 * @example
 * childPath("color.brand", "500") // "color.brand.500"
 * childPath(undefined, "color")   // "color"
 */
export function childPath(parent: string | undefined, name: string): string {
    return parent === undefined ? name : `${parent}.${name}`;
}

/**
 * Whether `path` is the group's own path or anything within it (Format 6.3): what removing or moving
 * the group takes with it. A sibling whose name merely starts the same way is not within.
 *
 * @example
 * atOrWithin("color.brand.500", "color.brand") // true
 * atOrWithin("color.brand", "color.brand")     // true
 * atOrWithin("color.brandy", "color.brand")    // false
 */
export function atOrWithin(path: string, group: string): boolean {
    return path === group || pathBelow(path, group) !== undefined;
}
