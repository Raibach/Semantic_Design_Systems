import express from "express";
import cors from "cors";
import multer from "multer";
import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs";

const app = express();
const PORT = 3001;

// SECURE CORS Configuration
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  // Localtunnel public access
  "https://grace-ui.loca.lt",
  "https://fine-planets-cut.loca.lt",
  // Ngrok public access
  "https://empathic-nonconversationally-latosha.ngrok-free.dev",
  // Add production domains when deploying:
  // 'https://yourdomain.com',
  // 'https://www.yourdomain.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(
        `⚠️  Blocked CORS request from unauthorized origin: ${origin}`,
      );
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Grace Flask API URL - Updated to port 8000 (FastAPI)
const GRACE_API_URL = "http://localhost:8000/api";
const PYTHON_BACKEND_URL = "http://localhost:8000";
const LM_BASE_URL = "http://127.0.0.1:1234";
const LM_CHAT_URL = `${LM_BASE_URL}/v1/chat/completions`;
const LM_RESPONSES_URL = `${LM_BASE_URL}/v1/responses`;
const LM_MODELS_URL = `${LM_BASE_URL}/v1/models`;

// Teacher Chat Endpoint - Routes through Python Flask API for full Grace reasoning
app.post("/api/lmstudio/query", async (req, res) => {
  try {
    const {
      question,
      context,
      reasoning,
      reasoningStyle,
      includeMemory,
      temperature,
      selfReflection,
      editorial,
    } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ content: "", error: "Missing question" });
    }

    // PERFORMANCE MODE: Aggressive optimizations for low-resource servers
    // Set to false to re-enable full features on bigger servers
    const PERFORMANCE_MODE = true;

    // Route through Python Flask API to get full Grace reasoning/memory/reflection
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/teacher/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      body: JSON.stringify({
        question,
        context,
        reasoning: PERFORMANCE_MODE ? false : reasoning !== false, // Disabled
        reasoning_style: PERFORMANCE_MODE
          ? "zero_shot"
          : reasoningStyle || "chain_of_thought", // Fastest
        include_memory: PERFORMANCE_MODE ? false : includeMemory === true, // Disabled
        temperature:
          temperature !== undefined
            ? temperature
            : PERFORMANCE_MODE
              ? 0.2
              : 0.45, // Lower = faster
        self_reflection: PERFORMANCE_MODE ? false : selfReflection !== false, // Disabled
        editorial: editorial || {
          enabled: true,
          detectChatGPTPatterns: PERFORMANCE_MODE ? false : true, // Disabled
          stance: PERFORMANCE_MODE ? "directive" : "collaborative", // Faster
          voicePreservationPriority: PERFORMANCE_MODE ? "medium" : "high",
          structuralCritique: false,
          askObjectiveFirst: false,
        },
      }),
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({
        content: "",
        error: result.error,
      });
    }

    return res.json({
      content: result.content || "",
      error: null,
    });
  } catch (error) {
    console.error("Teacher chat error:", error);
    return res.status(500).json({ content: "", error: error.message });
  }
});

// LM Studio Health Check
app.get("/api/lmstudio/health", async (req, res) => {
  try {
    const response = await fetch(LM_MODELS_URL);
    const available = response.ok;
    res.json({ available });
  } catch (error) {
    res.json({ available: false });
  }
});

// Source Evaluation Endpoint
app.post("/api/grace/source/evaluate", async (req, res) => {
  try {
    const { url, title, content } = req.body;
    const response = await fetch(`${GRACE_API_URL}/source/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      body: JSON.stringify({ url, title, content }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("Source evaluation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// News Query Endpoint
app.post("/api/grace/news", async (req, res) => {
  try {
    const { query, reasoning, includeMemory } = req.body;

    const response = await fetch(`${GRACE_API_URL}/news/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      body: JSON.stringify({
        query,
        reasoning: reasoning || false,
        include_memory: includeMemory || false,
      }),
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({
        content: "",
        error: result.error,
      });
    }

    res.json({
      content: result.result || "",
      sources: result.sources || [],
      error: null,
    });
  } catch (error) {
    console.error("News query error:", error);
    res.status(500).json({
      content: "",
      error: error.message,
    });
  }
});

// PDF Summarization Endpoint (new route)
app.post("/api/pdf/summarize", upload.array("files"), async (req, res) => {
  try {
    const { reasoning, analysisMode } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        content: "",
        error: "No files uploaded",
      });
    }

    // Create form data for Flask
    const formData = new FormData();
    files.forEach((file) => {
      formData.append(
        "files",
        fs.createReadStream(file.path),
        file.originalname,
      );
    });
    formData.append("reasoning", reasoning || "false");
    formData.append("analysisMode", analysisMode || "critical");

    // Create AbortController with 6 minute timeout to match frontend + backend processing time
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 360000); // 6 minutes

    const response = await fetch(`${GRACE_API_URL}/pdf/summarize`, {
      method: "POST",
      body: formData,
      headers: {
        ...formData.getHeaders(),
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    // Clean up uploaded files
    files.forEach((file) => {
      fs.unlinkSync(file.path);
    });

    if (result.error) {
      return res.status(500).json({
        content: "",
        error: result.error,
      });
    }

    res.json({
      content: result.content || "",
      error: null,
    });
  } catch (error) {
    console.error("PDF summarization error:", error);

    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          console.error("Failed to clean up file:", file.path);
        }
      });
    }

    res.status(500).json({
      content: "",
      error: error.message,
    });
  }
});

// PDF Summarization Endpoint (legacy Grace route)
app.post(
  "/api/grace/pdf/summarize",
  upload.array("files"),
  async (req, res) => {
    try {
      const { reasoning } = req.body;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          content: "",
          error: "No files uploaded",
        });
      }

      // Create form data for Flask
      const formData = new FormData();
      files.forEach((file) => {
        formData.append(
          "files",
          fs.createReadStream(file.path),
          file.originalname,
        );
      });
      formData.append("reasoning", reasoning || "false");

      // Create AbortController with 6 minute timeout to match frontend + backend processing time
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 360000); // 6 minutes

      const response = await fetch(`${GRACE_API_URL}/pdf/summarize`, {
        method: "POST",
        body: formData,
        headers: {
          ...formData.getHeaders(),
          "X-API-Key": req.headers["x-api-key"] || "",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      // Clean up uploaded files
      files.forEach((file) => {
        fs.unlinkSync(file.path);
      });

      if (result.error) {
        return res.status(500).json({
          content: "",
          error: result.error,
        });
      }

      res.json({
        content: result.content || "",
        error: null,
      });
    } catch (error) {
      console.error("PDF summarization error:", error);
      res.status(500).json({
        content: "",
        error: error.message,
      });
    }
  },
);

// Memory Recall Endpoint
app.post("/api/grace/memory/recall", async (req, res) => {
  try {
    const { query, reasoning } = req.body;

    const response = await fetch(`${GRACE_API_URL}/memory/recall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      body: JSON.stringify({
        query,
        reasoning: reasoning !== false,
      }),
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({
        content: "",
        error: result.error,
      });
    }

    res.json({
      content: result.content || "",
      error: null,
    });
  } catch (error) {
    console.error("Memory recall error:", error);
    res.status(500).json({
      content: "",
      error: error.message,
    });
  }
});

// Reasoning Trace Endpoint
app.get("/api/grace/reasoning/trace", async (req, res) => {
  try {
    const response = await fetch(`${GRACE_API_URL}/reasoning/trace`, {
      headers: {
        "X-API-Key": req.headers["x-api-key"] || "",
      },
    });
    const result = await response.json();

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error("Reasoning trace error:", error);
    res.status(500).json({
      error: error.message,
    });
  }
});

// Training Endpoint
app.post("/api/grace/train", async (req, res) => {
  try {
    const conversationData = req.body;

    const response = await fetch(`${GRACE_API_URL}/train`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      body: JSON.stringify(conversationData),
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Training error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const response = await fetch(`${GRACE_API_URL}/health`);
    const graceHealth = await response.json();
    res.json({
      status: "ok",
      graceBackend: GRACE_API_URL,
      graceStatus: graceHealth,
    });
  } catch (error) {
    res.json({
      status: "ok",
      graceBackend: GRACE_API_URL,
      graceStatus: "unavailable",
      error: error.message,
    });
  }
});

// ========== QUARANTINE API PROXY ==========
// Forward all quarantine requests to Python backend

app.get("/api/quarantine/summary", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/quarantine/summary`,
      {
        headers: {
          "X-API-Key": req.headers["x-api-key"] || "",
        },
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/quarantine/bucket/:bucket_name", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/quarantine/bucket/${req.params.bucket_name}`,
      {
        headers: {
          "X-API-Key": req.headers["x-api-key"] || "",
        },
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/quarantine/item/:source_id", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/quarantine/item/${req.params.source_id}`,
      {
        headers: {
          "X-API-Key": req.headers["x-api-key"] || "",
        },
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/quarantine/item/:source_id/status", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/quarantine/item/${req.params.source_id}/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": req.headers["x-api-key"] || "",
        },
        body: JSON.stringify(req.body),
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/quarantine/item/:source_id/move", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/quarantine/item/${req.params.source_id}/move`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": req.headers["x-api-key"] || "",
        },
        body: JSON.stringify(req.body),
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/quarantine/item/:source_id", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/quarantine/item/${req.params.source_id}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": req.headers["x-api-key"] || "",
        },
        body: JSON.stringify(req.body),
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUTHENTICATION ENDPOINTS
// Simple API key validation for Grace access
// ============================================

// Validate API key
app.post("/api/auth/validate", async (req, res) => {
  try {
    const { apiKey } = req.body;

    // DEVELOPMENT MODE - Accept ALL login attempts
    // Remove this in production and validate actual API keys
    res.json({
      valid: true,
      message: "API key validated successfully (dev mode)",
      user: {
        id: "user-1",
        apiKey: apiKey || "dev-key",
      },
    });
  } catch (error) {
    console.error("Error validating API key:", error);
    res.status(500).json({ error: error.message });
  }
});

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { apiKey } = req.body;

    // DEVELOPMENT MODE - Accept ALL login attempts
    // Remove this in production and validate actual credentials
    res.json({
      valid: true,
      message: "Login successful (dev mode)",
      user: {
        id: "user-1",
        apiKey: apiKey || "dev-key",
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TEACHER MODEL ENDPOINTS
// ============================================

// Ensure model server is running (on-demand startup)
app.post("/api/teacher/ensure-model", async (req, res) => {
  try {
    const { model_type } = req.body;

    if (!model_type) {
      return res.status(400).json({
        success: false,
        error: "Missing model_type parameter",
      });
    }

    // Route through Python FastAPI backend
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/teacher/ensure-model`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": req.headers["x-api-key"] || "",
        },
        body: JSON.stringify({
          model_type: model_type.toLowerCase(),
        }),
      },
    );

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: result.message || "Model server is running",
      model_type: result.model_type,
    });
  } catch (error) {
    console.error("Ensure model error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Teacher query endpoint (already exists as /api/lmstudio/query)
// This is just an alias for compatibility
app.post("/api/teacher/query", async (req, res) => {
  try {
    const {
      question,
      context,
      reasoning,
      reasoningStyle,
      includeMemory,
      temperature,
      selfReflection,
      editorial,
    } = req.body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ content: "", error: "Missing question" });
    }

    // Route through Python Flask API to get full Grace reasoning/memory/reflection
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/teacher/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
      },
      body: JSON.stringify({
        question,
        context,
        reasoning: reasoning !== false,
        reasoning_style: reasoningStyle || "chain_of_thought",
        include_memory: includeMemory === true,
        temperature: temperature !== undefined ? temperature : 0.45,
        self_reflection: selfReflection !== false,
        editorial: editorial || {
          enabled: true,
          detectChatGPTPatterns: true,
          stance: "collaborative",
          voicePreservationPriority: "high",
          structuralCritique: false,
          askObjectiveFirst: false,
        },
      }),
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({
        content: "",
        error: result.error,
      });
    }

    return res.json({
      content: result.content || "",
      error: null,
    });
  } catch (error) {
    console.error("Teacher query error:", error);
    return res.status(500).json({ content: "", error: error.message });
  }
});

// ============================================
// CONVERSATION API PROXY ENDPOINTS
// ============================================

// Get all conversations
app.get("/api/conversations", async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/conversations`, {
      headers: {
        "X-API-Key": req.headers["x-api-key"] || "",
        "X-User-ID": req.headers["x-user-id"] || "",
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific conversation
app.get("/api/conversations/:conversation_id", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/conversations/${req.params.conversation_id}`,
      {
        headers: {
          "X-API-Key": req.headers["x-api-key"] || "",
          "X-User-ID": req.headers["x-user-id"] || "",
        },
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create conversation
app.post("/api/conversations", async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_BACKEND_URL}/api/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": req.headers["x-api-key"] || "",
        "X-User-ID": req.headers["x-user-id"] || "",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add message to conversation
app.post("/api/conversations/:conversation_id/messages", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/conversations/${req.params.conversation_id}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": req.headers["x-api-key"] || "",
          "X-User-ID": req.headers["x-user-id"] || "",
        },
        body: JSON.stringify(req.body),
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MEMORY API PROXY ENDPOINTS
// ============================================

// Store dictation memory
app.post("/api/memory/store-dictation", async (req, res) => {
  try {
    const response = await fetch(
      `${PYTHON_BACKEND_URL}/api/memory/store-dictation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": req.headers["x-api-key"] || "",
          "X-User-ID": req.headers["x-user-id"] || "",
        },
        body: JSON.stringify(req.body),
      },
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TRANSCRIPTION ENDPOINT
// ============================================

// Transcribe audio
app.post("/api/transcribe", upload.single("audio_file"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res
        .status(400)
        .json({ text: "", error: "No audio file provided" });
    }

    // Create form data for Python backend
    const formData = new FormData();
    formData.append(
      "audio_file",
      fs.createReadStream(file.path),
      file.originalname,
    );

    const response = await fetch(`${PYTHON_BACKEND_URL}/api/transcribe`, {
      method: "POST",
      body: formData,
      headers: {
        ...formData.getHeaders(),
        "X-API-Key": req.headers["x-api-key"] || "",
      },
    });

    const result = await response.json();

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    if (result.error) {
      return res.status(500).json({
        text: "",
        error: result.error,
      });
    }

    res.json({
      text: result.text || "",
      error: null,
    });
  } catch (error) {
    console.error("Transcription error:", error);

    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error("Failed to clean up file:", req.file.path);
      }
    }

    res.status(500).json({
      text: "",
      error: error.message,
    });
  }
});

// ============================================
// CATCH-ALL PROXY FOR FASTAPI ENDPOINTS
// ============================================

// Generic proxy for all FastAPI endpoints not explicitly handled above
app.use("/api", async (req, res) => {
  try {
    const path = req.path;
    const url = `${PYTHON_BACKEND_URL}/api${path}`;

    console.log(`🔀 Proxying ${req.method} ${req.path} to ${url}`);

    // Prepare headers for FastAPI
    const headers = {
      "Content-Type": "application/json",
      "X-API-Key": req.headers["x-api-key"] || "",
      "X-User-ID": req.headers["x-user-id"] || "",
    };

    // Forward the request to FastAPI
    const response = await fetch(url, {
      method: req.method,
      headers: headers,
      body:
        req.method !== "GET" && req.method !== "HEAD"
          ? JSON.stringify(req.body)
          : undefined,
    });

    // Get response content type
    const contentType =
      response.headers.get("content-type") || "application/json";

    // Handle different response types
    if (contentType.includes("application/json")) {
      const data = await response.json();
      res.status(response.status).json(data);
    } else {
      const text = await response.text();
      res.status(response.status).type(contentType).send(text);
    }
  } catch (error) {
    console.error(`❌ Proxy error for ${req.method} ${req.path}:`, error);

    // Check if it's a connection error (FastAPI not running)
    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "FastAPI backend is not running",
        detail: "Please start the Python backend server on port 8000",
        path: req.path,
      });
    }

    res.status(500).json({
      error: "Proxy error",
      detail: error.message,
      path: req.path,
    });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
  console.log(`🔗 Grace API URL: ${GRACE_API_URL}`);
  console.log(`🔗 Python Backend URL: ${PYTHON_BACKEND_URL}`);
  console.log(`🔗 LM Studio URL: ${LM_BASE_URL}`);
  console.log(`🔀 Catch-all proxy enabled for FastAPI endpoints`);
});
