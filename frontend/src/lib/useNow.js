import { useEffect, useState } from "react";

// Live clock for countdowns. Re-renders once a minute by default (pass
// `intervalMs` for a finer tick). Returns the current unix time in seconds.
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
