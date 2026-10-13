import json
import os
from pathlib import Path

import mysql.connector

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "etl_pipeline" / "cleaned_json_data"

def read_json(filename):
    with open(DATA_DIR / filename, "r", encoding="utf-8") as file:
        return json.load(file)


def main():
        connection = mysql.connector.connect(
                host="localhost",
                user=os.getenv("DB_USER", "mobility_user"),
                password=os.getenv("DB_PASSWORD"),
                database="urban_mobility"
                )
        
        cursor = connection.cursor()
        
        
        try:
            # Load zones
            zones = read_json("zones.json")
            cursor.executemany(
                    """
                    INSERT INTO zones
                    (location_id, borough, zone, service_zone)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    borough = VALUES(borough),
                    zone = VALUES(zone),
                    service_zone = VALUES(service_zone)
                    """,
                  [
                      (
                          row["location_id"],
                          row.get("borough"),
                          row.get("zone"),
                          row.get("service_zone")
                      )
                      for row in zones
                  ]
            )
            connection.commit()
            print(f"Loaded {len(zones)} zones")


            # Load ventors
            vendors = read_json("vendors.json")
            cursor.executemany(
                """
                INSERT INTO vendors (vendor_id, vendors_name)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE
                vendors_name = VALUES(vendors_name)
                """,
                [
                    (row["vendor_id"], row["vendor_name"])
                    for row in vendors
                ]
                    
            )
            connection.commit()
            print(f"Loaded {len(vendors)} vendors")


            # Load payment types
            payment_types = read_json("payment_types.json")
            cursor.executemany(
                """
                INSERT INTO Payment_type (Payment_type_id, description)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE
                description = VALUES(description)
                """,
                [
                    (row["payment_type_id"], row["description"])
                    for row in payment_types
                ]

            )
            connection.commit()
            print(f"Loaded {len(payment_types)} payment_types")


            # load rate codes
            rate_codes = read_json("rate_codes.json")
            cursor.executemany(
                """
                INSERT INTO rate_codes (rate_code_id, description)
                VALUES (%s, %s) 
                ON DUPLICATE KEY UPDATE
                description = VALUES(description)
                """,
                [
                    (row["rate_code_id"], row["description"])
                    for row in rate_codes
                ]

            )
            connection.commit()
            print(f"Loaed {len(rate_codes)} rate_codes")

            # load zone geometries
            geometries = read_json("zone_geometries.json")
            cursor.executemany(
                """
                INSERT INTO zone_geometries
                (location_id, centroid_lat, centroid_lon, area_Sq_km, geometry)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                centroid_lat = VALUES(centroid_lat),
                centroid_lon = VALUES(centroid_lon),
                area_Sq_km = VALUES(area_sq_km),
                geometry = VALUES(geometry)
                """,
                [
                    (
                    
                    row["location_id"],
                    row["centroid_lat"],
                    row["centroid_lon"],
                    row["area_sq_km"],
                    json.dumps(row["geometry"])


                    )
                    for row in geometries
                ]
            )
            connection.commit()
            print(f"Loaded{len(geometries)} zone geometries")


        finally: 
            cursor.close()
            connection.close()
if __name__ == "__main__":
    main()



