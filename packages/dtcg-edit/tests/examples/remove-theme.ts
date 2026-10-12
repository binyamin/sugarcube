// Removes the dim theme, and deletes its file too if the person says yes. Only a file that no other
// theme uses can be deleted this way.
import { open } from "@sugarcube-sh/dtcg/node";
import { removeContext } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";

declare function confirm(question: string): Promise<boolean>;

const entry = "tokens/tokens.resolver.json";
const project = await open(entry);
const deleteFiles = await confirm("Also delete the files only the dim theme uses?");
const result = removeContext(project, "theme", "dim", { deleteFiles });
if ("ops" in result) {
    const saved = await applyToDisk(entry, result.ops, project.options);
    if ("conflicts" in saved) showConflicts(saved.conflicts);
}
