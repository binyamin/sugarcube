import type { DesignSystem, PlaceInPermutations, Span } from "../index.js";

export function writtenAtIn(ds: DesignSystem, path: string): PlaceInPermutations[] {
    const found = new Map<Span, PlaceInPermutations>();
    for (const permutation of ds.permutations) {
        const places = [
            ...(permutation.token(path)?.writtenAt ?? []),
            ...(permutation.group(path)?.writtenAt ?? []),
        ];
        for (const { source, span } of places) {
            const known = found.get(span);
            if (!known) {
                found.set(span, { span, sources: [source], permutations: [permutation.input] });
                continue;
            }
            if (!known.sources.includes(source)) known.sources.push(source);
            if (!known.permutations.includes(permutation.input)) {
                known.permutations.push(permutation.input);
            }
        }
    }
    return [...found.values()];
}
