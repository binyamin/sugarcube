// A script that renames the `color.brand` group to `color.primary`, updates every reference to the
// tokens inside it, and saves the result to disk in one go.
import { open } from "@sugarcube-sh/dtcg/node";
import { commit, rename } from "@sugarcube-sh/dtcg-edit";
import { applyToDisk } from "@sugarcube-sh/dtcg-edit/node";

const source = { entry: "tokens/tokens.resolver.json" };
const project = await open(source.entry);
const done = commit(project, rename(project, "color.brand", "primary"));
if ("project" in done) await applyToDisk(source, done.ops);
else if ("refused" in done) showMessage(done.refused.reason);
