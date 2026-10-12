// A validate command for token files. The files are read as the design system they make: through
// the resolver among them, or the one token file. Several token files with no resolver are refused,
// with the reason, since only a resolver says how they combine. Every problem is printed.
import { readFromMemory } from "@sugarcube-sh/dtcg";
import { readFile } from "node:fs/promises";

declare const paths: string[];

const files = Object.fromEntries(
    await Promise.all(paths.map(async (p) => [p, await readFile(p, "utf8")] as const)),
);
try {
    const doc = readFromMemory({ files });
    for (const d of doc.diagnostics)
        showMessage(`${d.severity}  ${d.at?.file ?? ""}  ${d.message}`);
} catch (error) {
    if (!(error instanceof TypeError)) throw error;
    showMessage(error.message);
}
