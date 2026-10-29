import { Router } from "express";
import { trackEvent } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one ISO date to another (negative when `to` is earlier). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** How many days the trip lasts, counting its first and last day. */
function tripLengthDays(trip: NewTrip): number {
  return daysBetween(trip.startDate, trip.endDate) + 1;
}

/** Days from today (UTC) to the trip's start: how far ahead it was booked or cancelled. */
function daysUntilStart(trip: NewTrip): number {
  return daysBetween(new Date().toISOString().slice(0, 10), trip.startDate);
}

/** The trip properties every trip event sends, with the destination cut to fit Pendo's size limits. */
function tripProperties(trip: Trip) {
  return { tripId: trip.id, destination: trip.destination.slice(0, 100), travelers: trip.travelers };
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
      ...tripProperties(trip),
      startDate: trip.startDate,
      endDate: trip.endDate,
      tripLengthDays: tripLengthDays(trip),
      daysUntilStart: daysUntilStart(trip),
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
  // The trip was found and its new details passed validation; says which of them changed.
  const { user, account } = res.locals as AuthLocals;
  trackEvent({
    event: "trip_updated",
    visitorId: user.id,
    accountId: account.id,
    properties: {
      ...tripProperties(trip),
      tripLengthDays: tripLengthDays(trip),
      destinationChanged: previous?.destination !== trip.destination,
      datesChanged: previous?.startDate !== trip.startDate || previous?.endDate !== trip.endDate,
      travelersChanged: previous?.travelers !== trip.travelers,
    },
  });
  res.json(trip);
});

tripsRouter.delete("/:id", (req, res) => {
  // Read before removing, so the event can say how far ahead the cancelled trip was.
  const trip = tripStore.get(req.params.id);
  if (!trip || !tripStore.remove(req.params.id)) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  const { user, account } = res.locals as AuthLocals;
  trackEvent({
    event: "trip_deleted",
    visitorId: user.id,
    accountId: account.id,
    properties: { ...tripProperties(trip), daysUntilStart: daysUntilStart(trip) },
  });
  res.status(204).end();
});
