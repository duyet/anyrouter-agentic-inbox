// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	/**
	 * Secret — set via `wrangler secret put GITHUB_TOKEN`, never in config
	 * or source. Only required if a rule in `workers/config/inbox.config.ts`
	 * uses the `github_issue` action.
	 */
	GITHUB_TOKEN?: string;
}
