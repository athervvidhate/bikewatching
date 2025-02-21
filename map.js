// Set your Mapbox access token here
mapboxgl.accessToken =
  "pk.eyJ1IjoiYXRoZXJ2IiwiYSI6ImNtN2JmdWxrdTAxdnoyam9sdDU4enZhNncifQ.8b5O5upD4ALrb0xGBmRgXQ";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map", // ID of the div where the map will render
  style: "mapbox://styles/mapbox/streets-v12", // Map style
  center: [-71.11822196963853, 42.37465074382746], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

const svg = d3.select("#map").append("svg");
let stations = [];
let timeFilter = -1;
let trips = [];
let radiusScale, circles;
let filteredStations = [];
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

function updateCircles() {
  circles
    .attr("r", (d) => radiusScale(d.totalTraffic) || 0)
    .attr("opacity", (d) => (d.totalTraffic > 0 ? 0.6 : 0))
    .style("--departure-ratio", (d) =>
        stationFlow(d.departures / d.totalTraffic)
      )
    .select("title")
    .text(
      (d) =>
        `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
    );
}

const timeSlider = document.getElementById("time-slider");
timeSlider.addEventListener("input", () => {
  updateTimeDisplay();
  if (trips.length > 0 && stations.length > 0) {
    filterTripsbyTime();
    updateCircles(); // Add this to update visualization
  }
});
const selectedTime = document.getElementById("selected-time");
const anyTimeLabel = document.getElementById("any-time");

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
  return date.toLocaleString("en-US", { timeStyle: "short" }); // Format as HH:MM AM/PM
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value); // Get slider value

  if (timeFilter === -1) {
    selectedTime.textContent = ""; // Clear time display
    anyTimeLabel.style.display = "block"; // Show "(any time)"
  } else {
    selectedTime.textContent = formatTime(timeFilter); // Display formatted time
    anyTimeLabel.style.display = "none"; // Hide "(any time)"
  }
}

function filterTripsbyTime() {
  filteredTrips =
    timeFilter === -1
      ? trips
      : trips.filter((trip) => {
          const startedMinutes = minutesSinceMidnight(trip.started_at);
          const endedMinutes = minutesSinceMidnight(trip.ended_at);
          return (
            Math.abs(startedMinutes - timeFilter) <= 60 ||
            Math.abs(endedMinutes - timeFilter) <= 60
          );
        });

  filteredArrivals = d3.rollup(
    filteredTrips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  filteredDepartures = d3.rollup(
    filteredTrips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  stations.forEach((station) => {
    const id = station.short_name;
    station.arrivals = filteredArrivals.get(id) ?? 0;
    station.departures = filteredDepartures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
  });

  radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range(timeFilter === -1 ? [0, 25] : [0, 15]);

  // Update filteredStations to reference the same objects
  filteredStations = stations;
  console.log("Filtered trips length:", filteredTrips.length);
}

function minutesSinceMidnight(date) {
  if (!(date instanceof Date) || isNaN(date)) return 0;
  return date.getHours() * 60 + date.getMinutes();
}

timeSlider.addEventListener("input", updateTimeDisplay);
updateTimeDisplay();

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

map.on("load", () => {
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...",
  });
  map.addSource("cambridge_route", {
    type: "geojson",
    data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson?...",
  });

  map.addLayer({
    id: "bike-lanes-boston",
    type: "line",
    source: "boston_route",
    paint: {
      "line-color": "#32CD32",
      "line-width": 3,
      "line-opacity": 0.4,
    },
  });

  map.addLayer({
    id: "bike-lanes-cambridge",
    type: "line",
    source: "cambridge_route",
    paint: {
      "line-color": "#32CD32",
      "line-width": 3,
      "line-opacity": 0.4,
    },
  });

  // Load the nested JSON file
  const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";

  d3.json(jsonurl)
    .then((jsonData) => {
      stations = jsonData.data.stations;
      map.resize();

      return d3
        .csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv")
        .then((loadedTrips) => {
          trips = loadedTrips;

          for (let trip of trips) {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
          }

          // Calculate departures and arrivals
          departures = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.start_station_id
          );

          arrivals = d3.rollup(
            trips,
            (v) => v.length,
            (d) => d.end_station_id
          );

          stations.forEach((station) => {
            let id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
          });

          // Set initial filteredStations
          filteredStations = stations;

          // Create radius scale after we have the traffic data
          radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);

          circles = svg
            .selectAll("circle")
            .data(stations, (d) => d.short_name)
            .enter()
            .append("circle")
            .attr("r", (d) => radiusScale(d.totalTraffic))
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) 
            .attr("stroke", "white")
            .attr("stroke-width", 1)
            .attr("opacity", 0.6)
            .style("pointer-events", "auto") // Enable pointer events for tooltips
            .each(function (d) {
              d3.select(this)
                .append("title")
                .text(
                  `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
                );
            });

          function updatePositions() {
            circles
              .attr("cx", (d) => getCoords(d).cx)
              .attr("cy", (d) => getCoords(d).cy);
          }

          // Initial position update
          updatePositions();

          // Add event listeners
          map.on("move", updatePositions);
          map.on("zoom", updatePositions);
          map.on("resize", updatePositions);
          map.on("moveend", updatePositions);

          filterTripsbyTime();
          updateCircles();
        });
    })
    .catch((error) => {
      console.error("Error loading JSON:", error);
    });
});
