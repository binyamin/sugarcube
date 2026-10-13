// Editing a token made by a generator, and a token inherited from another group. Each asks a question
// first: turn the step into an ordinary token, or override it here rather than in the original.
import { type DesignTokens } from "@sugarcube-sh/dtcg";
import { setValue, detach, commit } from "@sugarcube-sh/dtcg-edit";

declare let tokens: DesignTokens;

const a = commit(tokens, setValue(tokens, "space.md", { value: 18, unit: "px" }));
if ("decision" in a && a.decision.kind === "generated") {
    const done = commit(tokens, detach(tokens, "space.md"));
    if ("tokens" in done) tokens = done.tokens;
}

const b = commit(tokens, setValue(tokens, "primary.padding", "{space.lg}"));
if ("decision" in b && b.decision.kind === "inherited") {
    const done = commit(
        tokens,
        setValue(tokens, "primary.padding", "{space.lg}", { inherited: "here" }),
    );
    if ("tokens" in done) tokens = done.tokens;
}
