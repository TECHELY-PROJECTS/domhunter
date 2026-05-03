export interface RDAPResult {
  domain: string;
  available: boolean;
  registrar?: string;
  createdDate?: Date;
  expiresDate?: Date;
  ageYears?: number;
}

export async function rdapLookup(domain: string): Promise<RDAPResult> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 404) {
      return { domain, available: true };
    }

    if (!res.ok) {
      return { domain, available: false };
    }

    const data = (await res.json()) as {
      events?: Array<{ eventAction: string; eventDate: string }>;
      entities?: Array<{
        roles?: string[];
        vcardArray?: [string, Array<[string, unknown, unknown, string]>];
      }>;
    };

    let createdDate: Date | undefined;
    let expiresDate: Date | undefined;
    let registrar: string | undefined;

    for (const event of data.events ?? []) {
      if (event.eventAction === "registration")
        createdDate = new Date(event.eventDate);
      if (event.eventAction === "expiration")
        expiresDate = new Date(event.eventDate);
    }

    for (const entity of data.entities ?? []) {
      if (entity.roles?.includes("registrar")) {
        const vcard = entity.vcardArray?.[1];
        registrar = vcard?.find((v) => v[0] === "fn")?.[3];
      }
    }

    const ageYears = createdDate
      ? Math.round(
          (Date.now() - createdDate.getTime()) / (365.25 * 24 * 3600 * 1000),
        )
      : undefined;

    return {
      domain,
      available: false,
      registrar,
      createdDate,
      expiresDate,
      ageYears,
    };
  } catch {
    return { domain, available: false };
  }
}

export async function rdapBatch(
  domains: string[],
  delayMs = 200,
): Promise<Map<string, RDAPResult>> {
  const results = new Map<string, RDAPResult>();
  for (const domain of domains) {
    results.set(domain, await rdapLookup(domain));
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}
