import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createBooking, getBooking, updateBooking } from "@happy-hotels/mcp/client";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolTrace = {
  name: string;
  payload: unknown;
  result?: unknown;
  error?: string;
};

const REQUIRED_FIELDS = [
  "hotel",
  "lead_time",
  "arrival_date_year",
  "arrival_date_month",
  "arrival_date_week_number",
  "arrival_date_day_of_month",
  "stays_in_weekend_nights",
  "stays_in_week_nights",
  "adults",
  "children",
  "babies",
  "meal",
  "country",
  "market_segment",
  "is_repeated_guest",
  "reserved_room_type",
  "customer_type",
  "adr",
  "required_car_parking_spaces",
  "total_of_special_requests",
  "reservation_status",
  "reservation_status_date"
];

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

const NUMBER_FIELDS = new Set([
  "lead_time",
  "arrival_date_year",
  "arrival_date_week_number",
  "arrival_date_day_of_month",
  "stays_in_weekend_nights",
  "stays_in_week_nights",
  "adults",
  "children",
  "babies",
  "adr",
  "required_car_parking_spaces",
  "total_of_special_requests"
]);

const BOOLEAN_FIELDS = new Set(["is_repeated_guest"]);

const FIELD_LABELS: Record<string, string> = {
  hotel: "hotel (City Hotel or Resort Hotel)",
  lead_time: "lead time (days before arrival)",
  arrival_date_year: "arrival year (YYYY)",
  arrival_date_month: "arrival month (full name, e.g. January)",
  arrival_date_week_number: "arrival week number (1-53)",
  arrival_date_day_of_month: "arrival day of month (1-31)",
  stays_in_weekend_nights: "weekend nights",
  stays_in_week_nights: "week nights",
  adults: "number of adults",
  children: "number of children",
  babies: "number of babies",
  meal: "meal plan (BB, HB, FB, SC, or empty)",
  country: "country code (2-3 letters)",
  market_segment: "market segment (Corporate, Direct, Groups, Online TA)",
  is_repeated_guest: "repeat guest (true/false)",
  reserved_room_type: "room type (A-H)",
  customer_type: "customer type (Transient, Contract, Group, Other)",
  adr: "average daily rate (ADR)",
  required_car_parking_spaces: "required parking spaces",
  total_of_special_requests: "total special requests",
  reservation_status: "reservation status (Checked-In, Canceled, No-Show)",
  reservation_status_date: "reservation status date (YYYY-MM-DD)"
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_booking",
      description: "Create a hotel booking",
      parameters: {
        type: "object",
        properties: {
          payload: { type: "object" }
        },
        required: ["payload"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_booking",
      description: "Update a hotel booking",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          patch: { type: "object" }
        },
        required: ["id", "patch"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_booking",
      description: "Get a booking",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" }
        },
        required: ["id"]
      }
    }
  }
];

function buildSystemPrompt(booking: Record<string, unknown> | null) {
  return `You are the Happy Hotels SKO 2027 booking concierge.\n\nRules:\n- Build a draft booking object from the conversation.\n- Ask only for missing required fields.\n- Before creating or updating, present a confirmation summary and wait for the user to say "confirm".\n- Respond ONLY in JSON with keys: message, draft, missing_fields, ready_to_confirm.\n\nCurrent draft: ${JSON.stringify(booking ?? {}, null, 2)}\n\nRequired fields: ${REQUIRED_FIELDS.join(", ")}`;
}

function extractJson(content: string) {
  try {
    return JSON.parse(content) as {
      message?: string;
      draft?: Record<string, unknown>;
      missing_fields?: string[];
      ready_to_confirm?: boolean;
    };
  } catch {
    return { message: content };
  }
}

function getMissingFields(draft: Record<string, unknown> | null) {
  const data = draft ?? {};
  return REQUIRED_FIELDS.filter((field) => {
    const value = data[field];
    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim() === "") return true;
    if (NUMBER_FIELDS.has(field) && typeof value !== "number") return true;
    if (BOOLEAN_FIELDS.has(field) && typeof value !== "boolean") return true;
    if (field === "arrival_date_month" && typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!MONTH_NAMES.includes(normalized)) return true;
    }
    return false;
  });
}

function buildMissingMessage(missingFields: string[], booking: Record<string, unknown> | null) {
  const prefix = booking?.hotel
    ? `I can start a ${booking.hotel} booking.`
    : "I can start your booking.";
  const lines = missingFields.map((field) => `- ${FIELD_LABELS[field] ?? field}`);
  return `${prefix} To complete it, please provide:\n${lines.join("\n")}`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    messages: ChatMessage[];
    booking?: Record<string, unknown> | null;
  };

  const toolTrace: ToolTrace[] = [];
  const latestUser = body.messages.at(-1)?.content ?? "";
  const confirmed = latestUser.toLowerCase().includes("confirm");

  const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(body.booking ?? null) },
    ...body.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];

  let conversation = [...baseMessages];
  let booking = body.booking ?? null;
  const missingBefore = getMissingFields(booking);

  if (confirmed && booking && missingBefore.length === 0) {
    try {
      let result: unknown;
      if (typeof booking.id === "string") {
        const { id, ...patch } = booking;
        result = await updateBooking(id, patch);
        toolTrace.push({ name: "update_booking", payload: { id, patch }, result });
      } else {
        result = await createBooking(booking);
        toolTrace.push({ name: "create_booking", payload: { payload: booking }, result });
      }

      if (result && typeof result === "object") {
        booking = result as Record<string, unknown>;
      }

      return NextResponse.json({
        message: "Your booking has been confirmed.",
        booking,
        toolTrace
      });
    } catch (error) {
      toolTrace.push({
        name: typeof booking.id === "string" ? "update_booking" : "create_booking",
        payload: booking,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      return NextResponse.json({
        message: "I couldn't finalize the booking. Please try again.",
        booking,
        toolTrace
      });
    }
  }

  for (let i = 0; i < 2; i += 1) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: conversation,
      tools,
      tool_choice: "auto",
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const choice = completion.choices[0];
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}") as Record<
          string,
          unknown
        >;

        if (!confirmed && ["create_booking", "update_booking"].includes(toolCall.function.name)) {
          return NextResponse.json({
            message: "I have the booking summary ready. Please say confirm to proceed.",
            booking,
            toolTrace
          });
        }

        try {
          let result: unknown;
          if (toolCall.function.name === "create_booking") {
            result = await createBooking(args.payload as Record<string, unknown>);
          } else if (toolCall.function.name === "update_booking") {
            result = await updateBooking(args.id as string, args.patch as Record<string, unknown>);
          } else if (toolCall.function.name === "get_booking") {
            result = await getBooking(args.id as string);
          }

          toolTrace.push({
            name: toolCall.function.name,
            payload: args,
            result
          });

          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result ?? {})
          });

          if (result && typeof result === "object") {
            booking = result as Record<string, unknown>;
          }
        } catch (error) {
          toolTrace.push({
            name: toolCall.function.name,
            payload: args,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
      continue;
    }

    const content = choice.message.content ?? "";
    const parsed = extractJson(content);
    if (parsed.draft && typeof parsed.draft === "object") {
      booking = { ...(booking ?? {}), ...parsed.draft };
    }
    const missingFields = parsed.missing_fields?.length
      ? parsed.missing_fields
      : getMissingFields(booking);

    return NextResponse.json({
      message: missingFields.length > 0
        ? buildMissingMessage(missingFields, booking)
        : parsed.message ?? "",
      booking,
      toolTrace
    });
  }

  return NextResponse.json({
    message: "Let's continue the booking details.",
    booking,
    toolTrace
  });
}
