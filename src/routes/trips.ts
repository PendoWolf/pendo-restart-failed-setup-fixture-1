import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The trip details a save can change, in the order trip_updated lists them. */
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

/**
 * Whole days from one ISO date to another, negative when `to` comes first. Undefined when either date can't be read:
 * validateNewTrip() checks a date's format, not that it's on the calendar.
 */
function daysBetween(from: string, to: string): number | undefined {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return Number.isFinite(days) ? days : undefined;
}

/** How many days the trip spans, counting its first and last days, so a same-day trip lasts 1. */
function tripLengthDays(trip: Trip): number | undefined {
  const days = daysBetween(trip.startDate, trip.endDate);
  return days === undefined ? undefined : days + 1;
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
  // A trip was saved: its size, its length, and how many days from today (in UTC) until it starts.
  const { user, account } = res.locals as AuthLocals;
  trackEvent("trip_created", { user, account }, {
    tripId: trip.id,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    tripLengthDays: tripLengthDays(trip),
    daysUntilStart: daysBetween(new Date().toISOString().slice(0, 10), trip.startDate),
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
  // A save that changes nothing isn't an update. changedFields is comma-separated so Pendo can group by it, and
  // startDateShiftDays is positive when the trip was pushed back.
  const changedFields = TRIP_FIELDS.filter((field) => trip[field] !== previous?.[field]);
  if (previous && changedFields.length > 0) {
    const { user, account } = res.locals as AuthLocals;
    trackEvent("trip_updated", { user, account }, {
      tripId: trip.id,
      changedFields: changedFields.join(","),
      destination: trip.destination,
      travelers: trip.travelers,
      tripLengthDays: tripLengthDays(trip),
      startDateShiftDays: daysBetween(previous.startDate, trip.startDate),
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
