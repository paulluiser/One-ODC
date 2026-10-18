/** Exact public origins only; never trust arbitrary forwarded host headers. */
export function validProductivityOrigin(
  origin: string | null,
  requestUrl: string,
  config: {
    appUrl?: string;
    vercelUrl?: string;
    branchUrl?: string;
    productionUrl?: string;
    vercel?: boolean;
    fetchSite?: string | null;
  },
) {
  if (!origin || config.fetchSite === "cross-site") return false;
  const allowed = new Set<string>();
  for (const value of [
    config.appUrl,
    ...[config.vercelUrl, config.branchUrl, config.productionUrl]
      .filter(Boolean)
      .map((v) => `https://${v}`),
  ]) {
    if (!value) continue;
    try {
      const u = new URL(value);
      if (["https:", "http:"].includes(u.protocol)) allowed.add(u.origin);
    } catch {
      /* Invalid configuration cannot grant access. */
    }
  }
  try {
    const candidate = new URL(origin);
    if (candidate.origin !== origin || candidate.username || candidate.password)
      return false;
    if (!config.vercel) {
      const request = new URL(requestUrl);
      if (
        ["localhost", "127.0.0.1", "[::1]"].includes(request.hostname) &&
        request.protocol === "http:"
      ) {
        for (const host of ["localhost", "127.0.0.1", "[::1]"])
          allowed.add(
            `http://${host}${request.port ? `:${request.port}` : ""}`,
          );
      }
    }
    return allowed.has(origin);
  } catch {
    return false;
  }
}
