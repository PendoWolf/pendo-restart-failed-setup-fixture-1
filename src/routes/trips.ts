import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { trackEvent } from "../pendo/track-event.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
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

/** Whole days from one ISO date to another, or undefined when either isn't a real date (such as month 13). */
function daysBetween(from: string, to: string): number | undefined {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return Number.isNaN(days) ? undefined : days;
}

/**
 * How many days the trip lasts, counting its first and last day, and how many days away it starts (negative once it
 * has started).
 */
function tripTiming(trip: NewTrip): { tripLengthDays: number | undefined; daysUntilDeparture: number | undefined } {
  const today = new Date().toISOString().slice(0, 10);
  const nights = daysBetween(trip.startDate, trip.endDate);
  return {
    tripLengthDays: nights === undefined ? undefined : nights + 1,
    daysUntilDeparture: daysBetween(today, trip.startDate),
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
  // Tells Pendo a trip was saved, with its details. Destinations are free text, so long ones are cut short to stay
  // within Pendo's size limit for properties.
  trackEvent("trip_created", res.locals as AuthLocals, {
    tripId: trip.id,
    destination: trip.destination.slice(0, 80),
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    ...tripTiming(trip),
  });
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
  // Read before it's replaced, so the Track Event can say which fields changed.
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
  // Tells Pendo the trip was changed, and how: changedFields lists the fields that differ, or is "none" when the
  // save changed nothing.
  const changedFields = TRIP_FIELDS.filter((field) => previous?.[field] !== trip[field]);
  trackEvent("trip_updated", res.locals as AuthLocals, {
    tripId: trip.id,
    changedFields: changedFields.join(",") || "none",
    travelers: trip.travelers,
    ...tripTiming(trip),
  });
  res.json(trip);
});

tripsRouter.delete("/:id", (req, res) => {
  if (!tripStore.remove(req.params.id)) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  res.status(204).end();
});
