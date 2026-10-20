import type { JsonValue } from "@sugarcube-sh/dtcg";
import type { InputHTMLAttributes } from "react";
import { parsedJson } from "../controllers/typed-text";

export function JsonInput({
    text,
    onText,
    ...input
}: {
    text: string;
    onText(text: string, parsed: { value: JsonValue } | undefined): void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
    return (
        <>
            <input
                {...input}
                value={text}
                onChange={(event) => onText(event.target.value, parsedJson(event.target.value))}
            />
            {text !== "" && !parsedJson(text) && <span> Not valid JSON</span>}
        </>
    );
}
