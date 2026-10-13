import type {
    Document,
    Group,
    Permutation,
    Reference,
    ReferenceInPermutations,
    ReferenceOptions,
    Span,
    Token,
} from "../index.js";
import { within } from "../path.js";
import { acrossPermutations } from "../read/reference.js";
import { group, token } from "./token.js";

interface WrittenIn {
    place: Map<Reference, number>;
    byPath: Map<string, Reference[]>;
}

const written = new WeakMap<Permutation, WrittenIn>();

export function referencedIn(
    permutation: Permutation,
    path: string,
    { chained = false }: ReferenceOptions = {},
): Reference[] {
    const { place, byPath } = writtenIn(permutation);
    const reaching = (each: string, isToken: boolean): Reference[] => {
        if (isToken) return byPath.get(each) ?? [];
        return [...byPath].flatMap(([named, references]) =>
            within(named, each) ? references : [],
        );
    };
    const first = reaching(path, token(permutation, path) !== undefined);
    const found = new Set<Reference>(first);
    const seen = new Set([path]);
    const waiting = chained ? [first] : [];
    for (const references of waiting) {
        for (const reference of references) {
            found.add(reference);
            const { from } = reference;
            if (seen.has(from.path)) continue;
            seen.add(from.path);
            waiting.push(reaching(from.path, from.kind === "token"));
        }
    }
    return [...found].sort((a, b) => (place.get(a) ?? 0) - (place.get(b) ?? 0));
}

export function referencedByIn(
    doc: Document,
    path: string,
    options?: ReferenceOptions,
): ReferenceInPermutations[] {
    return across(doc, (permutation) => referencedIn(permutation, path, options));
}

export function referencesIn(
    doc: Document,
    path: string,
    { chained = false }: ReferenceOptions = {},
): ReferenceInPermutations[] {
    return across(doc, (permutation) => {
        const start = token(permutation, path) ?? group(permutation, path);
        if (!start) return [];
        const found: Reference[] = [];
        const seen = new Set<Token | Group>([start]);
        const waiting: (Token | Group)[] = [start];
        for (const each of waiting) {
            for (const reference of each.references) {
                found.push(reference);
                const next =
                    reference.path === undefined ? undefined : token(permutation, reference.path);
                if (!chained || !next || seen.has(next)) continue;
                seen.add(next);
                waiting.push(next);
            }
        }
        return found;
    });
}

function writtenIn(permutation: Permutation): WrittenIn {
    const cached = written.get(permutation);
    if (cached) return cached;
    const place = new Map<Reference, number>();
    const byPath = new Map<string, Reference[]>();
    const visit = (items: (Token | Group)[]) => {
        for (const each of items) {
            for (const reference of each.references) {
                place.set(reference, place.size);
                if (reference.path === undefined) continue;
                const list = byPath.get(reference.path);
                if (list) list.push(reference);
                else byPath.set(reference.path, [reference]);
            }
            if (each.kind === "group") visit(each.children);
        }
    };
    visit(permutation.children);
    const built = { place, byPath };
    written.set(permutation, built);
    return built;
}

function across(
    doc: Document,
    inPermutation: (permutation: Permutation) => Reference[],
): ReferenceInPermutations[] {
    const merged = new Map<Span, ReferenceInPermutations>();
    for (const permutation of doc.permutations) {
        for (const reference of inPermutation(permutation)) {
            const found = merged.get(reference.span);
            if (!found)
                merged.set(reference.span, acrossPermutations(reference, permutation.input));
            else if (!found.permutations.includes(permutation.input)) {
                found.permutations.push(permutation.input);
            }
        }
    }
    return [...merged.values()];
}
