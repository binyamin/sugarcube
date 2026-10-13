// Editing a token made by a generator, and a token inherited from another group. Each asks a question
// first: turn the step into an ordinary token, or override it here rather than in the original.
import { type DesignSystem } from "@sugarcube-sh/dtcg";
import { setValue, detach, commit } from "@sugarcube-sh/dtcg-edit";

declare let ds: DesignSystem;

const a = commit(ds, setValue(ds, "space.md", { value: 18, unit: "px" }));
if ("decision" in a && a.decision.kind === "generated") {
    const done = commit(ds, detach(ds, "space.md"));
    if ("ds" in done) ds = done.ds;
}

const b = commit(ds, setValue(ds, "primary.padding", "{space.lg}"));
if ("decision" in b && b.decision.kind === "inherited") {
    const done = commit(ds, setValue(ds, "primary.padding", "{space.lg}", { inherited: "here" }));
    if ("ds" in done) ds = done.ds;
}
