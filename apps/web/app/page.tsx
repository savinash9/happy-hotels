"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./page.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ToolTrace = {
  name: string;
  payload: unknown;
  result?: unknown;
};

type Booking = {
  id?: string;
  hotel?: string;
  arrival_date?: string;
  arrival_date_year?: number;
  arrival_date_month?: string;
  arrival_date_day_of_month?: number;
  adults?: number;
  children?: number;
  babies?: number;
  meal?: string;
  adr?: number;
  country?: string;
  reservation_status?: string;
  customer_type?: string;
  required_car_parking_spaces?: number;
  total_of_special_requests?: number;
  market_segment?: string;
  reserved_room_type?: string;
};

const initialMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Welcome to Happy Hotels SKO 2027 ✨ Tell me the stay you want and I will build the booking."
  }
];

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [toolTrace, setToolTrace] = useState<ToolTrace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const summaryItems = useMemo(() => {
    if (!booking) return [];
    return [
      { label: "Hotel", value: booking.hotel },
      { label: "Arrival", value: booking.arrival_date ?? "" },
      { label: "Guests", value: `${booking.adults ?? 0} adults` },
      { label: "Meal", value: booking.meal },
      { label: "Room", value: booking.reserved_room_type },
      { label: "Status", value: booking.reservation_status },
      { label: "Segment", value: booking.market_segment },
      { label: "Country", value: booking.country },
      { label: "Customer", value: booking.customer_type },
      {
        label: "Requests",
        value: `${booking.total_of_special_requests ?? 0} special`
      }
    ];
  }, [booking]);

  const confirmationReady = messages
    .slice(-1)[0]
    ?.content.toLowerCase()
    .includes("confirm");

  async function sendMessage() {
    if (!input.trim() || isLoading) return;
    const newMessages = [...messages, { role: "user", content: input.trim() }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, booking })
      });
      const payload = (await response.json()) as {
        message: string;
        booking?: Booking | null;
        toolTrace?: ToolTrace[];
      };

      setMessages((prev) => [...prev, { role: "assistant", content: payload.message }]);
      if (payload.booking) {
        setBooking(payload.booking);
      }
      if (payload.toolTrace) {
        setToolTrace(payload.toolTrace);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again."
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section>
        <div className={styles.header}>
          <div className={styles.logo}>
            <strong>Happy Hotels SKO 2027</strong>
            <span className={styles.highlight}>AI Booking Concierge</span>
          </div>
          <span className={styles.badge}>Live Demo</span>
        </div>
        <div className={styles.chatPane}>
          <div className={styles.messages}>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`${styles.message} ${
                  message.role === "user" ? styles.user : styles.assistant
                }`}
              >
                {message.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              placeholder="Describe the booking you want..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMessage();
                }
              }}
            />
            <button className={styles.button} onClick={sendMessage}>
              {isLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </section>
      <aside className={styles.sidePane}>
        <AnimatePresence mode="wait">
          <motion.div
            key={booking?.id ?? "draft"}
            className={styles.card}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35 }}
          >
            <div className={styles.cardTitle}>Booking Confirmation</div>
            {booking ? (
              <div className={styles.cardGrid}>
                {summaryItems.map((item) => (
                  <div key={item.label} className={styles.stat}>
                    <div className={styles.statLabel}>{item.label}</div>
                    <div className={styles.statValue}>{item.value || "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p>Draft will appear here as soon as we capture details.</p>
            )}
            {confirmationReady && (
              <div className={styles.confirmation}>
                Awaiting confirmation in chat. Say <strong>confirm</strong> to
                finalize.
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <details className={styles.drawer} open>
          <summary>Tool Trace</summary>
          {toolTrace.length === 0 ? (
            <p>No tool calls yet.</p>
          ) : (
            toolTrace.map((trace, index) => (
              <div key={`${trace.name}-${index}`} className={styles.traceItem}>
                <strong>{trace.name}</strong>
                <pre>{JSON.stringify(trace.payload, null, 2)}</pre>
                {trace.result && (
                  <pre>{JSON.stringify(trace.result, null, 2)}</pre>
                )}
              </div>
            ))
          )}
        </details>
      </aside>
    </main>
  );
}
