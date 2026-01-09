import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBooking, getBooking, updateBooking } from "./client.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const server = new Server(
  {
    name: "happy-hotels-mcp",
    version: "0.1.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const createBookingSchema = z.object({
  payload: z.record(z.unknown())
});

const updateBookingSchema = z.object({
  id: z.string(),
  patch: z.record(z.unknown())
});

const getBookingSchema = z.object({
  id: z.string()
});

server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "create_booking",
        description: "Create a hotel booking",
        inputSchema: {
          type: "object",
          properties: {
            payload: { type: "object" }
          },
          required: ["payload"]
        }
      },
      {
        name: "update_booking",
        description: "Update a hotel booking",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            patch: { type: "object" }
          },
          required: ["id", "patch"]
        }
      },
      {
        name: "get_booking",
        description: "Fetch a hotel booking",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        }
      }
    ]
  };
});

server.setRequestHandler("tools/call", async (request) => {
  try {
    if (request.params.name === "create_booking") {
      const input = createBookingSchema.parse(request.params.arguments);
      const booking = await createBooking(input.payload);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(booking, null, 2)
          }
        ]
      };
    }

    if (request.params.name === "update_booking") {
      const input = updateBookingSchema.parse(request.params.arguments);
      const booking = await updateBooking(input.id, input.patch);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(booking, null, 2)
          }
        ]
      };
    }

    if (request.params.name === "get_booking") {
      const input = getBookingSchema.parse(request.params.arguments);
      const booking = await getBooking(input.id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(booking, null, 2)
          }
        ]
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            message,
            details: error instanceof Error ? (error as Error & { details?: unknown }).details : undefined
          })
        }
      ]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
