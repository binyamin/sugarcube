import type { JsonValue } from "@sugarcube-sh/dtcg";
import { useState } from "react";
import { parsedJson } from "../controllers/token-page";

export function ValueField({
    shown,
    label,
    onWrite,
}: {
    shown: string;
    label: string;
    onWrite(value: JsonValue): void;
}) {
    const [text, setText] = useState(shown);
    const parsed = parsedJson(text);

    const write = () => {
        if (parsed && JSON.stringify(parsed.value) !== shown) onWrite(parsed.value);
    };

    return (
        <>
            <input
                aria-label={label}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onBlur={write}
                onKeyDown={(event) => {
                    if (event.key === "Enter") write();
                }}
            />
            {text !== "" && !parsed && <p>Not valid JSON</p>}
        </>
    );
}
