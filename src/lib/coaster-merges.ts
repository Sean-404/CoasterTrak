/**
 * Coaster rows merged into another row, so their old URLs redirect to the surviving ride
 * instead of returning a 404. See supabase/migrations/20261104120000_merge_same_ride_duplicates.sql.
 */
export const MERGED_COASTER_IDS: Readonly<Record<number, number>> = {
  15675: 4385, // Eurosat → Eurosat - CanCan Coaster
  128: 952, // Scooby-Doo → Woodstock Express (Carowinds)
  703: 952, // Fairly Odd Coaster → Woodstock Express (Carowinds)
  256: 257, // Runaway Train → Scorpion Express
  389: 1277, // Space Mountain: De la Terre à la Lune → Star Wars Hyperspace Mountain
  726: 1277, // Space Mountain: Mission 2 → Star Wars Hyperspace Mountain
  15775: 10470, // Big Thunder Mountain Railroad → Big Thunder Mountain (Paris)
  617: 605, // Rugrats Runaway Reptar → Kenny's Forest Flyer
  14683: 236, // Bobbaan → Swiss Bob
  14557: 6054, // George and the Dragon → Joris en de Draak
  311: 6247, // Sidewinder → Jolly Rancher Remix
  37: 98, // Pippin → Thunderbolt
  312: 589, // Steel Phantom → Phantom's Revenge
  391: 1194, // T2 → T3 (Kentucky Kingdom)
  122: 1116, // Scooby-Doo → Woodstock Express (Kings Dominion)
  934: 4674, // Intimidator 305 → Pantherian
  182: 40, // The Beastie → Woodstock Express (Kings Island)
  740: 40, // Fairly Odd Coaster → Woodstock Express (Kings Island)
  114: 40, // Scooby-Doo → Woodstock Express (Kings Island)
  353: 184, // Top Gun → The Bat
  578: 4759, // Flying Ace Aerial Chase → Woodstock's Air Rail
  14684: 15359, // Diabelska pętla → Devil's Loop
  586: 8859, // MP Xpress → Iron Claw
  14672: 541, // Kraken Unleashed → Kraken
  15774: 15701, // Big Thunder Mountain Railroad → Big Thunder Mountain (Tokyo)
  15587: 5167, // Psyké Underground → Turbine
  14627: 15823, // Technic Coaster → Lego Technic Test Track
  15897: 14563, // Gotham City Escape → Batman Gotham City Escape
};

/** The id to load for a coaster URL: the surviving row if this one was merged away. */
export function resolveMergedCoasterId(id: number): number {
  return MERGED_COASTER_IDS[id] ?? id;
}
