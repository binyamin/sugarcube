// A theme switcher on a docs site. It shows every color in whichever theme the reader picks,
// falling back to the default.
import { type DesignTokens } from "@sugarcube-sh/dtcg";

declare const tokens: DesignTokens;
declare const picked: string;

const theme = tokens.modifier("theme");
const themes = theme?.contexts.map(({ name }) => name) ?? [];
const current = tokens.permutation({
    theme: themes.includes(picked) ? picked : (theme?.default ?? ""),
});
for (const t of current?.tokens ?? []) {
    if (t.type === "color") row(t.path, t.resolved?.hex);
}
