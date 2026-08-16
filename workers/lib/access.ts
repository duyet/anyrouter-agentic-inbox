/**
 * Cloudflare Access configuration parsing.
 *
 * Kept out of `workers/app.ts` so it is unit-testable: the Worker entry imports
 * `cloudflare:` modules that the default ESM loader cannot resolve under vitest.
 */

/**
 * Resolve the Access issuer + JWKS URL from `TEAM_DOMAIN`.
 *
 * Accepts all three forms the Cloudflare dashboard and our README hand out:
 *   - a bare team name        — `anyr`
 *   - the team URL            — `https://anyr.cloudflareaccess.com`
 *   - the full certs endpoint — `https://anyr.cloudflareaccess.com/cdn-cgi/access/certs`
 *
 * The bare form used to throw `TypeError: Invalid URL` out of `new URL()`. That
 * throw was caught by the JWT verification catch and reported as "Invalid or
 * expired Access token", so a config-shape problem masqueraded as a bad token
 * and every request 403'd regardless of the JWT. Parse defensively instead.
 */
export function getAccessUrls(teamDomain: string): {
	issuer: string;
	certsUrl: URL;
} {
	const certsPath = "/cdn-cgi/access/certs";
	const raw = teamDomain.trim();
	if (!raw) throw new Error("TEAM_DOMAIN is empty");

	// A bare team name has no scheme and no dot ("anyr"); a bare hostname has a
	// dot but still no scheme ("anyr.cloudflareaccess.com"). Normalize both.
	const normalized = /^https?:\/\//i.test(raw)
		? raw
		: `https://${raw.includes(".") ? raw : `${raw}.cloudflareaccess.com`}`;

	const teamUrl = new URL(normalized);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath)
		? teamUrl
		: new URL(certsPath, issuer);

	return { issuer, certsUrl };
}

/**
 * `POLICY_AUD` may list more than one AUD, comma-separated.
 *
 * A Worker can sit behind several Access applications at once — here a
 * self-hosted app on `mail.anyrouter.dev` and the one-click "Cloudflare
 * Workers" app bound to the Worker itself, each with its own AUD. Whichever app
 * matches first injects the JWT, so accepting a single AUD 403s whenever the
 * other one wins.
 */
export function parsePolicyAuds(policyAud: string): string[] {
	return policyAud
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean);
}
