import { executeActions } from "../orchestrator/executeActions";

/** Seeds two יוסי contacts plus a Ramat Gan listing for disambiguation demos (US-004). */
export function seedUs004AmbiguousYossiRamatGan(): void {
  executeActions([
    {
      type: "create_or_update_client",
      data: {
        name: "יוסי כהן",
        role: "buyer",
        preferences: { areas: ["רמת גן"] }
      }
    },
    {
      type: "create_or_update_client",
      data: {
        name: "יוסי ביטון",
        role: "owner"
      }
    },
    {
      type: "create_or_update_property",
      data: {
        address: "שדרות ירושלים 10",
        city: "רמת גן",
        rooms: 3,
        owner_client_name: "יוסי ביטון"
      }
    }
  ]);
}
