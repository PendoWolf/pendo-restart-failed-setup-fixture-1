import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The trip fields PUT /api/trips/:id replaces, for telling Pendo which ones an edit changed. */
const TRIP_FIELDS = ["destination", "startDate", "endDate", "travelers"] as const;

/** Returns why `body` isn't a valid trip, or null when it is. */
function validateNewTrip(body: Partial<NewTrip> | undefined): string | null {
  if (!body || typeof body.destination !== "string" || body.destination.trim() === "") {
    return "destination is required";
  }
  if (typeof body.startDate !== "string" || !ISO_DATE.test(body.startDate)) {
    return "startDate must be a date like 2026-11-03";
  }
  if (typeof body.endDate !== "string" || !ISO_DATE.test(body.endDate)) {
    return "endDate must be a date like 2026-11-08";
  }
  if (body.endDate < body.startDate) {
    return "endDate must be on or after startDate";
  }
  if (!Number.isInteger(body.travelers) || (body.travelers as number) < 1) {
    return "travelers must be a whole number of at least 1";
  }
  return null;
}

/** Today's date in UTC, like "2026-11-03": the "today" tripStore.upcoming() compares trips with. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whole days from one date like "2026-11-03" to another, negative when `to` comes first. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/**
 * What the trip events tell Pendo about a trip, with its length in days (counting its first and last, so a
 * one-day trip is 1) and how many days from today it starts (negative once it has).
 */
function tripProperties(trip: Trip) {
  return {
    tripId: trip.id,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    tripLengthDays: daysBetween(trip.startDate, trip.endDate) + 1,
    daysUntilStart: daysBetween(today(), trip.startDate),
  };
}

export const tripsRouter = Router();

tripsRouter.get("/", (_req, res) => {
  res.json(tripStore.list());
});

tripsRouter.post("/", (req, res) => {
  const body = req.body as Partial<NewTrip> | undefined;
  const problem = validateNewTrip(body);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const trip = tripStore.create({
    destination: body!.destination!.trim(),
    startDate: body!.startDate!,
    endDate: body!.endDate!,
    travelers: body!.travelers!,
  });
  const { user, account } = res.locals as AuthLocals;
  trackEvent("trip_created", user, account, tripProperties(trip));
  res.status(201).json(trip);
});

tripsRouter.get("/:id", (req, res) => {
  const trip = tripStore.get(req.params.id);
  if (!trip) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  res.json(trip);
});

tripsRouter.put("/:id", (req, res) => {
  const body = req.body as Partial<NewTrip> | undefined;
  const problem = validateNewTrip(body);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }
  const previous = tripStore.get(req.params.id);
  const trip = tripStore.update(req.params.id, {
    destination: body!.destination!.trim(),
    startDate: body!.startDate!,
    endDate: body!.endDate!,
    travelers: body!.travelers!,
  });
  if (!trip) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  const { user, account } = res.locals as AuthLocals;
  trackEvent("trip_updated", user, account, {
    ...tripProperties(trip),
    // PUT replaces the whole trip, so only comparing with the trip before it tells what the edit changed.
    changedFields: TRIP_FIELDS.filter((field) => trip[field] !== previous?.[field]),
  });
  res.json(trip);
});

tripsRouter.delete("/:id", (req, res) => {
  const trip = tripStore.get(req.params.id);
  if (!trip || !tripStore.remove(req.params.id)) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  const { user, account } = res.locals as AuthLocals;
  trackEvent("trip_deleted", user, account, {
    ...tripProperties(trip),
    // An upcoming trip being cancelled, or a past one being cleaned up: the same rule as tripStore.upcoming().
    wasUpcoming: trip.endDate >= today(),
  });
  res.status(204).end();
});
