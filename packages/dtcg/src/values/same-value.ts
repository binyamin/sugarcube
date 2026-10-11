import type { Token, TokenType, UnresolvedValue } from "../index.js";
import { isJsonObject } from "./json.js";

const ROUNDING = 0.0005;

/**
 * Whether two values of a type are the same, allowing for the rounding that different spellings
 * of one value produce: numbers that agree to three decimal places, such as color components
 * written to different precision, are equal, and a color's `hex` fallback is not compared. Colors
 * in different color spaces, and lengths or durations in different units, are different values:
 * to compare them, convert one first. References are compared as references, not followed.
 *
 * @example
 * sameValue("dimension", { value: 0.1 + 0.2, unit: "rem" }, { value: 0.3, unit: "rem" }) // true
 * sameValue("dimension", { alias: "space.sm" }, { value: 4, unit: "px" })                 // false
 */
export function sameValue<T extends TokenType>(
    type: T,
    a: UnresolvedValue<T>,
    b: UnresolvedValue<T>,
): boolean;
/**
 * Whether two tokens have the same type and say the same value. References are compared as
 * references, not followed: to compare where two tokens end up, pass their `resolved` values with
 * the type.
 */
export function sameValue(a: Token, b: Token): boolean;
export function sameValue(...values: [TokenType, unknown, unknown] | [Token, Token]): boolean {
    if (values.length === 3) return alike(values[1], values[2], asValues);
    const [a, b] = values;
    return a.type === b.type && saysTheSame(a, b);
}

export function saysTheSame(a: Token, b: Token): boolean {
    if (a.value === undefined || b.value === undefined) {
        return a.value === b.value && sameJson(a.authored?.value, b.authored?.value);
    }
    return alike(a.value, b.value, asValues);
}

export function sameJson(a: unknown, b: unknown): boolean {
    return alike(a, b, exactly);
}

interface Rules {
    numbers(a: number, b: number): boolean;
    keys(value: Record<string, unknown>): string[];
}

const exactly: Rules = {
    numbers: (a, b) => a === b,
    keys: (value) => Object.keys(value).filter((key) => value[key] !== undefined),
};

const asValues: Rules = {
    numbers: (a, b) => Math.abs(a - b) < ROUNDING + Number.EPSILON,
    keys: (value) => {
        const keys = exactly.keys(value);
        return "colorSpace" in value ? keys.filter((key) => key !== "hex") : keys;
    },
};

function alike(a: unknown, b: unknown, rules: Rules): boolean {
    if (typeof a === "number" && typeof b === "number") return rules.numbers(a, b);
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((each, index) => alike(each, b[index], rules));
    }
    if (isJsonObject(a) && isJsonObject(b)) {
        const keys = rules.keys(a);
        return (
            keys.length === rules.keys(b).length &&
            keys.every((key) => alike(a[key], b[key], rules))
        );
    }
    return a === b;
}
