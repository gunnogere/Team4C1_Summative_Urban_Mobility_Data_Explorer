# Database Setup

## 1. What I Did

I reviewed the cleaned JSON files and created a `schema.sql` file to organize the data into tables for zones, zone geometries, vendors, payment types, and rate codes.

## 2. Tools Used

- **MySQL:** To create and manage the database.
- **VS Code:** To write the SQL code.
- **JSON files:** To identify the data needed for each table.

## 3. Why I Chose MySQL Over other database management system

I chose MySQL because it is easy to learn, simple to set up, and suitable for storing structured data in tables. It supports SQL queries and relationships between tables, making it a good choice for organizing and managing our urban mobility data.

## 4. How to Install and Run the Database

### Install MySQL
1. Download MySQL Server from https://dev.mysql.com/downloads/mysql/
2. Download MySQL Workbench from https://dev.mysql.com/downloads/workbench/

### Run the SQL File
1. Open MySQL Workbench.
2. Connect to your MySQL server.
3. Click **File → Open SQL Script**.
4. Open `database/schema.sql` from the project folder.
5. Click the lightning bolt icon to execute the code.
6. Refresh the Schemas panel to see the database and its tables.

