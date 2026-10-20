import { type Edits, isEdits } from "@sugarcube-sh/dtcg-edit";

export type SaveRequest = {
    title: string;
    description: string;
    entry: string;
    edits: Edits;
};

type Checked = { request: SaveRequest } | { error: string };

export function checkRequest(body: unknown): Checked {
    const raw = body as Partial<Record<keyof SaveRequest, unknown>> | null;
    if (
        !raw ||
        typeof raw.title !== "string" ||
        !raw.title ||
        typeof raw.entry !== "string" ||
        !raw.entry
    ) {
        return { error: "Missing required fields: title, entry, edits" };
    }
    if (!isEdits(raw.edits)) return { error: "edits is not a session's edits" };
    if (raw.edits.steps.length === 0) return { error: "Nothing to save" };

    return {
        request: {
            title: raw.title,
            description: typeof raw.description === "string" ? raw.description : "",
            entry: raw.entry,
            edits: raw.edits,
        },
    };
}
