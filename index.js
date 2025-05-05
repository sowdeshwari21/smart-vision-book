import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import pdfRoute from "./route/pdfRoute.js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

const app = express();
app.use(cors(
  {
    origin: "*", // Replace with your frontend URL
    methods: ["GET", "POST", "PUT", "DELETE","PATCH"],
    credentials: true,
  }
));
app.use(express.json());
app.use("/api/v1/pdf", pdfRoute);

const __dirname = dirname(fileURLToPath(import.meta.url));
  app.use(express.static(path.resolve(__dirname, "./public")));
  
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "./public", "index.html"));
  });

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
