USE urban_mobility;


-- Count taxi zones
SELECT COUNT(*) AS total_zones
FROM zones;


-- Count taxi trips
SELECT COUNT(*) AS total_trips
FROM trips;


-- Calculate average trip distance 
SELECT AVG(trip_distance_miles) AS average_distance
FROM trips;


-- Calculate total revenue
SELECT SUM(total_amount) AS total_revenue
FROM trips;

-- Count trips by pickup location 
SELECT pu_location_id, COUNT(*) AS trip_count
FROM trips
GROUP BY pu_location_id;
