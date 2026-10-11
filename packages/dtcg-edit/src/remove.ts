import {
    type Document,
    type Project,
    type Span,
    group,
    referrers,
    tokensIn,
} from "@sugarcube-sh/dtcg";
import { refused } from "./error-messages.js";
import type { FileOp, OpResult, Refusal } from "./index.js";
import { having, placeOf, tokenCopies, unique } from "./placement.js";
import { valueAt } from "./text-edits.js";

/**
 * Removes a token or group from every file that writes it: the copy that wins, any copy an earlier
 * file writes that it replaces, and each context's own. Never refused for what refers to it: the
 * tokens left pointing at nothing are listed in `broken`.
 *
 * Refused, with the reason: a path that is neither a token nor a group, a token a generator makes,
 * or a token or group inherited through `$extends`.
 *
 * @example
 * const result = remove(project, "color.legacy");
 * if ("ops" in result && result.broken?.length) warn(result.broken);
 */
export function remove(project: Project, path: string): OpResult {
    const { doc } = project;
    const copies = tokenRemoval(doc, path) ?? groupCopies(doc, path);
    if ("refused" in copies) return copies;

    const ops = copies.spans.flatMap((span): FileOp[] => {
        const place = placeOf(project, span);
        const was = place && valueAt(project.files[span.file] ?? "", place.path);
        if (!place || was === undefined) return [];
        return [{ kind: "remove", file: span.file, path: place.path, was }];
    });
    const broken = referrers(doc, copies.inside).map((each) => each.path);
    return { ops, alsoAffects: having(doc, path), broken, moved: [] };
}

type Copies = { spans: Span[]; inside: string[] } | { refused: Refusal };

function tokenRemoval(doc: Document, path: string): Copies | undefined {
    const copies = tokenCopies(doc, path);
    return copies && ("refused" in copies ? copies : { spans: copies.spans, inside: [path] });
}

function groupCopies(doc: Document, path: string): Copies {
    const found = doc.permutations.flatMap((perm) => {
        const declared = group(perm, path);
        return declared ? [{ perm, declared }] : [];
    });
    const [first] = found;
    if (!first) return refused({ kind: "not-found", path });
    const { inherited } = first.declared;
    if (inherited) return refused({ kind: "inherited", path, from: inherited.from });
    const spans = found.flatMap(({ declared }) => declared.declaredIn);
    const inside = found.flatMap(({ perm }) => tokensIn(perm, path).map((each) => each.path));
    return { spans: unique(spans), inside: [...new Set(inside)] };
}
