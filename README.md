<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agentic-inbox)

2. **Configure Cloudflare Access** -- Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under Settings > Domains & Routes. The modal will show your `POLICY_AUD` and `TEAM_DOMAIN` values. `TEAM_DOMAIN` can be either your Access team URL or the full `.../cdn-cgi/access/certs` URL. **You must set these as `vars` in `wrangler.jsonc` for your Worker.** They are public identifiers, not secrets: the worker verifies the Access JWT's signature against the public JWKS (`workers/app.ts`), and both values are matching parameters rather than signing material -- your team domain is visible in every Access login redirect, and the audience tag is embedded in every issued token.
3. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
4. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
5. **Create a mailbox** -- Visit your deployed app and create a mailbox for any address on your domain (e.g. `hello@example.com`)

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means the `POLICY_AUD` or `TEAM_DOMAIN` vars are incorrect.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then reset your Worker's `POLICY_AUD` and `TEAM_DOMAIN` vars to the latest values shown there.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker vars from the modal values.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation (required outside local development)

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

### Mail configuration as code

Domains, mailboxes, and per-email routing/action rules are declared in
[`workers/config/inbox.config.ts`](workers/config/inbox.config.ts), validated
against a Zod schema ([`workers/config/schema.ts`](workers/config/schema.ts))
at Worker startup. A malformed config throws immediately at import time
instead of silently no-op'ing at request time.

```ts
// workers/config/inbox.config.ts
const rawConfig = {
  domains: ["example.com"],

  // Restrict mailbox creation to a known set (empty list = unrestricted,
  // same as today's behavior).
  mailboxes: [{ address: "hello@example.com", name: "Hello" }],

  rules: [
    // Forward every email sent to support@ on to a teammate. The
    // destination must be a verified address in Cloudflare Email Routing
    // (Email Routing > Destination addresses) — if it isn't, the forward
    // fails explicitly (logged + recorded) rather than dropping the mail;
    // the original email is always kept in the mailbox either way.
    {
      name: "forward-support-to-duyet",
      match: { to: "support@example.com" },
      actions: [{ type: "forward", to: "duyet@example.com" }],
    },

    // File a GitHub issue for anything with "[bug]" in the subject.
    // Requires the GITHUB_TOKEN secret (see below) — never put a token in
    // this file. Idempotent: a retried/duplicated inbound delivery of the
    // same email will not open a second issue.
    {
      name: "file-bug-reports-as-issues",
      match: { subject: "^\\[bug\\]" },
      actions: [
        {
          type: "github_issue",
          repo: "your-org/your-repo",
          labels: ["bug", "from-email"],
        },
      ],
    },
  ],
};
```

A rule's `match` can combine `to` (exact recipient), `from` (case-insensitive
substring on the sender address), and `subject` (case-insensitive regex) —
every condition present on a rule must hold for it to match. Every matching
rule's `actions` run (see [`workers/lib/actions/`](workers/lib/actions/)); a
new action type only needs a schema entry in `schema.ts`, a handler module in
`workers/lib/actions/`, and one line in `workers/lib/actions/index.ts`'s
dispatcher table — nothing else changes.

The `github_issue` action needs a GitHub token with `repo` scope, set as a
real Worker secret — **never** in the config file:

```bash
wrangler secret put GITHUB_TOKEN
```

For local dev, copy `.dev.vars.example` to `.dev.vars` and fill in
`GITHUB_TOKEN` there instead.

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

Any user who passes the shared Cloudflare Access policy can access all mailboxes in this app by design. This includes the MCP server at `/mcp` -- external AI tools (Claude Code, Cursor, etc.) connected via MCP can operate on any mailbox by passing a `mailboxId` parameter. There is no per-mailbox authorization; the Cloudflare Access policy is the single trust boundary.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
