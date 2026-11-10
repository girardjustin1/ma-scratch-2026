// Outbound links in the emails. Plain links the reader chooses to open: no API, no tracking.

/** The game's page on masslottery.com (route /games/draw-and-instants/:identifier). */
export const lotteryGameUrl = (gameId: string) =>
  `https://www.masslottery.com/games/draw-and-instants/${encodeURIComponent(gameId)}`;

/** Google Maps search for a store: name, address and town, Massachusetts. */
export const mapsUrl = (store: string, address: string | undefined, town: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([store, address, `${town}, MA`].filter(Boolean).join(', '))}`;
