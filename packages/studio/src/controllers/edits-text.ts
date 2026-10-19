import { type Edits, isEdits } from "@sugarcube-sh/dtcg-edit";

export async function encodeEdits(edits: Edits): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(edits));
    return base64url(await piped(bytes, new CompressionStream("gzip")));
}

export async function decodeEdits(text: string): Promise<Edits | undefined> {
    try {
        const bytes = await piped(fromBase64url(text), new DecompressionStream("gzip"));
        const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
        return isEdits(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

async function piped(bytes: Uint8Array, through: GenericTransformStream): Promise<Uint8Array> {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(through);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function base64url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/={1,2}$/, "");
}

function fromBase64url(text: string): Uint8Array {
    const padded = text
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(text.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}
