import { type Input, permutationLabel } from "@sugarcube-sh/dtcg";
import type { Conflict, FileOp, Refusal } from "./index.js";

export const fixTitles = {
    useSimilar: (name: string) => `use \`${name}\`, which has a similar name`,
    deleteEarlier: (key: string) => `delete the earlier \`${key}\`, which is never used`,
    writePointer: (pointer: string) => `write it as \`${pointer}\``,
    deleteType: "delete this `$type`, so the token takes its group's type",
    extendsAsReference: (reference: string) => `write it as the reference \`${reference}\``,
    hexToObject: "write the color as an object, keeping the hex",
    measureAsObject: (type: string) => `write the ${type} as an object`,
    fullHex: (hex: string) =>
        `write the hex with ${hex.length === 9 ? "eight" : "six"} digits, \`${hex}\``,
    referenceAsPointer: (pointer: string) =>
        `write it as the pointer \`${pointer}\`, which can stand for part of a value`,
};

type Facts<T> = T extends unknown ? Omit<T, "reason"> : never;

type RefusalFacts = Facts<Refusal>;

const refusalReasons: {
    [K in Refusal["kind"]]: (facts: Extract<RefusalFacts, { kind: K }>) => string;
} = {
    "not-found": ({ path }) => `there is no token or group \`${path}\``,
    "generated": ({ path, from, extension }) => {
        const where = from === undefined ? "at the top of its file" : `on \`${from}\``;
        return `\`${path}\` is generated from \`${extension.join(".")}\` ${where}; change the extension instead`;
    },
    "not-a-group": ({ path }) => `\`${path}\` is a token, so nothing can be made inside it`,
    "taken": ({ path }) => `\`${path}\` already exists`,
    "override-instead": ({ path, context }) =>
        `\`${path}\` already exists for every context; to give ${named(context)} its own value, change it for that context`,
    "invalid-name": ({ name, character }) =>
        character === undefined
            ? "a name can't be empty: no path reaches it"
            : `\`${name}\` can't be a name: ${character === "$" ? "a leading `$` marks a property" : `\`${character}\` is used by references`}`,
    "inherited": ({ path, from }) =>
        `\`${path}\` comes from \`${from}\` through \`$extends\`; change it there`,
    "no-permutation": ({ context, why }) =>
        `there is no permutation for ${named(context)}: ${permutationGaps[why]}`,
    "several-contexts": ({ context }) =>
        `an override for ${named(context)} at once can't be written: no file is read by that combination alone`,
    "no-file-for-context": ({ path, context }) =>
        `\`${path}\` can't be written for ${named(context)}: it reads no whole file of its own to hold it`,
    "no-shared-file": ({ path }) =>
        `\`${path}\` can't be written for every permutation: no whole file they all read can hold it`,
    "hidden-by-later-file": ({ path, context, file }) =>
        `\`${path}\` can't be overridden for ${named(context)}: \`${file}\` is read after its files, so it would still win`,
    "no-shared-value": ({ path }) =>
        `no file every permutation reads writes \`${path}\`, only contexts do; change it for one context`,
};

const permutationGaps = {
    "unknown-modifier": "the resolver doesn't declare that modifier",
    "unknown-context": "the resolver doesn't declare that context",
    "no-default": "a modifier with no default was left out",
    "not-read": "the read didn't build it",
};

export function refused(facts: RefusalFacts): { refused: Refusal } {
    const reason = (refusalReasons[facts.kind] as (facts: RefusalFacts) => string)(facts);
    return { refused: { ...facts, reason } as Refusal };
}

export function conflict(op: FileOp, kind: Conflict["kind"]): Conflict {
    return { op, kind, reason: conflictReason(op, kind) };
}

function conflictReason(op: FileOp, kind: Conflict["kind"]): string {
    const place =
        "jsonPath" in op ? `\`${op.jsonPath.join(".")}\` in \`${op.file}\`` : `\`${op.file}\``;
    switch (kind) {
        case "not-read":
            return op.kind === "createFile"
                ? `nothing reads \`${op.file}\`, so it would be lost`
                : `\`${op.file}\` is not one of the files read`;
        case "gone":
            return `${place} is no longer there`;
        case "changed":
            return `${place} has changed since the edit was made`;
        case "taken":
            return op.kind === "renameKey"
                ? `${place} can't be renamed: a sibling is already called \`${op.name}\``
                : `${place} already holds something else`;
        case "not-a-group":
            return `${place} runs through something that is not a group, or past the end of a list`;
    }
}

function named(context: Input): string {
    return `\`${permutationLabel(context)}\``;
}
