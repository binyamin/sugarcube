// Switches a set of colors from one palette to another, such as every button color from blue to
// violet. Each color keeps its step, so 500 stays 500, in every theme that sets it. The whole
// switch is one undo step: if any part is refused, nothing changes.
import { acrossPermutations, pathBelow, tokensIn, type Token } from "@sugarcube-sh/dtcg";
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

const doc = session.project.doc;
const changes: ({ path: string; value: Json } & ValueOptions)[] = [];
for (const t of tokensIn(doc, "color.button")) {
    const base = swapped(t);
    if (base) changes.push({ path: t.path, value: base });

    for (const { permutation, token } of acrossPermutations(doc, t.path)) {
        const value = token.writtenAt.at(-1)?.source.context ? swapped(token) : undefined;
        if (value) changes.push({ path: t.path, value, context: permutation.input });
    }
}

const done = session.do(setValues(session.project, changes));
if ("refused" in done) showMessage(done.refused.reason);
