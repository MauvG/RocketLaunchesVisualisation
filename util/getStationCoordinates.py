import csv
import time
import requests

inputFilePath = "public/data/unique_stations.csv"
outputFilePath = "public/data/unique_station_locations.csv"

nominatimUrl = "https://nominatim.openstreetmap.org/search"

headers = {
    "User-Agent": "space-launch-geocoder"
}

results = []

with open(inputFilePath, newline="", encoding="utf-8") as inputFile:
    csvReader = csv.DictReader(inputFile)
    for row in csvReader:
        locationName = row["Location"].strip()

        params = {
            "q": locationName,
            "format": "json",
            "limit": 1
        }

        response = requests.get(nominatimUrl, params=params, headers=headers)
        response.raise_for_status()

        data = response.json()

        if data:
            latitude = data[0]["lat"]
            longitude = data[0]["lon"]
        else:
            latitude = ""
            longitude = ""

        results.append({
            "Location": locationName,
            "Latitude": latitude,
            "Longitude": longitude
        })

        time.sleep(1)

with open(outputFilePath, "w", newline="", encoding="utf-8") as outputFile:
    fieldnames = ["Location", "Latitude", "Longitude"]
    csvWriter = csv.DictWriter(outputFile, fieldnames=fieldnames)
    csvWriter.writeheader()
    csvWriter.writerows(results)
