// A server that turns saved edits into a pull request. It checks that what the browser sent is
// edits, reads the files from GitHub as they are now, applies the edits, and opens the pull request.
import { open } from "@sugarcube-sh/dtcg";
import { changedFiles, isEdits } from "@sugarcube-sh/dtcg-edit";

declare const body: { edits: unknown; title: string };
declare function readFromGitHub(path: string): Promise<string>;

if (!isEdits(body.edits)) throw new Error("not edits");
const project = await open("tokens.resolver.json", { readText: readFromGitHub });
const changes = changedFiles(project, body.edits.ops);
if ("conflicts" in changes) {
    showConflicts(changes.conflicts);
} else {
    await openPullRequest(changes, {
        title: body.title,
        body: "Saved from Studio",
    });
}
