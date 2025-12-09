import pandas as pd
import time
from geopy.geocoders import Nominatim
from tqdm import tqdm

INPUT_CSV = "assets/data/space_missions.csv"
OUTPUT_CSV = "assets/data/space_missions_geocoded.csv"
LOCATION_COLUMN = "Location"
USER_AGENT = "rocket-launch-visualisation"

df = pd.read_csv(INPUT_CSV, encoding="latin1")

def clean_location(location):
    if pd.isna(location):
        return None
    parts = location.split(",")

    if parts[0].strip().startswith(("LC-", "Site", "SLC", "LP")):
        parts = parts[1:]
    return ",".join(parts).strip()

df["CleanLocation"] = df[LOCATION_COLUMN].apply(clean_location)

unique_locations = df["CleanLocation"].dropna().unique()

print(f"Unique locations to geocode: {len(unique_locations)}")

geolocator = Nominatim(user_agent=USER_AGENT)
location_cache = {}

for location in tqdm(unique_locations):
    if location in location_cache:
        continue

    try:
        geo = geolocator.geocode(location, timeout=10)
        if geo:
            location_cache[location] = (geo.latitude, geo.longitude)
        else:
            location_cache[location] = (None, None)
    except Exception as e:
        print(f"Error geocoding {location}: {e}")
        location_cache[location] = (None, None)

    time.sleep(1)  

df["Latitude"] = df["CleanLocation"].apply(lambda x: location_cache.get(x, (None, None))[0])
df["Longitude"] = df["CleanLocation"].apply(lambda x: location_cache.get(x, (None, None))[1])

df.drop(columns=["CleanLocation"], inplace=True)
df.to_csv(OUTPUT_CSV, index=False)

print(f"\nGeocoded file saved to: {OUTPUT_CSV}")
