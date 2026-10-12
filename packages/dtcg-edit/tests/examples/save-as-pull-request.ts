// A server that turns saved edits into a pull request. It checks that what the browser sent is
// edits, reads the files from GitHub as they are now, applies the edits, and opens the pull request.
import { open } from "@sugarcube-sh/dtcg";
import { apply, changedFiles, isEdits } from "@sugarcube-sh/dtcg-edit";

declare const body: { edits: unknown; title: string };
declare function readFromGitHub(path: string): Promise<string>;

if (!isEdits(body.edits)) throw new Error("not edits");
const project = await open("tokens.resolver.json", { readText: readFromGitHub });
const next = apply(project, body.edits.ops);
if ("conflicts" in next) {
    showConflicts(next.conflicts);
} else {
    await openPullRequest(changedFiles(project, next), {
        title: body.title,
        body: "Saved from Studio",
    });
}
