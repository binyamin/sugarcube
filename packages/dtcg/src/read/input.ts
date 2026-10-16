import type { Input, InputProblem } from "../index.js";

export interface Modifier {
    name: string;
    contexts: string[];
    default: string | undefined;
}

export type CheckedInput =
    | { ok: true; input: Input }
    | { ok: false; problems: [InputProblem, ...InputProblem[]] };

export function checkedInput(modifiers: Modifier[], raw: Record<string, unknown>): CheckedInput {
    if (modifiers.length === 0) return { ok: true, input: {} };
    const problems: InputProblem[] = [];
    const chosen: Input = {};
    const mentioned = new Set<Modifier>();

    for (const [key, value] of Object.entries(raw)) {
        const modifier = findByName(modifiers, key, ({ name }) => name);
        if (!modifier) {
            const valid = modifiers.map(({ name }) => name);
            problems.push({ reason: "unknown-modifier", modifier: key, valid });
            continue;
        }
        mentioned.add(modifier);
        if (typeof value !== "string") {
            problems.push({ reason: "not-a-string", modifier: modifier.name });
            continue;
        }
        const context = findByName(modifier.contexts, value, (each) => each);
        if (context === undefined) {
            const { name, contexts: valid } = modifier;
            problems.push({ reason: "unknown-context", modifier: name, context: value, valid });
            continue;
        }
        chosen[modifier.name] = context;
    }

    for (const modifier of modifiers) {
        if (mentioned.has(modifier) || modifier.default !== undefined) continue;
        const { name, contexts: valid } = modifier;
        problems.push({ reason: "missing-modifier", modifier: name, valid });
    }

    const [first, ...rest] = problems;
    return first
        ? { ok: false, problems: [first, ...rest] }
        : { ok: true, input: withDefaults(modifiers, chosen) };
}

export function withDefaults(modifiers: Modifier[], chosen: Input): Input {
    const input: Input = {};
    for (const { name, default: fallback } of modifiers) {
        const context = chosen[name] ?? fallback;
        if (context !== undefined) input[name] = context;
    }
    return input;
}

export function findByName<T>(
    candidates: T[],
    wanted: string,
    nameOf: (candidate: T) => string,
): T | undefined {
    const exact = candidates.find((candidate) => nameOf(candidate) === wanted);
    if (exact !== undefined) return exact;
    const folded = candidates.filter(
        (candidate) => nameOf(candidate).toLowerCase() === wanted.toLowerCase(),
    );
    return folded.length === 1 ? folded[0] : undefined;
}
