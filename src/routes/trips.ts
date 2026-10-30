import { Router } from "express";
import { trackEvent, truncate } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from the ISO date `from` to the ISO date `to`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** The trip's length and lead time, for its Pendo Track Events. */
function tripTiming(trip: Trip): { tripDurationDays: number; daysUntilStart: number } {
  const today = new Date().toISOString().slice(0, 10);
  return {
    // Counts both the start and end day, so a same-day trip lasts 1 day.
    tripDurationDays: daysBetween(trip.startDate, trip.endDate) + 1,
    daysUntilStart: daysBetween(today, trip.startDate),
  };
}

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
  // The trip passed validation and was saved.
  const { user, account } = res.locals as AuthLocals;
  trackEvent({
    event: "trip_created",
    visitorId: user.id,
    accountId: account.id,
    properties: {
      tripId: trip.id,
      destination: truncate(trip.destination),
      travelers: trip.travelers,
      ...tripTiming(trip),
      accountPlan: account.plan,
    },
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
  // The trip edit passed validation and was saved: record which of its details changed.
  const { user, account } = res.locals as AuthLocals;
  const fields: (keyof NewTrip)[] = ["destination", "startDate", "endDate", "travelers"];
  trackEvent({
    event: "trip_updated",
    visitorId: user.id,
    accountId: account.id,
    properties: {
      tripId: trip.id,
      changedFields: fields.filter((field) => previous?.[field] !== trip[field]),
      travelers: trip.travelers,
      ...tripTiming(trip),
    },
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
