// Shared in-process state for the live tracker connection.
// The live poller (GLI-104) updates this on each fetch; the
// /live/thermals route reads it so the client can show status.

import type { TrackerStatus } from "./lib/types.ts";

let currentStatus: TrackerStatus = "ok";

export function setTrackerStatus(status: TrackerStatus): void {
  currentStatus = status;
}

export function getTrackerStatus(): TrackerStatus {
  return currentStatus;
}
