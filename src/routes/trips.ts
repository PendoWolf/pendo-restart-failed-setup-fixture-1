import { Router } from "express";
import type { AuthLocals } from "../auth/require-auth.js";
import { trackEvent, type TrackProperties } from "../pendo/track.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
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

/** Whole days from one ISO date to another, such as 5 from "2026-11-03" to "2026-11-08", or undefined if unreadable. */
function daysBetween(from: string, to: string): number | undefined {
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS;
  return Number.isNaN(days) ? undefined : days;
}

/** The trip's details as Pendo Track Event properties. */
function tripProperties(trip: Trip): TrackProperties {
  const days = daysBetween(trip.startDate, trip.endDate);
  return {
    tripId: trip.id,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    // Counts the first and the last day, so a same-day trip is 1 day long.
    tripLengthDays: days === undefined ? undefined : days + 1,
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
  trackEvent({
    event: "trip_created",
    visitorId: user.id,
    accountId: account.id,
    properties: {
      ...tripProperties(trip),
      // How far ahead the trip is planned, from today as tripStore.upcoming() counts it (UTC).
      daysUntilStart: daysBetween(new Date().toISOString().slice(0, 10), trip.startDate),
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
  // Saving the trip without changing anything doesn't count as an update.
  const changedFields = TRIP_FIELDS.filter((field) => previous?.[field] !== trip[field]);
  if (changedFields.length > 0) {
    const { user, account } = res.locals as AuthLocals;
    trackEvent({
      event: "trip_updated",
      visitorId: user.id,
      accountId: account.id,
      properties: { ...tripProperties(trip), changedFields },
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
