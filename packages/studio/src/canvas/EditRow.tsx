import type { JsonValue, TokenType } from "@sugarcube-sh/dtcg";
import { type ValueOptions, setValue } from "@sugarcube-sh/dtcg-edit";
import { useStudio } from "../providers/studio-context";
import { TypedField } from "./TypedField";
import { useEdit } from "./use-edit";

export function EditRow({
    label,
    type,
    value,
    path,
    where,
}: {
    label: string | undefined;
    type: TokenType | undefined;
    value: JsonValue | undefined;
    path: string;
    where: ValueOptions;
}) {
    const studio = useStudio();
    const edit = useEdit();

    return (
        <>
            <dt>{label}</dt>
            <dd>
                <TypedField
                    type={type}
                    written={value}
                    label={label ?? path}
                    path={path}
                    onWrite={(next) => edit.run(setValue(studio.state.tokens, path, next, where))}
                />
                {edit.view}
            </dd>
        </>
    );
}
