import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const baseUrl = process.env.HOTEL_API_BASE_URL ?? "http://localhost:4000/api/v1";
const apiKey = process.env.HOTEL_API_KEY;

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
};

async function requestJson<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (apiKey) {
    headers.set("x-api-key", apiKey);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers
  });

  const payload = (await response.json()) as T | ApiError;
  if (!response.ok) {
    const errorPayload = payload as ApiError;
    const error = new Error(errorPayload.error?.message ?? "API error");
    (error as Error & { details?: unknown }).details = errorPayload.error;
    throw error;
  }
  return payload as T;
}

export type Booking = Record<string, unknown>;

export async function createBooking(payload: Booking) {
  const result = await requestJson<{ data: Booking }>("/bookings", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return result.data;
}

export async function updateBooking(id: string, patch: Booking) {
  const result = await requestJson<{ data: Booking }>(`/bookings/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
  return result.data;
}

export async function getBooking(id: string) {
  const result = await requestJson<{ data: Booking }>(`/bookings/${id}`);
  return result.data;
}
