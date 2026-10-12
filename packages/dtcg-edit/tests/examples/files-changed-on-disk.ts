// The token files change on disk while the token editor has unsaved changes, because someone
// pulled new commits or edited a file in their code editor. The unsaved changes are put back on
// top of the new files. One to a token that also changed comes back as a clash, the token as you
// had it and as the files have it now, and the files' version is what shows.
import { open } from "@sugarcube-sh/dtcg";
import { type Session } from "@sugarcube-sh/dtcg-edit";

declare const session: Session;
declare function readText(path: string): Promise<string>;

export async function onFilesChanged(): Promise<void> {
    const clashes = session.adopt(await open("tokens.resolver.json", { readText }));
    for (const { path, yours, theirs } of clashes) showClash(path, yours, theirs);
}
