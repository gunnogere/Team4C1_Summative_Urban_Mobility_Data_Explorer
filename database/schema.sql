CREATE DATABASE IF NOT EXISTS urban_mobility;
USE urban_mobility;


-- 1. Zones table
CREATE TABLE zones (
    location_id INT PRIMARY KEY,
    borough VARCHAR(100),
    zone VARCHAR(150),
    service_done VARCHAR(150)
);

-- 2. Vendors table
CREATE TABLE vendors (
    vendors_id INT PRIMARY KEY,
    vendors_name VARCHAR(225) NOT NULL
);

-- 3. Zone geometries table
CREATE TABLE zone_geometries (
    location_id INT PRIMARY KEY,
    centroid_lat DECIMAL(10, 6)
    centroid_lon DECIMAL(10, 6)
    area_sq_km DECIMAL(12, 4)
    geometry JSON
);

-- 4. Payment types table
CREATE TABLE Payment_type (
    Payment_type_id INT PRIMARY KEY,
    description VARCHAR(100) NOT NULL
);

-- 5. Rate codes table
CREATE TABLE rate_codes (
    rate_code_id INT PRIMARY KEY,
    description VARCHAR(100) NOT NULL
);
