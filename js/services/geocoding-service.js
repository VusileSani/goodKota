export async function geocodeSouthAfricanAddress(address) {
  const query = String(address || "").trim();
  if (!query) throw new Error("Enter a street address first.");

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "za");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);

  let response;
  try {
    response = await fetch(url, { headers: { "Accept-Language": "en-ZA,en" } });
  } catch {
    throw new Error("Address lookup is unavailable right now. Enter latitude and longitude manually.");
  }
  if (!response.ok) throw new Error("Address lookup could not be completed. Enter coordinates manually if needed.");
  const results = await response.json();
  const match = results[0];
  if (!match) throw new Error("That address could not be located. Refine it or enter coordinates manually.");

  const a = match.address || {};
  return {
    address: match.display_name || query,
    area: a.suburb || a.town || a.city || a.village || a.county || "",
    latitude: Number(match.lat),
    longitude: Number(match.lon)
  };
}
