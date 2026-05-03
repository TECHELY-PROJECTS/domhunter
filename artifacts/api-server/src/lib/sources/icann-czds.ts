export async function getICANNAuthToken(
  username: string,
  password: string,
): Promise<string> {
  const res = await fetch("https://account.icann.org/api/authenticate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ICANN auth failed: ${res.status}`);
  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}

export async function downloadComZoneFile(
  token: string,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(
    "https://czds-api.icann.org/czds/downloads/com.zone",
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new Error(`Zone file download failed: ${res.status}`);
  return res.body!;
}

export async function* parseZoneFile(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4 && parts[3] === "NS") {
        const domain = parts[0].toLowerCase().replace(/\.$/, "");
        if (domain && !domain.includes(".") && domain.length > 0) {
          yield `${domain}.com`;
        }
      }
    }
  }
}
