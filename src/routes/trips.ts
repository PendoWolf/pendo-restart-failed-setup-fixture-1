import { Router } from "express";
import { daysBetween, today, trackEvent, truncate } from "../analytics/pendo-track.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip, Trip } from "../types.js";

const TRIP_FIELDS: (keyof NewTrip)[] = ["destination", "startDate", "endDate", "travelers"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
      tripLengthDays: daysBetween(trip.startDate, trip.endDate),
      daysUntilStart: daysBetween(today(), trip.startDate),
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
  const previous: Trip | undefined = tripStore.get(req.params.id);
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
  // Only fire when the save actually changed the trip's details.
  const changedFields = previous ? TRIP_FIELDS.filter((field) => previous[field] !== trip[field]) : [];
  if (changedFields.length > 0) {
    const { user, account } = res.locals as AuthLocals;
    trackEvent({
      event: "trip_updated",
      visitorId: user.id,
      accountId: account.id,
      properties: {
        tripId: trip.id,
        changedFields,
        travelers: trip.travelers,
        tripLengthDays: daysBetween(trip.startDate, trip.endDate),
        daysUntilStart: daysBetween(today(), trip.startDate),
      },
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
