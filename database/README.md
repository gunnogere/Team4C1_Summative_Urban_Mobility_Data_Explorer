# Urban Mobility Data Explorer
### Database Setup & Documentation

## 1. Project Overview

The Urban Mobility Data Explorer is a project designed to organize and manage transportation data for analysis. This task focuses on building the database foundation using MySQL, creating tables, defining relationships, and preparing the database to store and retrieve transportation information efficiently.

## 2. Tools and Technologies Used

- **MySQL** — Stores and manages data in relational tables.
- **SQL** — Creates tables, defines relationships, and retrieves data using queries.
- **Python** — Supports data loading and processing.

## 3. Why I Chose MySQL

I chose MySQL over other database management systems because it is easy to learn, reliable, and suitable for managing structured transportation data. It supports SQL queries, primary keys, foreign keys, and relationships between tables. MySQL is also widely used, well documented, and suitable for this project because it allows data to be stored, organized, and retrieved efficiently.

## 4. Project Structure

```text
Urban_Mobility_Data_Explorer/
├── schema.sql
├── queries.sql
├── load_data.py
└── README.md
```

- **`schema.sql`** — Creates the database tables and defines their structure.
- **`queries.sql`** — Contains SQL queries used to retrieve, inspect, and analyze data.
- **`load_data.py`** — Loads data into the database using Python.
- **`README.md`** — Explains the project and how to run the database setup.

## 5. Database Setup

### Step 1: Create the Database

Open MySQL and execute:

```sql
CREATE DATABASE urban_mobility;
USE urban_mobility;
```

### Step 2: Create the Tables

From the project directory, run:

```bash
mysql -u root -p urban_mobility < schema.sql
```

Enter your MySQL password when prompted.

This command executes the SQL statements in `schema.sql` to create the required tables.

### Step 3: Load the Data

Run the Python data-loading script:

```bash
python load_data.py
```

Make sure MySQL is running and the database connection settings in `load_data.py` are correct before executing the script.

## 6. Verifying the Database

To confirm that the tables were created, run:

```sql
USE urban_mobility;
SHOW TABLES;
```

To inspect the trips table:

```sql
DESCRIBE trips;
```

To check the number of records:

```sql
SELECT COUNT(*) AS total_trips
FROM trips;
```

To view a sample of the records:

```sql
SELECT *
FROM trips
LIMIT 5;
```

## 7. Running SQL Queries

The `queries.sql` file contains queries for retrieving and analyzing transportation data.

Run the queries using:

```bash
mysql -u root -p urban_mobility < queries.sql
```

This executes the SQL statements saved in the file.



