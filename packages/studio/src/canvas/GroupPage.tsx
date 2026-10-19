import { NavLink } from "react-router";
import { hrefFor } from "../app/token-path";
import type { Group } from "@sugarcube-sh/dtcg";
import { groupView } from "../controllers/views";
import { Showing } from "./Showing";
import { AsCSS, Written } from "./Value";

export function GroupPage({ group }: { group: Group }) {
    const view = groupView(group);

    return (
        <article>
            <h1>{view.path}</h1>
            {view.description && <p>{view.description}</p>}
            <Showing />

            {view.groups.length > 0 && (
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Group</th>
                            <th scope="col">Tokens</th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.groups.map((row) => (
                            <tr key={row.path}>
                                <th scope="row">
                                    <NavLink to={hrefFor(row.path)} end>
                                        {row.name}
                                    </NavLink>
                                </th>
                                <td>{row.count}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {view.tokens.length === 0 ? (
                <p>
                    {view.groups.length > 0
                        ? "No tokens directly in this group."
                        : "This group has no tokens."}
                </p>
            ) : (
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Token</th>
                            <th scope="col">Value</th>
                            <th scope="col">CSS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.tokens.map((row) => (
                            <tr key={row.path}>
                                <th scope="row">
                                    <NavLink to={hrefFor(row.path)} end>
                                        {row.name}
                                    </NavLink>
                                </th>
                                <td>
                                    <Written value={row.written} />
                                </td>
                                <td>
                                    <AsCSS type={row.type} css={row.css} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </article>
    );
}
