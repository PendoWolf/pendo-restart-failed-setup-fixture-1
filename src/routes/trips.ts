import { Router } from "express";
import { daysBetween, trackPendoEvent, truncateForPendo } from "../analytics/pendo.js";
import type { AuthLocals } from "../auth/require-auth.js";
import { tripStore } from "../store/trips.js";
import type { NewTrip } from "../types.js";

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
  // Pendo: a valid trip was saved, which the create click can't tell from a rejected one.
  const { user, account } = res.locals as AuthLocals;
  trackPendoEvent("trip_created", { user, account }, {
    tripId: trip.id,
    destination: truncateForPendo(trip.destination),
    startDate: trip.startDate,
    endDate: trip.endDate,
    tripDurationDays: daysBetween(trip.startDate, trip.endDate) + 1,
    daysUntilDeparture: daysBetween(new Date().toISOString().slice(0, 10), trip.startDate),
    travelers: trip.travelers,
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
  if (!trip || !previous) {
    res.status(404).json({ error: "trip not found" });
    return;
  }
  // Pendo: a valid update was saved, with what changed compared with the trip before it.
  const { user, account } = res.locals as AuthLocals;
  trackPendoEvent("trip_updated", { user, account }, {
    tripId: trip.id,
    destination: truncateForPendo(trip.destination),
    tripDurationDays: daysBetween(trip.startDate, trip.endDate) + 1,
    travelers: trip.travelers,
    destinationChanged: previous.destination !== trip.destination,
    datesChanged: previous.startDate !== trip.startDate || previous.endDate !== trip.endDate,
    travelersChanged: previous.travelers !== trip.travelers,
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
