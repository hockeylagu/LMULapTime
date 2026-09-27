export const LOADING_QUOTES: readonly string[] = [
  'Warming up the tire blankets (and the coffee maker)...',
  'Blaming the understeer on tire pressures before leaving the pit box...',
  'Explaining to the stewards that track limits are merely a recommendation...',
  'Consulting the telemetry to prove that was definitely netcode...',
  'Asking the race engineer why we boxed for slicks during heavy rain...',
  'Checking if Eau Rouge is really flat-out on cold tires...',
  'Recalculating fuel delta: exactly 0.2 liters short, as is tradition...',
  'Searching the pit garage for the missing 10mm socket...',
  'Calibrating the hypercar hybrid deploy map with pure optimism...',
  'Sweeping marbles and gravel out of the sidepods...',
  'Double-checking brake bias because Turn 1 looked unusually scary today...',
  'Bribing the French marshals with croissants at the Bugatti chicane...',
  'Asking the spotter to mute their sarcasm until after qualifying...',
  'Polishing the headlights for the 3:00 AM Mulsanne straight stint...',
  'Telling the driver to pit confirm... driver ignores radio...',
  'Checking whether the tire degradation is physical or psychological...',
  'Convincing race control that the cut at Monza T1 was a tactical detour...',
  'Applying 100% brake pressure and praying for mechanical grip...',
  'Re-indexing DuckDB frames faster than a GT3 car through Tertre Rouge...',
  'Hunting down that phantom vibration in the force feedback...',
  'Negotiating with the differential for a little more corner rotation...',
  'Checking the radar: 100% chance of yellow flags at the start...',
  'Confirming with the team principal that second place is just first of the losers...',
  'Wiping virtual bugs off the virtual visor...',
  'Reminding the driver that the race cannot be won in Turn 1, only lost...',
  'Tuning the dampers to handle excessive emotional turbulence...',
  'Waiting for the marshals to locate the missing apex cone...',
  'Reviewing the incident replay: "He turned right into me, mate!"',
];

export function getRandomLoadingQuote(): string {
  const index = Math.floor(Math.random() * LOADING_QUOTES.length);
  return LOADING_QUOTES[index];
}
