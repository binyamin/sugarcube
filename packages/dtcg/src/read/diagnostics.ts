import { diagnosticMessages } from "../error-messages.js";
import type {
    Diagnostic,
    DiagnosticDetailByKind,
    DiagnosticKind,
    Input,
    Permutations,
} from "../index.js";
import { sameJson } from "../values/same-value.js";
import type { Building } from "./building.js";

const FOUND_IN = Symbol("found in");

type Finding = Building<Diagnostic> & { [FOUND_IN]?: Input[] };

export type DiagnosticExtra = Partial<
    Pick<Diagnostic, "message" | "span" | "path" | "related" | "tags">
> & {
    permutation?: Input;
};

export function diagnostic<K extends DiagnosticKind>(
    kind: K,
    detail: DiagnosticDetailByKind[K],
    { permutation, ...extra }: DiagnosticExtra = {},
): Diagnostic {
    const { severity, message } = diagnosticMessages[kind];
    const made = {
        kind,
        severity: typeof severity === "function" ? severity(detail) : severity,
        message: message(detail),
        ...extra,
        docs: docsFor(kind, detail),
        detail,
    } as Finding;
    if (permutation !== undefined) made[FOUND_IN] = [permutation];
    return made;
}

function docsFor<K extends DiagnosticKind>(kind: K, detail: DiagnosticDetailByKind[K]): string {
    const page = `https://sugarcube.sh/errors/${kind}`;
    if (kind !== "invalid-value") return page;
    return `${page}#${(detail as DiagnosticDetailByKind["invalid-value"]).reason}`;
}

export class Problems {
    readonly #all: Finding[] = [];
    readonly #atSpot = new Map<string, Finding[]>();

    found(problem: Diagnostic): Diagnostic {
        const spot = spotOf(problem);
        const here = this.#atSpot.get(spot);
        const same = here?.find((each) => sameJson(each, problem));
        if (same) {
            for (const input of (problem as Finding)[FOUND_IN] ?? [])
                foundInPermutation(same, input);
            return same;
        }
        if (here) here.push(problem);
        else this.#atSpot.set(spot, [problem]);
        this.#all.push(problem);
        return problem;
    }

    foundAll(problems: readonly Diagnostic[]): Diagnostic[] {
        return problems.map((each) => this.found(each));
    }

    inPermutations(permutations: Permutations): Diagnostic[] {
        for (const found of this.#all) {
            const inputs = found[FOUND_IN] ?? [];
            delete found[FOUND_IN];
            found.permutations = permutations.where(({ input }) => inputs.includes(input));
        }
        return this.#all;
    }

    get list(): readonly Diagnostic[] {
        return this.#all;
    }
}

function spotOf({ span }: Diagnostic): string {
    return span === undefined ? "" : `${span.file}:${span.offset}:${span.length}`;
}

export function inReadingPermutations(
    diagnostics: Building<Diagnostic>[],
    permutations: Permutations,
    entry: string,
): Diagnostic[] {
    for (const found of diagnostics) {
        found.permutations ??= permutationsWith(found, permutations, entry);
    }
    return diagnostics;
}

function permutationsWith(
    found: Diagnostic,
    permutations: Permutations,
    entry: string,
): Permutations {
    const file = found.span?.file;
    if (file === undefined || file === entry) return permutations;
    return permutations.where(({ sources }) => sources.some((each) => each.file === file));
}

export function foundInPermutation(found: Diagnostic, permutation: Input): void {
    const finding = found as Finding;
    const inputs = finding[FOUND_IN];
    if (!inputs) finding[FOUND_IN] = [permutation];
    else if (!inputs.includes(permutation)) inputs.push(permutation);
}
