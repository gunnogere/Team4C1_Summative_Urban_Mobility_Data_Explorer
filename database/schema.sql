```CREATE DATABASE IF NOT EXISTS urban_mobility;
USE urban_mobility;

-- Dimension tables (sources: etl_pipeline/cleaned_json_data/*.json)

-- 1. zones.json
CREATE TABLE zones (
    location_id  INT PRIMARY KEY,
    borough      VARCHAR(100) NULL,
    zone         VARCHAR(150) NULL,
    service_zone VARCHAR(150) NULL
);

-- 2. zone_geometries.json (260 of 265 zones have geometry)
CREATE TABLE zone_geometries (
    location_id  INT PRIMARY KEY,
    centroid_lat DECIMAL(10, 6) NOT NULL,
    centroid_lon DECIMAL(10, 6) NOT NULL,
    area_sq_km   DECIMAL(12, 4) NOT NULL,
    geometry     JSON NOT NULL,
    FOREIGN KEY (location_id) REFERENCES zones(location_id)
);

-- 3. vendors.json
CREATE TABLE vendors (
    vendor_id   INT PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL
);

-- 4. payment_types.json
CREATE TABLE payment_types (
    payment_type_id INT PRIMARY KEY,
    description     VARCHAR(100) NOT NULL
);

-- 5. rate_codes.json
CREATE TABLE rate_codes (
    rate_code_id INT PRIMARY KEY,
    description  VARCHAR(100) NOT NULL
);

-- 6. trips.json (fact table)
CREATE TABLE trips (
    trip_id               INT UNSIGNED PRIMARY KEY, -- source CSV row number
    vendor_id             INT NOT NULL,
    pickup_datetime       DATETIME NOT NULL,
    dropoff_datetime      DATETIME NOT NULL,
    passenger_count       TINYINT UNSIGNED NULL,
    trip_distance_miles   DECIMAL(6, 2) NOT NULL,
    rate_code_id          INT NULL,
    store_and_fwd_flag    CHAR(1) NULL,
    pu_location_id        INT NOT NULL,
    do_location_id        INT NOT NULL,
    payment_type_id       INT NOT NULL,
    fare_amount           DECIMAL(8, 2) NOT NULL,
    extra                 DECIMAL(8, 2) NOT NULL,
    mta_tax               DECIMAL(8, 2) NOT NULL,
    tip_amount            DECIMAL(8, 2) NOT NULL,
    tolls_amount          DECIMAL(8, 2) NOT NULL,
    improvement_surcharge DECIMAL(8, 2) NOT NULL,
    congestion_surcharge  DECIMAL(8, 2) NOT NULL,
    total_amount          DECIMAL(8, 2) NOT NULL,
    -- derived features
    trip_duration_min     DECIMAL(8, 2) NOT NULL,
    avg_speed_mph         DECIMAL(6, 2) NOT NULL,
    fare_per_mile         DECIMAL(10, 2) NOT NULL,
    pickup_day_of_week    TINYINT UNSIGNED NOT NULL, -- 0=Sunday
    is_weekend            BOOLEAN NOT NULL,
    tip_pct               DECIMAL(10, 2) NULL, -- only for credit card trips
    pickup_hour           TINYINT UNSIGNED NOT NULL,
    is_rush_hour          BOOLEAN NOT NULL,
    is_cross_borough      BOOLEAN NOT NULL,
    CONSTRAINT chk_store_fwd CHECK (store_and_fwd_flag IN ('Y', 'N')),
    FOREIGN KEY (vendor_id)       REFERENCES vendors(vendor_id),
    FOREIGN KEY (rate_code_id)    REFERENCES rate_codes(rate_code_id),
    FOREIGN KEY (payment_type_id) REFERENCES payment_types(payment_type_id),
    FOREIGN KEY (pu_location_id)  REFERENCES zones(location_id),
    FOREIGN KEY (do_location_id)  REFERENCES zones(location_id),
    INDEX idx_pickup_datetime (pickup_datetime),
    INDEX idx_pu_location (pu_location_id),
    INDEX idx_do_location (do_location_id),
    INDEX idx_hour_dow (pickup_hour, pickup_day_of_week)```
);
