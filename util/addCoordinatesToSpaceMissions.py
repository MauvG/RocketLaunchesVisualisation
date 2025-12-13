import pandas as pd

missionsFile = "public/data/space_missions.csv"
stationsFile = "public/data/unique_station_locations.csv"
outputFile = "public/data/space_missions_geocoded.csv"

missionsDf = pd.read_csv(missionsFile, encoding="latin-1")
stationsDf = pd.read_csv(stationsFile)

stationsDf["location"] = stationsDf["Location"].str.strip()
missionsDf["location"] = missionsDf["Location"].str.strip()

stationsLookup = {
    station: (lat, lon)
    for station, lat, lon in zip(
        stationsDf["location"],
        stationsDf["Latitude"],
        stationsDf["Longitude"]
    )
}

def findCoordinates(missionLocation):
    for stationName, coords in stationsLookup.items():
        if stationName in missionLocation:
            return coords
    return (None, None)

coordinates = missionsDf["location"].apply(findCoordinates)

missionsDf["Latitude"] = coordinates.apply(lambda x: x[0])
missionsDf["Longitude"] = coordinates.apply(lambda x: x[1])

missionsDf.drop(columns=["location"], inplace=True)

missionsDf.to_csv(outputFile, index=False)
