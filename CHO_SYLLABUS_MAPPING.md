# CHO Syllabus Mapping - MERN Cafe Management System

This project was built strictly according to the CHO syllabus requirements for a MERN stack application.

## 1. Node.js & Express (Backend)
- **Express Framework**: Used for building the REST API.
- **RESTful Architecture**: Follows standard GET, POST, PUT, DELETE routing patterns.
- **Middleware**: Used custom middleware (`authMiddleware.js`) and third-party middleware (`cors`, `express.json`).
- **Multer**: Used strictly for simple local image uploads (`uploadMiddleware.js`).
- **Nodemon**: Used as a development dependency for server reloading.

## 2. MongoDB & Mongoose (Database)
- **Mongoose**: Object Data Modeling (ODM) library used to enforce schemas and interact with MongoDB.
- **Collections**: Models created for `User`, `MenuItem`, and `Order`.
- **References / Relationships**: The Order model uses `mongoose.Schema.Types.ObjectId` to reference `User` and `MenuItem` appropriately.

## 3. Authentication & Security
- **bcryptjs**: Used to securely hash and salt user passwords before storing in MongoDB.
- **JSON Web Tokens (JWT)**: Used for stateless authentication. Passed securely in HTTP headers (`Authorization: Bearer <token>`).
- **Role-based Access Control**: Distinguishes between standard customers and administrative users (`req.user.role`).

## 4. React (Frontend)
- **Vite**: Used for scaffolding and building the React application.
- **Functional Components & Hooks**: Heavily utilizes `useState`, `useEffect`, and `useContext`.
- **React Router**: Implements declarative routing for SPAs (`BrowserRouter`, `Routes`, `Route`).
- **Context API**: Provides global state management for User Authentication (`AuthContext.jsx`) and Cart functionalities (`CartContext.jsx`) without requiring Redux.
- **Axios**: Centralized HTTP client communicating with the backend APIs via a Vite proxy to prevent CORS issues.
- **Strict Architecture**: Separation of concerns enforced (`.jsx` for UI, `.css` for styling, `.js` for logic/helpers).

## Excluded Technologies
As requested by the project scope, the following technologies were strictly excluded to keep the project compliant with the CHO syllabus:
- Socket.IO
- Redux
- Tailwind CSS
- Next.js
- Firebase / Cloud Storage
- GraphQL
- Payment Gateways (Razorpay/Stripe)
