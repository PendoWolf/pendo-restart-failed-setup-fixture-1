import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The trip's fields, which PUT /api/trips/:id replaces all at once. */
const TRIP_FIELDS: (keyof NewTrip)[] = ["destination", "startDate", "endDate", "travelers"];

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

/** Whole days from one ISO date to another, or undefined when either isn't a real date. */
function daysBetween(from: string, to: string): number | undefined {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return Number.isNaN(days) ? undefined : Math.round(days);
}

/** The trip's shape, for its Track Events: how long it is, who goes and how far ahead it starts. */
function tripShape(trip: Trip): {
  tripLengthDays: number | undefined;
  travelers: number;
  daysUntilStart: number | undefined;
} {
  const nights = daysBetween(trip.startDate, trip.endDate);
  const today = new Date().toISOString().slice(0, 10);
  return {
    // Counts both the first and the last day, so a day trip is 1 day long.
    tripLengthDays: nights === undefined ? undefined : nights + 1,
    travelers: trip.travelers,
    // Negative when the trip has already started.
    daysUntilStart: daysBetween(today, trip.startDate),
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
  trackEvent("trip_created", {
    visitorId: user.id,
    accountId: account.id,
    properties: {
      tripId: trip.id,
      // Capped, so the event's properties stay within Pendo's size limit.
      destination: trip.destination.slice(0, 100),
      startDate: trip.startDate,
      endDate: trip.endDate,
      ...tripShape(trip),
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
  // Read before the update: PUT replaces every field, so only this tells which ones really changed.
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
  const changedFields = previous ? TRIP_FIELDS.filter((field) => previous[field] !== trip[field]) : [];
  if (changedFields.length > 0) {
    const { user, account } = res.locals as AuthLocals;
    trackEvent("trip_updated", {
      visitorId: user.id,
      accountId: account.id,
      properties: { tripId: trip.id, changedFields, ...tripShape(trip) },
    });
  }
  res.json(trip);
});

tripsRouter.delete("/:id", (req, res) => {
  if (!tripStore.remove(req.params.id)) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  res.status(204).end();
});
