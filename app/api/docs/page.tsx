import { getBaseUrl } from "@/lib/api-docs-base-url";

const routes = [
  {
    method: "GET",
    path: "/api/health",
    description: "Service health check.",
    response: `{
  "ok": true,
  "database": "configured | mock",
  "mode": "neon-http | mock"
}`,
  },
  {
    method: "GET",
    path: "/api/sources",
    description: "List available governance data sources and their capabilities.",
    query: [
      { name: "—", type: "—", description: "No query parameters." },
    ],
    response: `{
  "data": [
    {
      "source": "snapshot",
      "label": "Snapshot",
      "syncedAt": "2024-01-01T00:00:00Z | null",
      "supports": {
        "protocols": true,
        "sourceObjects": true,
        "proposals": true,
        "votes": false,
        "execution": false,
        "translations": true,
        "bodySearch": true
      }
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/spaces",
    description: "List Snapshot governance spaces (DAOs / protocols).",
    query: [
      { name: "q", type: "string", description: "Search space name." },
      { name: "category", type: "string", description: "Filter by category (protocol, defi, gaming, service, social, defai, grant, rwa)." },
      { name: "verified", type: "boolean", description: "Filter verified only." },
      { name: "sort", type: "string", description: "'activity' (default) or 'followers'." },
      { name: "limit", type: "number", description: "Max results (default 200, max 200)." },
    ],
    response: `{
  "data": [
    {
      "id": "uniswapgovernance.eth",
      "name": "Uniswap",
      "about": "...",
      "avatar": "https://...",
      "verified": true,
      "website": "https://uniswap.org",
      "categories": ["DeFi"],
      "followersCount": 12345,
      "proposalCount": 234,
      "activeProposals": 3
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/spaces/[slug]",
    description: "Get a single space by its Snapshot slug (ENS name).",
    response: `{
  "data": { /* space object */ }
}`,
  },
  {
    method: "GET",
    path: "/api/spaces/[slug]/proposals",
    description: "List proposals for a specific space.",
    query: [
      { name: "q", type: "string", description: "Search proposal title." },
      { name: "status", type: "string", description: "Active, Upcoming, Closed, Executed, or All." },
      { name: "sort", type: "string", description: "'time' (default)." },
      { name: "limit", type: "number", description: "Max results (default 24, max 200)." },
      { name: "locale", type: "string", description: "Translation locale (en, zh, ja, ko)." },
    ],
    response: `{
  "data": [
    {
      "id": "0x...",
      "title": "Proposal Title",
      "state": "active",
      "endTs": 1700000000,
      "space": { "id": "aave.eth", "name": "Aave", "avatar": "..." }
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/proposals",
    description: "List Snapshot proposals across all spaces.",
    query: [
      { name: "q", type: "string", description: "Search proposal title." },
      { name: "status", type: "string", description: "Active, Upcoming, Closed, Executed, or All." },
      { name: "sort", type: "string", description: "'time' (default) or 'expiring' (soonest ending first)." },
      { name: "spaceSlug", type: "string", description: "Filter by space." },
      { name: "limit", type: "number", description: "Max results (default 24, max 200)." },
      { name: "locale", type: "string", description: "Translation locale (en, zh, ja, ko)." },
      { name: "translatedOnly", type: "boolean", description: "Only proposals with translations." },
    ],
    response: `{
  "data": [
    {
      "id": "0x...",
      "title": "...",
      "state": "active",
      "endTs": 1700000000,
      "scoresTotal": 1000000,
      "votesCount": 500,
      "space": { "id": "aave.eth", "name": "Aave", "avatar": "..." },
      "translation": { "title": "...", "summary": "..." }
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/api/proposals/[id]",
    description: "Get a single proposal with full detail.",
    query: [
      { name: "locale", type: "string", description: "Translation locale overlay." },
    ],
    response: `{
  "data": { /* full proposal detail */ }
}`,
  },
  {
    method: "GET",
    path: "/api/proposals/[id]/translations",
    description: "Get AI translations for a proposal.",
    query: [
      { name: "locale", type: "string", description: "Single locale (returns single translation)." },
      { name: "locale", type: "string[]", description: "Multiple &locale= params (returns list)." },
    ],
    response: `{
  "data": { /* single translation or array */ }
}`,
  },
  {
    method: "GET",
    path: "/api/protocols",
    description: "List canonical governance protocols (aggregate across sources).",
    query: [
      { name: "q", type: "string", description: "Search protocol name or aliases." },
      { name: "source", type: "string", description: "'snapshot', 'tally', or 'all'." },
      { name: "limit", type: "number", description: "Page size (default 50, max 200)." },
    ],
    response: `{
  "protocols": [...],
  "total": 42
}`,
  },
  {
    method: "GET",
    path: "/api/protocols/[id]/sources",
    description: "Get source refs (Snapshot space / Tally organization) for a protocol.",
    response: `{
  "protocol": { "id": "uniswap", "slug": "uniswap", "name": "Uniswap" },
  "sources": [...]
}`,
  },
  {
    method: "GET",
    path: "/api/protocols/[id]/proposals",
    description: "Get proposals for a protocol (aggregated across its sources).",
    query: [
      { name: "q", type: "string", description: "Search proposal title/body." },
      { name: "source", type: "string", description: "'snapshot', 'tally', or 'all'." },
      { name: "statusGroup", type: "string", description: "Upcoming, Active, Closed, Executed, All." },
      { name: "sort", type: "string", description: "'time', 'heat', 'votes', 'endingSoon'." },
      { name: "limit", type: "number", description: "Page size (default 50, max 200)." },
    ],
    response: `{
  "proposals": [...],
  "total": 12
}`,
  },
];

const baseCdnUrl = "https://undertide.xyz";
const baseUrl = getBaseUrl();

export default async function ApiDocsPage() {
  return (
    <html lang="en">
      <head>
        <title>UnderTide Public API</title>
        <meta name="description" content="UnderTide — AI-Native Web3 Governance Context API" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0b; color: #e4e4e7; line-height: 1.6; }
          .container { max-width: 920px; margin: 0 auto; padding: 2rem 1.5rem 6rem; }
          h1 { font-size: 1.8rem; font-weight: 700; margin-bottom: 0.25rem; color: #fafafa; }
          .subtitle { font-size: 0.95rem; color: #a1a1aa; margin-bottom: 2rem; }
          .base-url { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; background: #18181b; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 2.5rem; word-break: break-all; }
          .base-url code { color: #a78bfa; }
          h2 { font-size: 1.2rem; font-weight: 600; margin-top: 2.5rem; margin-bottom: 0.75rem; color: #fafafa; border-bottom: 1px solid #27272a; padding-bottom: 0.5rem; }
          .endpoint { margin-bottom: 1.5rem; border: 1px solid #27272a; border-radius: 10px; background: #141416; overflow: hidden; }
          .endpoint-header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: #1a1a1d; border-bottom: 1px solid #27272a; }
          .method { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.05em; }
          .method.get { background: #1a3a2a; color: #4ade80; }
          .path { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; color: #d4d4d8; }
          .desc { font-size: 0.85rem; color: #a1a1aa; }
          .endpoint-body { padding: 0.75rem 1rem 1rem; }
          .params-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin-bottom: 0.5rem; margin-top: 0.5rem; }
          table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 0.75rem; }
          th { text-align: left; padding: 0.4rem 0.5rem; color: #a1a1aa; font-weight: 500; border-bottom: 1px solid #27272a; }
          td { padding: 0.4rem 0.5rem; border-bottom: 1px solid #1f1f23; }
          td.name { font-family: 'SF Mono', 'Fira Code', monospace; color: #c4b5fd; }
          td.type { font-family: 'SF Mono', 'Fira Code', monospace; color: #6ee7b7; }
          pre { background: #0e0e10; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.75rem; overflow-x: auto; border: 1px solid #1f1f23; color: #d4d4d8; }
          .footer { margin-top: 3rem; font-size: 0.8rem; color: #71717a; text-align: center; }
          a { color: #a78bfa; text-decoration: none; }
          a:hover { text-decoration: underline; }
          .note { font-size: 0.8rem; background: #1e1b2e; border: 1px solid #2d2a3e; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; color: #c4b5fd; }
        `}</style>
      </head>
      <body>
        <div className="container">
          <h1>UnderTide API</h1>
          <p className="subtitle">AI-Native Web3 Governance Context — open read API, no key required.</p>

          <div className="note">
            ⚡ All endpoints are CORS-enabled and free to use for read access.
            Rate limits apply per IP. <br />
            Responses are cached with <code>stale-while-revalidate</code> for reliability.
          </div>

          <div className="base-url">
            Base URL: <code>{baseUrl}</code>
          </div>

          {routes.map((route) => (
            <div key={route.path} className="endpoint">
              <div className="endpoint-header">
                <span className={`method ${route.method.toLowerCase()}`}>{route.method}</span>
                <span className="path">{route.path}</span>
              </div>
              <div className="endpoint-body">
                <p className="desc">{route.description}</p>
                {route.query && route.query[0]?.name !== "—" && (
                  <>
                    <p className="params-title">Query Parameters</p>
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {route.query.map((param) => (
                          <tr key={param.name}>
                            <td className="name">{param.name}</td>
                            <td className="type">{param.type}</td>
                            <td>{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                <p className="params-title">Response</p>
                <pre><code>{route.response}</code></pre>
              </div>
            </div>
          ))}

          <div className="footer">
            <p>
              Built by UnderTide —{' '}
              <a href="https://undertide.xyz" target="_blank" rel="noopener noreferrer">undertide.xyz</a> ·{' '}
              <a href="https://github.com/DeFiAlien/undertide-app-v2" target="_blank" rel="noopener noreferrer">GitHub</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
