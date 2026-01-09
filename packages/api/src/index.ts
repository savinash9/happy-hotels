import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express, { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? 4000);
const apiKey = process.env.HOTEL_API_KEY;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const HOTEL_ENUM = ["City Hotel", "Resort Hotel"] as const;
const MEAL_ENUM = ["BB", "HB", "FB", "SC", ""] as const;
const MARKET_SEGMENT_ENUM = ["Corporate", "Direct", "Groups", "Online TA"] as const;
const CUSTOMER_TYPE_ENUM = ["Transient", "Contract", "Group", "Other"] as const;
const RESERVED_ROOM_ENUM = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const RES_STATUS_ENUM = ["Canceled", "Checked-In", "No-Show"] as const;

const bookingBaseSchema = z.object({
  hotel: z.enum(HOTEL_ENUM),
  lead_time: z.number().int().nonnegative(),
  arrival_date_year: z.number().int().min(2000),
  arrival_date_month: z.string().min(1),
  arrival_date_week_number: z.number().int().min(1).max(53),
  arrival_date_day_of_month: z.number().int().min(1).max(31),
  stays_in_weekend_nights: z.number().int().min(0),
  stays_in_week_nights: z.number().int().min(0),
  adults: z.number().int().min(0),
  children: z.number().int().min(0),
  babies: z.number().int().min(0),
  meal: z.enum(MEAL_ENUM),
  country: z.string().min(2).max(3),
  market_segment: z.enum(MARKET_SEGMENT_ENUM),
  is_repeated_guest: z.boolean(),
  reserved_room_type: z.enum(RESERVED_ROOM_ENUM),
  agent: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  customer_type: z.enum(CUSTOMER_TYPE_ENUM),
  adr: z.number(),
  required_car_parking_spaces: z.number().int().min(0),
  total_of_special_requests: z.number().int().min(0),
  reservation_status: z.enum(RES_STATUS_ENUM),
  reservation_status_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const bookingCreateSchema = bookingBaseSchema;
const bookingPatchSchema = bookingBaseSchema.partial();

const bookingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  hotel: z.enum(HOTEL_ENUM).optional(),
  year: z.coerce.number().int().optional(),
  month: z.string().optional(),
  country: z.string().optional(),
  status: z.enum(RES_STATUS_ENUM).optional()
});

const monthMap: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

function computeArrivalDate(year: number, month: string, day: number) {
  const normalized = month.trim().toLowerCase();
  const monthIndex = monthMap[normalized];
  if (monthIndex === undefined) {
    throw new Error(`Invalid month name: ${month}`);
  }
  return new Date(Date.UTC(year, monthIndex, day));
}

function sendError(res: Response, code: string, message: string, details: unknown[] = []) {
  return res.status(code === "NOT_FOUND" ? 404 : 400).json({
    error: {
      code,
      message,
      details
    }
  });
}

function apiKeyGuard(req: Request, res: Response, next: NextFunction) {
  if (!apiKey) {
    return next();
  }
  const header = req.header("x-api-key");
  if (header !== apiKey) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid API key",
        details: []
      }
    });
  }
  return next();
}

app.use("/api/v1", apiKeyGuard);

app.post("/api/v1/bookings", async (req, res, next) => {
  try {
    const payload = bookingCreateSchema.parse(req.body);
    const arrival_date = computeArrivalDate(
      payload.arrival_date_year,
      payload.arrival_date_month,
      payload.arrival_date_day_of_month
    );

    const booking = await prisma.booking.create({
      data: {
        ...payload,
        arrival_date,
        agent: payload.agent ?? null,
        company: payload.company ?? null
      }
    });

    return res.status(201).json({ data: booking });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/v1/bookings/:id", async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, deleted_at: null }
    });
    if (!booking) {
      return sendError(res, "NOT_FOUND", "Booking not found");
    }
    return res.json({ data: booking });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/v1/bookings", async (req, res, next) => {
  try {
    const query = bookingQuerySchema.parse(req.query);
    const where = {
      deleted_at: null,
      hotel: query.hotel,
      arrival_date_year: query.year,
      arrival_date_month: query.month,
      country: query.country,
      reservation_status: query.status
    };

    const [items, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        orderBy: { created_at: "desc" }
      }),
      prisma.booking.count({ where })
    ]);

    return res.json({
      data: items,
      pagination: {
        page: query.page,
        page_size: query.page_size,
        total
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.patch("/api/v1/bookings/:id", async (req, res, next) => {
  try {
    const patch = bookingPatchSchema.parse(req.body);
    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, deleted_at: null }
    });

    if (!existing) {
      return sendError(res, "NOT_FOUND", "Booking not found");
    }

    let arrival_date = existing.arrival_date;
    const year = patch.arrival_date_year ?? existing.arrival_date_year;
    const month = patch.arrival_date_month ?? existing.arrival_date_month;
    const day = patch.arrival_date_day_of_month ?? existing.arrival_date_day_of_month;
    if (
      patch.arrival_date_year !== undefined ||
      patch.arrival_date_month !== undefined ||
      patch.arrival_date_day_of_month !== undefined
    ) {
      arrival_date = computeArrivalDate(year, month, day);
    }

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: {
        ...patch,
        arrival_date,
        agent: patch.agent !== undefined ? patch.agent : existing.agent,
        company: patch.company !== undefined ? patch.company : existing.company
      }
    });

    return res.json({ data: booking });
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/v1/bookings/:id", async (req, res, next) => {
  try {
    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, deleted_at: null }
    });
    if (!existing) {
      return sendError(res, "NOT_FOUND", "Booking not found");
    }

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: { deleted_at: new Date() }
    });

    return res.json({ data: booking });
  } catch (error) {
    return next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload",
        details: error.flatten().fieldErrors
      }
    });
  }

  if (error instanceof Error && error.message.startsWith("Invalid month")) {
    return res.status(400).json({
      error: {
        code: "INVALID_MONTH",
        message: error.message,
        details: []
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unexpected error",
      details: []
    }
  });
});

app.listen(port, () => {
  console.log(`Happy Hotels API listening on http://localhost:${port}`);
});
