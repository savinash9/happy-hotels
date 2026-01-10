import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

type FetchType = typeof fetch;

async function run() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(serverTransport);

  const client = new Client({
    name: "happy-hotels-mcp-smoke",
    version: "0.1.0"
  });

  await client.connect(clientTransport);

  const originalFetch: FetchType | undefined = globalThis.fetch;
  globalThis.fetch = async () => {
    const body = JSON.stringify({ data: { id: "smoke" } });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const list = await client.listTools();
    const toolNames = list.tools.map((tool) => tool.name);
    if (!toolNames.includes("get_booking")) {
      throw new Error("tools/list did not include get_booking");
    }

    const callResult = await client.callTool({
      name: "get_booking",
      arguments: { id: "smoke" }
    });

    const [first] = callResult.content;
    if (!first || first.type !== "text") {
      throw new Error("tools/call returned unexpected content");
    }

    const parsed = JSON.parse(first.text);
    if (parsed?.id !== "smoke") {
      throw new Error("tools/call returned unexpected payload");
    }
  } finally {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      // Clean up for older runtimes that didn't have fetch by default.
      delete (globalThis as { fetch?: FetchType }).fetch;
    }
    await client.close();
    await server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
