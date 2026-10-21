import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRIP_FIELDS: (keyof NewTrip)[] = ["destination", "startDate", "endDate", "travelers"];
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Whole days from one ISO date to another, negative when `to` is the earlier one. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** How long a trip is and how far off it is, for Pendo's trip_created and trip_updated events. */
function tripTiming(trip: Trip): { tripLengthDays: number; daysUntilDeparture: number } {
  // Today in UTC, as tripStore.upcoming() has it.
  const today = new Date().toISOString().slice(0, 10);
  return {
    // Counting the first and the last day, so a same-day trip is 1 day long.
    tripLengthDays: daysBetween(trip.startDate, trip.endDate) + 1,
    // Negative for a trip that has already started.
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
  // The trip was saved: the Create click also fires when validation rejects it.
  const { user, account } = res.locals as AuthLocals;
  trackEvent("trip_created", user, account, {
    tripId: trip.id,
    destination: trip.destination,
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
  // The edit was saved, and which details changed: such as "startDate,endDate" when the dates moved, or "none".
  const { user, account } = res.locals as AuthLocals;
  trackEvent("trip_updated", user, account, {
    tripId: trip.id,
    changedFields: TRIP_FIELDS.filter((field) => previous?.[field] !== trip[field]).join(",") || "none",
    destination: trip.destination,
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
