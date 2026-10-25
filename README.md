RESQAI 🚑
Smart Emergency Response Network
RESQAI is a web-based prototype that helps demonstrate emergency coordination by selecting an available ambulance and a suitable hospital, then recording the assignment.
Note: RESQAI is a project prototype for demonstration, not a replacement for professional emergency dispatch or medical services. It does not provide live GPS tracking, live traffic-based ETAs, sign-in, or staff authorization.

Features
- Dashboard with ambulance, hospital, and emergency counts
- Submit an emergency and attempt automatic coordination
- View and search emergency records
- Review resolved or completed emergency history
- View and edit supported ambulance and hospital details
- Import sample data from CSV files
- Store application data in PostgreSQL (including Supabase-hosted PostgreSQL)
Tech Stack
- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express
- Database: PostgreSQL / Supabase
- API format: HTTP + JSON
Project Structure
RESQAI/
├── FRONTEND/   # React web application
├── BACKEND/    # Express API, database schema, tests and CSV import
└── DATA/       # Sample CSV data 
Getting Started
1. Requirements
Install Node.js and have access to a PostgreSQL database. You can use Supabase for hosted PostgreSQL.
2. Configure the backend
Open a terminal in BACKEND:
cd BACKEND
npm install
Create a .env file using .env.example as a guide. Set your database connection details (DATABASE_URL or the supported DB_* variables). Keep your .env file private and do not commit credentials.

Set up the database using schema.sql and apply any required migrations, including the hospital room-capacity migration, if your database needs them. See SUPABASE_SETUP.md for Supabase-specific instructions.

Start the backend:
npm start
The frontend expects the API at http://localhost:5000/api by default. If your backend uses another address or port, configure VITE_API_BASE_URL in the frontend environment.
3. Start the frontend
Open a second terminal:
cd FRONTEND
npm install
npm run dev
Open the local URL printed by Vite in your browser.
Sample Data (Optional)
The repository includes CSV import tooling for ambulance, hospital, and emergency sample data. After configuring the database, follow the instructions in BACKEND/SUPABASE_SETUP.md and run the importer from BACKEND:
npm run import:csv
To validate the CSV data without inserting it, use the importer's supported dry-run or validation-only option.
API Overview
Method	Endpoint	Purpose
GET	/api/dashboard/stats	Dashboard counts
GET	/api/emergencies	List and filter emergencies
POST	/api/emergencies	Submit and coordinate an emergency
GET	/api/ambulances	List ambulances
PATCH	/api/ambulances/:id	Update supported ambulance details
GET	/api/hospitals	List hospitals
PATCH	/api/hospitals/:id	Update supported hospital details


Run Backend Tests
From the BACKEND directory:
npm test


Contributing
For changes, create a branch, test your updates, and avoid committing secrets or local .env files.
