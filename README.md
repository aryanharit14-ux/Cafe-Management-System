# Cafe Management System (MERN)

A complete MERN (MongoDB, Express, React, Node.js) stack Cafe Management System strictly built according to the CHO syllabus requirements.

## Features

### Customer Flow
- **Authentication**: Registration and Login using JWT and bcrypt.
- **Menu**: Browse available cafe items with dynamically served images.
- **Shopping Cart**: Add items, adjust quantities, and securely persist cart using Context API and `localStorage`.
- **Order Placement**: Checkout securely without trusting frontend price variables.
- **Order History**: Customers can track their placed orders natively.

### Admin Flow
- **Dashboard**: High-level statistical overview of operations.
- **Menu Management**: Full CRUD operations to add, update (including pricing and availability), and remove menu items.
- **Image Upload**: Upload images via `multipart/form-data` natively utilizing Multer, hosted statically on the Node server.
- **Order Management**: Monitor all incoming orders and update fulfillment statuses (`Pending`, `Preparing`, `Ready`, `Completed`).

## Technology Stack

- **Frontend**: React (Vite), React Router, Context API, Axios.
- **Backend**: Node.js, Express, Multer, bcryptjs, jsonwebtoken.
- **Database**: MongoDB, Mongoose.

## Getting Started

### 1. Prerequisites
- Node.js (v18+ recommended)
- MongoDB running locally or on a remote cluster

### 2. Backend Setup
1. Open a terminal and navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` directory with the following variables:
   ```env
   NODE_ENV=development
   PORT=5001
   MONGO_URI=mongodb://127.0.0.1:27017/cafe-management
   JWT_SECRET=your_super_secret_jwt_key
   ```
4. Start the backend development server:
   ```bash
   npm start
   ```

### 3. Frontend Setup
1. Open a separate terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

### 4. Application Usage
- The React application runs on `http://localhost:5173`.
- The Vite proxy routes API calls to the Express server running on `http://127.0.0.1:5001`.
- Uploaded menu images are saved in `backend/uploads/` and served statically.

## Security & Architecture Integrity
- **Backend Authority**: Pricing, availability, order ownership, and admin execution rights are fully verified by the backend. The frontend is never treated as the source of truth.
- **Clean Separation**: Pure `.jsx` for React layouts, standard `.css` for styling, and standalone `.js` for HTTP/API and validation logic.
