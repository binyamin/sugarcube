import type { TokenType } from "@sugarcube-sh/dtcg";
import { setValue } from "@sugarcube-sh/dtcg-edit";
import type { ValueRow } from "../controllers/token-page";
import { useStudio } from "../providers/studio-context";
import { TypedField } from "./TypedField";
import { useEdit } from "./use-edit";

export function EditRow({
    row,
    type,
    path,
}: {
    row: ValueRow;
    type: TokenType | undefined;
    path: string;
}) {
    const studio = useStudio();
    const edit = useEdit();
    const label = row.unwritten ? `Override for ${row.label}` : row.label;

    return (
        <>
            <dt>{label}</dt>
            <dd>
                <TypedField
                    type={type}
                    written={row.value}
                    label={label ?? path}
                    path={path}
                    onWrite={(next, part) =>
                        edit.run(setValue(studio.state.tokens, path, next, { ...row.where, part }))
                    }
                />
                {edit.view}
            </dd>
        </>
    );
}
