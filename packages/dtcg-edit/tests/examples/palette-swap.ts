// Switches a set of colors from one palette to another, such as every button color from blue to
// violet. Each color keeps its step, so 500 stays 500, in every theme that sets it. The whole
// switch is one undo step: if any part is refused, nothing changes.
import { pathBelow, type Token } from "@sugarcube-sh/dtcg";
import { setValues, type Json, type Session, type ValueOptions } from "@sugarcube-sh/dtcg-edit";

declare const session: Session;

const oldPalette = "color.blue";
const newPalette = "color.violet";

const swap = [{ from: oldPalette, to: newPalette }];

function swapped(t: Token): Json | undefined {
    const whole = t.referenceAt();
    if (whole?.path === undefined || pathBelow(whole.path, oldPalette) === undefined)
        return undefined;
    return whole.moved(swap);
}

const tokens = session.tokens;
const changes: ({ path: string; value: Json } & ValueOptions)[] = [];
for (const t of tokens.permutation().group("color.button")?.tokens ?? []) {
    const base = swapped(t);
    if (base) changes.push({ path: t.path, value: base });

    for (const permutation of tokens.permutations) {
        const there = permutation.token(t.path);
        const value = there?.valueFrom.source.context ? swapped(there) : undefined;
        if (value) changes.push({ path: t.path, value, context: permutation.input });
    }
}

const done = session.do(setValues(session.tokens, changes));
if ("refused" in done) showMessage(done.refused.reason);
