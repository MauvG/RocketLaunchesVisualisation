import csv
import re

inputFilePath = "public/data/space_missions.csv"
outputFilePath = "public/data/unique_stations.csv"

uniqueLocations = set()
launchPadPattern = re.compile(r"[0-9/]")

with open(inputFilePath, newline="", encoding="latin-1") as inputFile:
    csvReader = csv.DictReader(inputFile)
    for row in csvReader:
        rawLocation = row["Location"].strip()
        if not rawLocation:
            continue

        firstPart, *restParts = rawLocation.split(",", 1)

        if restParts and launchPadPattern.search(firstPart):
            cleanedLocation = restParts[0].strip()
        else:
            cleanedLocation = rawLocation

        uniqueLocations.add(cleanedLocation)

with open(outputFilePath, "w", newline="", encoding="utf-8") as outputFile:
    csvWriter = csv.writer(outputFile)
    csvWriter.writerow(["Location"])
    for location in sorted(uniqueLocations):
        csvWriter.writerow([location])
