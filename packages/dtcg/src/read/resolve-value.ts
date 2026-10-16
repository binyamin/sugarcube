import type {
    DiagnosticDetailByKind,
    DiagnosticKind,
    Input,
    JsonPath,
    Span,
    TokenType,
    WrittenReference,
} from "../index.js";
import { isJsonObject } from "../values/json.js";
import { referenceText } from "../values/references.js";
import type { ReadAgain } from "../values/read-syntax.js";
import type { Siblings } from "../values/syntax.js";
import type { MergedToken, Merged } from "./merge.js";
import { type Occurrence, occurrence } from "./occurrence.js";
import type { LocatedReference, ValueReader } from "./parse-value.js";
import { refSteps } from "./pointer.js";
import { reach, stepInto } from "./ref-meaning.js";

export const UNRESOLVED = Symbol("unresolved");

export type Target = "untyped" | { type: TokenType; resolved?: unknown };

export interface Resolving {
    readValue: ValueReader;
    merged: Merged;
    permutation: Input;
    outcomeOf(path: string, from: string, span: Span): Target | undefined;
    report<K extends DiagnosticKind>(
        kind: K,
        detail: DiagnosticDetailByKind[K],
        path: string,
        span: Span,
    ): void;
    recordMissing(reference: WrittenReference, from: string, span: Span): void;
    reportUnreachable(use: Occurrence, from: string): void;
}

interface Following {
    token: MergedToken;
    seen: string[];
    within: Occurrence | undefined;
}

export function resolveValue(
    resolving: Resolving,
    token: MergedToken,
    value: unknown,
    references: LocatedReference[],
    readAgain: ReadAgain[],
): unknown {
    const following = { token, seen: [], within: undefined };
    return resolveIn(resolving, following, value, references, readAgain);
}

function resolveIn(
    resolving: Resolving,
    following: Following,
    value: unknown,
    references: LocatedReference[],
    readAgain: ReadAgain[],
): unknown {
    const followed: [LocatedReference, unknown][] = [];
    let resolved = value;
    let failed = false;
    for (const located of references) {
        const { property } = located.reference;
        if (readAgain.some((each) => startsWith(property, each.property))) continue;
        const part = follow(resolving, following, located);
        if (part === UNRESOLVED) failed = true;
        else {
            followed.push([located, part]);
            resolved = replaced(resolved, property, part);
        }
    }
    if (failed) return UNRESOLVED;

    const { readValue, permutation } = resolving;
    const { token, within } = following;
    for (const again of readAgain) {
        const { jsonPath, owner, raw } = again;
        const syntax = again.from(siblingsOf(again, followed));
        const slot = { syntax, jsonPath, owner, element: false };
        const { result, notes } = readValue.readTarget(token, slot, raw, permutation);
        if (!result.ok) return UNRESOLVED;
        const inner = notes.references.map((reference) => ({
            reference,
            occurrence: within ?? occurrence(token, reference),
        }));
        const part = resolveIn(resolving, following, result.value, inner, notes.readAgain);
        if (part === UNRESOLVED) return UNRESOLVED;
        resolved = replaced(resolved, again.property, part);
    }
    return resolved;
}

function follow(resolving: Resolving, following: Following, located: LocatedReference): unknown {
    const { merged, readValue, permutation, report, recordMissing, reportUnreachable } = resolving;
    const { token, seen, within } = following;
    const { ref, syntax, owner, element, jsonPath } = located.reference;
    const use = within ?? located.occurrence;
    const expected = syntax.kind === "ofType" ? syntax.type : owner;
    const adjusted = (part: unknown) =>
        part !== UNRESOLVED && syntax.kind === "ofType" && syntax.adjust
            ? syntax.adjust(part)
            : part;

    if (ref.syntax === "curly-brace") {
        const target = { path: ref.path, reference: ref };
        return adjusted(substitute(resolving, token, target, expected, use, element));
    }

    const { pointer: written } = ref;
    if (seen.includes(written)) {
        report("circular-reference", { chain: [...seen, written] }, token.path, use.span);
        return UNRESOLVED;
    }
    const reached = reach(refSteps(written), merged);
    const unreachable = () => {
        if (!within) reportUnreachable(located.occurrence, token.path);
        else if (reached.kind === "group") {
            report("not-a-token", { ref: written }, token.path, use.span);
        } else recordMissing(ref, token.path, use.span);
        return UNRESOLVED;
    };
    if (reached.kind === "group" || reached.kind === "nothing") return unreachable();

    const whole = reached.kind === "token";
    if (whole && (syntax.kind === "ofType" || element)) {
        const target = { path: reached.path, reference: ref };
        return adjusted(substitute(resolving, token, target, expected, use, element));
    }
    const { authored } = reached.token;
    const stepped = whole ? { value: authored } : stepInto(authored, reached.inside);
    if (!stepped) return unreachable();
    const raw = stepped.value;

    const slot = { syntax, jsonPath, owner, element };
    const { result, notes } = readValue.readTarget(token, slot, raw, permutation);
    if (!result.ok) return UNRESOLVED;
    const inner = notes.references.map((reference) => ({ reference, occurrence: use }));
    const deeper = { token, seen: [...seen, written], within: use };
    return resolveIn(resolving, deeper, result.value, inner, notes.readAgain);
}

function substitute(
    { outcomeOf, merged, report, recordMissing }: Resolving,
    token: MergedToken,
    { path, reference }: { path: string; reference: WrittenReference },
    expected: TokenType,
    use: Occurrence,
    element: boolean,
): unknown {
    const { span } = use;
    const shown = referenceText(reference);
    const target = outcomeOf(path, token.path, span);
    if (target === undefined) {
        if (merged.groups.has(path)) report("not-a-token", { ref: shown }, token.path, span);
        else recordMissing(reference, token.path, span);
        return UNRESOLVED;
    }
    if (target === "untyped" || !("resolved" in target)) return UNRESOLVED;
    if (target.type !== expected) {
        report("type-mismatch", { ref: shown, expected, found: target.type }, token.path, span);
        return UNRESOLVED;
    }
    if (!element) return target.resolved;
    const list = Array.isArray(target.resolved) ? target.resolved : [target.resolved];
    if (list.length !== 1) {
        report("reference-to-several", { ref: shown, count: list.length }, token.path, span);
        return UNRESOLVED;
    }
    return list[0];
}

function siblingsOf(again: ReadAgain, followed: [LocatedReference, unknown][]): Siblings {
    const parent = again.property.slice(0, -1);
    const siblings: Record<string, unknown> = { ...again.siblings };
    for (const [{ reference }, part] of followed) {
        const { property } = reference;
        const name = property.at(-1);
        const beside = property.length === again.property.length && startsWith(property, parent);
        if (beside && typeof name === "string") siblings[name] = part;
    }
    return siblings;
}

function replaced(value: unknown, property: JsonPath, part: unknown): unknown {
    const [step, ...rest] = property;
    if (step === undefined) return part;
    if (Array.isArray(value)) {
        return value.map((item, index) => (index === step ? replaced(item, rest, part) : item));
    }
    if (isJsonObject(value) && typeof step === "string") {
        return { ...value, [step]: replaced(value[step], rest, part) };
    }
    return value;
}

function startsWith(jsonPath: JsonPath, start: JsonPath): boolean {
    return start.length <= jsonPath.length && start.every((step, i) => jsonPath[i] === step);
}
