// A build command. If the tokens have errors, it prints each with its file, line and surrounding
// source, and stops. Otherwise it writes the CSS.
import { read } from "@sugarcube-sh/dtcg/node";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

declare function codeFrame(text: string, line: number, column: number, length: number): string;
declare function emitCSS(tokens: unknown): Promise<void>;

const entry = "tokens/tokens.resolver.json";
const tokens = await read(entry);
const problems = tokens.diagnostics.filter((d) => d.severity === "error");
if (problems.length) {
    for (const d of problems) {
        const where = d.span ? `${d.span.file}:${d.span.start.line}:${d.span.start.column}` : "";
        const frame = d.span
            ? codeFrame(
                  await readFile(join(dirname(entry), d.span.file), "utf8"),
                  d.span.start.line,
                  d.span.start.column,
                  d.span.length,
              )
            : "";
        showMessage(`${where}  ${d.message}\n${frame}\n  see ${d.docs}`);
    }
} else {
    await emitCSS(tokens);
}
